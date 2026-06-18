import { randomUUID } from 'crypto'
import { prisma } from '../../plugins/prisma.js'
import { AppError } from '../../utils/errors.js'
import { safeJsonParse, safeJsonStringify } from '../../utils/json.js'
import { settingsService } from '../settings/settings.service.js'

export interface FindOrCreateResult {
  reportId: string
  status: 'completed' | 'processing' | 'pending'
  reused: boolean
  reuseReason?: 'completed_recent' | 'processing_existing' | 'pending_existing'
  sparkCode?: string
}

export interface ReusableReport {
  reportId: string
  status: 'completed' | 'processing' | 'pending'
  reuseReason: 'completed_recent' | 'processing_existing' | 'pending_existing'
  sparkCode: string
}

export class ReportService {
  // sparkCodeCreateLocks: prevent concurrent creation of reports for same sparkCode
  private sparkCodeCreateLocks = new Map<string, Promise<unknown>>()

  /**
   * Check if there is a reusable report for the given sparkCode.
   * Returns the reusable report info, or null if a new report must be created.
   * Does NOT create anything — safe to call before daily limit checks.
   */
  async findReusableReport(sparkCode: string): Promise<ReusableReport | null> {
    const reuseTtlSeconds = await settingsService.getNumber('reuseReportTtlSeconds')
    const now = new Date()

    // 1. Check completed + reusable
    const completed = await prisma.sparkReport.findFirst({
      where: { sparkCode, status: 'completed' },
      orderBy: { createdAt: 'desc' },
    })

    if (completed) {
      const ageMs = now.getTime() - completed.createdAt.getTime()
      const ageSeconds = ageMs / 1000
      const expiresOk = !completed.expiresAt || completed.expiresAt > now

      if (ageSeconds < reuseTtlSeconds && expiresOk) {
        return {
          reportId: completed.id,
          status: 'completed',
          reuseReason: 'completed_recent',
          sparkCode,
        }
      }
    }

    // 2. Check processing
    const processing = await prisma.sparkReport.findFirst({
      where: { sparkCode, status: 'processing' },
      orderBy: { createdAt: 'desc' },
    })

    if (processing && processing.lockedAt) {
      const lockedAgeMs = now.getTime() - processing.lockedAt.getTime()
      const expiresOk = !processing.expiresAt || processing.expiresAt > now

      if (lockedAgeMs < 5 * 60 * 1000 && expiresOk) {
        return {
          reportId: processing.id,
          status: 'processing',
          reuseReason: 'processing_existing',
          sparkCode,
        }
      }

      // Stale processing — mark as failed
      await prisma.sparkReport.update({
        where: { id: processing.id },
        data: {
          status: 'failed',
          errorCode: 'SERVER_RESTARTED',
          errorMessage: '任务处理超时，可能因服务器重启中断',
          completedAt: now,
        },
      })
    }

    // 3. Check pending
    const pending = await prisma.sparkReport.findFirst({
      where: { sparkCode, status: 'pending' },
      orderBy: { createdAt: 'desc' },
    })

    if (pending) {
      if (pending.lockedAt) {
        const lockedAgeMs = now.getTime() - pending.lockedAt.getTime()
        if (lockedAgeMs < 5 * 60 * 1000) {
          return {
            reportId: pending.id,
            status: 'pending',
            reuseReason: 'pending_existing',
            sparkCode,
          }
        }
      }
      return {
        reportId: pending.id,
        status: 'pending',
        reuseReason: 'pending_existing',
        sparkCode,
      }
    }

    return null
  }

  /**
   * Create a new pending SparkReport with per-sparkCode locking to prevent
   * TOCTOU duplicates. Caller MUST have already checked daily limit and
   * confirmed findReusableReport returned null.
   */
  async createPendingReport(sparkCode: string, clientIpHash: string): Promise<FindOrCreateResult> {
    // Serialize per sparkCode to prevent concurrent creation
    const existingLock = this.sparkCodeCreateLocks.get(sparkCode)
    if (existingLock) {
      await existingLock
      // After waiting, double-check: another caller may have created the report
      const reusable = await this.findReusableReport(sparkCode)
      if (reusable) {
        return {
          reportId: reusable.reportId,
          status: reusable.status,
          reused: true,
          reuseReason: reusable.reuseReason,
          sparkCode,
        }
      }
    }

    const lockPromise = this._createPendingReport(sparkCode, clientIpHash)
    this.sparkCodeCreateLocks.set(sparkCode, lockPromise)

    try {
      return await lockPromise
    } finally {
      this.sparkCodeCreateLocks.delete(sparkCode)
    }
  }

  private async _createPendingReport(sparkCode: string, clientIpHash: string): Promise<FindOrCreateResult> {
    const autoCleanupDays = await settingsService.getNumber('autoCleanupDays')
    const now = new Date()

    // Double-check: a prior lock holder may have already created a report
    const existing = await this.findReusableReport(sparkCode)
    if (existing) {
      return {
        reportId: existing.reportId,
        status: existing.status,
        reused: true,
        reuseReason: existing.reuseReason,
        sparkCode,
      }
    }

    const expiresAt = autoCleanupDays > 0
      ? new Date(now.getTime() + autoCleanupDays * 24 * 60 * 60 * 1000)
      : null

    const report = await prisma.sparkReport.create({
      data: {
        id: randomUUID(),
        sparkCode,
        sparkUrl: `https://spark.lucko.me/${sparkCode}`,
        reportType: 'unknown',
        status: 'pending',
        stage: 'queued',
        progress: 0,
        clientIpHash,
        expiresAt,
      },
    })

    return {
      reportId: report.id,
      status: 'pending',
      reused: false,
      sparkCode,
    }
  }

  // Kept for backward compatibility with any internal callers
  async findOrCreateReport(sparkCode: string, clientIpHash: string): Promise<FindOrCreateResult> {
    // Serialize per sparkCode
    const existingLock = this.sparkCodeCreateLocks.get(sparkCode)
    if (existingLock) {
      await existingLock
      // After waiting, check again
      const retry = await this.findOrCreateReport(sparkCode, clientIpHash)
      return retry
    }

    const lockPromise = this._findOrCreateReport(sparkCode, clientIpHash)
    this.sparkCodeCreateLocks.set(sparkCode, lockPromise)

    try {
      const result = await lockPromise
      return result
    } finally {
      this.sparkCodeCreateLocks.delete(sparkCode)
    }
  }

  private async _findOrCreateReport(sparkCode: string, clientIpHash: string): Promise<FindOrCreateResult> {
    const reuseTtlSeconds = await settingsService.getNumber('reuseReportTtlSeconds')
    const autoCleanupDays = await settingsService.getNumber('autoCleanupDays')
    const now = new Date()

    // 1. Check completed + reusable
    const completed = await prisma.sparkReport.findFirst({
      where: {
        sparkCode,
        status: 'completed',
      },
      orderBy: { createdAt: 'desc' },
    })

    if (completed) {
      const ageMs = now.getTime() - completed.createdAt.getTime()
      const ageSeconds = ageMs / 1000
      const expiresOk = !completed.expiresAt || completed.expiresAt > now

      if (ageSeconds < reuseTtlSeconds && expiresOk) {
        return {
          reportId: completed.id,
          status: 'completed',
          reused: true,
          reuseReason: 'completed_recent',
          sparkCode,
        }
      }
    }

    // 2. Check processing
    const processing = await prisma.sparkReport.findFirst({
      where: {
        sparkCode,
        status: 'processing',
      },
      orderBy: { createdAt: 'desc' },
    })

    if (processing && processing.lockedAt) {
      const lockedAgeMs = now.getTime() - processing.lockedAt.getTime()
      const expiresOk = !processing.expiresAt || processing.expiresAt > now

      if (lockedAgeMs < 5 * 60 * 1000 && expiresOk) {
        return {
          reportId: processing.id,
          status: 'processing',
          reused: true,
          reuseReason: 'processing_existing',
          sparkCode,
        }
      }

      // Stale processing — mark as failed
      await prisma.sparkReport.update({
        where: { id: processing.id },
        data: {
          status: 'failed',
          errorCode: 'SERVER_RESTARTED',
          errorMessage: '任务处理超时，可能因服务器重启中断',
          completedAt: now,
        },
      })
    }

    // 3. Check for existing pending report (TOCTOU fix: a prior lock holder
    //    may have already created a pending report while this caller waited)
    const pending = await prisma.sparkReport.findFirst({
      where: {
        sparkCode,
        status: 'pending',
      },
      orderBy: { createdAt: 'desc' },
    })

    if (pending) {
      // If locked recently (within 5 minutes), return it — it is being processed
      if (pending.lockedAt) {
        const lockedAgeMs = now.getTime() - pending.lockedAt.getTime()
        if (lockedAgeMs < 5 * 60 * 1000) {
          return {
            reportId: pending.id,
            status: 'pending',
            reused: true,
            reuseReason: 'pending_existing',
            sparkCode,
          }
        }
      }
      // lockedAt is old or null — return it; the queue will pick it up
      return {
        reportId: pending.id,
        status: 'pending',
        reused: true,
        reuseReason: 'pending_existing',
        sparkCode,
      }
    }

    // 4. Create new report
    const expiresAt = autoCleanupDays > 0
      ? new Date(now.getTime() + autoCleanupDays * 24 * 60 * 60 * 1000)
      : null

    const report = await prisma.sparkReport.create({
      data: {
        id: randomUUID(),
        sparkCode,
        sparkUrl: `https://spark.lucko.me/${sparkCode}`,
        reportType: 'unknown',
        status: 'pending',
        stage: 'queued',
        progress: 0,
        clientIpHash,
        expiresAt,
      },
    })

    return {
      reportId: report.id,
      status: 'pending',
      reused: false,
      sparkCode,
    }
  }

  async findById(reportId: string) {
    const report = await prisma.sparkReport.findUnique({
      where: { id: reportId },
      include: { analysisResult: true },
    })

    if (!report) {
      throw new AppError('REPORT_NOT_FOUND', '报告不存在')
    }

    return report
  }

  async findByIdPublic(reportId: string) {
    const report = await prisma.sparkReport.findUnique({
      where: { id: reportId },
      include: { analysisResult: true },
    })

    if (!report) {
      throw new AppError('REPORT_NOT_FOUND', '报告不存在')
    }

    // Strip internal/sensitive data
    const result: any = {
      reportId: report.id,
      sparkCode: report.sparkCode,
      sparkUrl: report.sparkUrl,
      reportType: report.reportType,
      status: report.status,
      severity: report.analysisResult?.severity || null,
      summary: report.analysisResult?.summary || null,
      createdAt: report.createdAt,
      completedAt: report.completedAt,
    }

    if (report.status === 'completed') {
      result.normalizedSummary = safeJsonParse(report.normalizedJson, null)
      result.ruleAnalysis = safeJsonParse(report.ruleAnalysisJson, null)
      result.aiResult = safeJsonParse(report.analysisResult?.aiResultJson, null)
    }

    if (report.status === 'processing' || report.status === 'pending') {
      result.progress = report.progress
      result.stage = report.stage
      result.message = stageToMessage(report.stage)
    }

    if (report.status === 'failed') {
      result.errorCode = report.errorCode
      result.errorMessage = report.errorMessage
    }

    return result
  }

  async saveAnalysisResult(
    reportId: string,
    aiResult: {
      aiResultJson: object | null
      markdownReport: string
      severity: string
      summary: string
      isFallback: boolean
      model?: string
      promptTemplateId?: string
      promptVersion?: number
      inputTokens?: number
      outputTokens?: number
    },
  ) {
    const data = {
      severity: aiResult.severity,
      summary: aiResult.summary,
      aiResultJson: aiResult.aiResultJson ? safeJsonStringify(aiResult.aiResultJson) : null,
      markdownReport: aiResult.markdownReport,
      isFallback: aiResult.isFallback,
      model: aiResult.model,
      promptTemplateId: aiResult.promptTemplateId,
      promptVersion: aiResult.promptVersion,
      inputTokens: aiResult.inputTokens,
      outputTokens: aiResult.outputTokens,
    }

    const existing = await prisma.analysisResult.findUnique({ where: { reportId } })

    if (existing) {
      await prisma.analysisResult.update({ where: { reportId }, data })
    } else {
      await prisma.analysisResult.create({
        data: { id: randomUUID(), reportId, ...data },
      })
    }
  }

  async markFailed(
    reportId: string,
    errorCode: string,
    errorMessage: string,
    errorDetailJson?: unknown,
  ) {
    await prisma.sparkReport.update({
      where: { id: reportId },
      data: {
        status: 'failed',
        stage: 'failed',
        errorCode,
        errorMessage,
        errorDetailJson: errorDetailJson ? safeJsonStringify(errorDetailJson) : null,
        completedAt: new Date(),
      },
    })
  }

  async updateStage(
    reportId: string,
    data: {
      stage?: string
      progress?: number
      status?: string
      platform?: string
      minecraftVersion?: string
      sparkVersion?: string
      serverBrand?: string
      reportType?: string
      durationSeconds?: number
      rawMetadataJson?: string | null
      normalizedJson?: string | null
      ruleAnalysisJson?: string | null
      startedAt?: Date | null
      completedAt?: Date | null
      lockedAt?: Date | null
    },
  ) {
    await prisma.sparkReport.update({
      where: { id: reportId },
      data,
    })
  }

  async list(options: {
    status?: string
    sparkCode?: string
    severity?: string
    reportType?: string
    createdFrom?: string
    createdTo?: string
    page?: number
    pageSize?: number
    sortBy?: string
    sortOrder?: 'asc' | 'desc'
  }) {
    const { page = 1, pageSize = 20, sortBy = 'createdAt', sortOrder = 'desc' } = options
    const where: any = {}

    if (options.status) where.status = options.status
    if (options.sparkCode) where.sparkCode = { contains: options.sparkCode }
    if (options.reportType) where.reportType = options.reportType
    if (options.createdFrom || options.createdTo) {
      where.createdAt = {}
      if (options.createdFrom) where.createdAt.gte = new Date(options.createdFrom)
      if (options.createdTo) where.createdAt.lte = new Date(options.createdTo)
    }

    // Severity comes from AnalysisResult (join)
    if (options.severity) {
      where.analysisResult = { severity: options.severity }
    }

    const [total, reports] = await Promise.all([
      prisma.sparkReport.count({ where }),
      prisma.sparkReport.findMany({
        where,
        include: { analysisResult: true },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { [sortBy]: sortOrder },
      }),
    ])

    return { total, reports, page, pageSize }
  }

  async delete(reportId: string) {
    const report = await prisma.sparkReport.findUnique({ where: { id: reportId } })
    if (!report) {
      throw new AppError('REPORT_NOT_FOUND', '报告不存在')
    }

    // Cascade delete (AnalysisResult cascade configured in Prisma)
    await prisma.sparkReport.delete({ where: { id: reportId } })
  }

  async cleanup(olderThanDays: number, dryRun: boolean) {
    const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000)

    // Find reports where expiresAt is set and past due, OR created before cutoff without expiresAt
    const matched = await prisma.sparkReport.count({
      where: {
        OR: [
          { expiresAt: { not: null, lt: new Date() } },
          { expiresAt: null, createdAt: { lt: cutoff } },
        ],
      },
    })

    if (!dryRun && matched > 0) {
      await prisma.sparkReport.deleteMany({
        where: {
          OR: [
            { expiresAt: { not: null, lt: new Date() } },
            { expiresAt: null, createdAt: { lt: cutoff } },
          ],
        },
      })
    }

    return { matched, deleted: dryRun ? 0 : matched, dryRun }
  }

  async getStatus(reportId: string) {
    const report = await prisma.sparkReport.findUnique({
      where: { id: reportId },
    })

    if (!report) {
      throw new AppError('REPORT_NOT_FOUND', '报告不存在')
    }

    return {
      reportId: report.id,
      status: report.status,
      progress: report.progress,
      stage: report.stage,
      message: stageToMessage(report.stage),
      errorCode: report.errorCode,
      errorMessage: report.errorMessage,
    }
  }
}

const STAGE_MESSAGES: Record<string, string> = {
  queued: '等待分析任务开始',
  fetching_spark: '正在读取 spark 报告',
  normalizing: '正在整理性能数据',
  rule_analyzing: '正在进行规则预分析',
  building_prompt: '正在构建 AI 分析上下文',
  calling_ai: '正在调用 AI 生成诊断报告',
  saving_result: '正在保存分析结果',
  completed: '分析完成',
  failed: '分析失败',
}

function stageToMessage(stage: string | null | undefined): string {
  if (!stage) return '未知状态'
  return STAGE_MESSAGES[stage] || stage
}

export const reportService = new ReportService()
