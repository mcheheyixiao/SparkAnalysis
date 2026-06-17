import { request as undiciRequest } from 'undici'
import type { IAIProvider, ChatCompletionOptions, ChatCompletionResult, ChatMessage } from './ai-provider.interface.js'
import { AppError } from '../../utils/errors.js'
import type { AiConfig } from './ai.types.js'

export class DeepSeekProvider implements IAIProvider {
  private config: AiConfig

  constructor(config: AiConfig) {
    this.config = config
  }

  async chatCompletion(options: ChatCompletionOptions): Promise<ChatCompletionResult> {
    const { model, messages, temperature, maxTokens, timeoutMs } = options

    if (!this.config.enabled || !this.config.apiKeyEncrypted) {
      throw new AppError('AI_NOT_CONFIGURED', 'AI 服务未配置或未启用')
    }

    const controller = new AbortController()
    const timeout = timeoutMs ?? this.config.timeoutMs
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    try {
      const response = await undiciRequest(`${this.config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKeyEncrypted}`,
        },
        body: JSON.stringify({
          model: model || this.config.model,
          messages,
          temperature: temperature ?? this.config.temperature,
          max_tokens: maxTokens ?? this.config.maxTokens,
        }),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (response.statusCode === 401 || response.statusCode === 403) {
        throw new AppError('AI_NOT_CONFIGURED', 'AI API Key 无效')
      }
      if (response.statusCode === 429) {
        throw new AppError('AI_ERROR', 'AI 服务请求过于频繁，请稍后重试')
      }
      if (response.statusCode >= 500) {
        throw new AppError('AI_ERROR', 'AI 服务暂时不可用')
      }

      const body = await response.body.text()

      if (!response.statusCode || response.statusCode >= 400) {
        throw new AppError('AI_ERROR', `AI 服务返回错误 (${response.statusCode})`)
      }

      let json: any
      try {
        json = JSON.parse(body)
      } catch {
        throw new AppError('AI_ERROR', 'AI 服务返回数据无法解析')
      }

      const choice = json?.choices?.[0]
      if (!choice?.message?.content) {
        throw new AppError('AI_ERROR', 'AI 返回内容为空')
      }

      return {
        content: choice.message.content,
        model: json.model || model,
        inputTokens: json.usage?.prompt_tokens,
        outputTokens: json.usage?.completion_tokens,
      }
    } catch (err) {
      clearTimeout(timeoutId)
      if (err instanceof AppError) throw err
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new AppError('AI_TIMEOUT', 'AI 分析超时，请稍后重试')
      }
      throw new AppError('AI_ERROR', '调用 AI 服务失败')
    }
  }
}
