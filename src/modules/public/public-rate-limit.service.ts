import { prisma } from '../../plugins/prisma.js'
import { settingsService } from '../settings/settings.service.js'
import { AppError } from '../../utils/errors.js'

/**
 * Business rate limiter for public /api/public/analyze endpoint.
 *
 * Design:
 * - Uses clientIpHash (SHA-256 of IP + salt) — does NOT store plaintext IP.
 * - Two tiers with different counting strategies:
 *   1. Per-minute:  in-memory sliding window, counts ALL POST /analyze requests
 *      (including reuse). Survives restarts = acceptable in MVP.
 *   2. Per-day:    DB-based, counts SparkReport rows. Only checked BEFORE
 *      creating a NEW report (not on reuse). Survives restarts naturally.
 * - Defaults come from SystemSetting values.
 *
 * Per-minute uses in-memory because counting SparkReport rows would miss
 * requests that reuse an existing completed/processing report (no new row
 * is created). The in-memory window is reset on restart — acceptable for MVP.
 */
export class PublicRateLimitService {
  /** In-memory sliding window: key = clientIpHash, value = timestamps (ms) */
  private readonly minuteWindows = new Map<string, number[]>()

  /** Interval handle for periodic cleanup */
  private cleanupInterval: ReturnType<typeof setInterval> | null = null

  /**
   * Optional overrides for testing — when set, these are used instead of
   * querying the database for SystemSettings.
   */
  private readonly perMinuteLimitOverride?: number
  private readonly perDayLimitOverride?: number

  constructor(options?: { perMinuteLimit?: number; perDayLimit?: number }) {
    this.perMinuteLimitOverride = options?.perMinuteLimit
    this.perDayLimitOverride = options?.perDayLimit

    // Clean up stale entries every 5 minutes to prevent unbounded Map growth.
    this.cleanupInterval = setInterval(() => this.pruneStaleWindows(), 5 * 60_000)
    // Allow the process to exit even if this timer is still active
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref()
    }
  }

  /**
   * Check per-minute limit (in-memory sliding window).
   * MUST be called on EVERY POST /api/public/analyze request, including reuse.
   *
   * @throws AppError with code RATE_LIMIT_EXCEEDED if limit is breached.
   */
  async checkPerMinuteLimit(clientIpHash: string): Promise<void> {
    const limit = await this.getPerMinuteLimit()
    const now = Date.now()
    const windowStart = now - 60_000

    let timestamps = this.minuteWindows.get(clientIpHash)

    if (!timestamps) {
      timestamps = [now]
      this.minuteWindows.set(clientIpHash, timestamps)
      return
    }

    // Remove expired entries (older than 60 seconds)
    const active = timestamps.filter(ts => ts > windowStart)

    if (active.length >= limit) {
      throw new AppError(
        'RATE_LIMIT_EXCEEDED',
        '请求过于频繁，请稍后再试',
      )
    }

    active.push(now)
    this.minuteWindows.set(clientIpHash, active)
  }

  /**
   * Check per-day limit (DB-based, counts SparkReport rows).
   * MUST only be called BEFORE creating a NEW SparkReport — NOT on reuse.
   *
   * @throws AppError with code RATE_LIMIT_EXCEEDED if limit is breached.
   */
  async checkPerDayLimit(clientIpHash: string): Promise<void> {
    const limit = await this.getPerDayLimit()
    const since = new Date(Date.now() - 24 * 60 * 60_000) // 24 hours ago

    const count = await prisma.sparkReport.count({
      where: {
        clientIpHash,
        createdAt: { gte: since },
      },
    })

    if (count >= limit) {
      throw new AppError(
        'RATE_LIMIT_EXCEEDED',
        '今日分析次数已达上限，请明天再试',
      )
    }
  }

  /**
   * Legacy entry point — kept for backward compatibility.
   * Prefer calling checkPerMinuteLimit and checkPerDayLimit separately
   * so the route can control exactly when the daily check fires.
   *
   * @deprecated Use checkPerMinuteLimit + checkPerDayLimit directly.
   */
  async checkPublicAnalyzeLimit(
    clientIpHash: string,
    isNewReport: boolean,
  ): Promise<void> {
    await this.checkPerMinuteLimit(clientIpHash)

    if (isNewReport) {
      await this.checkPerDayLimit(clientIpHash)
    }
  }

  // ---- Private helpers ----

  private async getPerMinuteLimit(): Promise<number> {
    if (this.perMinuteLimitOverride !== undefined) return this.perMinuteLimitOverride
    const value = await settingsService.getNumber('publicRateLimitPerMinute', 5)
    return Math.min(Math.max(value, 1), 100)
  }

  private async getPerDayLimit(): Promise<number> {
    if (this.perDayLimitOverride !== undefined) return this.perDayLimitOverride
    const value = await settingsService.getNumber('publicRateLimitPerDay', 30)
    return Math.min(Math.max(value, 1), 1000)
  }

  /**
   * Remove entries with no active timestamps from the Map.
   * Called periodically to prevent unbounded memory growth.
   */
  private pruneStaleWindows(): void {
    const now = Date.now()
    const windowStart = now - 60_000

    for (const [key, timestamps] of this.minuteWindows) {
      const active = timestamps.filter(ts => ts > windowStart)
      if (active.length === 0) {
        this.minuteWindows.delete(key)
      } else {
        this.minuteWindows.set(key, active)
      }
    }
  }

  /**
   * Clean up interval on shutdown. Call from server shutdown handler.
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }
    this.minuteWindows.clear()
  }
}

export const publicRateLimitService = new PublicRateLimitService()
