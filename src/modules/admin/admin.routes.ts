import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { randomUUID } from 'crypto'
import { prisma } from '../../plugins/prisma.js'
import { encryptApiKey, decryptApiKey, maskApiKey } from '../../utils/crypto.js'
import { adminAuthService } from './admin-auth.service.js'
import { promptService } from '../prompts/prompt.service.js'
import { reportService } from '../reports/report.service.js'
import { settingsService } from '../settings/settings.service.js'
import { logService } from '../logs/log.service.js'
import { AppError } from '../../utils/errors.js'
import { safeJsonParse } from '../../utils/json.js'
import { DeepSeekProvider } from '../ai/deepseek-provider.js'
import type { IQueueStats } from '../queue/queue.interface.js'

// ---- Queue status getter injection ----
let _getQueueStatus: (() => IQueueStats) | null = null

export function setQueueStatusGetter(getter: () => IQueueStats) {
  _getQueueStatus = getter
}

// ---- Zod schemas ----
const loginSchema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(128),
})

const aiSettingsSchema = z.object({
  provider: z.string().max(32).optional(),
  baseUrl: z.string().max(512).optional(),
  apiKey: z.string().max(512).optional(),
  model: z.string().max(128).optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(1).max(131072).optional(),
  timeoutMs: z.number().int().min(1000).max(300000).optional(),
  enabled: z.boolean().optional(),
})

const systemSettingsSchema = z.record(z.string(), z.string())

const promptCreateSchema = z.object({
  name: z.string().min(1).max(128),
  type: z.enum(['system', 'user', 'json_schema', 'beginner', 'advanced']),
  content: z.string().min(1),
})

const promptUpdateSchema = z.object({
  name: z.string().min(1).max(128).optional(),
  content: z.string().min(1).optional(),
})

const cleanupSchema = z.object({
  olderThanDays: z.number().int().min(1).max(365).default(30),
  dryRun: z.boolean().default(false),
})

const testAiSchema = z.object({
  provider: z.string().max(32).optional(),
  baseUrl: z.string().max(512).optional(),
  apiKey: z.string().max(512).optional(),
  model: z.string().max(128).optional(),
})

export async function adminRoutes(fastify: FastifyInstance) {
  // ========================
  // Auth routes
  // ========================

  // POST /api/admin/auth/login
  fastify.post('/api/admin/auth/login', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = loginSchema.safeParse(request.body)
    if (!parsed.success) {
      const err = new AppError('INVALID_CREDENTIALS', '请输入用户名和密码')
      return reply.status(400).send({
        success: false,
        error: { code: err.code, message: err.message },
      })
    }

    const result = await adminAuthService.login(parsed.data.username, parsed.data.password, request)

    // Audit log
    await logService.write('info', 'auth', `Admin login: ${parsed.data.username}`)

    return reply.send({
      success: true,
      data: result,
    })
  })

  // POST /api/admin/auth/logout
  fastify.post('/api/admin/auth/logout', async (request: FastifyRequest, reply: FastifyReply) => {
    const adminUser = (request as any).adminUser
    const result = await adminAuthService.logout(adminUser.sub)
    await logService.write('info', 'auth', `Admin logout: ${adminUser.username}`)
    return reply.send({ success: true, data: result })
  })

  // GET /api/admin/auth/me
  fastify.get('/api/admin/auth/me', async (request: FastifyRequest, reply: FastifyReply) => {
    const adminUser = (request as any).adminUser
    const user = await adminAuthService.getMe(adminUser.sub)
    return reply.send({ success: true, data: { user } })
  })

  // ========================
  // AI Settings routes
  // ========================

  // GET /api/admin/settings/ai
  fastify.get('/api/admin/settings/ai', async (_request: FastifyRequest, reply: FastifyReply) => {
    const setting = await prisma.aiSetting.findFirst()

    if (!setting) {
      return reply.send({
        success: true,
        data: {
          provider: 'deepseek',
          baseUrl: 'https://api.deepseek.com/v1',
          model: 'deepseek-chat',
          apiKeyMasked: '',
          temperature: 0.3,
          maxTokens: 4096,
          timeoutMs: 60000,
          enabled: false,
          updatedAt: null,
        },
      })
    }

    return reply.send({
      success: true,
      data: {
        provider: setting.provider,
        baseUrl: setting.baseUrl,
        model: setting.model,
        apiKeyMasked: maskApiKey(setting.apiKeyEncrypted),
        temperature: setting.temperature,
        maxTokens: setting.maxTokens,
        timeoutMs: setting.timeoutMs,
        enabled: setting.enabled,
        updatedAt: setting.updatedAt,
      },
    })
  })

  // PUT /api/admin/settings/ai
  fastify.put('/api/admin/settings/ai', {
    bodyLimit: 65536, // 64KB
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = aiSettingsSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_SPARK_URL', message: '参数校验失败', detail: parsed.error.issues },
      })
    }

    const data = parsed.data
    const existing = await prisma.aiSetting.findFirst()

    const updateData: any = {}
    if (data.provider !== undefined) updateData.provider = data.provider
    if (data.baseUrl !== undefined) updateData.baseUrl = data.baseUrl
    if (data.apiKey !== undefined) updateData.apiKeyEncrypted = encryptApiKey(data.apiKey)
    if (data.model !== undefined) updateData.model = data.model
    if (data.temperature !== undefined) updateData.temperature = data.temperature
    if (data.maxTokens !== undefined) updateData.maxTokens = data.maxTokens
    if (data.timeoutMs !== undefined) updateData.timeoutMs = data.timeoutMs
    if (data.enabled !== undefined) updateData.enabled = data.enabled

    let setting: any
    if (existing) {
      setting = await prisma.aiSetting.update({
        where: { id: existing.id },
        data: updateData,
      })
    } else {
      setting = await prisma.aiSetting.create({
        data: {
          id: randomUUID(),
          provider: data.provider ?? 'deepseek',
          baseUrl: data.baseUrl ?? 'https://api.deepseek.com/v1',
          apiKeyEncrypted: data.apiKey ? encryptApiKey(data.apiKey) : '',
          model: data.model ?? 'deepseek-chat',
          temperature: data.temperature ?? 0.3,
          maxTokens: data.maxTokens ?? 4096,
          timeoutMs: data.timeoutMs ?? 60000,
          enabled: data.enabled ?? true,
        },
      })
    }

    // Audit log
    const adminUser = (request as any).adminUser
    await prisma.adminAuditLog.create({
      data: {
        id: randomUUID(),
        adminUserId: adminUser.sub,
        action: 'update_ai_settings',
        targetType: 'ai_setting',
        targetId: setting.id,
      },
    })

    await logService.write('info', 'admin', 'AI settings updated', { adminUsername: adminUser.username })

    return reply.send({
      success: true,
      data: {
        provider: setting.provider,
        baseUrl: setting.baseUrl,
        model: setting.model,
        apiKeyMasked: maskApiKey(setting.apiKeyEncrypted),
        temperature: setting.temperature,
        maxTokens: setting.maxTokens,
        timeoutMs: setting.timeoutMs,
        enabled: setting.enabled,
        updatedAt: setting.updatedAt,
      },
    })
  })

  // POST /api/admin/settings/ai/test
  fastify.post('/api/admin/settings/ai/test', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = testAiSchema.safeParse(request.body)
    let config: {
      provider: string
      baseUrl: string
      apiKey: string
      model: string
      temperature: number
      maxTokens: number
      timeoutMs: number
      enabled: boolean
    }

    if (parsed.success && parsed.data.apiKey) {
      // Use provided test params
      const d = parsed.data
      config = {
        provider: d.provider ?? 'deepseek',
        baseUrl: d.baseUrl ?? 'https://api.deepseek.com/v1',
        apiKey: d.apiKey!,
        model: d.model ?? 'deepseek-chat',
        temperature: 0.3,
        maxTokens: 64,
        timeoutMs: 15000,
        enabled: true,
      }
    } else {
      // Use stored settings
      const setting = await prisma.aiSetting.findFirst()
      if (!setting || !setting.enabled || !setting.apiKeyEncrypted) {
        throw new AppError('AI_NOT_CONFIGURED', 'AI 服务未配置或未启用，请先保存 AI 设置')
      }

      let decryptedKey: string
      try {
        decryptedKey = decryptApiKey(setting.apiKeyEncrypted)
      } catch {
        throw new AppError('AI_NOT_CONFIGURED', 'API Key 解密失败，请重新设置')
      }

      if (!decryptedKey) {
        throw new AppError('AI_NOT_CONFIGURED', '请在后台设置 API Key')
      }

      config = {
        provider: setting.provider,
        baseUrl: setting.baseUrl,
        apiKey: decryptedKey,
        model: setting.model,
        temperature: 0.3,
        maxTokens: 64,
        timeoutMs: 15000,
        enabled: true,
      }
    }

    // Create provider and test
    const provider = new DeepSeekProvider({
      provider: config.provider,
      baseUrl: config.baseUrl,
      apiKeyEncrypted: config.apiKey,
      model: config.model,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      timeoutMs: config.timeoutMs,
      enabled: config.enabled,
    })

    const startTime = Date.now()
    try {
      const result = await provider.chatCompletion({
        model: config.model,
        messages: [
          { role: 'user', content: 'Hi' },
        ],
        maxTokens: 64,
        timeoutMs: 15000,
      })

      const latencyMs = Date.now() - startTime

      return reply.send({
        success: true,
        data: {
          ok: true,
          latencyMs,
          model: result.model,
          responsePreview: result.content.slice(0, 200),
        },
      })
    } catch (err) {
      const latencyMs = Date.now() - startTime
      const message = err instanceof AppError ? err.message : '连接失败'

      // Sanitize error — never leak API keys
      const sanitized = message.replace(/Bearer\s+\S+/gi, 'Bearer ****')

      return reply.send({
        success: true,
        data: {
          ok: false,
          latencyMs,
          error: sanitized,
        },
      })
    }
  })

  // ========================
  // System Settings routes
  // ========================

  // GET /api/admin/settings/system
  fastify.get('/api/admin/settings/system', async (_request: FastifyRequest, reply: FastifyReply) => {
    const settings = await settingsService.getAllSettings()
    return reply.send({
      success: true,
      data: { settings },
    })
  })

  // PUT /api/admin/settings/system
  fastify.put('/api/admin/settings/system', {
    bodyLimit: 65536, // 64KB
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = systemSettingsSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_SPARK_URL', message: '参数格式错误，应为 key-value 对象' },
      })
    }

    await settingsService.updateSettings(parsed.data)

    // Audit log
    const adminUser = (request as any).adminUser
    await prisma.adminAuditLog.create({
      data: {
        id: randomUUID(),
        adminUserId: adminUser.sub,
        action: 'update_system_settings',
        targetType: 'system_setting',
        detailJson: JSON.stringify({ keys: Object.keys(parsed.data) }),
      },
    })

    await logService.write('info', 'admin', 'System settings updated', {
      adminUsername: adminUser.username,
      keys: Object.keys(parsed.data),
    })

    const settings = await settingsService.getAllSettings()
    return reply.send({
      success: true,
      data: { settings },
    })
  })

  // ========================
  // Prompt Templates routes
  // ========================

  // GET /api/admin/prompts
  fastify.get('/api/admin/prompts', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as any
    const type = query?.type as string | undefined
    const prompts = await promptService.list(type as any)
    return reply.send({
      success: true,
      data: { prompts },
    })
  })

  // POST /api/admin/prompts
  fastify.post('/api/admin/prompts', {
    bodyLimit: 262144, // 256KB
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = promptCreateSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_SPARK_URL', message: '参数校验失败', detail: parsed.error.issues },
      })
    }

    const prompt = await promptService.create(parsed.data)

    // Audit log
    const adminUser = (request as any).adminUser
    await prisma.adminAuditLog.create({
      data: {
        id: randomUUID(),
        adminUserId: adminUser.sub,
        action: 'create_prompt',
        targetType: 'prompt_template',
        targetId: prompt.id,
        detailJson: JSON.stringify({ name: prompt.name, type: prompt.type }),
      },
    })

    await logService.write('info', 'admin', `Prompt created: ${prompt.name}`, { adminUsername: adminUser.username })

    return reply.status(201).send({
      success: true,
      data: { prompt },
    })
  })

  // GET /api/admin/prompts/:id
  fastify.get('/api/admin/prompts/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    const prompt = await promptService.findById(id)
    return reply.send({
      success: true,
      data: { prompt },
    })
  })

  // PUT /api/admin/prompts/:id
  fastify.put('/api/admin/prompts/:id', {
    bodyLimit: 262144, // 256KB
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    const parsed = promptUpdateSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_SPARK_URL', message: '参数校验失败', detail: parsed.error.issues },
      })
    }

    const prompt = await promptService.update(id, parsed.data)

    // Audit log
    const adminUser = (request as any).adminUser
    await prisma.adminAuditLog.create({
      data: {
        id: randomUUID(),
        adminUserId: adminUser.sub,
        action: 'update_prompt',
        targetType: 'prompt_template',
        targetId: id,
        detailJson: JSON.stringify({ name: prompt.name, version: prompt.version }),
      },
    })

    await logService.write('info', 'admin', `Prompt updated: ${prompt.name}`, { adminUsername: adminUser.username })

    return reply.send({
      success: true,
      data: { prompt },
    })
  })

  // DELETE /api/admin/prompts/:id
  fastify.delete('/api/admin/prompts/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    const prompt = await promptService.findById(id)
    await promptService.delete(id)

    // Audit log
    const adminUser = (request as any).adminUser
    await prisma.adminAuditLog.create({
      data: {
        id: randomUUID(),
        adminUserId: adminUser.sub,
        action: 'delete_prompt',
        targetType: 'prompt_template',
        targetId: id,
        detailJson: JSON.stringify({ name: prompt.name, type: prompt.type }),
      },
    })

    await logService.write('info', 'admin', `Prompt deleted: ${prompt.name}`, { adminUsername: adminUser.username })

    return reply.send({
      success: true,
      data: { deleted: true },
    })
  })

  // POST /api/admin/prompts/:id/set-default
  fastify.post('/api/admin/prompts/:id/set-default', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    const prompt = await promptService.findById(id)
    await promptService.setDefault(id)

    // Audit log
    const adminUser = (request as any).adminUser
    await prisma.adminAuditLog.create({
      data: {
        id: randomUUID(),
        adminUserId: adminUser.sub,
        action: 'set_default_prompt',
        targetType: 'prompt_template',
        targetId: id,
        detailJson: JSON.stringify({ name: prompt.name, type: prompt.type }),
      },
    })

    await logService.write('info', 'admin', `Prompt set as default: ${prompt.name}`, { adminUsername: adminUser.username })

    return reply.send({
      success: true,
      data: { prompt: await promptService.findById(id) },
    })
  })

  // ========================
  // Reports routes
  // ========================

  // GET /api/admin/reports
  fastify.get('/api/admin/reports', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as any
    const result = await reportService.list({
      status: query.status as string | undefined,
      sparkCode: query.sparkCode as string | undefined,
      severity: query.severity as string | undefined,
      reportType: query.reportType as string | undefined,
      createdFrom: query.createdFrom as string | undefined,
      createdTo: query.createdTo as string | undefined,
      page: query.page ? parseInt(query.page, 10) : undefined,
      pageSize: query.pageSize ? parseInt(query.pageSize, 10) : undefined,
      sortBy: query.sortBy as string | undefined,
      sortOrder: query.sortOrder as 'asc' | 'desc' | undefined,
    })

    return reply.send({
      success: true,
      data: result,
    })
  })

  // GET /api/admin/reports/:id
  fastify.get('/api/admin/reports/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    const report = await reportService.findById(id)

    // Admin detail includes rawMetadataJson
    const result: any = {
      id: report.id,
      sparkCode: report.sparkCode,
      sparkUrl: report.sparkUrl,
      reportType: report.reportType,
      status: report.status,
      progress: report.progress,
      stage: report.stage,
      platform: report.platform,
      minecraftVersion: report.minecraftVersion,
      sparkVersion: report.sparkVersion,
      serverBrand: report.serverBrand,
      durationSeconds: report.durationSeconds,
      rawMetadataJson: report.rawMetadataJson ? safeJsonParse(report.rawMetadataJson, null) : null,
      normalizedJson: report.normalizedJson ? safeJsonParse(report.normalizedJson, null) : null,
      ruleAnalysisJson: report.ruleAnalysisJson ? safeJsonParse(report.ruleAnalysisJson, null) : null,
      errorCode: report.errorCode,
      errorMessage: report.errorMessage,
      clientIpHash: report.clientIpHash,
      startedAt: report.startedAt,
      completedAt: report.completedAt,
      lockedAt: report.lockedAt,
      createdAt: report.createdAt,
      updatedAt: report.updatedAt,
      expiresAt: report.expiresAt,
    }

    if (report.analysisResult) {
      result.analysisResult = {
        severity: report.analysisResult.severity,
        summary: report.analysisResult.summary,
        aiResultJson: report.analysisResult.aiResultJson ? safeJsonParse(report.analysisResult.aiResultJson, null) : null,
        markdownReport: report.analysisResult.markdownReport,
        isFallback: report.analysisResult.isFallback,
        model: report.analysisResult.model,
        promptTemplateId: report.analysisResult.promptTemplateId,
        promptVersion: report.analysisResult.promptVersion,
        inputTokens: report.analysisResult.inputTokens,
        outputTokens: report.analysisResult.outputTokens,
      }
    }

    return reply.send({
      success: true,
      data: { report: result },
    })
  })

  // DELETE /api/admin/reports/:id
  fastify.delete('/api/admin/reports/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    await reportService.delete(id)

    // Audit log
    const adminUser = (request as any).adminUser
    await prisma.adminAuditLog.create({
      data: {
        id: randomUUID(),
        adminUserId: adminUser.sub,
        action: 'delete_report',
        targetType: 'spark_report',
        targetId: id,
      },
    })

    await logService.write('info', 'admin', `Report deleted: ${id}`, { adminUsername: adminUser.username })

    return reply.send({
      success: true,
      data: { deleted: true },
    })
  })

  // POST /api/admin/reports/cleanup
  fastify.post('/api/admin/reports/cleanup', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = cleanupSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_SPARK_URL', message: '参数校验失败', detail: parsed.error.issues },
      })
    }

    const result = await reportService.cleanup(parsed.data.olderThanDays, parsed.data.dryRun)

    // Audit log
    const adminUser = (request as any).adminUser
    await prisma.adminAuditLog.create({
      data: {
        id: randomUUID(),
        adminUserId: adminUser.sub,
        action: 'cleanup_reports',
        targetType: 'spark_report',
        detailJson: JSON.stringify(parsed.data),
      },
    })

    await logService.write('info', 'admin', `Reports cleanup: matched=${result.matched}, deleted=${result.deleted}, dryRun=${result.dryRun}`, {
      adminUsername: adminUser.username,
    })

    return reply.send({
      success: true,
      data: result,
    })
  })

  // ========================
  // Queue routes
  // ========================

  // GET /api/admin/queue/status
  fastify.get('/api/admin/queue/status', async (_request: FastifyRequest, reply: FastifyReply) => {
    if (!_getQueueStatus) {
      return reply.send({
        success: true,
        data: {
          pending: 0,
          processing: 0,
          maxConcurrency: 0,
          uptime: 0,
          lastJobStartedAt: null,
          lastJobCompletedAt: null,
        },
      })
    }

    const stats = _getQueueStatus()
    return reply.send({
      success: true,
      data: stats,
    })
  })

  // ========================
  // Logs routes
  // ========================

  // GET /api/admin/logs
  fastify.get('/api/admin/logs', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as any
    const result = await logService.query({
      level: query.level as string | undefined,
      module: query.module as string | undefined,
      page: query.page ? parseInt(query.page, 10) : undefined,
      pageSize: query.pageSize ? parseInt(query.pageSize, 10) : undefined,
    })

    return reply.send({
      success: true,
      data: result,
    })
  })
}
