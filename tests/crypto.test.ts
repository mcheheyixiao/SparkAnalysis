import { describe, it, expect, vi } from 'vitest'

// Must be hoisted above the module imports because env.ts calls loadEnv()
// at module scope, which would process.exit(1) without valid env vars.
const mocks = vi.hoisted(() => {
  return {
    ENCRYPTION_KEY: Buffer.from('0123456789abcdef0123456789abcdef').toString('base64'),
    IP_HASH_SALT: 'test-salt-for-hashing',
  }
})

vi.mock('../src/config/env.js', () => ({
  env: {
    ENCRYPTION_KEY: mocks.ENCRYPTION_KEY,
    IP_HASH_SALT: mocks.IP_HASH_SALT,
  },
}))

import { encryptApiKey, decryptApiKey, hashClientIp } from '../src/utils/crypto.js'

describe('encryptApiKey / decryptApiKey', () => {
  it('should encrypt and decrypt a plaintext round-trip', () => {
    const plaintext = 'sk-this-is-a-test-api-key-12345'
    const encrypted = encryptApiKey(plaintext)
    expect(encrypted).not.toBe(plaintext)
    expect(encrypted.split(':')).toHaveLength(3)

    const decrypted = decryptApiKey(encrypted)
    expect(decrypted).toBe(plaintext)
  })

  it('should produce different ciphertexts for different plaintexts', () => {
    const ct1 = encryptApiKey('api-key-alpha')
    const ct2 = encryptApiKey('api-key-beta')
    expect(ct1).not.toBe(ct2)
  })

  it('should produce different ciphertexts for the same plaintext (random IV)', () => {
    const ct1 = encryptApiKey('same-key-twice')
    const ct2 = encryptApiKey('same-key-twice')
    expect(ct1).not.toBe(ct2)
    // Both should decrypt back to the same plaintext
    expect(decryptApiKey(ct1)).toBe('same-key-twice')
    expect(decryptApiKey(ct2)).toBe('same-key-twice')
  })

  it('should throw when decrypting with wrong format', () => {
    expect(() => decryptApiKey('not-valid-format')).toThrow('Invalid encrypted format')
    expect(() => decryptApiKey('a:b')).toThrow('Invalid encrypted format')
    expect(() => decryptApiKey('a:b:c:d')).toThrow('Invalid encrypted format')
  })

  it('should return empty string for empty encrypted input', () => {
    expect(decryptApiKey('')).toBe('')
  })
})

describe('hashClientIp', () => {
  it('should produce consistent output for the same input', () => {
    const ip = '192.168.1.100'
    const hash1 = hashClientIp(ip)
    const hash2 = hashClientIp(ip)
    expect(hash1).toBe(hash2)
    // Should be a 64-character hex string (SHA-256)
    expect(hash1).toHaveLength(64)
    expect(hash1).toMatch(/^[0-9a-f]{64}$/)
  })

  it('should produce different hashes for different IPs', () => {
    const hash1 = hashClientIp('10.0.0.1')
    const hash2 = hashClientIp('10.0.0.2')
    expect(hash1).not.toBe(hash2)
  })
})
