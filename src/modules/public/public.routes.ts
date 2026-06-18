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
  // Execution order (consistent with design):
  //   BodyLimit (1KB) → Fastify rate-limit → Zod → clientIpHash →
  //   Business rate-limit (per-minute + per-day) → SparkUrlParser →
  //   ReportService.findOrCreateReport → enqueue
  //
  // Rate-limit design:
  //   - Per-minute limit: checked on EVERY POST /analyze call (including reuse).
  //   - Per-day limit:   checked on EVERY POST /analyze call (conservative —
  //     even reuse attempts are blocked if the daily cap is reached, which is
  //     acceptable because a user that exhausts their daily quota should wait).
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

    // Parse spark URL (validates https + spark.lucko.me + extracts code)
    const sparkUrl = parseSparkUrl(parsed.data.url)

    // Client IP hash (does NOT store plaintext IP)
    const ip = getClientIp(request)
    const ipHash = hashClientIp(ip)

    // Business rate limiting (per-minute + per-day)
    // Checked before findOrCreateReport so we don't create a report if limits are hit.
    // isNewReport=true means we check BOTH per-minute and per-day limits.
    // (Conservative: even reuse attempts are blocked if daily limit is exceeded.)
    await publicRateLimitService.checkPublicAnalyzeLimit(ipHash, true)

    // Find or create report
    const result = await reportService.findOrCreateReport(sparkUrl.code, ipHash)

    // If not reused (new pending report), enqueue
    if (!result.reused) {
      if (_queueService) {
        await _queueService.enqueue({
          reportId: result.reportId,
          sparkCode: sparkUrl.code,
        })
      }
    }

    return reply.status(201).send({
      success: true,
      data: {
        reportId: result.reportId,
        status: result.status,
        sparkCode: sparkUrl.code,
        reused: result.reused,
        reuseReason: result.reuseReason || undefined,
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
