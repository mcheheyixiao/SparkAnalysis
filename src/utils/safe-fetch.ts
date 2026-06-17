import { request as undiciRequest, Client, interceptors } from 'undici'
import { AppError } from './errors.js'

export interface SafeFetchOptions {
  timeout?: number       // ms, default 10000
  maxBytes?: number      // max response body size, default 5MB
  method?: string
  headers?: Record<string, string>
}

export interface SafeFetchResult {
  statusCode: number
  body: string
  headers: Record<string, string | string[]>
}

/**
 * Unified HTTP fetch with SSRF protection.
 * Only allows HTTPS to spark.lucko.me. Redirect handled manually (max 1).
 */
export async function safeFetch(url: string, options: SafeFetchOptions = {}): Promise<SafeFetchResult> {
  const {
    timeout = 10000,
    maxBytes = 5 * 1024 * 1024, // 5MB
    method = 'GET',
    headers = {},
  } = options

  // Validate URL
  let targetUrl: URL
  try {
    targetUrl = new URL(url)
  } catch {
    throw new AppError('SPARK_REMOTE_ERROR', '内部请求 URL 无效')
  }

  // Only allow HTTPS
  if (targetUrl.protocol !== 'https:') {
    throw new AppError('SPARK_REMOTE_ERROR', '内部请求仅允许 HTTPS')
  }

  // Only allow spark.lucko.me
  if (targetUrl.hostname.toLowerCase() !== 'spark.lucko.me') {
    throw new AppError('SPARK_REMOTE_ERROR', '不允许请求该域名')
  }

  // No custom port
  if (targetUrl.port) {
    throw new AppError('SPARK_REMOTE_ERROR', '不允许自定义端口')
  }

  // Dispatcher that disables automatic redirects (manual redirect, max 1 hop)
  const dispatcher = new Client(targetUrl.origin).compose(
    interceptors.redirect({ maxRedirections: 0 }),
  )

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    const response = await undiciRequest(targetUrl.toString(), {
      method,
      headers: {
        'User-Agent': 'SparkAIAnalyzer/1.0',
        'Accept': 'application/json, text/plain, */*',
        ...headers,
      },
      signal: controller.signal,
      dispatcher,
    })

    clearTimeout(timeoutId)

    // Handle redirect (max 1)
    if (response.statusCode >= 300 && response.statusCode < 400) {
      const location = response.headers['location'] as string
      if (!location) {
        throw new AppError('SPARK_REMOTE_ERROR', '重定向缺少 Location header')
      }

      // Validate redirect target
      let redirectUrl: URL
      try {
        redirectUrl = new URL(location, targetUrl)
      } catch {
        throw new AppError('SPARK_REMOTE_ERROR', '重定向 URL 无效')
      }

      if (redirectUrl.protocol !== 'https:' ||
          redirectUrl.hostname.toLowerCase() !== 'spark.lucko.me' ||
          redirectUrl.port) {
        throw new AppError('SPARK_REMOTE_ERROR', '重定向到非白名单域名')
      }

      // Follow redirect (single hop)
      const redirectResponse = await undiciRequest(redirectUrl.toString(), {
        method: 'GET',
        headers: {
          'User-Agent': 'SparkAIAnalyzer/1.0',
          'Accept': 'application/json, text/plain, */*',
        },
        signal: AbortSignal.timeout(timeout),
        dispatcher,
      })

      return await readResponse(redirectResponse, maxBytes)
    }

    return await readResponse(response, maxBytes)
  } catch (err) {
    clearTimeout(timeoutId)

    if (err instanceof AppError) throw err

    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new AppError('SPARK_FETCH_TIMEOUT', 'spark 数据抓取超时，请稍后重试')
    }

    if (err instanceof Error && err.message.includes('UND_ERR_HEADERS_TIMEOUT')) {
      throw new AppError('SPARK_FETCH_TIMEOUT', 'spark 数据抓取超时，请稍后重试')
    }

    throw new AppError('SPARK_REMOTE_ERROR', 'spark 服务暂时不可用，请稍后重试')
  }
}

async function readResponse(
  response: Awaited<ReturnType<typeof undiciRequest>>,
  maxBytes: number,
): Promise<SafeFetchResult> {
  // Check status
  if (response.statusCode === 404) {
    throw new AppError('SPARK_REPORT_NOT_FOUND', 'spark 报告不存在，请检查链接是否有效')
  }
  if (response.statusCode === 413 || response.statusCode === 502 || response.statusCode === 503) {
    throw new AppError('SPARK_REMOTE_ERROR', 'spark 服务暂时不可用')
  }
  if (response.statusCode >= 500) {
    throw new AppError('SPARK_REMOTE_ERROR', 'spark 服务器错误')
  }

  // Check Content-Length
  const contentLength = response.headers['content-length']
  if (contentLength) {
    const len = parseInt(contentLength as string, 10)
    if (!isNaN(len) && len > maxBytes) {
      throw new AppError('SPARK_RESPONSE_TOO_LARGE', `spark 响应超过大小限制 (${maxBytes} bytes)`)
    }
  }

  // Read body with size limit
  const chunks: Buffer[] = []
  let totalBytes = 0

  for await (const chunk of response.body as AsyncIterable<Buffer>) {
    totalBytes += chunk.length
    if (totalBytes > maxBytes) {
      throw new AppError('SPARK_RESPONSE_TOO_LARGE', `spark 响应超过大小限制 (${maxBytes} bytes)`)
    }
    chunks.push(chunk)
  }

  const body = Buffer.concat(chunks).toString('utf-8')

  // Validate JSON for spark routes
  try {
    JSON.parse(body)
  } catch {
    throw new AppError('SPARK_RESPONSE_INVALID', 'spark 返回数据无法解析')
  }

  // Collect headers
  const resHeaders: Record<string, string | string[]> = {}
  for (const [key, value] of Object.entries(response.headers)) {
    if (value != null) resHeaders[key] = value as string | string[]
  }

  return {
    statusCode: response.statusCode,
    body,
    headers: resHeaders,
  }
}
