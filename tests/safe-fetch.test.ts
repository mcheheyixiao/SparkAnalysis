import { describe, it, expect } from 'vitest'
import { validateSparkFetchUrl } from '../src/utils/safe-fetch.js'
import { AppError } from '../src/utils/errors.js'

function expectError(fn: () => void): AppError {
  try {
    fn()
    throw new Error('Expected AppError but none was thrown')
  } catch (e) {
    expect(e).toBeInstanceOf(AppError)
    return e as AppError
  }
}

describe('validateSparkFetchUrl', () => {
  // ---- Valid URLs ----

  it('should accept raw=1', () => {
    expect(() =>
      validateSparkFetchUrl('https://spark.lucko.me/abc123?raw=1'),
    ).not.toThrow()
  })

  it('should accept raw=1&full=true', () => {
    expect(() =>
      validateSparkFetchUrl('https://spark.lucko.me/abc123?raw=1&full=true'),
    ).not.toThrow()
  })

  it('should accept URL with hyphens and underscores in code', () => {
    expect(() =>
      validateSparkFetchUrl('https://spark.lucko.me/my-test_code123?raw=1'),
    ).not.toThrow()
  })

  // ---- Invalid: query params ----

  it('should reject extra query params', () => {
    const err = expectError(() =>
      validateSparkFetchUrl('https://spark.lucko.me/abc123?raw=1&evil=1'),
    )
    expect(err.code).toBe('SPARK_REMOTE_ERROR')
  })

  it('should reject when raw is missing', () => {
    const err = expectError(() =>
      validateSparkFetchUrl('https://spark.lucko.me/abc123'),
    )
    expect(err.code).toBe('SPARK_REMOTE_ERROR')
  })

  it('should reject when raw != 1', () => {
    const err = expectError(() =>
      validateSparkFetchUrl('https://spark.lucko.me/abc123?raw=2'),
    )
    expect(err.code).toBe('SPARK_REMOTE_ERROR')
  })

  it('should reject when full is present but not true', () => {
    const err = expectError(() =>
      validateSparkFetchUrl('https://spark.lucko.me/abc123?raw=1&full=false'),
    )
    expect(err.code).toBe('SPARK_REMOTE_ERROR')
  })

  it('should reject when only full=true is present (raw missing)', () => {
    const err = expectError(() =>
      validateSparkFetchUrl('https://spark.lucko.me/abc123?full=true'),
    )
    expect(err.code).toBe('SPARK_REMOTE_ERROR')
  })

  // ---- Invalid: path ----

  it('should reject sub-paths', () => {
    const err = expectError(() =>
      validateSparkFetchUrl('https://spark.lucko.me/abc123/extra?raw=1'),
    )
    expect(err.code).toBe('SPARK_REMOTE_ERROR')
  })

  it('should reject empty path', () => {
    const err = expectError(() =>
      validateSparkFetchUrl('https://spark.lucko.me/?raw=1'),
    )
    expect(err.code).toBe('SPARK_REMOTE_ERROR')
  })

  // ---- Invalid: host/port/auth ----

  it('should reject non-spark domain', () => {
    const err = expectError(() =>
      validateSparkFetchUrl('https://example.com/abc123?raw=1'),
    )
    expect(err.code).toBe('SPARK_REMOTE_ERROR')
  })

  it('should reject HTTP', () => {
    const err = expectError(() =>
      validateSparkFetchUrl('http://spark.lucko.me/abc123?raw=1'),
    )
    expect(err.code).toBe('SPARK_REMOTE_ERROR')
  })

  it('should reject custom port', () => {
    const err = expectError(() =>
      validateSparkFetchUrl('https://spark.lucko.me:8080/abc123?raw=1'),
    )
    expect(err.code).toBe('SPARK_REMOTE_ERROR')
  })

  it('should reject username:password in URL', () => {
    const err = expectError(() =>
      validateSparkFetchUrl('https://user:pass@spark.lucko.me/abc123?raw=1'),
    )
    expect(err.code).toBe('SPARK_REMOTE_ERROR')
  })

  // ---- Invalid: hash ----

  it('should reject hash fragment', () => {
    const err = expectError(() =>
      validateSparkFetchUrl('https://spark.lucko.me/abc123?raw=1#section'),
    )
    expect(err.code).toBe('SPARK_REMOTE_ERROR')
  })

  // ---- Invalid: URL parse ----

  it('should reject invalid URL string', () => {
    const err = expectError(() =>
      validateSparkFetchUrl('not-a-url'),
    )
    expect(err.code).toBe('SPARK_REMOTE_ERROR')
  })

  // ---- URL object input ----

  it('should also accept URL objects', () => {
    const url = new URL('https://spark.lucko.me/abc123?raw=1&full=true')
    expect(() => validateSparkFetchUrl(url)).not.toThrow()
  })

  it('should reject URL objects with invalid params', () => {
    const url = new URL('https://spark.lucko.me/abc123?raw=1&bad=param')
    const err = expectError(() => validateSparkFetchUrl(url))
    expect(err.code).toBe('SPARK_REMOTE_ERROR')
  })
})
