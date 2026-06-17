import { z } from 'zod'
import { AppError } from '../../utils/errors.js'
import type { ParsedSparkUrl } from './spark.types.js'

const urlSchema = z.string().url().max(2048)

export function parseSparkUrl(input: string): ParsedSparkUrl {
  // 1. Basic URL validation
  const parsed = urlSchema.safeParse(input)
  if (!parsed.success) {
    throw new AppError('INVALID_SPARK_URL', '请输入有效的 URL 地址')
  }

  // 2. Parse URL
  let url: URL
  try {
    url = new URL(input)
  } catch {
    throw new AppError('INVALID_SPARK_URL', '无法解析 URL')
  }

  // 3. Protocol must be https
  if (url.protocol !== 'https:') {
    throw new AppError('INVALID_SPARK_URL', '仅支持 HTTPS 链接')
  }

  // 4. Hostname must be spark.lucko.me (case-insensitive)
  if (url.hostname.toLowerCase() !== 'spark.lucko.me') {
    throw new AppError('INVALID_SPARK_URL', '请输入有效的 spark.lucko.me 分析链接')
  }

  // 5. No username/password (@ bypass)
  if (url.username || url.password) {
    throw new AppError('INVALID_SPARK_URL', 'URL 格式无效')
  }

  // 6. No custom port
  if (url.port && url.port !== '443') {
    throw new AppError('INVALID_SPARK_URL', '不允许自定义端口')
  }

  // 7. Extract code from pathname: /{code}
  const match = url.pathname.match(/^\/([A-Za-z0-9_-]+)$/)
  if (!match || !match[1]) {
    throw new AppError('SPARK_CODE_NOT_FOUND', '无法从链接中提取 spark 报告 ID')
  }

  const code = match[1]

  // 8. Reconstruct URLs (ignore user's query/fragment)
  return {
    code,
    normalizedUrl: `https://spark.lucko.me/${code}`,
    rawMetadataUrl: `https://spark.lucko.me/${code}?raw=1`,
  }
}
