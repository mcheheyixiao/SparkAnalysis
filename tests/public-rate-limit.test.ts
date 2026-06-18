import { describe, it, expect, beforeEach } from 'vitest'
import { PublicRateLimitService } from '../src/modules/public/public-rate-limit.service.js'
import { AppError } from '../src/utils/errors.js'

describe('PublicRateLimitService — per-minute (in-memory sliding window)', () => {
  let service: PublicRateLimitService

  beforeEach(() => {
    // Create a fresh instance with explicit override limits (no DB needed)
    service = new PublicRateLimitService({ perMinuteLimit: 5 })
  })

  it('should allow requests within the per-minute limit', async () => {
    for (let i = 0; i < 5; i++) {
      await expect(
        service.checkPerMinuteLimit('hash-aaa'),
      ).resolves.toBeUndefined()
    }
  })

  it('should reject the 6th request within 60 seconds for the same IP hash', async () => {
    for (let i = 0; i < 5; i++) {
      await service.checkPerMinuteLimit('hash-bbb')
    }

    try {
      await service.checkPerMinuteLimit('hash-bbb')
      expect.unreachable('Expected AppError but none was thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(AppError)
      expect((e as AppError).code).toBe('RATE_LIMIT_EXCEEDED')
      expect((e as AppError).message).toBe('请求过于频繁，请稍后再试')
    }
  })

  it('should NOT affect different IP hashes', async () => {
    // Exhaust hash-aaa
    for (let i = 0; i < 5; i++) {
      await service.checkPerMinuteLimit('hash-aaa')
    }

    // hash-bbb should still be able to make requests
    for (let i = 0; i < 5; i++) {
      await expect(
        service.checkPerMinuteLimit('hash-bbb'),
      ).resolves.toBeUndefined()
    }

    // hash-aaa should be blocked
    await expect(
      service.checkPerMinuteLimit('hash-aaa'),
    ).rejects.toThrow(AppError)
  })

  it('should track per-minute for ALL requests (simulates reused reports)', async () => {
    // Even reused requests should count toward per-minute limit
    for (let i = 0; i < 5; i++) {
      await service.checkPerMinuteLimit('hash-reuse')
    }

    // 6th request should be blocked regardless of whether it would be a reuse
    await expect(
      service.checkPerMinuteLimit('hash-reuse'),
    ).rejects.toThrow(AppError)
  })

  it('should clean up stale entries on new request', async () => {
    // Directly insert stale timestamps into the internal map
    const oldTimestamp = Date.now() - 120_000 // 2 minutes ago
    const windows = (service as any).minuteWindows
    windows.set('hash-stale', [oldTimestamp, oldTimestamp])

    // This call should prune stale entries and allow the request
    await expect(
      service.checkPerMinuteLimit('hash-stale'),
    ).resolves.toBeUndefined()

    // After pruning, only 1 active entry (the current one)
    const updated = windows.get('hash-stale')
    expect(updated).toBeDefined()
    expect(updated.length).toBe(1)
  })
})

describe('PublicRateLimitService — checkPublicAnalyzeLimit (legacy)', () => {
  let service: PublicRateLimitService

  beforeEach(() => {
    service = new PublicRateLimitService({ perMinuteLimit: 5 })
  })

  it('should check per-minute for all requests (isNewReport=false)', async () => {
    // isNewReport=false should only check per-minute, not per-day
    for (let i = 0; i < 5; i++) {
      await expect(
        service.checkPublicAnalyzeLimit('hash-legacy', false),
      ).resolves.toBeUndefined()
    }

    await expect(
      service.checkPublicAnalyzeLimit('hash-legacy', false),
    ).rejects.toThrow(AppError)
  })
})
