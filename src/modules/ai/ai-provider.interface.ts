export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatCompletionOptions {
  model: string
  messages: ChatMessage[]
  temperature?: number
  maxTokens?: number
  timeoutMs?: number
}

export interface ChatCompletionResult {
  content: string
  model: string
  inputTokens?: number
  outputTokens?: number
}

export interface IAIProvider {
  chatCompletion(options: ChatCompletionOptions): Promise<ChatCompletionResult>
}
