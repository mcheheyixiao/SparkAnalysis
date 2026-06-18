import { prisma } from '../../plugins/prisma.js'
import { decryptApiKey } from '../../utils/crypto.js'
import { attemptJsonRepair, safeJsonParse } from '../../utils/json.js'
import { AppError } from '../../utils/errors.js'
import { logService } from '../logs/log.service.js'
import { DeepSeekProvider } from './deepseek-provider.js'
import { promptBuilder } from './prompt-builder.service.js'
import type { IAIProvider, ChatMessage } from './ai-provider.interface.js'
import type { AiAnalysisOutput, AiDiagnosisResult, AiConfig, BuiltPrompts } from './ai.types.js'
import type { NormalizedSummary, RuleAnalysisResult } from '../spark/spark.types.js'
import { buildFallbackMarkdownReport, buildMarkdownReportFromAiResult } from '../reports/markdown-report.builder.js'
import { z } from 'zod'

// ── Normalization helpers ──────────────────────────────────────────

export function normalizeBeginnerExplanation(raw: unknown): { summary: string; details?: string } {
  if (typeof raw === 'string') {
    return { summary: raw }
  }
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>
    return {
      summary: typeof obj.summary === 'string' ? obj.summary : String(obj.summary || ''),
      details: typeof obj.details === 'string' ? obj.details : undefined,
    }
  }
  return { summary: '' }
}

export function normalizeRetestCommands(raw: unknown): { command: string; description?: string }[] {
  if (!Array.isArray(raw)) return []
  return raw.map((item: unknown) => {
    if (typeof item === 'string') {
      return { command: item }
    }
    if (item && typeof item === 'object') {
      const obj = item as Record<string, unknown>
      return {
        command: typeof obj.command === 'string' ? obj.command : String(obj.command || ''),
        description: typeof obj.description === 'string' ? obj.description : undefined,
      }
    }
    return { command: String(item) }
  })
}

export function normalizeMissingInfo(raw: unknown): { question: string; why?: string }[] {
  if (!Array.isArray(raw)) return []
  return raw.map((item: unknown) => {
    if (typeof item === 'string') {
      return { question: item }
    }
    if (item && typeof item === 'object') {
      const obj = item as Record<string, unknown>
      return {
        question: typeof obj.question === 'string' ? obj.question : String(obj.question || ''),
        why: typeof obj.why === 'string' ? obj.why : undefined,
      }
    }
    return { question: String(item) }
  })
}

// ── Zod schema: accepts BOTH old and new formats ────────────────────

export const aiOutputSchema = z.object({
  one_sentence_summary: z.string(),
  severity: z.enum(['normal', 'low', 'medium', 'high', 'critical']),
  // beginner_explanation: string OR { summary, details? }
  beginner_explanation: z.union([
    z.string(),
    z.object({
      summary: z.string().optional().default(''),
      details: z.string().optional(),
    }),
  ]),
  key_evidence: z.array(z.object({
    title: z.string(),
    explanation: z.string(),
    confidence: z.enum(['high', 'medium', 'low']),
  })),
  suspected_causes: z.array(z.object({
    rank: z.number(),
    name: z.string(),
    category: z.string(),
    reason: z.string(),
    confidence: z.enum(['high', 'medium', 'low']),
    how_to_verify: z.string(),
  })),
  fix_plan: z.array(z.object({
    priority: z.number(),
    action: z.string(),
    difficulty: z.enum(['easy', 'medium', 'hard']),
    risk: z.enum(['low', 'medium', 'high']),
    expected_effect: z.string(),
  })),
  // retest_commands: string[] OR { command, description? }[]
  retest_commands: z.array(
    z.union([
      z.string(),
      z.object({
        command: z.string(),
        description: z.string().optional(),
      }),
    ]),
  ),
  // missing_information: string[] OR { question, why? }[]
  missing_information: z.array(
    z.union([
      z.string(),
      z.object({
        question: z.string(),
        why: z.string().optional(),
      }),
    ]),
  ),
  // markdown_report: NOT trusted — we generate our own
  markdown_report: z.string().optional(),
}).passthrough() // Allow extra fields without breaking validation

export class AiAnalysisService {
  /**
   * Analyze with pre-built prompts. Does NOT save to DB (caller's responsibility).
   */
  async analyzeWithPrompts(
    normalized: NormalizedSummary,
    ruleAnalysis: RuleAnalysisResult,
    reportType: string,
    prompts: BuiltPrompts,
  ): Promise<{
    aiResultJson: AiAnalysisOutput
    markdownReport: string
    severity: string
    summary: string
    isFallback: boolean
    model?: string
    inputTokens?: number
    outputTokens?: number
  }> {
    // 1. Load AI config
    const aiConfig = await this.loadAiConfig()

    // 2. Create provider
    const provider = new DeepSeekProvider(aiConfig)

    // 3. Build messages
    const messages: ChatMessage[] = [
      { role: 'system', content: prompts.systemPrompt },
      {
        role: 'user',
        content: prompts.userPrompt + '\n\n请严格按照以下 JSON schema 输出：\n' + prompts.jsonSchema,
      },
    ]

    try {
      // 4. Call AI
      const result = await provider.chatCompletion({
        model: aiConfig.model,
        messages,
        temperature: aiConfig.temperature,
        maxTokens: aiConfig.maxTokens,
        timeoutMs: aiConfig.timeoutMs,
        responseFormat: 'json_object',
      })

      // 5. Parse JSON
      let parsed: any = null
      let isFallback = false

      // Try direct parse
      try {
        parsed = JSON.parse(result.content)
      } catch {
        // Try repair
        parsed = attemptJsonRepair(result.content)
        if (parsed) {
          await logService.write('warn', 'ai', 'AI JSON repaired successfully', {
            model: result.model,
          })
        }
      }

      // Validate with Zod (accepts both old and new formats)
      if (parsed) {
        const validated = aiOutputSchema.safeParse(parsed)
        if (validated.success) {
          // Normalize to canonical AiDiagnosisResult
          const canonical = this.normalizeToCanonical(validated.data)
          // Generate markdownReport from structured fields (NEVER trust AI's raw markdown)
          const generatedMarkdown = buildMarkdownReportFromAiResult(canonical)

          return {
            aiResultJson: canonical,
            markdownReport: generatedMarkdown,
            severity: canonical.severity,
            summary: canonical.one_sentence_summary || '',
            isFallback: false,
            model: result.model,
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
          }
        }

        // Log Zod validation errors for debugging
        await logService.write('warn', 'ai', 'AI JSON Zod validation failed', {
          model: result.model,
          zodErrors: JSON.stringify(validated.error.issues.slice(0, 5)),
        })
      }

      // 6. Fallback: build from rule analysis
      isFallback = true
      await logService.write('warn', 'ai', 'AI JSON parse failed, using rule-based fallback', {
        model: result.model,
        aiContentPreview: result.content.slice(0, 500),
      })

      return this.buildFallbackResult(ruleAnalysis, result)
    } catch (err) {
      if (err instanceof AppError) {
        // AI_NOT_CONFIGURED, AI_TIMEOUT, AI_ERROR → re-throw (pipeline marks as failed)
        throw err
      }
      throw new AppError('AI_ERROR', 'AI 分析过程发生未知错误')
    }
  }

  /**
   * Normalize validated (potentially mixed-format) data to canonical AiDiagnosisResult.
   */
  private normalizeToCanonical(data: z.infer<typeof aiOutputSchema>): AiDiagnosisResult {
    return {
      one_sentence_summary: data.one_sentence_summary,
      severity: data.severity,
      beginner_explanation: normalizeBeginnerExplanation(data.beginner_explanation),
      key_evidence: data.key_evidence,
      suspected_causes: data.suspected_causes,
      fix_plan: data.fix_plan,
      retest_commands: normalizeRetestCommands(data.retest_commands),
      missing_information: normalizeMissingInfo(data.missing_information),
      markdown_report: undefined, // We generate our own
    }
  }

  private async loadAiConfig(): Promise<AiConfig> {
    const setting = await prisma.aiSetting.findFirst()
    if (!setting || !setting.enabled) {
      throw new AppError('AI_NOT_CONFIGURED', 'AI 服务未配置或未启用')
    }

    let apiKey: string
    try {
      apiKey = decryptApiKey(setting.apiKeyEncrypted)
    } catch {
      throw new AppError('AI_NOT_CONFIGURED', 'API Key 解密失败，请重新设置')
    }

    if (!apiKey) {
      throw new AppError('AI_NOT_CONFIGURED', '请在后台设置 API Key')
    }

    if (!setting.model) {
      throw new AppError('AI_NOT_CONFIGURED', '请在后台设置 AI 模型')
    }

    return {
      provider: setting.provider,
      baseUrl: setting.baseUrl,
      apiKey: apiKey,
      model: setting.model,
      temperature: setting.temperature,
      maxTokens: setting.maxTokens,
      timeoutMs: setting.timeoutMs,
      enabled: setting.enabled,
    }
  }

  private buildFallbackResult(
    ruleAnalysis: RuleAnalysisResult,
    aiResult: { content: string; model: string; inputTokens?: number; outputTokens?: number },
  ): {
    aiResultJson: AiAnalysisOutput
    markdownReport: string
    severity: string
    summary: string
    isFallback: boolean
    model?: string
    inputTokens?: number
    outputTokens?: number
  } {
    const summary = ruleAnalysis.summary || 'AI 分析结果解析失败，以下为基于规则分析的结果'

    // Build clean fallback markdown — NEVER include raw AI output
    const cleanMarkdown = buildFallbackMarkdownReport({
      summary,
      severity: ruleAnalysis.severity,
      ruleAnalysis,
      reason: 'AI_INVALID_JSON',
    })

    const fallback: AiDiagnosisResult = {
      one_sentence_summary: summary,
      severity: ruleAnalysis.severity,
      beginner_explanation: {
        summary: '本报告使用规则兜底分析生成。AI 结构化输出可能异常，但以下内容仍可作为初步排查参考。',
      },
      key_evidence: ruleAnalysis.evidence.map((e) => ({
        title: e.title,
        explanation: e.detail,
        confidence: e.confidence,
      })),
      suspected_causes: ruleAnalysis.suspectedCauses.map((c, i) => ({
        rank: i + 1,
        name: c.name,
        category: c.category,
        reason: c.reason,
        confidence: c.confidence,
        how_to_verify: '建议使用 /spark profiler 重新采样',
      })),
      fix_plan: [],
      retest_commands: ruleAnalysis.recommendedCommands.map((c) => ({ command: c })),
      missing_information: ruleAnalysis.limitations.map((l) => ({ question: l })),
      markdown_report: cleanMarkdown,
    }

    return {
      aiResultJson: fallback,
      markdownReport: cleanMarkdown,
      severity: ruleAnalysis.severity,
      summary,
      isFallback: true,
      model: aiResult.model,
      inputTokens: aiResult.inputTokens,
      outputTokens: aiResult.outputTokens,
    }
  }
}

export const aiAnalysisService = new AiAnalysisService()
