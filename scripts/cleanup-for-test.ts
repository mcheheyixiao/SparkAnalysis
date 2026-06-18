// scripts/cleanup-for-test.ts
// Clean up all report data + logs, re-seed prompts, keep AI/system settings intact.
// Usage: npx tsx scripts/cleanup-for-test.ts

import { PrismaClient } from '@prisma/client'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { randomUUID } from 'crypto'

const prisma = new PrismaClient()

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
  console.log('🧹 Cleaning up data for testing...\n')

  // 1. Count before
  const reportCount = await prisma.sparkReport.count()
  const resultCount = await prisma.analysisResult.count()
  const logCount = await prisma.systemLog.count()
  console.log(`  Before: ${reportCount} reports, ${resultCount} analysisResults, ${logCount} logs`)

  // 2. Delete analysis results first (foreign key), then reports, then logs
  console.log('\n  Deleting analysis results...')
  await prisma.analysisResult.deleteMany()
  console.log('  Deleting spark reports...')
  await prisma.sparkReport.deleteMany()
  console.log('  Deleting system logs...')
  await prisma.systemLog.deleteMany()

  // Verify clean
  const afterReport = await prisma.sparkReport.count()
  const afterResult = await prisma.analysisResult.count()
  const afterLog = await prisma.systemLog.count()
  console.log(`  After:  ${afterReport} reports, ${afterResult} analysisResults, ${afterLog} logs`)

  // 3. Re-seed prompt templates (sync Prompt/*.md with DB)
  console.log('\n📝 Syncing prompt templates from Prompt/*.md...')
  const promptTemplates = [
    { name: 'Default System Prompt',            type: 'system',      file: 'Default System Prompt.md' },
    { name: 'Default User Prompt',              type: 'user',        file: 'Default User Prompt.md' },
    { name: 'Default JSON Schema',              type: 'json_schema', file: 'Default JSON Schema Prompt.md' },
    { name: 'Default Beginner Explanation',     type: 'beginner',    file: 'Default Beginner Explanation.md' },
    { name: 'Default Advanced Diagnosis',       type: 'advanced',    file: 'Default Advanced Diagnosis Prompt.md' },
  ]

  for (const tmpl of promptTemplates) {
    const content = readPromptFile(tmpl.file)
    if (!content) continue

    const existing = await prisma.promptTemplate.findFirst({
      where: { type: tmpl.type, isDefault: true },
    })

    if (existing) {
      await prisma.promptTemplate.update({
        where: { id: existing.id },
        data: {
          name: tmpl.name,
          content,
          version: { increment: 1 },
        },
      })
      console.log(`  ✅ Updated: ${tmpl.name}`)
    } else {
      await prisma.promptTemplate.create({
        data: {
          id: randomUUID(),
          name: tmpl.name,
          type: tmpl.type,
          content,
          isDefault: true,
          version: 1,
        },
      })
      console.log(`  ✅ Created: ${tmpl.name}`)
    }
  }

  // 4. Verify prompts
  const promptCount = await prisma.promptTemplate.count()
  console.log(`\n  ✅ ${promptCount} prompt templates synced`)

  // 5. Check AI config
  const aiConfig = await prisma.aiSetting.findFirst()
  if (aiConfig) {
    console.log(`\n🤖 AI Config: provider=${aiConfig.provider}, model=${aiConfig.model}, enabled=${aiConfig.enabled}`)
    if (!aiConfig.enabled || !aiConfig.apiKeyEncrypted) {
      console.log('  ⚠️  AI 未启用或未配置 API Key — 需要先在后台设置才能测试 AI 诊断')
    }
  } else {
    console.log('\n  ⚠️  未找到 AI 配置 — 需要先在后台设置')
  }

  console.log('\n🎉 Cleanup complete. Ready for testing!')
}

main()
  .catch((e) => {
    console.error('Cleanup failed:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
