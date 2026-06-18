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
    const { model, messages, temperature, maxTokens, timeoutMs, responseFormat } = options

    if (!this.config.enabled || !this.config.apiKey) {
      throw new AppError('AI_NOT_CONFIGURED', 'AI 服务未配置或未启用')
    }

    // Build request body
    const body: Record<string, unknown> = {
      model: model || this.config.model,
      messages,
      temperature: temperature ?? this.config.temperature,
      max_tokens: maxTokens ?? this.config.maxTokens,
    }

    // Add response_format if requested and supported by the baseUrl/model
    // DeepSeek API supports response_format: { type: "json_object" } on compatible models.
    // For proxies or older endpoints that don't support it, we retry without.
    const wantJsonFormat = responseFormat === 'json_object'
    if (wantJsonFormat) {
      body.response_format = { type: 'json_object' }
    }

    try {
      return await this.doRequest(body, timeoutMs)
    } catch (err) {
      // If response_format was rejected, retry without it
      if (wantJsonFormat && err instanceof AppError && err.code === 'AI_ERROR') {
        const msg = err.message.toLowerCase()
        // Common error patterns when response_format is not supported
        if (
          msg.includes('response_format') ||
          msg.includes('unknown parameter') ||
          msg.includes('invalid parameter') ||
          msg.includes('unsupported') ||
          msg.includes('not supported')
        ) {
          delete body.response_format
          return await this.doRequest(body, timeoutMs)
        }
      }
      throw err
    }
  }

  private async doRequest(
    body: Record<string, unknown>,
    timeoutMs?: number,
  ): Promise<ChatCompletionResult> {
    const controller = new AbortController()
    const timeout = timeoutMs ?? this.config.timeoutMs
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    try {
      const response = await undiciRequest(`${this.config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify(body),
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

      const respBody = await response.body.text()

      if (!response.statusCode || response.statusCode >= 400) {
        let apiError = `HTTP ${response.statusCode}`
        try {
          const errJson = JSON.parse(respBody)
          if (errJson?.error?.message) {
            apiError = errJson.error.message
          }
        } catch { /* use default */ }
        throw new AppError('AI_ERROR', `AI 服务返回错误 (${response.statusCode}): ${apiError}`)
      }

      let json: any
      try {
        json = JSON.parse(respBody)
      } catch {
        throw new AppError('AI_ERROR', 'AI 服务返回数据无法解析')
      }

      const choice = json?.choices?.[0]
      // DeepSeek V4 models may return reasoning_content (thinking tokens) alongside or
      // instead of content. Always prefer the final content, but fall back to reasoning.
      const finalContent = choice?.message?.content || choice?.message?.reasoning_content
      if (!finalContent) {
        console.error('[DeepSeek] Unexpected response:', JSON.stringify(json).slice(0, 500))
        throw new AppError('AI_ERROR', 'AI 返回内容为空')
      }

      return {
        content: finalContent,
        model: json.model || (body.model as string),
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
