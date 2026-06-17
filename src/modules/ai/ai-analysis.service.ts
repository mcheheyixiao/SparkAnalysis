import { prisma } from '../../plugins/prisma.js'
import { decryptApiKey } from '../../utils/crypto.js'
import { attemptJsonRepair, safeJsonParse } from '../../utils/json.js'
import { AppError } from '../../utils/errors.js'
import { logService } from '../logs/log.service.js'
import { DeepSeekProvider } from './deepseek-provider.js'
import { promptBuilder } from './prompt-builder.service.js'
import type { IAIProvider, ChatMessage } from './ai-provider.interface.js'
import type { AiAnalysisOutput, AiConfig, BuiltPrompts } from './ai.types.js'
import type { NormalizedSummary, RuleAnalysisResult } from '../spark/spark.types.js'
import { z } from 'zod'

const aiOutputSchema = z.object({
  one_sentence_summary: z.string(),
  severity: z.enum(['normal', 'low', 'medium', 'high', 'critical']),
  beginner_explanation: z.string(),
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
  retest_commands: z.array(z.string()),
  missing_information: z.array(z.string()),
  markdown_report: z.string(),
})

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

      // Validate with Zod
      if (parsed) {
        const validated = aiOutputSchema.safeParse(parsed)
        if (validated.success) {
          return {
            aiResultJson: validated.data as AiAnalysisOutput,
            markdownReport: validated.data.markdown_report || '',
            severity: validated.data.severity,
            summary: validated.data.one_sentence_summary || '',
            isFallback: false,
            model: result.model,
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
          }
        }
      }

      // 6. Fallback: build from rule analysis
      isFallback = true
      await logService.write('warn', 'ai', 'AI JSON parse failed, using fallback', {
        model: result.model,
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
      apiKeyEncrypted: apiKey,
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
    const fallback: AiAnalysisOutput = {
      one_sentence_summary: ruleAnalysis.summary || 'AI 分析结果解析失败，以下为基于规则分析的结果',
      severity: ruleAnalysis.severity,
      beginner_explanation: `AI 返回内容格式异常，以下为基于规则预分析的结果。\n\n${ruleAnalysis.summary}\n\n${aiResult.content.slice(0, 500)}`,
      key_evidence: ruleAnalysis.evidence.map(e => ({
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
      retest_commands: ruleAnalysis.recommendedCommands,
      missing_information: ruleAnalysis.limitations,
      markdown_report: aiResult.content || `# 分析报告\n\n${ruleAnalysis.summary}`,
    }

    return {
      aiResultJson: fallback,
      markdownReport: fallback.markdown_report,
      severity: ruleAnalysis.severity,
      summary: ruleAnalysis.summary,
      isFallback: true,
      model: aiResult.model,
      inputTokens: aiResult.inputTokens,
      outputTokens: aiResult.outputTokens,
    }
  }
}

export const aiAnalysisService = new AiAnalysisService()
