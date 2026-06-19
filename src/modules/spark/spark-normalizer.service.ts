import type { SparkRawData, NormalizedSummary, NormalizedThread, NormalizedSource, NormalizedGcSummary, NormalizedGcCollector, NormalizedEntityDistributionSummary, NormalizedEntityTypeStat, NormalizedWorldEntitySummary, NormalizedHotEntityChunk } from './spark.types.js'

interface SourceIndex {
  classSources: Map<string, string>
  methodSources: Map<string, string>
  lineSources: Map<string, string> | undefined
}

export class SparkNormalizer {
  normalize(rawData: SparkRawData): NormalizedSummary {
    const limitations: string[] = []
    const raw = rawData.rawJson as any
    const metadata = raw?.metadata || raw || {}
    const full = raw?.full || {}

    // Record full fetch failure
    if (rawData.fullFetchFailed) {
      const reason = rawData.fullFailReason || 'unknown'
      if (reason.includes('too large') || reason.includes('maxBytes') || reason.includes('size')) {
        limitations.push(
          'full=true 数据拉取失败：响应体超过 sparkFullMaxBytes 限制，未能解析完整 profiler 调用树。当前分析只能基于 metadata 和部分摘要，无法精确定位具体方法来源。'
        )
      } else if (reason.includes('timeout') || reason.includes('abort')) {
        limitations.push(
          'full=true 数据拉取超时，未能解析完整 profiler 调用树。'
        )
      } else if (reason.includes('invalid') || reason.includes('parse') || reason.includes('JSON')) {
        limitations.push(
          'full=true 数据解析失败，未能读取完整 profiler 调用树。'
        )
      } else {
        limitations.push(
          `full=true 数据拉取失败：${reason}。未能解析完整 profiler 调用树。`
        )
      }
    }

    // ---- Debug info (for AI prompt) ----
    const rawTopLevelKeys = this.getTopLevelKeys(raw)
    const fullTopLevelKeys = raw?.full ? this.getTopLevelKeys(raw.full) : undefined
    const extractionHints: string[] = []
    const hasFull = !!raw?.full

    // ---- Server info ----
    const server = this.extractServerInfo(raw, rawData)
    this.detectedPlatform = server.platform

    // ---- Timing ----
    const timing = {
      createdAt: metadata?.createdAt || raw?.createdAt || full?.createdAt || full?.metadata?.startTime || metadata?.startTime,
      durationSeconds: rawData.durationSeconds
        ?? this.durationToSeconds(metadata?.durationSeconds) ?? this.durationToSeconds(raw?.durationSeconds)
        ?? this.durationToSeconds(full?.durationSeconds) ?? this.durationToSeconds(full?.duration)
        // Spark platformStatistics.uptime is in milliseconds
        ?? this.msToSeconds(this.pickFirst(full, ['metadata.platformStatistics.uptime']))
        ?? this.msToSeconds(this.pickFirst(raw, ['metadata.platformStatistics.uptime', 'metadata.metadata.platformStatistics.uptime']))
        ?? this.durationToSeconds(metadata?.interval)
        ?? this.durationToSeconds(full?.metadata?.interval),
    }

    // ---- Health ----
    const health = this.extractHealth(raw, full, rawData.reportType, limitations, extractionHints)

    // ---- Profiler (sampler data) ----
    const profiler = this.extractProfiler(raw, full, rawData.reportType, limitations, extractionHints)

    return {
      code: rawData.code,
      reportType: rawData.reportType,
      server,
      timing,
      health,
      profiler,
      limitations,
      debug: {
        rawTopLevelKeys,
        fullTopLevelKeys,
        extractionHints,
      },
    }
  }

  // ========== Server info extraction ==========

  private extractServerInfo(raw: any, rawData: SparkRawData): NormalizedSummary['server'] {
    const metadata = raw?.metadata || raw || {}
    const full = raw?.full || {}

    return {
      platform:
        this.pickFirst<string>(raw, ['metadata.platform.name', 'metadata.platform.type', 'metadata.platform.brand', 'metadata.platform', 'platform.name', 'platform.type', 'platform', 'server', 'system.platform', 'environment'])
        || rawData.platform,
      minecraftVersion:
        this.pickFirst<string>(raw, ['metadata.platform.version', 'platform.version', 'minecraftVersion', 'mcVersion', 'serverVersion', 'platformVersion'])
        || this.pickFirst<string>(full, ['minecraftVersion', 'mcVersion', 'serverVersion', 'platformVersion'])
        || rawData.minecraftVersion,
      sparkVersion:
        this.pickFirst<string>(raw, ['sparkVersion', 'metadata.sparkVersion', 'metadata.spark_version'])
        || rawData.sparkVersion,
      serverBrand:
        this.pickFirst<string>(raw, ['serverBrand', 'platform.brand', 'metadata.platform.brand', 'brand'])
        || rawData.serverBrand,
      environment: metadata?.system?.environment || raw?.system?.environment || full?.system?.environment,
    }
  }

  // ========== Health extraction ==========

  private extractHealth(
    raw: any,
    full: any,
    reportType: string,
    limitations: string[],
    hints: string[],
  ): NormalizedSummary['health'] {
    const health: NormalizedSummary['health'] = {}
    let hasAnyHealthData = false

    // --- TPS ---
    const tpsObj = this.findFirstDeep<any>(raw, ['tps'])
      || this.findFirstDeep<any>(full, ['tps'])
      || raw?.health?.tps || raw?.tps || full?.tps || full?.health?.tps
      || this.pickFirst<any>(raw, ['data.tps', 'server.tps', 'platform.tps'])

    if (tpsObj && typeof tpsObj === 'object') {
      const tps = {
        latest: this.toNumber(tpsObj?.last1m) ?? this.toNumber(tpsObj?.latest) ?? this.toNumber(tpsObj?.oneMinute) ?? this.toNumber(tpsObj?.['1m']),
        mean: this.toNumber(tpsObj?.mean) ?? this.toNumber(tpsObj?.avg) ?? this.toNumber(tpsObj?.average),
        min: this.toNumber(tpsObj?.min),
        max: this.toNumber(tpsObj?.max),
      }
      // If mean is missing but latest is present, use latest as mean estimate
      // so downstream rule analysis can still detect TPS issues.
      if (tps.mean == null && tps.latest != null) {
        tps.mean = tps.latest
      }
      if (tps.latest != null || tps.mean != null) {
        health.tps = tps
        hasAnyHealthData = true
      }
    } else if (this.toNumber(tpsObj) != null) {
      health.tps = { mean: this.toNumber(tpsObj) }
      hasAnyHealthData = true
    }

    // --- MSPT ---
    let msptObj = this.findFirstDeep<any>(raw, ['mspt'])
      || this.findFirstDeep<any>(full, ['mspt'])
      || raw?.health?.mspt || raw?.mspt || full?.mspt || full?.health?.mspt
      || this.pickFirst<any>(raw, ['tick.mspt', 'ticks.mspt', 'data.mspt'])

    // If the found msptObj doesn't have useful numeric fields, try timeWindowStatistics
    const msptObjHasFields = msptObj && typeof msptObj === 'object'
      && (this.toNumber(msptObj?.mean) != null || this.toNumber(msptObj?.median) != null
          || this.toNumber(msptObj?.max) != null || this.toNumber(msptObj?.p95) != null)

    if (!msptObjHasFields) {
      const tws = full?.timeWindowStatistics
      if (tws && typeof tws === 'object') {
        const windows = Object.values(tws) as any[]
        if (windows.length > 0) {
          const msptMedians: number[] = []
          const msptMaxes: number[] = []
          for (const w of windows) {
            if (typeof w?.msptMedian === 'number') msptMedians.push(w.msptMedian)
            if (typeof w?.msptMax === 'number') msptMaxes.push(w.msptMax)
          }
          if (msptMedians.length > 0 || msptMaxes.length > 0) {
            const medianVal = msptMedians.length > 0 ? this.avg(msptMedians) : undefined
            health.mspt = {
              mean: medianVal, // propagate to mean so rule analyzer can use it
              median: medianVal,
              max: msptMaxes.length > 0 ? Math.max(...msptMaxes) : undefined,
            }
            hasAnyHealthData = true
            msptObj = null // mark as processed so we skip the block below
          }
        }
      }
    }

    if (msptObj && typeof msptObj === 'object' && msptObjHasFields !== false) {
      const mspt = {
        mean: this.toNumber(msptObj?.mean) ?? this.toNumber(msptObj?.avg) ?? this.toNumber(msptObj?.average),
        median: this.toNumber(msptObj?.median) ?? this.toNumber(msptObj?.p50),
        p95: this.toNumber(msptObj?.p95) ?? this.toNumber(msptObj?.['95th']),
        max: this.toNumber(msptObj?.max),
      }
      // If mean is missing but median is present, use median as mean estimate
      if (mspt.mean == null && mspt.median != null) {
        mspt.mean = mspt.median
      }
      if (mspt.mean != null || mspt.median != null) {
        health.mspt = mspt
        hasAnyHealthData = true
      }
    }

    // --- CPU ---
    const cpuObj = this.findFirstDeep<any>(raw, ['cpu'])
      || this.findFirstDeep<any>(full, ['cpu'])
      || raw?.health?.cpu || raw?.cpu || full?.cpu || full?.health?.cpu
      || this.pickFirst<any>(raw, ['system.cpu', 'process.cpu'])

    // If cpu object doesn't have usable numeric values, try timeWindowStatistics
    let cpuFromWindows: { process?: number; system?: number } | undefined
    const cpuObjHasUsableFields = cpuObj && typeof cpuObj === 'object'
      && ((typeof (cpuObj as any)?.process === 'number') || (typeof (cpuObj as any)?.system === 'number')
          || (typeof (cpuObj as any)?.processUsage?.last1m === 'number') || (typeof (cpuObj as any)?.systemUsage?.last1m === 'number'))
    if (!cpuObjHasUsableFields) {
      const tws = full?.timeWindowStatistics
      if (tws && typeof tws === 'object') {
        const windows = Object.values(tws) as any[]
        const cpuProcessVals: number[] = []
        const cpuSystemVals: number[] = []
        for (const w of windows) {
          if (typeof w?.cpuProcess === 'number') cpuProcessVals.push(w.cpuProcess)
          if (typeof w?.cpuSystem === 'number') cpuSystemVals.push(w.cpuSystem)
        }
        if (cpuProcessVals.length > 0 || cpuSystemVals.length > 0) {
          cpuFromWindows = {
            process: cpuProcessVals.length > 0 ? Math.round(this.avg(cpuProcessVals) * 100) : undefined,
            system: cpuSystemVals.length > 0 ? Math.round(this.avg(cpuSystemVals) * 100) : undefined,
          }
        }
      }
    }

    const effectiveCpu = cpuObj || cpuFromWindows
    if (effectiveCpu && typeof effectiveCpu === 'object') {
      // Handle nested CPU usage objects (spark system info): { processUsage: { last1m: 0.33 }, systemUsage: { last1m: 0.33 } }
      const procUsage = effectiveCpu?.processUsage
      const sysUsage = effectiveCpu?.systemUsage
      const cpu = {
        process: this.normalizePercent(effectiveCpu?.process) ?? this.normalizePercent(effectiveCpu?.processLoad) ?? this.normalizePercent(effectiveCpu?.cpuProcess)
          ?? this.normalizePercent(procUsage?.last1m) ?? this.normalizePercent(procUsage?.last15m)
          ?? this.normalizePercent(procUsage?.mean) ?? this.normalizePercent(procUsage?.avg),
        system: this.normalizePercent(effectiveCpu?.system) ?? this.normalizePercent(effectiveCpu?.systemLoad) ?? this.normalizePercent(effectiveCpu?.cpuSystem)
          ?? this.normalizePercent(sysUsage?.last1m) ?? this.normalizePercent(sysUsage?.last15m)
          ?? this.normalizePercent(sysUsage?.mean) ?? this.normalizePercent(sysUsage?.avg),
      }
      if (cpu.process != null || cpu.system != null) {
        health.cpu = cpu
        hasAnyHealthData = true
      }
    }

    // --- Memory ---
    const memObj = this.findFirstDeep<any>(raw, ['memory'])
      || this.findFirstDeep<any>(full, ['memory'])
      || raw?.health?.memory || raw?.memory || full?.memory || full?.health?.memory
      || this.pickFirst<any>(raw, ['heap', 'jvm.memory', 'system.memory'])

    if (memObj && typeof memObj === 'object') {
      // Handle nested heap sub-object: { heap: { used, committed }, nonHeap, pools }
      // Spark platformStatistics.memory uses this nested structure.
      const heapObj = memObj?.heap
      const used = this.bytesToMB(
        memObj?.used ?? memObj?.usedBytes ?? memObj?.heapUsed ?? memObj?.usedMemory
          ?? heapObj?.used ?? heapObj?.usedBytes ?? heapObj?.heapUsed
      )
      const max = this.bytesToMB(
        memObj?.max ?? memObj?.maxBytes ?? memObj?.total ?? memObj?.committed ?? memObj?.heapMax ?? memObj?.maxMemory
          ?? heapObj?.max ?? heapObj?.maxBytes ?? heapObj?.total ?? heapObj?.committed ?? heapObj?.heapMax
      )
      const usagePercent = this.normalizePercent(memObj?.usagePercent)
        ?? this.normalizePercent(memObj?.usage)
        ?? this.normalizePercent(heapObj?.usagePercent)
        ?? this.normalizePercent(heapObj?.usage)
        ?? (max != null && max > 0 && used != null ? Math.round((used / max) * 100) : undefined)

      if (used != null || max != null) {
        health.memory = { usedMB: used, maxMB: max, usagePercent }
        hasAnyHealthData = true
      }
    }

    // --- GC ---
    const gcSummary = this.extractGcSummary(raw, full)
    if (gcSummary) {
      health.gc = gcSummary
      hasAnyHealthData = true
    }

    // --- Player count ---
    const playerCount =
      this.toFiniteNumber(this.pickFirst(full, ['metadata.platformStatistics.playerCount']))
      ?? this.toFiniteNumber(this.pickFirst(raw, ['metadata.platformStatistics.playerCount', 'metadata.metadata.platformStatistics.playerCount']))
      ?? this.toFiniteNumber(raw?.playerCount ?? full?.playerCount)
    if (playerCount != null) {
      health.playerCount = playerCount
    }

    // --- World entities ---
    const worldEntities =
      this.toFiniteNumber(this.pickFirst(full, ['metadata.platformStatistics.world.totalEntities']))
      ?? this.toFiniteNumber(this.pickFirst(raw, ['metadata.platformStatistics.world.totalEntities', 'metadata.metadata.platformStatistics.world.totalEntities']))
    if (worldEntities != null) {
      health.worldEntities = worldEntities
    }

    // --- Entity distribution (P7) ---
    const entityDistribution = this.extractEntityDistribution(raw, full, limitations, hints)
    if (entityDistribution) {
      health.entityDistribution = entityDistribution
      hasAnyHealthData = true
    }

    if (!hasAnyHealthData && reportType === 'health') {
      limitations.push('未从 raw/full 数据中提取到 TPS/MSPT/CPU/Memory/GC 健康数据')
      hints.push('health report detected but no health metrics extracted')
    }

    // Add limitation if only sampler summary is available (no full profiler)
    if (reportType === 'sampler' && !hasAnyHealthData) {
      limitations.push('仅有 sampler 摘要数据，缺少 health 报告中的 TPS/MSPT 指标')
    }

    return health
  }

  // ========== GC extraction (P6) ==========

  /**
   * Extract structured GC summary from spark metadata.
   * Priority order:
   * 1. raw.metadata.platformStatistics.gc
   * 2. full.metadata.platformStatistics.gc
   * 3. raw.platformStatistics.gc
   * 4. full.platformStatistics.gc
   * 5. raw.health.gc
   * 6. full.health.gc
   * 7. raw.gc
   * 8. full.gc
   * 9. findFirstDeep as last resort
   */
  private extractGcSummary(raw: any, full?: any): NormalizedGcSummary | undefined {
    // Priority-ordered GC data sources
    const gcSources: unknown[] = []

    // 1-2: metadata.platformStatistics.gc (primary source for spark raw data)
    const rawMetaGc = this.getByPath(raw, 'metadata.platformStatistics.gc')
    if (rawMetaGc !== undefined && rawMetaGc !== null) gcSources.push(rawMetaGc)

    if (full) {
      const fullMetaGc = this.getByPath(full, 'metadata.platformStatistics.gc')
      if (fullMetaGc !== undefined && fullMetaGc !== null) gcSources.push(fullMetaGc)
    }

    // 3-4: platformStatistics.gc
    const rawPlatGc = this.getByPath(raw, 'platformStatistics.gc')
    if (rawPlatGc !== undefined && rawPlatGc !== null) gcSources.push(rawPlatGc)

    if (full) {
      const fullPlatGc = this.getByPath(full, 'platformStatistics.gc')
      if (fullPlatGc !== undefined && fullPlatGc !== null) gcSources.push(fullPlatGc)
    }

    // 5-6: health.gc
    const rawHealthGc = this.getByPath(raw, 'health.gc')
    if (rawHealthGc !== undefined && rawHealthGc !== null) gcSources.push(rawHealthGc)

    if (full) {
      const fullHealthGc = this.getByPath(full, 'health.gc')
      if (fullHealthGc !== undefined && fullHealthGc !== null) gcSources.push(fullHealthGc)
    }

    // 7-8: top-level gc
    if (raw?.gc !== undefined && raw.gc !== null) gcSources.push(raw.gc)
    if (full?.gc !== undefined && full.gc !== null) gcSources.push(full.gc)

    // 9: findFirstDeep as last resort (but skip if we already have sources from metadata path)
    if (gcSources.length === 0) {
      const deepGc = this.findFirstDeep<any>(raw, ['gc']) || this.findFirstDeep<any>(full, ['gc'])
      if (deepGc !== undefined && deepGc !== null) gcSources.push(deepGc)
    }

    // Parse each source until we get valid collectors
    for (const gcObj of gcSources) {
      if (!gcObj || typeof gcObj !== 'object') continue
      const collectors = this.normalizeGcCollectors(gcObj)
      if (collectors.length > 0) {
        return this.buildGcSummary(collectors, gcObj)
      }
    }

    return undefined
  }

  /**
   * Parse GC collectors from an unknown GC object, supporting:
   * - Object format: { "G1 Young Generation": { total: 30, avgTime: 23 }, ... }
   * - Array format: [ { name: "G1 Young Generation", collections: 30, timeMs: 4567 }, ... ]
   * - Nested collectors: { collectors: [ ... ] }
   */
  private normalizeGcCollectors(gcObj: unknown): NormalizedGcCollector[] {
    if (!gcObj || typeof gcObj !== 'object') return []

    const record = gcObj as Record<string, unknown>

    // Nested collectors array
    if (Array.isArray(record.collectors)) {
      return (record.collectors as any[]).map((c: any) => this.parseCollectorEntry(c)).filter((c): c is NormalizedGcCollector => c !== null)
    }

    // Array format: direct array of collector objects
    if (Array.isArray(gcObj)) {
      return (gcObj as any[]).map((c: any) => this.parseCollectorEntry(c)).filter((c): c is NormalizedGcCollector => c !== null)
    }

    // Object format: keys are collector names, values are stats objects
    const collectors: NormalizedGcCollector[] = []
    for (const [key, val] of Object.entries(record)) {
      // Skip non-collector keys
      if (['collectors', 'frequency', 'warning', 'type', 'name', 'uptime'].includes(key.toLowerCase())) continue
      if (typeof val !== 'object' || val === null) continue

      const collector = this.parseCollectorEntry({ name: key, ...(val as Record<string, unknown>) })
      if (collector) collectors.push(collector)
    }

    return collectors
  }

  /**
   * Parse a single collector entry, extracting known field names.
   */
  private parseCollectorEntry(entry: any): NormalizedGcCollector | null {
    if (!entry || typeof entry !== 'object') return null

    const name = typeof entry.name === 'string' ? entry.name : undefined
    if (!name) return null // name is required

    const record = entry as Record<string, unknown>

    // collections: total (spark), collections, collectionCount, count, runs
    const collections = this.pickNumber(record, ['total', 'collections', 'collectionCount', 'count', 'runs'])

    // time: avgTime (spark), time, timeMs, totalTime, totalTimeMs, collectionTime, collectionTimeMs, duration, durationMs
    const timeMs = this.pickNumber(record, ['avgTime', 'time', 'timeMs', 'totalTime', 'totalTimeMs', 'collectionTime', 'collectionTimeMs', 'duration', 'durationMs'])

    // average: avgTime (spark), averageTime, averageTimeMs, avg, avgTimeMs, mean
    const averageTimeMs = this.pickNumber(record, ['avgTime', 'averageTime', 'averageTimeMs', 'avg', 'avgTimeMs', 'mean'])

    // max: maxTime, maxTimeMs, max
    const maxTimeMs = this.pickNumber(record, ['maxTime', 'maxTimeMs', 'max'])

    // last: lastTime, lastTimeMs
    const lastTimeMs = this.pickNumber(record, ['lastTime', 'lastTimeMs'])

    // avgFrequency is in ms between collections — not a time metric, but useful for context
    // We store it as a debug field or skip; don't confuse with timeMs

    return {
      name,
      ...(collections != null ? { collections } : {}),
      ...(timeMs != null ? { timeMs } : {}),
      ...(averageTimeMs != null ? { averageTimeMs } : {}),
      ...(maxTimeMs != null ? { maxTimeMs } : {}),
      ...(lastTimeMs != null ? { lastTimeMs } : {}),
    }
  }

  /**
   * Build the summary object from parsed collectors.
   */
  private buildGcSummary(collectors: NormalizedGcCollector[], _rawGcObj: unknown): NormalizedGcSummary {
    const totalCollections = collectors.reduce((sum, c) => sum + (c.collections || 0), 0)
    const totalTimeMs = collectors.reduce((sum, c) => sum + (c.timeMs || 0), 0)

    const youngCollectors = collectors.filter(c => c.name.toLowerCase().includes('young'))
    const oldCollectors = collectors.filter(c => c.name.toLowerCase().includes('old'))

    const youngCollections = youngCollectors.reduce((sum, c) => sum + (c.collections || 0), 0)
    const youngTimeMs = youngCollectors.reduce((sum, c) => sum + (c.timeMs || 0), 0)
    const oldCollections = oldCollectors.reduce((sum, c) => sum + (c.collections || 0), 0)
    const oldTimeMs = oldCollectors.reduce((sum, c) => sum + (c.timeMs || 0), 0)
    const hasOldGc = oldCollections > 0 || oldTimeMs > 0

    // Check for warning in raw GC object
    const warning = typeof (_rawGcObj as any)?.warning === 'string' ? (_rawGcObj as any).warning : undefined

    return {
      collectors,
      ...(totalCollections > 0 || collectors.some(c => c.collections != null) ? { totalCollections } : {}),
      ...(totalTimeMs > 0 || collectors.some(c => c.timeMs != null) ? { totalTimeMs } : {}),
      ...(youngCollections > 0 ? { youngCollections } : {}),
      ...(youngTimeMs > 0 ? { youngTimeMs } : {}),
      ...(oldCollections > 0 ? { oldCollections } : {}),
      ...(oldTimeMs > 0 ? { oldTimeMs } : {}),
      hasOldGc,
      ...(warning ? { warning } : {}),
    }
  }

  /**
   * Safely convert a value to a finite number, returning undefined if invalid.
   */
  private toFiniteNumber(value: unknown): number | undefined {
    return this.toNumber(value)
  }

  /**
   * Convert milliseconds to seconds. Returns undefined if value is null/NaN.
   */
  private msToSeconds(value: unknown): number | undefined {
    const n = this.toFiniteNumber(value)
    if (n == null) return undefined
    return Math.round(n / 1000)
  }

  /**
   * Interpret a duration value as seconds. If value > 10000, assume it's in ms and convert.
   */
  private durationToSeconds(value: unknown): number | undefined {
    const n = this.toFiniteNumber(value)
    if (n == null) return undefined
    // If value looks like milliseconds (> 10000), convert to seconds
    if (n > 10000) return Math.round(n / 1000)
    return n
  }

  /**
   * Pick the first finite number from an object given a list of candidate keys.
   */
  private pickNumber(obj: Record<string, unknown>, keys: string[]): number | undefined {
    for (const key of keys) {
      const val = obj[key]
      const n = this.toNumber(val)
      if (n != null) return n
    }
    return undefined
  }

  // ========== Entity distribution extraction (P7) ==========

  /**
   * Extract entity type distribution summary from spark metadata.
   * Priority source: raw.metadata.platformStatistics.world
   */
  private extractEntityDistribution(
    raw: any,
    full: any,
    limitations: string[],
    _hints: string[],
  ): NormalizedEntityDistributionSummary | undefined {
    // 1. Find the world object from priority-ordered data sources
    const worldObj = this.pickFirst<any>(raw, [
      'metadata.platformStatistics.world',
      'metadata.metadata.platformStatistics.world',
      'platformStatistics.world',
    ]) ?? this.pickFirst<any>(full, [
      'metadata.platformStatistics.world',
      'platformStatistics.world',
    ])

    if (!worldObj || typeof worldObj !== 'object') {
      // Try fallback paths
      const fallbackWorld = raw?.world ?? full?.world
      if (fallbackWorld && typeof fallbackWorld === 'object') {
        return this.buildEntityDistribution(fallbackWorld, raw, full, limitations)
      }
      return undefined
    }

    return this.buildEntityDistribution(worldObj, raw, full, limitations)
  }

  private buildEntityDistribution(
    worldObj: any,
    raw: any,
    full: any,
    limitations: string[],
  ): NormalizedEntityDistributionSummary | undefined {
    const distLimitations: string[] = []
    const globalRiskFlags: string[] = []

    // --- Total entities ---
    const totalEntities = this.toFiniteNumber(worldObj?.totalEntities)
      ?? this.toFiniteNumber(worldObj?.entities)
      ?? this.toFiniteNumber(worldObj?.total)

    if (totalEntities == null) return undefined

    // --- Global entity counts ---
    const globalEntityCounts = worldObj?.entityCounts
    if (!globalEntityCounts || typeof globalEntityCounts !== 'object') {
      distLimitations.push(
        '检测到世界实体总数，但 spark raw/full 数据中未找到可解析的实体类型分布，无法判断具体是哪类实体造成压力。'
      )
      return {
        totalEntities,
        worlds: [],
        globalTopTypes: [],
        riskFlags: [],
        limitations: distLimitations,
      }
    }

    // Parse global entity type stats
    const allGlobalStats = this.parseGlobalEntityStats(globalEntityCounts, totalEntities)
    const totalTypes = allGlobalStats.length
    const globalTopTypes = allGlobalStats.slice(0, 15)

    // Collect risk flags from global top types
    for (const stat of allGlobalStats) {
      if (stat.riskLevel === 'high' || stat.riskLevel === 'medium') {
        if (!globalRiskFlags.includes(stat.type)) {
          globalRiskFlags.push(stat.type)
        }
      }
    }

    // Total entities risk flag
    if (totalEntities >= 10000) {
      globalRiskFlags.push('实体总数过高(≥10000)')
    } else if (totalEntities >= 5000) {
      globalRiskFlags.push('实体总数偏高(≥5000)')
    } else if (totalEntities >= 1000) {
      globalRiskFlags.push('实体总数超过1000，需观察')
    }

    // Summary limitation if we truncated types
    if (allGlobalStats.length > 15) {
      distLimitations.push(
        '实体类型数量较多，已仅保留 TopN 类型，其余合并为 otherEntitiesTotal，避免向 AI 传递过大的实体清单。'
      )
    }

    // --- Parse worlds ---
    const worlds: NormalizedWorldEntitySummary[] = []
    const allChunks: NormalizedHotEntityChunk[] = []
    const rawWorlds = worldObj?.worlds
    if (Array.isArray(rawWorlds)) {
      for (const w of rawWorlds) {
        if (!w || typeof w !== 'object') continue
        const worldSummary = this.parseWorldSummary(w, totalEntities)
        if (worldSummary) {
          worlds.push(worldSummary)
        }
        // Collect chunks for hotChunks
        if (Array.isArray(w?.regions)) {
          for (const region of w.regions) {
            if (!region || !Array.isArray(region?.chunks)) continue
            for (const chunk of region.chunks) {
              if (!chunk || typeof chunk !== 'object') continue
              const chunkX = this.toFiniteNumber(chunk?.x)
              const chunkZ = this.toFiniteNumber(chunk?.z)
              const chunkTotal = this.toFiniteNumber(chunk?.totalEntities)
              if (chunkX == null || chunkZ == null || chunkTotal == null) continue

              const chunkEntityCounts = chunk?.entityCounts
              const chunkTopTypes: NormalizedEntityTypeStat[] = []
              if (chunkEntityCounts && typeof chunkEntityCounts === 'object') {
                const chunkStats = Object.entries(chunkEntityCounts as Record<string, unknown>)
                  .filter(([key, val]) => {
                    if (!key || typeof key !== 'string' || key === '[object Object]') return false
                    const n = this.toFiniteNumber(val)
                    return n != null && n > 0
                  })
                  .map(([key, val]) => ({
                    type: key,
                    count: this.toFiniteNumber(val)!,
                    ratio: chunkTotal > 0 ? Math.round((this.toFiniteNumber(val)! / chunkTotal) * 10000) / 10000 : undefined,
                  }))
                  .sort((a, b) => b.count - a.count)
                for (const stat of chunkStats.slice(0, 5)) {
                  const risk = this.classifyEntityRisk(stat.type, stat.count)
                  chunkTopTypes.push({ ...stat, ...risk })
                }
              }

              const chunkRiskFlags: string[] = []
              if (chunkTotal >= 50) chunkRiskFlags.push('高实体密度区块')
              if (chunkTopTypes.some(t => t.riskLevel === 'high')) chunkRiskFlags.push('含高风险实体类型')

              allChunks.push({
                world: w?.name || 'unknown',
                chunkX,
                chunkZ,
                approxBlockX: chunkX * 16,
                approxBlockZ: chunkZ * 16,
                totalEntities: chunkTotal,
                topTypes: chunkTopTypes,
                riskFlags: chunkRiskFlags.length > 0 ? chunkRiskFlags : undefined,
              })
            }
          }
        }
      }
    }

    // Sort chunks by totalEntities descending and take top 10
    allChunks.sort((a, b) => b.totalEntities - a.totalEntities)
    const hotChunks = allChunks.slice(0, 10)

    if (hotChunks.length > 0) {
      distLimitations.push(
        '已提取高实体区块摘要，但该数据只表示区块实体数量，不包含玩家行为、精确实体坐标或机器位置。'
      )
    }

    return {
      totalEntities,
      totalTypes,
      worlds,
      globalTopTypes,
      hotChunks: hotChunks.length > 0 ? hotChunks : undefined,
      riskFlags: globalRiskFlags,
      limitations: distLimitations.length > 0 ? distLimitations : undefined,
    }
  }

  /**
   * Parse global entity type stats from entityCounts object.
   * Returns sorted array with risk classification applied.
   */
  private parseGlobalEntityStats(
    entityCounts: unknown,
    totalEntities: number,
  ): NormalizedEntityTypeStat[] {
    if (!entityCounts || typeof entityCounts !== 'object') return []

    const stats: NormalizedEntityTypeStat[] = []

    for (const [key, val] of Object.entries(entityCounts as Record<string, unknown>)) {
      // Skip invalid keys
      if (!key || typeof key !== 'string' || key === '[object Object]') continue
      const count = this.toFiniteNumber(val)
      if (count == null || count <= 0) continue

      const ratio = totalEntities > 0
        ? Math.round((count / totalEntities) * 10000) / 10000
        : undefined

      const risk = this.classifyEntityRisk(key, count)
      stats.push({
        type: key,
        count,
        ratio,
        ...risk,
      })
    }

    // Sort by count descending
    stats.sort((a, b) => b.count - a.count)
    return stats
  }

  /**
   * Parse a single world summary from spark world data.
   */
  private parseWorldSummary(
    worldData: any,
    _globalTotalEntities: number,
  ): NormalizedWorldEntitySummary | undefined {
    const worldName = worldData?.name
    if (!worldName || typeof worldName !== 'string') return undefined

    const worldTotal = this.toFiniteNumber(worldData?.totalEntities)
    if (worldTotal == null) return undefined

    // Get world-level entity counts
    let worldEntityCounts: Record<string, number> | undefined
    if (worldData?.entityCounts && typeof worldData.entityCounts === 'object') {
      // Direct world-level entityCounts
      worldEntityCounts = {}
      for (const [key, val] of Object.entries(worldData.entityCounts as Record<string, unknown>)) {
        if (!key || typeof key !== 'string' || key === '[object Object]') continue
        const n = this.toFiniteNumber(val)
        if (n != null && n > 0) worldEntityCounts[key] = n
      }
    } else {
      // Aggregate from regions -> chunks -> entityCounts
      worldEntityCounts = {}
      if (Array.isArray(worldData?.regions)) {
        for (const region of worldData.regions) {
          if (!region || !Array.isArray(region?.chunks)) continue
          for (const chunk of region.chunks) {
            if (!chunk || typeof chunk?.entityCounts !== 'object') continue
            for (const [key, val] of Object.entries(chunk.entityCounts as Record<string, unknown>)) {
              if (!key || typeof key !== 'string' || key === '[object Object]') continue
              const n = this.toFiniteNumber(val)
              if (n != null && n > 0) {
                worldEntityCounts[key] = (worldEntityCounts[key] || 0) + n
              }
            }
          }
        }
      }
    }

    // Build top types
    const worldStats: NormalizedEntityTypeStat[] = []
    let aggregatedTotal = 0
    for (const [key, count] of Object.entries(worldEntityCounts)) {
      if (count <= 0) continue
      aggregatedTotal += count
      const ratio = worldTotal > 0 ? Math.round((count / worldTotal) * 10000) / 10000 : undefined
      const risk = this.classifyEntityRisk(key, count)
      worldStats.push({ type: key, count, ratio, ...risk })
    }
    worldStats.sort((a, b) => b.count - a.count)

    const topTypes = worldStats.slice(0, 10)
    const effectiveTotal = worldTotal > 0 ? worldTotal : aggregatedTotal
    const topTypesTotal = topTypes.reduce((sum, t) => sum + t.count, 0)
    const otherTypesCount = Math.max(0, worldStats.length - topTypes.length)
    const otherEntitiesTotal = Math.max(0, effectiveTotal - topTypesTotal)

    const worldRiskFlags: string[] = []
    for (const stat of topTypes) {
      if (stat.riskLevel === 'high' || stat.riskLevel === 'medium') {
        if (!worldRiskFlags.includes(stat.type)) {
          worldRiskFlags.push(stat.type)
        }
      }
    }

    return {
      world: worldName,
      totalEntities: effectiveTotal,
      topTypes,
      otherTypesCount: otherTypesCount > 0 ? otherTypesCount : undefined,
      otherEntitiesTotal: otherEntitiesTotal > 0 ? otherEntitiesTotal : undefined,
      riskFlags: worldRiskFlags.length > 0 ? worldRiskFlags : undefined,
    }
  }

  /**
   * Classify entity risk level based on type and count.
   */
  private classifyEntityRisk(type: string, count: number): {
    riskLevel?: 'low' | 'medium' | 'high'
    riskReason?: string
  } {
    const lower = type.toLowerCase()

    // minecraft:item / item — dropped items/掉落物
    if (lower === 'minecraft:item' || lower === 'item') {
      if (count >= 1000) return { riskLevel: 'high', riskReason: '掉落物数量极高，可能造成实体 tick、合并、碰撞或清理压力；需结合 profiler 主线程热点确认。' }
      if (count >= 250) return { riskLevel: 'medium', riskReason: '掉落物数量偏高，可能造成实体 tick、合并、碰撞或清理压力；需结合 profiler 主线程热点确认。' }
      return {}
    }

    // experience_orb — 经验球
    if (lower === 'minecraft:experience_orb' || lower === 'experience_orb') {
      if (count >= 500) return { riskLevel: 'high', riskReason: '经验球数量极高，可能造成实体 tick 和渲染压力；需结合 profiler 主线程热点确认。' }
      if (count >= 150) return { riskLevel: 'medium', riskReason: '经验球数量偏高，可能造成实体处理开销；需结合 profiler 主线程热点确认。' }
      return {}
    }

    // villager — 村民
    if (lower === 'minecraft:villager' || lower === 'villager') {
      if (count >= 300) return { riskLevel: 'high', riskReason: '村民数量极高，AI/寻路/交易处理可能造成显著主线程压力；需结合 profiler 中 entity/ai/pathfind 热点确认。' }
      if (count >= 100) return { riskLevel: 'medium', riskReason: '村民数量偏高，AI 和寻路可能产生实体处理开销；需结合 profiler 确认。' }
      return {}
    }

    // armor_stand — 盔甲架
    if (lower === 'minecraft:armor_stand' || lower === 'armor_stand') {
      if (count >= 500) return { riskLevel: 'high', riskReason: '盔甲架数量极高，可能造成实体 tick 和渲染更新压力；需结合 profiler 确认。' }
      if (count >= 200) return { riskLevel: 'medium', riskReason: '盔甲架数量偏高，可能产生实体处理开销；需结合 profiler 确认。' }
      return {}
    }

    // item_frame / glow_item_frame — 展示框
    if (lower === 'minecraft:item_frame' || lower === 'minecraft:glow_item_frame' || lower === 'item_frame' || lower === 'glow_item_frame') {
      if (count >= 500) return { riskLevel: 'high', riskReason: '展示框数量极高，可能造成实体 tick 和渲染更新压力；需结合 profiler 确认。' }
      if (count >= 200) return { riskLevel: 'medium', riskReason: '展示框数量偏高，可能产生实体处理开销；需结合 profiler 确认。' }
      return {}
    }

    // minecart / boat — 矿车/船
    if (lower === 'minecraft:minecart' || lower === 'minecart' ||
        lower === 'minecraft:boat' || lower === 'boat' ||
        lower === 'lootr:lootr_minecart') {
      if (count >= 300) return { riskLevel: 'high', riskReason: '矿车/船类实体数量极高，可能造成实体 tick 和碰撞检测压力；需结合 profiler 主线程热点确认。' }
      if (count >= 100) return { riskLevel: 'medium', riskReason: '矿车/船类实体数量偏高，可能产生实体处理开销；需结合 profiler 确认。' }
      return {}
    }

    return {}
  }

  // ========== Profiler extraction ==========

  private extractProfiler(
    raw: any,
    full: any,
    reportType: string,
    limitations: string[],
    hints: string[],
  ): NormalizedSummary['profiler'] {
    const threads: NormalizedThread[] = []
    const sources: NormalizedSource[] = []
    const suspiciousMethods: NormalizedSummary['profiler']['suspiciousMethods'] = []

    // Build source reverse index from classSources/methodSources/lineSources (full=true data)
    // Must be built BEFORE parsing threads so methods can be annotated with source info.
    const sourceIndex = this.buildSourceIndex(full)

    // --- Threads ---
    const rawThreads =
      raw?.sampler?.threads || raw?.profiler?.threads || raw?.threads
      || full?.sampler?.threads || full?.profiler?.threads || full?.threads
      || this.findFirstDeep<any>(raw, ['threads'])
      || this.findFirstDeep<any>(full, ['threads'])
      || raw?.threadDumps

    if (rawThreads && typeof rawThreads === 'object') {
      if (Array.isArray(rawThreads)) {
        // Array format: [{ name: "...", percent: 75, children: [...] }]
        for (const t of rawThreads) {
          if (!t) continue
          const thread = this.parseThreadNode(t, sourceIndex)
          if (thread) threads.push(thread)
        }
      } else {
        // Object format: { "Server thread": { totalPercent: 75, methods: [...] } }
        for (const [name, data] of Object.entries(rawThreads) as [string, any][]) {
          const thread: NormalizedThread = {
            name,
            type: this.classifyThreadType(name),
            totalPercent: data?.totalPercent ?? data?.percent,
          }
          const methods = data?.methods || data?.children || data?.nodes || []
          if (Array.isArray(methods) && methods.length > 0) {
            thread.topMethods = methods.slice(0, 10).map((m: any) => this.parseMethodNode(m, { sourceIndex }))
          }
          threads.push(thread)
        }
      }
    }

    // Try callTree/calltree/root path for thread data
    if (threads.length === 0) {
      const callTree = raw?.sampler?.callTree || raw?.profiler?.callTree || raw?.callTree || raw?.calltree
        || full?.sampler?.callTree || full?.profiler?.callTree || full?.callTree || full?.calltree
        || this.findFirstDeep<any>(raw, ['callTree', 'calltree', 'root'])

      if (callTree && typeof callTree === 'object') {
        const rootChildren = callTree?.root?.children || callTree?.children || callTree?.nodes || []
        if (Array.isArray(rootChildren)) {
          for (const child of rootChildren.slice(0, 20)) {
            const thread = this.parseThreadNode(child, sourceIndex)
            if (thread) threads.push(thread)
          }
        }
      }
    }

    // --- Sources ---
    // Sources from metadata are name-only (no percent). Enrich with method-level
    // evidence from classSources/methodSources in the full=true data.
    const rawSources =
      raw?.sampler?.sources || raw?.profiler?.sources || raw?.sources
      || full?.sampler?.sources || full?.profiler?.sources || full?.sources
      || full?.metadata?.sources || raw?.metadata?.sources
      || this.findFirstDeep<any>(raw, ['sources'])
      || this.findFirstDeep<any>(full, ['sources'])

    if (rawSources && typeof rawSources === 'object') {
      for (const [name, data] of Object.entries(rawSources) as [string, any][]) {
        // Compute source percent from thread methods that match this source
        const matchedMethods: string[] = []
        let computedPercent: number | undefined = data?.percent ?? data?.totalPercent

        // If no explicit percent, try to compute from thread data
        if (computedPercent == null && (sourceIndex.classSources.size > 0 || sourceIndex.methodSources.size > 0)) {
          const mainThread = threads.find(t => t.type === 'main' || t.name.toLowerCase().includes('server thread'))
          if (mainThread?.topMethods) {
            for (const m of mainThread.topMethods) {
              const fullName = m.packageName ? `${m.packageName}.${m.name}`.replace(/\.\./g, '.') : m.name
              const src = this.lookupSource(sourceIndex, fullName, m.name, m.packageName)
              if (src === name) {
                matchedMethods.push(m.name)
                computedPercent = (computedPercent || 0) + (m.percent || 0)
              }
            }
          }
        }

        // Determine if this source appears on the main thread
        const appearsOnMainThread = matchedMethods.length > 0

        sources.push({
          name,
          type: this.classifySourceType(name),
          totalPercent: computedPercent != null ? Math.round(computedPercent * 100) / 100 : undefined,
          evidence: appearsOnMainThread
            ? [`主线程发现 ${matchedMethods.length} 个关联方法，累计占比 ${(computedPercent || 0).toFixed(1)}%`]
            : (data?.evidence || undefined),
        })
      }
    }

    // --- Limitations ---
    if (threads.length === 0 && sources.length === 0 && (reportType === 'sampler' || reportType === 'profiler')) {
      limitations.push('未从 raw/full 数据中提取到 sampler/profiler 线程数据')
      hints.push('no thread data extracted for sampler/profiler report')
    }

    if (sources.length === 0 && threads.length > 0 && reportType === 'sampler') {
      hints.push('threads extracted but no source breakdown available')
    }

    // Report source percentage limitations
    const sourcesWithPercent = sources.filter(s => s.totalPercent != null)
    if (sources.length > 0 && sourcesWithPercent.length === 0) {
      // Check if we have method-level data at all
      const allMethods = threads.flatMap(t => t.topMethods || [])
      const methodsWithPercent = allMethods.filter(m => m.percent != null && m.percent > 0)
      const nonMinecraftMethods = allMethods.filter(m =>
        m.source && m.source !== 'minecraft' && m.source !== 'java' && m.source !== 'native' && m.source !== 'unknown'
      )

      if (methodsWithPercent.length > 0 && nonMinecraftMethods.length === 0) {
        // We have method percents but they're all minecraft/java/native — cannot attribute to plugins/mods
        limitations.push(
          '所有热点方法均为原版 minecraft/Java/Native 方法，未发现具体插件/模组方法的显著占比。当前采样数据无法归因到特定插件或模组，建议使用 /spark profiler --timeout 120 采集更精确的 profiler 数据'
        )
      } else if (methodsWithPercent.length === 0) {
        limitations.push('来源列表已提取，但所有来源均缺少占比数据，无法判断各来源的真实开销权重')
      } else {
        limitations.push('来源列表已提取，但来源占比与主线程方法关联不足，无法精确定位具体插件/模组开销')
      }
    }

    // Report thread method detail limitations
    const threadsWithMethods = threads.filter(t => t.topMethods && t.topMethods.length > 0)
    if (threads.length > 0 && threadsWithMethods.length === 0) {
      limitations.push('线程数据未包含方法级调用栈，无法定位具体热点方法')
    }

    // If sources exist but none have thread evidence, note it — but only if we
    // haven't already added a more specific limitation above
    if (sources.length > 0 && sourcesWithPercent.length === 0) {
      const hasSpecificLimitation = limitations.some(l =>
        l.includes('原版 minecraft') || l.includes('来源占比与主线程')
      )
      if (!hasSpecificLimitation) {
        limitations.push('缺少完整 profiler 调用树 + 来源占比数据，建议使用 /spark profiler --timeout 120 重新采集以获取方法级热点和精确占比')
      }
    }

    // Sampler vs profiler note
    if (threads.length > 0 && reportType === 'sampler') {
      const isProfiler = raw?.metadata?.samplerEngine === 1 || full?.metadata?.samplerEngine === 1
      if (!isProfiler) {
        limitations.push('当前数据来自 sampler（采样器），仅能提供有限的方法热点线索。建议使用 /spark profiler --timeout 120 采集更精确的调用树数据')
      }
    }

    return { threads, sources, suspiciousMethods }
  }

  // ========== Thread/Method parsing ==========

  private parseThreadNode(node: any, sourceIndex?: SourceIndex): NormalizedThread | null {
    if (!node) return null
    const name = node?.name || node?.threadName || node?.thread || 'unknown'
    const percent = this.toNumber(node?.percent)
      ?? this.toNumber(node?.totalPercent)
      ?? (node?.samples && node?.totalSamples ? (node.samples / node.totalSamples) * 100 : undefined)

    const thread: NormalizedThread = {
      name,
      type: this.classifyThreadType(name),
      totalPercent: percent,
    }

    // Collect methods from the call tree.
    // Spark nodes use { className, methodName, time, times[], children, childrenRefs }.
    const children = node?.children || node?.nodes || node?.methods || []
    if (Array.isArray(children) && children.length > 0) {
      // Walk the call tree to collect all methods with their effective times
      const allMethods = this.collectMethodsFromTree(children, 0)
      // Sort by priority first (root frames + idle last), then by effective time descending
      allMethods.sort((a, b) => {
        const priA = this.classifyMethodPriority(a)
        const priB = this.classifyMethodPriority(b)
        if (priA !== priB) return priB - priA // higher priority first
        return (b._effectiveTime || 0) - (a._effectiveTime || 0)
      })
      // Calculate total time for percent computation:
      // Use the sum of top-level children's effective times as denominator
      const topLevelTime = children.reduce((sum: number, c: any) => {
        return sum + this.extractNodeTime(c)
      }, 0)
      const totalTime = topLevelTime > 0 ? topLevelTime : allMethods.reduce((sum, m) => sum + (m._effectiveTime || 0), 0)
      const context = { threadTotalTime: totalTime, sourceIndex }
      thread.topMethods = allMethods.slice(0, 30).map(m => this.parseMethodNode(m, context))
    }

    return thread
  }

  /**
   * Extract the effective time from a method node.
   * Spark full data stores per-window sample counts in the "times" array.
   * The "time" field is often 0. Summing "times" gives the actual sample count.
   */
  private extractNodeTime(node: any): number {
    if (!node) return 0
    // If times array exists, sum its values (per-window sample counts)
    if (Array.isArray(node?.times) && node.times.length > 0) {
      return node.times.reduce((sum: number, v: any) => sum + (typeof v === 'number' ? v : 0), 0)
    }
    // Fall back to time field
    return this.toNumber(node?.time) ?? 0
  }

  /**
   * Recursively collect method nodes from the spark call tree.
   * Each node has: className, methodName, time, times[], children, childrenRefs
   * Returns flat array with _effectiveTime pre-computed from times[] array.
   */
  private collectMethodsFromTree(nodes: any[], depth: number): any[] {
    const result: any[] = []
    const maxDepth = 50
    if (depth > maxDepth) return result

    for (const node of nodes) {
      if (!node) continue
      // Attach effective time computed from times[] array
      const effectiveTime = this.extractNodeTime(node)
      result.push({ ...node, _effectiveTime: effectiveTime })
      const subChildren = node?.children || []
      if (Array.isArray(subChildren) && subChildren.length > 0) {
        result.push(...this.collectMethodsFromTree(subChildren, depth + 1))
      }
    }
    return result
  }

  private parseMethodNode(node: any, context?: { threadTotalTime?: number; sourceIndex?: SourceIndex }): any {
    if (!node) return { name: 'unknown' }

    const className = node?.className || node?.packageName || node?.package || undefined
    const rawMethodName = node?.methodName || node?.method || node?.name || undefined

    // Build display name: avoid className.className.methodName duplication.
    // If rawMethodName already starts with className, use it as-is.
    let methodDisplayName: string
    if (rawMethodName && className && !rawMethodName.startsWith(className)) {
      methodDisplayName = `${className}.${rawMethodName}`
    } else if (rawMethodName) {
      methodDisplayName = rawMethodName
    } else if (className) {
      methodDisplayName = className
    } else {
      methodDisplayName = node?.name || 'unknown'
    }

    // Use className as package name (not the source name)
    const pkgName = className

    // Calculate percent from time
    let percent: number | undefined = this.toNumber(node?.percent) ?? this.toNumber(node?.totalPercent)
    const nodeTime = node?._effectiveTime ?? this.extractNodeTime(node)
    if (percent == null && context?.threadTotalTime != null && context.threadTotalTime > 0 && nodeTime > 0) {
      percent = (nodeTime / context.threadTotalTime) * 100
      // Round to 2 decimal places
      percent = Math.round(percent * 100) / 100
      // Clamp to reasonable range
      if (percent > 100) percent = 100
      if (percent < 0.01 && percent > 0) percent = 0.01
    }

    // Source lookup
    let source = node?.source || node?.origin || undefined
    if (!source && context?.sourceIndex) {
      source = this.lookupSource(context.sourceIndex, methodDisplayName, rawMethodName || methodDisplayName, className)
    }
    // Fallback: classify based on package/class name pattern when no explicit source mapping exists
    if (!source && className) {
      source = this.classifyMethodSource(className)
    }

    return {
      name: methodDisplayName,
      packageName: pkgName,
      source,
      percent,
      selfPercent: this.toNumber(node?.selfPercent) ?? this.toNumber(node?.selfTimePercent),
      totalPercent: percent,
    }
  }

  // ========== Source-to-method mapping (from full=true classSources/methodSources) ==========

  /**
   * Build a reverse index from class/method/line descriptor to source name.
   * Spark full=true data has classSources, methodSources, and lineSources objects.
   */
  private buildSourceIndex(full: any): SourceIndex {
    const classSources = new Map<string, string>()
    const methodSources = new Map<string, string>()
    let lineSources: Map<string, string> | undefined

    // classSources: maps full class name → source/mod name
    // e.g. { "net.minecraft.server.MinecraftServer": "minecraft", ... }
    const csRaw = full?.classSources
    if (csRaw && typeof csRaw === 'object') {
      for (const [key, val] of Object.entries(csRaw) as [string, any][]) {
        if (typeof val === 'string') {
          classSources.set(key, val)
        }
      }
    }

    // methodSources: maps method descriptor → source name
    // e.g. { "net.minecraft.Util.m_137550_": "minecraft", ... }
    const msRaw = full?.methodSources
    if (msRaw && typeof msRaw === 'object') {
      for (const [key, val] of Object.entries(msRaw) as [string, any][]) {
        if (typeof val === 'string') {
          methodSources.set(key, val)
        }
      }
    }

    // lineSources: maps line descriptor → source name (enhancement only)
    const lsRaw = full?.lineSources
    if (lsRaw && typeof lsRaw === 'object') {
      lineSources = new Map<string, string>()
      for (const [key, val] of Object.entries(lsRaw) as [string, any][]) {
        if (typeof val === 'string') {
          lineSources.set(key, val)
        }
      }
    }

    return { classSources, methodSources, lineSources }
  }

  /**
   * Look up which source a method belongs to.
   *
   * Priority order:
   *   1. methodSources exact match on fullMethodName
   *   2. methodSources exact match on shortName (without className)
   *   3. classSources exact match on the className portion of fullMethodName
   *   4. classSources prefix match: fullMethodName starts with classKey + "."
   *   5. lineSources prefix match (enhancement only, lower priority)
   *   6. Package-based prefix match, excluding net/java/com/org roots
   *   7. Return undefined
   */
  private lookupSource(index: SourceIndex, fullMethodName: string, methodNameOnly: string, className?: string): string | undefined {
    if (!index) return undefined
    if (!fullMethodName) return undefined

    // 1. methodSources exact match on fullMethodName
    if (index.methodSources.has(fullMethodName)) return index.methodSources.get(fullMethodName)

    // 2. methodSources exact match on shortName
    if (methodNameOnly && index.methodSources.has(methodNameOnly)) return index.methodSources.get(methodNameOnly)

    // 3. classSources exact match on the className
    if (className && index.classSources.has(className)) return index.classSources.get(className)

    // Also try extracting className from fullMethodName (last part before the method)
    const extractedClassName = this.extractClassName(fullMethodName)
    if (extractedClassName && index.classSources.has(extractedClassName)) {
      return index.classSources.get(extractedClassName)
    }

    // 4. classSources prefix match: fullMethodName starts with classKey + "."
    for (const [classKey, src] of index.classSources) {
      if (fullMethodName.startsWith(classKey + '.')) {
        return src
      }
    }

    // 5. lineSources prefix match (enhancement only, lower priority)
    if (index.lineSources && index.lineSources.size > 0) {
      for (const [lineKey, src] of index.lineSources) {
        if (fullMethodName.startsWith(lineKey) || fullMethodName.includes(lineKey)) {
          return src
        }
      }
    }

    // 6. Package-based prefix match (exclude net/java/com/org short roots)
    const rootPkg = fullMethodName.split('.')[0] || ''
    if (['net', 'java', 'com', 'org', 'io', 'dev', 'me', 'club', 'cn', 'de', 'fr', 'ru', 'xyz'].includes(rootPkg.toLowerCase())) {
      // Only match if we have 3+ segments (e.g., net.minecraft.Something)
      const segments = fullMethodName.split('.')
      if (segments.length >= 3) {
        const prefix3 = segments.slice(0, 3).join('.')
        for (const [classKey, src] of index.classSources) {
          if (prefix3 === classKey || classKey.startsWith(prefix3 + '.')) {
            return src
          }
        }
      }
    }

    return undefined
  }

  /**
   * Extract the class name from a full method name.
   * "net.minecraft.Util.m_137550_" → "net.minecraft.Util"
   * "native.[vdso]" → "native"
   */
  private extractClassName(fullMethodName: string): string | undefined {
    if (!fullMethodName) return undefined
    const lastDot = fullMethodName.lastIndexOf('.')
    if (lastDot < 0) return undefined
    return fullMethodName.substring(0, lastDot)
  }

  // ========== Helper utilities ==========

  /**
   * Try multiple dot-separated paths and return the first non-null/non-undefined value.
   */
  private pickFirst<T = unknown>(obj: any, paths: string[]): T | undefined {
    for (const path of paths) {
      const val = this.getByPath(obj, path)
      if (val !== undefined && val !== null) return val as T
    }
    return undefined
  }

  /**
   * Get a value at a dot-separated path (e.g. "metadata.platform.name").
   */
  private getByPath(obj: any, path: string): unknown {
    const parts = path.split('.')
    let current = obj
    for (const part of parts) {
      if (current == null || typeof current !== 'object') return undefined
      current = current[part]
    }
    return current
  }

  /**
   * Safely convert a value to a number, returning undefined if invalid.
   */
  private toNumber(value: unknown): number | undefined {
    if (value === null || value === undefined) return undefined
    if (typeof value === 'number' && !isNaN(value) && isFinite(value)) return value
    if (typeof value === 'string') {
      const n = parseFloat(value)
      return isNaN(n) || !isFinite(n) ? undefined : n
    }
    return undefined
  }

  /**
   * Calculate arithmetic mean of a number array.
   */
  private avg(values: number[]): number {
    if (values.length === 0) return 0
    return values.reduce((a, b) => a + b, 0) / values.length
  }

  /**
   * Convert bytes to MB. If value is already in MB range (< ~30), return as-is.
   * If value looks like bytes (> 1,000,000), convert to MB.
   */
  private bytesToMB(value: unknown): number | undefined {
    const n = this.toNumber(value)
    if (n == null) return undefined
    // If already a reasonable MB value (e.g. under ~30, looks like MB not bytes)
    if (n < 1000) return Math.round(n)
    // If it looks like bytes, convert to MB
    if (n > 1000000) return Math.round(n / (1024 * 1024))
    // Ambiguous range (1000–1000000): could be KB or small bytes; convert if > 10000
    if (n > 10000) return Math.round(n / (1024 * 1024))
    return Math.round(n)
  }

  /**
   * Normalize a percentage value. If > 1, treat as 0–100. If 0–1, multiply by 100.
   */
  private normalizePercent(value: unknown): number | undefined {
    const n = this.toNumber(value)
    if (n == null) return undefined
    if (n > 1) return n // already 0–100 scale
    return Math.round(n * 100) // 0–1 scale
  }

  /**
   * Find the first object/array value matching any of the given keys at any depth.
   */
  private findFirstDeep<T = unknown>(obj: unknown, keys: string[], maxDepth = 6): T | undefined {
    return this._findDeep<T>(obj, keys, maxDepth, 0)
  }

  private _findDeep<T = unknown>(obj: unknown, keys: string[], maxDepth: number, depth: number): T | undefined {
    if (depth > maxDepth) return undefined
    if (obj == null || typeof obj !== 'object') return undefined

    if (Array.isArray(obj)) {
      const limit = Math.min(obj.length, 20)
      for (let i = 0; i < limit; i++) {
        const found = this._findDeep<T>(obj[i], keys, maxDepth, depth + 1)
        if (found !== undefined) return found
      }
      return undefined
    }

    const record = obj as Record<string, unknown>
    for (const [k, v] of Object.entries(record)) {
      if (keys.includes(k)) return v as unknown as T
      const found = this._findDeep<T>(v, keys, maxDepth, depth + 1)
      if (found !== undefined) return found
    }
    return undefined
  }

  /**
   * Get top-level keys of an object for debugging.
   */
  private getTopLevelKeys(obj: unknown): string[] {
    if (!obj || typeof obj !== 'object') return []
    return Object.keys(obj as object)
  }

  /**
   * Classify a method's source based on its className (package-based fallback).
   * Used when no explicit classSources/methodSources entry exists.
   */
  private classifyMethodSource(className: string): string | undefined {
    if (!className) return undefined
    const lower = className.toLowerCase()

    // Mod loaders — check before vanilla minecraft to avoid substring false matches
    if (lower.startsWith('net.minecraftforge.')) return 'forge'
    if (lower.startsWith('net.neoforged.')) return 'neoforge'
    if (lower.startsWith('net.fabricmc.')) return 'fabric'

    // Vanilla Minecraft
    if (lower.startsWith('net.minecraft.') || lower.startsWith('com.mojang.')) return 'minecraft'

    // Java standard library
    if (lower.startsWith('java.') || lower.startsWith('jdk.') || lower.startsWith('sun.') || lower.startsWith('com.sun.') || lower.startsWith('javax.')) return 'java'

    // Native / system libraries
    if (lower === 'native' || lower.startsWith('lib') || lower.includes('[vdso]')) return 'native'

    // Other known domains → likely plugin/mod
    if (lower.startsWith('com.') || lower.startsWith('org.') || lower.startsWith('io.') || lower.startsWith('dev.') || lower.startsWith('net.') || lower.startsWith('me.') || lower.startsWith('club.')) return undefined // unknown mod/plugin, let classSources handle it

    return undefined
  }

  /**
   * Return a priority score for sorting. Higher = more actionable (shown first).
   * Root frames and idle/wait methods get low priority so they don't dominate
   * the top methods list in profiler data.
   *
   * Priority 2: Normal methods (potentially actionable hot spots)
   * Priority 1: Idle/wait/native methods (park, sleep, wait, [vdso], libc)
   * Priority 0: Root frames (MinecraftServer, Thread entry points — always on stack)
   */
  private classifyMethodPriority(node: any): number {
    const className = (node?.className || '').toLowerCase()
    const methodName = (node?.methodName || '').toLowerCase()
    const fullName = className + '.' + methodName

    // Priority 0: Root frames — always on the stack, never actionable
    if (
      className.startsWith('net.minecraft.server.minecraftserver') ||
      className === 'net.minecraft.server.minecraftserver' ||
      (className.startsWith('net.minecraft.server') && methodName.startsWith('lambda$spin')) ||
      className.startsWith('java.lang.thread') ||
      className.startsWith('java.lang.invoke.directmethodhandle') ||
      className.startsWith('java.lang.invoke.invokers') ||
      className.startsWith('java.lang.invoke.lambdaform') ||
      className.startsWith('java.lang.invoke.methodhandle') ||
      className.startsWith('java.util.concurrent.forkjoinworkerthread')
    ) {
      return 0
    }

    // Priority 1: Idle/wait/native methods — not hot spots
    if (
      fullName.includes('unsafe.park') ||
      fullName.includes('locksupport.park') ||
      fullName.includes('object.wait') ||
      fullName.includes('thread.sleep') ||
      fullName.includes('thread.yield') ||
      fullName.includes('condition.await') ||
      className === 'native' ||
      className.startsWith('libc') ||
      className.startsWith('libpthread') ||
      methodName.includes('[vdso]') ||
      methodName.includes('__kernel_') ||
      // These are always-on-stack for idle servers
      (className.startsWith('jdk.internal.misc') && methodName === 'park')
    ) {
      return 1
    }

    // Priority 2: Everything else — potentially actionable
    return 2
  }

  // ========== Thread/Source classification ==========

  private classifyThreadType(name: string): NormalizedThread['type'] {
    const lower = name.toLowerCase()
    if (lower.includes('server thread') || (lower.includes('main') && !lower.includes('worker')))
      return 'main'
    if (lower.includes('async') || lower.includes('netty') || lower.includes('eventloop'))
      return 'async'
    if (lower.includes('worker') || lower.includes('pool') || lower.includes('executor'))
      return 'worker'
    return 'unknown'
  }

  // Cache the platform type for source classification context
  private detectedPlatform: string | undefined

  private classifySourceType(name: string): NormalizedSource['type'] {
    const lower = name.toLowerCase()
    // Mod loaders must be checked BEFORE vanilla Minecraft to avoid
    // net.minecraftforge matching net.minecraft as a substring.
    if (['net.minecraftforge', 'net.neoforged', 'net.fabricmc'].some(p => lower.includes(p)))
      return 'mod'
    if (['minecraft', 'mojang', 'net.minecraft', 'com.mojang'].some(p => lower.includes(p)))
      return 'minecraft'
    if (['java.', 'jdk.', 'sun.', 'com.sun.'].some(p => lower.startsWith(p)))
      return 'java'
    // Heuristic: if it has a domain-like package structure, likely a plugin or mod
    if (name.includes('.') && !lower.startsWith('java'))
      return 'plugin'

    // For Forge/Fabric/NeoForge platforms, simple-named sources are most likely mods.
    // Plugins (Bukkit/Spigot/Paper) typically have package-structured names like "com.example.MyPlugin".
    const platform = (this.detectedPlatform || '').toLowerCase()
    const isModded = ['forge', 'fabric', 'neoforge', 'quilt'].some(p => platform.includes(p))
    if (isModded && name.length > 0) {
      return 'mod'
    }

    // For non-modded platforms (Paper, Spigot, Bukkit, Purpur, etc.),
    // simple-named sources without dots are plugins (e.g. luckperms, essentials).
    const isPluginPlatform = ['paper', 'spigot', 'bukkit', 'purpur', 'pufferfish', 'folia', 'leaf'].some(p => platform.includes(p))
    if (isPluginPlatform && name.length > 0) {
      return 'plugin'
    }

    // Generic fallback: if name contains no dots and it's not java/minecraft, it's likely a mod or plugin
    if (!name.includes('.') && name.length > 0) {
      return 'plugin'
    }

    return 'unknown'
  }
}

export const sparkNormalizer = new SparkNormalizer()
