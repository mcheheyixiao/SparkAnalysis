import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcrypt'
import { randomUUID } from 'crypto'
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

const prisma = new PrismaClient()

// Resolve Prompt/ directory relative to project root (where `npm run prisma:seed` is executed)
const PROMPT_DIR = resolve(process.cwd(), 'Prompt')

function readPromptFile(filename: string): string {
  const filePath = resolve(PROMPT_DIR, filename)
  if (existsSync(filePath)) {
    return readFileSync(filePath, 'utf-8').trim()
  }
  console.warn(`  ⚠ Prompt file not found: ${filePath}, using empty string`)
  return ''
}

async function main() {
  console.log('🌱 Seeding database...')

  // 1. Default admin user
  const username = process.env.DEFAULT_ADMIN_USERNAME || 'admin'
  const password = process.env.DEFAULT_ADMIN_PASSWORD || 'change_me_now'
  const passwordHash = await bcrypt.hash(password, 12)

  await prisma.adminUser.upsert({
    where: { username },
    update: {},
    create: {
      id: randomUUID(),
      username,
      passwordHash,
      role: 'superadmin',
      enabled: true,
    },
  })
  console.log(`  ✅ Admin user: ${username}`)

  // 2. Default system settings (all 13 keys)
  const defaultSettings: Record<string, string> = {
    saveRawSparkData: 'false',
    saveNormalizedSummary: 'true',
    saveAiResult: 'true',
    autoCleanupDays: '30',
    sparkFetchTimeoutMs: '10000',
    sparkRawMaxBytes: '5242880',
    sparkFullMaxBytes: '31457280',
    aiTimeoutMs: '60000',
    publicRateLimitPerMinute: '5',
    publicRateLimitPerDay: '30',
    maxConcurrency: '2',
    reuseCompletedReport: 'true',
    reuseReportTtlSeconds: '3600',
  }

  for (const [key, value] of Object.entries(defaultSettings)) {
    await prisma.systemSetting.upsert({
      where: { key },
      update: {},
      create: { id: randomUUID(), key, value },
    })
  }
  console.log(`  ✅ ${Object.keys(defaultSettings).length} system settings`)

  // 3. Default AI setting (placeholder, not enabled)
  const existingAi = await prisma.aiSetting.findFirst()
  if (!existingAi) {
    await prisma.aiSetting.create({
      data: {
        id: randomUUID(),
        provider: 'deepseek',
        baseUrl: 'https://api.deepseek.com',
        apiKeyEncrypted: '',
        model: 'deepseek-v4-pro',
        temperature: 0.3,
        maxTokens: 4096,
        timeoutMs: 60000,
        enabled: false,
      },
    })
    console.log('  ✅ Default AI setting (disabled)')
  }

  // 4. Default prompt templates (loaded from Prompt/*.md files)
  const promptTemplates = [
    {
      name: 'Default System Prompt',
      type: 'system',
      content: readPromptFile('Default System Prompt.md'),
      isDefault: true,
      version: 1,
    },
    {
      name: 'Default User Prompt',
      type: 'user',
      content: readPromptFile('Default User Prompt.md'),
      isDefault: true,
      version: 1,
    },
    {
      name: 'Default JSON Schema',
      type: 'json_schema',
      content: readPromptFile('Default JSON Schema Prompt.md'),
      isDefault: true,
      version: 1,
    },
    {
      name: 'Default Beginner Explanation',
      type: 'beginner',
      content: readPromptFile('Default Beginner Explanation.md'),
      isDefault: true,
      version: 1,
    },
    {
      name: 'Default Advanced Diagnosis',
      type: 'advanced',
      content: readPromptFile('Default Advanced Diagnosis Prompt.md'),
      isDefault: true,
      version: 1,
    },
  ]

 for (const tmpl of promptTemplates) {
    const existing = await prisma.promptTemplate.findFirst({
      where: { type: tmpl.type, isDefault: true },
    })
    if (existing) {
      // Update existing default with latest content from Prompt/*.md
      await prisma.promptTemplate.update({
        where: { id: existing.id },
        data: {
          name: tmpl.name,
          content: tmpl.content,
          version: { increment: 1 },
        },
      })
      console.log(`  ✅ Updated: ${tmpl.name}`)
    } else {
      await prisma.promptTemplate.create({
        data: { id: randomUUID(), ...tmpl },
      })
      console.log(`  ✅ Created: ${tmpl.name}`)
    }
  }
  console.log(`  ✅ ${promptTemplates.length} prompt templates`)

  console.log('🎉 Seed complete!')
}

main()
  .catch((e) => {
    console.error('Seed failed:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
