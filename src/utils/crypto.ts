import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto'
import { env } from '../config/env.js'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16
const AUTH_TAG_LENGTH = 16
const ENCODING = 'base64'

function getKey(): Buffer {
  // ENCRYPTION_KEY is a base64-encoded 32-byte key
  const key = Buffer.from(env.ENCRYPTION_KEY, 'base64')
  // Defensive check: even though env.ts validates this at startup,
  // ensure the decoded key is exactly 32 bytes for AES-256-GCM
  if (key.length !== 32) {
    throw new Error(
      `ENCRYPTION_KEY 解码后必须为 32 字节，当前为 ${key.length} 字节。\n` +
      '请使用以下命令生成：\n' +
      'node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"'
    )
  }
  return key
}

export function encryptApiKey(plaintext: string): string {
  const key = getKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)

  let encrypted = cipher.update(plaintext, 'utf8', ENCODING)
  encrypted += cipher.final(ENCODING)
  const authTag = cipher.getAuthTag()

  // Format: iv:authTag:ciphertext (all base64)
  return `${iv.toString(ENCODING)}:${authTag.toString(ENCODING)}:${encrypted}`
}

export function decryptApiKey(encrypted: string): string {
  if (!encrypted) return ''

  const key = getKey()
  const parts = encrypted.split(':')
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted format')
  }

  const [ivB64, authTagB64, ciphertext] = parts
  const iv = Buffer.from(ivB64, ENCODING)
  const authTag = Buffer.from(authTagB64, ENCODING)

  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)

  let decrypted = decipher.update(ciphertext, ENCODING, 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}

export function maskApiKey(encrypted: string): string {
  if (!encrypted) return ''
  try {
    const decrypted = decryptApiKey(encrypted)
    if (decrypted.length <= 8) return '****'
    return decrypted.slice(0, 3) + '****' + decrypted.slice(-4)
  } catch {
    return '****'
  }
}

export function hashClientIp(ip: string): string {
  return createHash('sha256')
    .update(ip + env.IP_HASH_SALT)
    .digest('hex')
}
