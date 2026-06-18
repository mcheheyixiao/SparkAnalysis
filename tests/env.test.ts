import { describe, it, expect, vi } from 'vitest'

// Set env vars BEFORE importing env.ts (which calls loadEnv() at module scope).
// We use vi.hoisted so they are set before the module graph loads.
const hoisted = vi.hoisted(() => {
  // Generate a valid 32-byte base64 key for testing
  const validKey = Buffer.from('0123456789abcdef0123456789abcdef').toString('base64')

  process.env.NODE_ENV = 'test'
  process.env.PORT = '3001'
  process.env.DATABASE_URL = 'mysql://user:pass@localhost:3306/test'
  process.env.JWT_SECRET = 'a'.repeat(32)
  process.env.ENCRYPTION_KEY = validKey
  process.env.IP_HASH_SALT = 'test-salt-1234'
  process.env.CORS_ORIGIN = 'http://localhost:3000'
  process.env.DEFAULT_ADMIN_USERNAME = 'admin'
  process.env.DEFAULT_ADMIN_PASSWORD = 'password12345678'
  process.env.LOG_LEVEL = 'info'

  return { validKey }
})

import { envSchemaForTesting, base64KeyValidator } from '../src/config/env.js'

describe('ENCRYPTION_KEY validation', () => {
  it('should accept a valid 32-byte base64 key', () => {
    const result = envSchemaForTesting.safeParse({
      ...process.env,
      ENCRYPTION_KEY: hoisted.validKey,
    })
    expect(result.success).toBe(true)
  })

  it('should reject a key that is not valid base64', () => {
    // "!!!not-valid-base64!!!" is not valid base64
    const result = envSchemaForTesting.safeParse({
      ...process.env,
      ENCRYPTION_KEY: '!!!not-valid-base64!!!',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const messages = result.error.issues.map(i => i.message).join(' ')
      expect(messages).toMatch(/base64/i)
    }
  })

  it('should reject a base64 key that decodes to less than 32 bytes', () => {
    // "aGVsbG8=" decodes to "hello" (5 bytes)
    const result = envSchemaForTesting.safeParse({
      ...process.env,
      ENCRYPTION_KEY: 'aGVsbG8=',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const messages = result.error.issues.map(i => i.message).join(' ')
      expect(messages).toMatch(/32/)
    }
  })

  it('should reject a base64 key that decodes to more than 32 bytes', () => {
    // 64-byte key in base64 (valid base64 but wrong length)
    const longKey = Buffer.from('a'.repeat(64)).toString('base64')
    const result = envSchemaForTesting.safeParse({
      ...process.env,
      ENCRYPTION_KEY: longKey,
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const messages = result.error.issues.map(i => i.message).join(' ')
      expect(messages).toMatch(/32/)
    }
  })

  it('should reject a non-canonical base64 key', () => {
    // Base64 where padding is required but missing (non-canonical)
    // "YQ" is the first byte of "YQ==" which decodes to one byte (0x61)
    const result = envSchemaForTesting.safeParse({
      ...process.env,
      ENCRYPTION_KEY: 'YQ',
    })
    expect(result.success).toBe(false)
  })
})

describe('JWT_SECRET validation', () => {
  it('should reject JWT_SECRET shorter than 32 characters', () => {
    const result = envSchemaForTesting.safeParse({
      ...process.env,
      JWT_SECRET: 'too_short',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const messages = result.error.issues.map(i => i.message).join(' ')
      expect(messages).toMatch(/32/)
    }
  })

  it('should accept JWT_SECRET of 32 or more characters', () => {
    const result = envSchemaForTesting.safeParse({
      ...process.env,
      JWT_SECRET: 'a'.repeat(32),
    })
    expect(result.success).toBe(true)
  })
})

describe('base64KeyValidator standalone', () => {
  it('should accept a valid 32-byte base64 key', () => {
    const schema = base64KeyValidator()
    const result = schema.safeParse(hoisted.validKey)
    expect(result.success).toBe(true)
  })

  it('should reject a key that decodes to wrong byte length', () => {
    const schema = base64KeyValidator()
    // "aGVsbG8=" = "hello" = 5 bytes
    const result = schema.safeParse('aGVsbG8=')
    expect(result.success).toBe(false)
  })
})
