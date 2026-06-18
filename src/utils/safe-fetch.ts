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

// ---- Spark URL validation ----

// Matches: /{code}  where code is [A-Za-z0-9_-]+
const SPARK_PATH_RE = /^\/[A-Za-z0-9_-]+$/

/**
 * Validate that a URL is a safe spark fetch target.
 *
 * Rules (aligned with the SSRF design):
 *   1. protocol === 'https:'
 *   2. hostname === 'spark.lucko.me' (case-insensitive)
 *   3. port is empty
 *   4. username/password are empty
 *   5. pathname matches /^\/[A-Za-z0-9_-]+$/
 *   6. Only allowed query params: raw=1 (required) and full=true (optional)
 *   7. No hash fragment
 *
 * @throws AppError with code SPARK_REMOTE_ERROR if validation fails.
 */
export function validateSparkFetchUrl(url: string | URL): void {
  let parsed: URL
  try {
    parsed = typeof url === 'string' ? new URL(url) : url
  } catch {
    throw new AppError('SPARK_REMOTE_ERROR', '内部请求 URL 无效')
  }

  // 1. Protocol must be https
  if (parsed.protocol !== 'https:') {
    throw new AppError('SPARK_REMOTE_ERROR', '内部请求仅允许 HTTPS')
  }

  // 2. Hostname must be spark.lucko.me
  if (parsed.hostname.toLowerCase() !== 'spark.lucko.me') {
    throw new AppError('SPARK_REMOTE_ERROR', '不允许请求该域名')
  }

  // 3. No custom port
  if (parsed.port) {
    throw new AppError('SPARK_REMOTE_ERROR', '不允许自定义端口')
  }

  // 4. No username/password
  if (parsed.username || parsed.password) {
    throw new AppError('SPARK_REMOTE_ERROR', 'URL 格式无效')
  }

  // 5. Pathname must be /{code}
  if (!SPARK_PATH_RE.test(parsed.pathname)) {
    throw new AppError('SPARK_REMOTE_ERROR', 'spark URL 路径格式无效')
  }

  // 6. Query params: only raw=1 (required) and full=true (optional)
  const params = parsed.searchParams
  const raw = params.get('raw')
  const full = params.get('full')

  // raw=1 is required
  if (raw !== '1') {
    throw new AppError('SPARK_REMOTE_ERROR', 'spark 抓取参数无效')
  }

  // full, if present, must equal true
  if (full !== null && full !== 'true') {
    throw new AppError('SPARK_REMOTE_ERROR', 'spark 抓取参数无效')
  }

  // No other query params allowed
  const allowedParams = new Set(['raw', 'full'])
  for (const key of params.keys()) {
    if (!allowedParams.has(key)) {
      throw new AppError('SPARK_REMOTE_ERROR', 'spark 抓取参数无效')
    }
  }

  // 7. No hash fragment
  if (parsed.hash) {
    throw new AppError('SPARK_REMOTE_ERROR', '不允许 URL hash fragment')
  }
}

// ---- Main fetch function ----

/**
 * Unified HTTP fetch with SSRF protection.
 * Only allows HTTPS to spark.lucko.me with strict path/query validation.
 * Redirects are handled manually (max 1), with the same strict validation.
 *
 * Each request creates and closes its own undici Client to avoid resource leaks.
 */
export async function safeFetch(url: string, options: SafeFetchOptions = {}): Promise<SafeFetchResult> {
  const {
    timeout = 10000,
    maxBytes = 5 * 1024 * 1024, // 5MB
    method = 'GET',
    headers = {},
  } = options

  // Validate URL — throws SPARK_REMOTE_ERROR on any violation
  validateSparkFetchUrl(url)

  // Parse — safe after validation
  const targetUrl = new URL(url)

  // First request
  const response = await requestOnce(targetUrl, {
    method,
    headers: {
      'User-Agent': 'SparkAIAnalyzer/1.0',
      'Accept': 'application/json, text/plain, */*',
      ...headers,
    },
    timeout,
  })

  // Handle redirect (max 1)
  if (response.statusCode >= 300 && response.statusCode < 400) {
    // Close the original response's Client (redirect body is not consumed)
    const originalClient: Client | undefined = (response as any)._safeFetchClient
    if (originalClient) {
      try { await originalClient.close() } catch { /* ignore close errors */ }
    }

    const location = response.headers['location'] as string
    if (!location) {
      throw new AppError('SPARK_REMOTE_ERROR', '重定向缺少 Location header')
    }

    // Resolve redirect URL relative to the original
    let redirectUrl: URL
    try {
      redirectUrl = new URL(location, targetUrl)
    } catch {
      throw new AppError('SPARK_REMOTE_ERROR', '重定向 URL 无效')
    }

    // Strict validation of redirect target (same rules as initial URL)
    validateSparkFetchUrl(redirectUrl)

    // Follow redirect (single hop, with own Client)
    const redirectResponse = await requestOnce(redirectUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'SparkAIAnalyzer/1.0',
        'Accept': 'application/json, text/plain, */*',
      },
      timeout,
    })

    return await readResponse(redirectResponse, maxBytes)
  }

  // Not a redirect — read and validate the response body
  return await readResponse(response, maxBytes)
}

/**
 * Execute a single HTTP request to a validated URL.
 *
 * Creates a new undici Client for this request and ALWAYS closes it
 * in the finally block — even on timeout, error, or oversized response.
 */
async function requestOnce(
  targetUrl: URL,
  options: {
    method: string
    headers: Record<string, string>
    timeout: number
  },
): Promise<Awaited<ReturnType<typeof undiciRequest>>> {
  const { method, headers, timeout } = options

  // Create dispatcher with manual redirect disabled
  const client = new Client(targetUrl.origin)
  const dispatcher = client.compose(
    interceptors.redirect({ maxRedirections: 0 }),
  )

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    const response = await undiciRequest(targetUrl.toString(), {
      method,
      headers,
      signal: controller.signal,
      dispatcher,
    })

    // NOTE: We do NOT close the client here — the caller must read the
    // response body first, because undici streams the body lazily.
    // Instead, we attach the client to the response for the caller to close.
    ;(response as any)._safeFetchClient = client

    return response
  } catch (err) {
    clearTimeout(timeoutId)

    // Close client on error (no response body to drain)
    try { await client.close() } catch { /* ignore close errors */ }

    if (err instanceof AppError) throw err

    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new AppError('SPARK_FETCH_TIMEOUT', 'spark 数据抓取超时，请稍后重试')
    }

    if (err instanceof Error && err.message.includes('UND_ERR_HEADERS_TIMEOUT')) {
      throw new AppError('SPARK_FETCH_TIMEOUT', 'spark 数据抓取超时，请稍后重试')
    }

    throw new AppError('SPARK_REMOTE_ERROR', 'spark 服务暂时不可用，请稍后重试')
  } finally {
    clearTimeout(timeoutId)
  }
}

async function readResponse(
  response: Awaited<ReturnType<typeof undiciRequest>>,
  maxBytes: number,
): Promise<SafeFetchResult> {
  // Extract the attached Client (set by requestOnce) so we can close it
  // after the body is fully consumed.
  const client: Client | undefined = (response as any)._safeFetchClient

  try {
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
  } finally {
    // Always close the Client after reading (or failing to read) the response body
    if (client) {
      try { await client.close() } catch { /* ignore close errors */ }
    }
  }
}
