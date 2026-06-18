export type ErrorCode =
  | 'INVALID_SPARK_URL'
  | 'SPARK_CODE_NOT_FOUND'
  | 'PAYLOAD_TOO_LARGE'
  | 'RATE_LIMIT_EXCEEDED'
  | 'REPORT_NOT_FOUND'
  | 'INVALID_CREDENTIALS'
  | 'ACCOUNT_DISABLED'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'INVALID_SETTINGS_KEY'
  | 'AI_NOT_CONFIGURED'
  | 'SPARK_FETCH_TIMEOUT'
  | 'SPARK_REPORT_NOT_FOUND'
  | 'SPARK_RESPONSE_TOO_LARGE'
  | 'SPARK_RESPONSE_INVALID'
  | 'SPARK_REMOTE_ERROR'
  | 'AI_TIMEOUT'
  | 'AI_ERROR'
  | 'SERVER_RESTARTED'
  | 'SERVER_SHUTDOWN'
  | 'INTERNAL_ERROR'

export const ErrorHttpStatus: Record<ErrorCode, number> = {
  INVALID_SPARK_URL: 400,
  SPARK_CODE_NOT_FOUND: 400,
  PAYLOAD_TOO_LARGE: 413,
  RATE_LIMIT_EXCEEDED: 429,
  REPORT_NOT_FOUND: 404,
  INVALID_CREDENTIALS: 401,
  ACCOUNT_DISABLED: 403,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  INVALID_SETTINGS_KEY: 400,
  AI_NOT_CONFIGURED: 500,
  SPARK_FETCH_TIMEOUT: 502,
  SPARK_REPORT_NOT_FOUND: 502,
  SPARK_RESPONSE_TOO_LARGE: 502,
  SPARK_RESPONSE_INVALID: 502,
  SPARK_REMOTE_ERROR: 502,
  AI_TIMEOUT: 502,
  AI_ERROR: 502,
  SERVER_RESTARTED: 500,
  SERVER_SHUTDOWN: 500,
  INTERNAL_ERROR: 500,
}

export class AppError extends Error {
  public readonly code: ErrorCode
  public readonly httpStatus: number
  public readonly requestId?: string
  public readonly detail?: unknown

  constructor(code: ErrorCode, message: string, options?: { requestId?: string; detail?: unknown }) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.httpStatus = ErrorHttpStatus[code]
    this.requestId = options?.requestId
    this.detail = options?.detail
  }
}
