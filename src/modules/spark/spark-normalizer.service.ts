import type { SparkRawData, NormalizedSummary, NormalizedThread, NormalizedSource } from './spark.types.js'

export class SparkNormalizer {
  normalize(rawData: SparkRawData): NormalizedSummary {
    const limitations: string[] = []
    const raw = rawData.rawJson as any
    const metadata = raw?.metadata || raw || {}
    const full = raw?.full || {}

    // ---- Debug info (for AI prompt) ----
    const rawTopLevelKeys = this.getTopLevelKeys(raw)
    const fullTopLevelKeys = raw?.full ? this.getTopLevelKeys(raw.full) : undefined
    const extractionHints: string[] = []
    const hasFull = !!raw?.full

    // ---- Server info ----
    const server = this.extractServerInfo(raw, rawData)

    // ---- Timing ----
    const timing = {
      createdAt: metadata?.createdAt || raw?.createdAt || full?.createdAt,
      durationSeconds: rawData.durationSeconds ?? metadata?.durationSeconds ?? raw?.durationSeconds ?? full?.durationSeconds ?? full?.duration,
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
      if (tps.latest != null || tps.mean != null) {
        health.tps = tps
        hasAnyHealthData = true
      }
    } else if (this.toNumber(tpsObj) != null) {
      health.tps = { mean: this.toNumber(tpsObj) }
      hasAnyHealthData = true
    }

    // --- MSPT ---
    const msptObj = this.findFirstDeep<any>(raw, ['mspt'])
      || this.findFirstDeep<any>(full, ['mspt'])
      || raw?.health?.mspt || raw?.mspt || full?.mspt || full?.health?.mspt
      || this.pickFirst<any>(raw, ['tick.mspt', 'ticks.mspt', 'data.mspt'])

    if (msptObj && typeof msptObj === 'object') {
      const mspt = {
        mean: this.toNumber(msptObj?.mean) ?? this.toNumber(msptObj?.avg) ?? this.toNumber(msptObj?.average),
        median: this.toNumber(msptObj?.median) ?? this.toNumber(msptObj?.p50),
        p95: this.toNumber(msptObj?.p95) ?? this.toNumber(msptObj?.['95th']),
        max: this.toNumber(msptObj?.max),
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

    if (cpuObj && typeof cpuObj === 'object') {
      const cpu = {
        process: this.normalizePercent(cpuObj?.process) ?? this.normalizePercent(cpuObj?.processLoad),
        system: this.normalizePercent(cpuObj?.system) ?? this.normalizePercent(cpuObj?.systemLoad),
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
      const used = this.bytesToMB(
        memObj?.used ?? memObj?.usedBytes ?? memObj?.heapUsed ?? memObj?.usedMemory
      )
      const max = this.bytesToMB(
        memObj?.max ?? memObj?.maxBytes ?? memObj?.total ?? memObj?.committed ?? memObj?.heapMax ?? memObj?.maxMemory
      )
      const usagePercent = this.normalizePercent(memObj?.usagePercent)
        ?? this.normalizePercent(memObj?.usage)
        ?? (max != null && max > 0 && used != null ? Math.round((used / max) * 100) : undefined)

      if (used != null || max != null) {
        health.memory = { usedMB: used, maxMB: max, usagePercent }
        hasAnyHealthData = true
      }
    }

    // --- GC ---
    const gcObj = this.findFirstDeep<any>(raw, ['gc'])
      || this.findFirstDeep<any>(full, ['gc'])
      || raw?.health?.gc || raw?.gc || full?.gc || full?.health?.gc
      || this.pickFirst<any>(raw, ['garbageCollector', 'jvm.gc'])

    if (gcObj && typeof gcObj === 'object') {
      health.gc = {
        collectors: gcObj?.collectors,
        frequency: gcObj?.frequency,
        warning: gcObj?.warning,
      }
      hasAnyHealthData = true
    }

    if (!hasAnyHealthData && reportType === 'health') {
      limitations.push('未从 raw/full 数据中提取到 TPS/MSPT/CPU/Memory/GC 健康数据')
      hints.push('health report detected but no health metrics extracted')
    }

    return health
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
          const thread = this.parseThreadNode(t)
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
            thread.topMethods = methods.slice(0, 10).map((m: any) => this.parseMethodNode(m))
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
            const thread = this.parseThreadNode(child)
            if (thread) threads.push(thread)
          }
        }
      }
    }

    // --- Sources ---
    const rawSources =
      raw?.sampler?.sources || raw?.profiler?.sources || raw?.sources
      || full?.sampler?.sources || full?.profiler?.sources || full?.sources
      || this.findFirstDeep<any>(raw, ['sources'])
      || this.findFirstDeep<any>(full, ['sources'])

    if (rawSources && typeof rawSources === 'object') {
      for (const [name, data] of Object.entries(rawSources) as [string, any][]) {
        sources.push({
          name,
          type: this.classifySourceType(name),
          totalPercent: data?.percent ?? data?.totalPercent,
          evidence: data?.evidence,
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

    return { threads, sources, suspiciousMethods }
  }

  // ========== Thread/Method parsing ==========

  private parseThreadNode(node: any): NormalizedThread | null {
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

    const children = node?.children || node?.nodes || node?.methods || []
    if (Array.isArray(children) && children.length > 0) {
      thread.topMethods = children.slice(0, 10).map((c: any) => this.parseMethodNode(c))
    }

    return thread
  }

  private parseMethodNode(node: any): any {
    if (!node) return { name: 'unknown' }
    return {
      name: node?.name || node?.method || node?.className || 'unknown',
      packageName: node?.packageName || node?.package || node?.className,
      source: node?.source || node?.origin,
      percent: this.toNumber(node?.percent) ?? this.toNumber(node?.totalPercent),
      selfPercent: this.toNumber(node?.selfPercent) ?? this.toNumber(node?.selfTimePercent),
      totalPercent: this.toNumber(node?.totalPercent) ?? this.toNumber(node?.percent),
    }
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
    return 'unknown'
  }
}

export const sparkNormalizer = new SparkNormalizer()
