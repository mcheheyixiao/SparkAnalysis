import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { parseSparkUrl } from '../spark/spark-url.parser.js'
import { reportService } from '../reports/report.service.js'
import { hashClientIp } from '../../utils/crypto.js'
import { getClientIp } from '../../utils/ip.js'
import { AppError } from '../../utils/errors.js'
import { publicRateLimitService } from './public-rate-limit.service.js'

const analyzeSchema = z.object({
  url: z.string().min(1).max(2048),
})

// Note: queueService will be injected after creation
let _queueService: { enqueue: (job: { reportId: string; sparkCode: string }) => Promise<void> } | null = null

export function setQueueService(qs: typeof _queueService) {
  _queueService = qs
}

export async function publicRoutes(fastify: FastifyInstance) {
  // POST /api/public/analyze — Submit spark URL for analysis
  //
  // Execution flow (consistent with design):
  //   BodyLimit (1KB) → Fastify rate-limit → Zod → clientIpHash →
  //   Per-minute business rate limit (ALL requests, including reuse) →
  //   SparkUrlParser → ReportService.findReusableReport →
  //   If reusable → return immediately (no daily limit check).
  //   If NOT reusable → Per-day business rate limit → createPendingReport → enqueue.
  //
  // Rate-limit design:
  //   - Per-minute: in-memory sliding window, counts ALL POST /analyze calls.
  //   - Per-day:    DB-based, counts SparkReport rows, only before creating a NEW report.
  //   - Limits are read from SystemSetting: publicRateLimitPerMinute (default 5)
  //     and publicRateLimitPerDay (default 30).
  fastify.post('/api/public/analyze', {
    bodyLimit: 1024, // 1KB body limit
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const rid = (request as any).requestId

    // Zod validation
    const parsed = analyzeSchema.safeParse(request.body)
    if (!parsed.success) {
      const err = new AppError('INVALID_SPARK_URL', '请输入有效的 spark 链接', { requestId: rid })
      return reply.status(400).send({
        success: false,
        error: { code: err.code, message: err.message, requestId: rid },
      })
    }

    // Client IP hash (does NOT store plaintext IP)
    const ip = getClientIp(request)
    const ipHash = hashClientIp(ip)

    // ---- Per-minute rate limit (ALL requests, including reuse) ----
    await publicRateLimitService.checkPerMinuteLimit(ipHash)

    // Parse spark URL (validates https + spark.lucko.me + extracts code)
    const sparkUrl = parseSparkUrl(parsed.data.url)

    // ---- Check for reusable report ----
    const reusable = await reportService.findReusableReport(sparkUrl.code)

    if (reusable) {
      // Reuse existing report — NO daily limit check
      return reply.status(201).send({
        success: true,
        data: {
          reportId: reusable.reportId,
          status: reusable.status,
          sparkCode: sparkUrl.code,
          reused: true,
          reuseReason: reusable.reuseReason,
        },
      })
    }

    // ---- Per-day limit (only before creating a NEW report) ----
    await publicRateLimitService.checkPerDayLimit(ipHash)

    // ---- Create new pending report ----
    const result = await reportService.createPendingReport(sparkUrl.code, ipHash)

    // If createPendingReport detected a race and returned a reused result
    if (result.reused) {
      return reply.status(201).send({
        success: true,
        data: {
          reportId: result.reportId,
          status: result.status,
          sparkCode: sparkUrl.code,
          reused: true,
          reuseReason: result.reuseReason,
        },
      })
    }

    // Enqueue the new report
    if (_queueService) {
      await _queueService.enqueue({
        reportId: result.reportId,
        sparkCode: sparkUrl.code,
      })
    }

    return reply.status(201).send({
      success: true,
      data: {
        reportId: result.reportId,
        status: result.status,
        sparkCode: sparkUrl.code,
        reused: false,
      },
    })
  })

  // GET /api/public/reports/:id/status
  fastify.get('/api/public/reports/:id/status', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    const status = await reportService.getStatus(id)
    return reply.send({ success: true, data: status })
  })

  // GET /api/public/reports/:id
  fastify.get('/api/public/reports/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    const report = await reportService.findByIdPublic(id)

    // If still processing, return status
    if (report.status === 'processing' || report.status === 'pending') {
      return reply.send({
        success: true,
        data: {
          reportId: report.reportId,
          status: report.status,
          progress: report.progress,
          stage: report.stage,
          message: report.message,
        },
      })
    }

    // If failed, return error info
    if (report.status === 'failed') {
      return reply.send({
        success: true,
        data: {
          reportId: report.reportId,
          status: report.status,
          errorCode: report.errorCode,
          errorMessage: report.errorMessage,
          createdAt: report.createdAt,
        },
      })
    }

    // Completed
    return reply.send({ success: true, data: report })
  })
}
