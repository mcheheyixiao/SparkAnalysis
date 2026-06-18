import { prisma } from '../../plugins/prisma.js'
import { settingsService } from '../settings/settings.service.js'
import { AppError } from '../../utils/errors.js'

/**
 * Business rate limiter for public /api/public/analyze endpoint.
 *
 * Design:
 * - Uses clientIpHash (SHA-256 of IP + salt) — does NOT store plaintext IP.
 * - Counts SparkReport rows in the database to survive restarts.
 * - Two tiers:
 *   1. Per-minute:  count reports with same clientIpHash in the last 60 seconds.
 *      Checked on EVERY /api/public/analyze call (including reuse).
 *   2. Per-day:    count reports with same clientIpHash in the last 24 hours.
 *      Checked only BEFORE creating a NEW SparkReport (not on reuse).
 * - Defaults come from SystemSetting values loaded by the caller.
 *
 * Rationale for DB-based counting (per MVP constraints):
 * - No new tables needed.
 * - Survives server restarts.
 * - Uses the existing (clientIpHash, createdAt) index on SparkReport.
 * - Does not save plaintext IP anywhere.
 */
export class PublicRateLimitService {
  /**
   * Check both per-minute and per-day limits for a given clientIpHash.
   *
   * @param clientIpHash - SHA-256 hash of (clientIp + IP_HASH_SALT)
   * @param isNewReport  - true if the caller intends to CREATE a new SparkReport.
   *                       When false (reusing an existing report), the daily limit
   *                       is NOT checked — only the per-minute limit applies.
   * @throws AppError with code RATE_LIMIT_EXCEEDED if limit is breached.
   */
  async checkPublicAnalyzeLimit(
    clientIpHash: string,
    isNewReport: boolean,
  ): Promise<void> {
    // 1. Per-minute check: how many reports from this IP hash in the last 60 seconds?
    await this.checkPerMinuteLimit(clientIpHash)

    // 2. Per-day check: only for NEW reports (not reuse)
    if (isNewReport) {
      await this.checkPerDayLimit(clientIpHash)
    }
  }

  private async checkPerMinuteLimit(clientIpHash: string): Promise<void> {
    const limit = await this.getPerMinuteLimit()
    const since = new Date(Date.now() - 60_000) // 60 seconds ago

    const count = await prisma.sparkReport.count({
      where: {
        clientIpHash,
        createdAt: { gte: since },
      },
    })

    if (count >= limit) {
      throw new AppError(
        'RATE_LIMIT_EXCEEDED',
        '请求过于频繁，请稍后再试',
      )
    }
  }

  private async checkPerDayLimit(clientIpHash: string): Promise<void> {
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

  private async getPerMinuteLimit(): Promise<number> {
    const value = await settingsService.getNumber('publicRateLimitPerMinute')
    // Default 5, clamp to reasonable range
    return Math.min(Math.max(value || 5, 1), 100)
  }

  private async getPerDayLimit(): Promise<number> {
    const value = await settingsService.getNumber('publicRateLimitPerDay')
    // Default 30, clamp to reasonable range
    return Math.min(Math.max(value || 30, 1), 1000)
  }
}

export const publicRateLimitService = new PublicRateLimitService()
