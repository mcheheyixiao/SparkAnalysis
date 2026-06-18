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
   * Fetch full spark data (?raw=1&full=true).
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

  /**
   * Merge raw metadata and full data into a single SparkRawData.
   * Full data is preferred for type detection and data extraction.
   */
  mergeRawAndFull(rawData: SparkRawData, fullJson: unknown): SparkRawData {
    const merged = {
      metadata: rawData.rawJson,
      full: fullJson,
    }

    // Re-detect report type from merged data (prefer fullJson)
    const reportType = this.detectReportType(fullJson) !== 'unknown'
      ? this.detectReportType(fullJson)
      : rawData.reportType

    // Extract server info from merged data
    const md = rawData.rawJson as any
    const full = fullJson as any
    const metadata = (full?.metadata || md?.metadata || {}) as any

    return {
      code: rawData.code,
      reportType,
      platform: this.extractPlatformName(full) || this.extractPlatformName(md) || rawData.platform,
      minecraftVersion: this.pickServerInfo(full, md, ['minecraftVersion', 'mcVersion', 'serverVersion', 'platformVersion']) || rawData.minecraftVersion,
      sparkVersion: this.pickServerInfo(full, md, ['sparkVersion']) || rawData.sparkVersion,
      serverBrand: this.pickServerInfo(full, md, ['serverBrand', 'brand']) || rawData.serverBrand,
      durationSeconds: full?.durationSeconds || full?.duration || metadata?.durationSeconds || metadata?.duration || rawData.durationSeconds,
      rawJson: merged,
    }
  }

  // =========== Private helpers ===========

  private extractRawData(code: string, json: any): SparkRawData {
    const reportType = this.detectReportType(json)

    return {
      code,
      reportType,
      platform: this.extractPlatformName(json),
      minecraftVersion: this.extractServerField(json, ['minecraftVersion', 'mcVersion', 'serverVersion', 'platformVersion']),
      sparkVersion: this.extractServerField(json, ['sparkVersion']),
      serverBrand: this.extractServerField(json, ['serverBrand', 'brand']),
      durationSeconds: json?.durationSeconds || json?.duration || json?.metadata?.durationSeconds || json?.metadata?.duration,
      rawJson: json,
    }
  }

  /**
   * Priority-based report type detection using deep key search.
   * Order: sampler/profiler → health → heap → unknown
   */
  private detectReportType(json: any): SparkRawData['reportType'] {
    // ---- sampler / profiler ----
    const samplerKeys = [
      'sampler', 'profiler', 'threads', 'threadDumps',
      'callTree', 'calltree', 'root', 'sources',
    ]
    if (this.hasAnyKeyDeep(json, samplerKeys)) return 'sampler'

    // Check metadata.type / type fields
    const typeField = this.findFirstDeep<string>(json, ['type', 'metadata'])
    if (typeof typeField === 'string') {
      const t = typeField.toLowerCase()
      if (t === 'sampler' || t === 'profiler') return 'sampler'
    }
    const mdType = (json?.metadata as any)?.type
    if (typeof mdType === 'string') {
      const t = mdType.toLowerCase()
      if (t === 'sampler' || t === 'profiler') return 'sampler'
    }

    // ---- health ----
    const healthKeys = [
      'health', 'tps', 'mspt', 'tick', 'ticks',
      'cpu', 'memory', 'gc', 'ping',
    ]
    if (this.hasAnyKeyDeep(json, healthKeys)) return 'health'

    if (typeof typeField === 'string' && typeField.toLowerCase() === 'health') return 'health'
    if (typeof mdType === 'string' && mdType.toLowerCase() === 'health') return 'health'

    // ---- heap ----
    const heapKeys = [
      'heap', 'heapSummary', 'objects', 'classes', 'instances', 'memoryUsage',
    ]
    if (this.hasAnyKeyDeep(json, heapKeys)) return 'heap'

    if (typeof typeField === 'string' && typeField.toLowerCase() === 'heap') return 'heap'
    if (typeof mdType === 'string' && mdType.toLowerCase() === 'heap') return 'heap'

    return 'unknown'
  }

  /**
   * Check if any of the given keys exist at any depth (up to maxDepth).
   * Arrays are scanned up to the first 20 items.
   */
  private hasAnyKeyDeep(obj: unknown, keys: string[], maxDepth = 5): boolean {
    return this._hasAnyKeyDeep(obj, keys, maxDepth, 0)
  }

  private _hasAnyKeyDeep(obj: unknown, keys: string[], maxDepth: number, currentDepth: number): boolean {
    if (currentDepth > maxDepth) return false
    if (obj == null) return false
    if (typeof obj !== 'object') return false

    if (Array.isArray(obj)) {
      const limit = Math.min(obj.length, 20)
      for (let i = 0; i < limit; i++) {
        if (this._hasAnyKeyDeep(obj[i], keys, maxDepth, currentDepth + 1)) return true
      }
      return false
    }

    const record = obj as Record<string, unknown>
    for (const [k, v] of Object.entries(record)) {
      if (keys.includes(k)) return true
      if (this._hasAnyKeyDeep(v, keys, maxDepth, currentDepth + 1)) return true
    }
    return false
  }

  /**
   * Find the first value matching any of the given keys at any depth.
   */
  private findFirstDeep<T = unknown>(obj: unknown, keys: string[], maxDepth = 5): T | undefined {
    return this._findFirstDeep<T>(obj, keys, maxDepth, 0)
  }

  private _findFirstDeep<T = unknown>(obj: unknown, keys: string[], maxDepth: number, currentDepth: number): T | undefined {
    if (currentDepth > maxDepth) return undefined
    if (obj == null) return undefined
    if (typeof obj !== 'object') return undefined

    if (Array.isArray(obj)) {
      const limit = Math.min(obj.length, 20)
      for (let i = 0; i < limit; i++) {
        const found = this._findFirstDeep<T>(obj[i], keys, maxDepth, currentDepth + 1)
        if (found !== undefined) return found
      }
      return undefined
    }

    const record = obj as Record<string, unknown>
    // Check if this object is a match for "metadata" / "type" keys
    // (these are special — we want the VALUE of the matched key)
    for (const [k, v] of Object.entries(record)) {
      if (keys.includes(k)) {
        // For special singleton keys like "type" on metadata, return the whole object context
        return v as unknown as T
      }
    }
    // Recurse
    for (const [, v] of Object.entries(record)) {
      const found = this._findFirstDeep<T>(v, keys, maxDepth, currentDepth + 1)
      if (found !== undefined) return found
    }
    return undefined
  }

  /**
   * Extract platform name from various possible locations.
   */
  private extractPlatformName(json: any): string | undefined {
    const metadata = json?.metadata || {}
    const candidates = [
      metadata?.platform,
      json?.platform,
      json?.server,
      json?.system,
      json?.environment,
      metadata?.server,
      metadata?.system,
    ]

    for (const c of candidates) {
      if (!c) continue
      if (typeof c === 'string') return c
      if (typeof c === 'object') {
        const name = c?.name || c?.type || c?.brand || c?.platform
        if (name) return name
      }
    }

    // Deep search for platform object
    const platformObj = this.findFirstDeep<any>(json, ['platform'])
    if (platformObj && typeof platformObj === 'object') {
      return platformObj?.name || platformObj?.type || platformObj?.brand || platformObj?.platform
    }

    return undefined
  }

  /**
   * Extract a server info field from multiple candidate locations.
   */
  private extractServerField(json: any, fieldNames: string[]): string | undefined {
    const metadata = json?.metadata || {}
    // Also check 'version' in platform objects for minecraft version
    const allNames = [...fieldNames]
    if (fieldNames.includes('minecraftVersion')) {
      allNames.push('version')
    }
    for (const fn of allNames) {
      if (metadata[fn]) return String(metadata[fn])
      if (json[fn]) return String(json[fn])
      if (metadata?.platform?.[fn]) return String(metadata.platform[fn])
      if (json?.platform?.[fn]) return String(json.platform[fn])
    }
    // Deep search
    const found = this.findFirstDeep<any>(json, fieldNames)
    if (found !== undefined) return String(found)
    return undefined
  }

  /**
   * Pick a server info value from full data, then raw metadata.
   */
  private pickServerInfo(full: any, raw: any, fieldNames: string[]): string | undefined {
    for (const fn of fieldNames) {
      const v = full?.[fn] || full?.metadata?.[fn] || full?.platform?.[fn]
        || raw?.[fn] || raw?.metadata?.[fn] || raw?.platform?.[fn]
      if (v !== undefined && v !== null) return String(v)
    }
    return undefined
  }

  // =========== Cache management ===========

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
