import { safeFetch } from '../../utils/safe-fetch.js'
import { AppError } from '../../utils/errors.js'
import type { SparkRawData } from './spark.types.js'

interface CacheEntry {
  data: SparkRawData
  timestamp: number
  size: number
}

export class SparkFetcher {
  private cache = new Map<string, CacheEntry>()
  private readonly cacheMaxEntries = 100
  private readonly cacheMaxTotalBytes = 50 * 1024 * 1024 // 50MB
  private readonly cacheTtlMs = 5 * 60 * 1000 // 5 minutes
  private readonly defaultTimeout: number
  private readonly rawMaxBytes: number
  private readonly fullMaxBytes: number

  constructor(options?: { timeout?: number; rawMaxBytes?: number; fullMaxBytes?: number }) {
    this.defaultTimeout = options?.timeout ?? 10000
    this.rawMaxBytes = options?.rawMaxBytes ?? 5 * 1024 * 1024
    this.fullMaxBytes = options?.fullMaxBytes ?? 30 * 1024 * 1024
  }

  async fetchRawMetadata(code: string): Promise<SparkRawData> {
    // Check cache
    const cached = this.cache.get(code)
    if (cached && Date.now() - cached.timestamp < this.cacheTtlMs) {
      return cached.data
    }

    const url = `https://spark.lucko.me/${code}?raw=1`
    const result = await safeFetch(url, {
      timeout: this.defaultTimeout,
      maxBytes: this.rawMaxBytes,
    })

    let json: any
    try {
      json = JSON.parse(result.body)
    } catch {
      throw new AppError('SPARK_RESPONSE_INVALID', 'spark 返回数据无法解析为 JSON')
    }

    const rawData = this.extractRawData(code, json)

    // Update cache with eviction
    this.addToCache(code, rawData, result.body.length)

    return rawData
  }

  /**
   * Extension point — fetch full spark data (?raw=1&full=true).
   * MVP: disabled by default, available for future use.
   */
  async fetchFullData(code: string): Promise<unknown> {
    const url = `https://spark.lucko.me/${code}?raw=1&full=true`
    const result = await safeFetch(url, {
      timeout: this.defaultTimeout * 3,
      maxBytes: this.fullMaxBytes,
    })

    try {
      return JSON.parse(result.body)
    } catch {
      throw new AppError('SPARK_RESPONSE_INVALID', 'spark full data 无法解析为 JSON')
    }
  }

  private extractRawData(code: string, json: any): SparkRawData {
    const metadata = json?.metadata || json

    // Determine report type from available data
    let reportType: SparkRawData['reportType'] = 'unknown'
    if (json?.sampler || metadata?.sampler) {
      reportType = 'sampler'
    } else if (json?.heap || metadata?.heap) {
      reportType = 'heap'
    } else if (json?.health || metadata?.health || json?.tps || metadata?.tps) {
      reportType = 'health'
    }

    const platformInfo = metadata?.platform || json?.platform || {}
    const systemInfo = metadata?.system || json?.system || {}

    return {
      code,
      reportType,
      platform: platformInfo?.name || platformInfo?.type || systemInfo?.platform,
      minecraftVersion: platformInfo?.version || systemInfo?.minecraftVersion,
      sparkVersion: metadata?.sparkVersion || json?.sparkVersion || systemInfo?.sparkVersion,
      serverBrand: platformInfo?.brand || systemInfo?.serverBrand,
      durationSeconds: metadata?.durationSeconds || json?.durationSeconds || metadata?.duration,
      rawJson: json,
    }
  }

  private addToCache(code: string, data: SparkRawData, sizeBytes: number) {
    // Evict oldest if at capacity
    if (this.cache.size >= this.cacheMaxEntries) {
      const oldest = this.cache.keys().next()
      if (oldest.value) this.cache.delete(oldest.value)
    }

    // Evict to stay under total bytes limit
    let totalBytes = sizeBytes
    for (const entry of this.cache.values()) {
      totalBytes += entry.size
    }
    while (totalBytes > this.cacheMaxTotalBytes && this.cache.size > 0) {
      const oldestKey = this.cache.keys().next().value
      if (oldestKey) {
        const removed = this.cache.get(oldestKey)
        if (removed) totalBytes -= removed.size
        this.cache.delete(oldestKey)
      }
    }

    this.cache.set(code, { data, timestamp: Date.now(), size: sizeBytes })
  }

  clearCache(): void {
    this.cache.clear()
  }
}

// Singleton
export const sparkFetcher = new SparkFetcher()
