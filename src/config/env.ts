import { z } from 'zod'

/**
 * Validates that a string is valid base64 and decodes to exactly 32 bytes.
 * Used for AES-256-GCM ENCRYPTION_KEY.
 */
export function base64KeyValidator(): z.ZodEffects<z.ZodString, string, string> {
  return z.string().superRefine((val, ctx) => {
    // 1. Check if it's valid base64
    let buffer: Buffer
    try {
      buffer = Buffer.from(val, 'base64')
    } catch {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'ENCRYPTION_KEY 必须是有效的 base64 字符串',
      })
      return
    }

    // 2. Check re-encoding gives same string (catches non-canonical base64)
    const reEncoded = buffer.toString('base64')
    if (reEncoded !== val) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'ENCRYPTION_KEY 不是规范的 base64 编码',
      })
      return
    }

    // 3. Check decoded length is exactly 32 bytes
    if (buffer.length !== 32) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `ENCRYPTION_KEY base64 解码后必须正好是 32 字节，当前为 ${buffer.length} 字节。\n请使用以下命令生成：\nnode -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`,
      })
    }
  })
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('production'),
  PORT: z.coerce.number().int().positive().default(3001),

  DATABASE_URL: z.string().url().startsWith('mysql://'),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET 至少需要 32 个字符'),
  JWT_EXPIRES_IN: z.string().default('7d'),

  ENCRYPTION_KEY: base64KeyValidator(),
  IP_HASH_SALT: z.string().min(8),

  CORS_ORIGIN: z.string().default('https://your-domain.com'),

  DEFAULT_ADMIN_USERNAME: z.string().default('admin'),
  DEFAULT_ADMIN_PASSWORD: z.string().min(8),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
})

// Exported for testing — do NOT use outside tests
export const envSchemaForTesting = envSchema

export type Env = z.infer<typeof envSchema>

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env)
  if (!parsed.success) {
    console.error('❌ Invalid environment variables:')
    for (const issue of parsed.error.issues) {
      console.error(`  - ${issue.path.join('.')}: ${issue.message}`)
    }
    console.error('\n💡 生成 ENCRYPTION_KEY:')
    console.error('  node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"')
    process.exit(1)
  }
  return parsed.data
}

export const env = loadEnv()
