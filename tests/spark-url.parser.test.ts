import { describe, it, expect } from 'vitest'
import { parseSparkUrl } from '../src/modules/spark/spark-url.parser.js'
import { AppError } from '../src/utils/errors.js'

describe('parseSparkUrl', () => {
  it('should parse a valid spark URL', () => {
    const result = parseSparkUrl('https://spark.lucko.me/abc123XYZ')
    expect(result.code).toBe('abc123XYZ')
    expect(result.normalizedUrl).toBe('https://spark.lucko.me/abc123XYZ')
    expect(result.rawMetadataUrl).toBe('https://spark.lucko.me/abc123XYZ?raw=1')
  })

  it('should reject an invalid domain', () => {
    expect(() => parseSparkUrl('https://evil.example.com/abc123')).toThrow(AppError)
    try {
      parseSparkUrl('https://evil.example.com/abc123')
    } catch (e) {
      expect(e).toBeInstanceOf(AppError)
      expect((e as AppError).code).toBe('INVALID_SPARK_URL')
    }
  })

  it('should reject HTTP instead of HTTPS', () => {
    expect(() => parseSparkUrl('http://spark.lucko.me/abc123')).toThrow(AppError)
    try {
      parseSparkUrl('http://spark.lucko.me/abc123')
    } catch (e) {
      expect(e).toBeInstanceOf(AppError)
      expect((e as AppError).code).toBe('INVALID_SPARK_URL')
    }
  })

  it('should reject URL with @ bypass attempt', () => {
    expect(() =>
      parseSparkUrl('https://evil@spark.lucko.me/abc123'),
    ).toThrow(AppError)
    try {
      parseSparkUrl('https://evil@spark.lucko.me/abc123')
    } catch (e) {
      expect(e).toBeInstanceOf(AppError)
      expect((e as AppError).code).toBe('INVALID_SPARK_URL')
    }
  })

  it('should reject URL with custom port', () => {
    expect(() =>
      parseSparkUrl('https://spark.lucko.me:8080/abc123'),
    ).toThrow(AppError)
    try {
      parseSparkUrl('https://spark.lucko.me:8080/abc123')
    } catch (e) {
      expect(e).toBeInstanceOf(AppError)
      expect((e as AppError).code).toBe('INVALID_SPARK_URL')
    }
  })

  it('should accept URL with query params and extract code', () => {
    const result = parseSparkUrl('https://spark.lucko.me/abc123?foo=bar&baz=1')
    expect(result.code).toBe('abc123')
    expect(result.normalizedUrl).toBe('https://spark.lucko.me/abc123')
    expect(result.rawMetadataUrl).toBe('https://spark.lucko.me/abc123?raw=1')
  })

  it('should reject an empty string', () => {
    expect(() => parseSparkUrl('')).toThrow(AppError)
  })

  it('should reject non-URL input', () => {
    expect(() => parseSparkUrl('not-a-url-at-all')).toThrow(AppError)
  })
})
