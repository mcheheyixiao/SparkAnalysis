import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('production'),
  PORT: z.coerce.number().int().positive().default(3001),

  DATABASE_URL: z.string().url().startsWith('mysql://'),

  JWT_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: z.string().default('7d'),

  ENCRYPTION_KEY: z.string().min(32),
  IP_HASH_SALT: z.string().min(8),

  CORS_ORIGIN: z.string().default('https://your-domain.com'),

  DEFAULT_ADMIN_USERNAME: z.string().default('admin'),
  DEFAULT_ADMIN_PASSWORD: z.string().min(8),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
})

export type Env = z.infer<typeof envSchema>

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env)
  if (!parsed.success) {
    console.error('❌ Invalid environment variables:')
    for (const issue of parsed.error.issues) {
      console.error(`  - ${issue.path.join('.')}: ${issue.message}`)
    }
    process.exit(1)
  }
  return parsed.data
}

export const env = loadEnv()
