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
    this.detectedPlatform = server.platform

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

    // Add limitation if only sampler summary is available (no full profiler)
    if (reportType === 'sampler' && !hasAnyHealthData) {
      limitations.push('仅有 sampler 摘要数据，缺少 health 报告中的 TPS/MSPT 指标')
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
    // Sources from metadata are name-only (no percent). Enrich with method-level
    // evidence from classSources/methodSources in the full=true data.
    const rawSources =
      raw?.sampler?.sources || raw?.profiler?.sources || raw?.sources
      || full?.sampler?.sources || full?.profiler?.sources || full?.sources
      || full?.metadata?.sources || raw?.metadata?.sources
      || this.findFirstDeep<any>(raw, ['sources'])
      || this.findFirstDeep<any>(full, ['sources'])

    // Build source reverse index from classSources/methodSources (full=true data)
    const sourceIndex = this.buildSourceIndex(full)

    if (rawSources && typeof rawSources === 'object') {
      for (const [name, data] of Object.entries(rawSources) as [string, any][]) {
        // Compute source percent from thread methods that match this source
        const matchedMethods: string[] = []
        let computedPercent: number | undefined = data?.percent ?? data?.totalPercent

        // If no explicit percent, try to compute from thread data
        if (computedPercent == null && sourceIndex.size > 0) {
          const mainThread = threads.find(t => t.type === 'main' || t.name.toLowerCase().includes('server thread'))
          if (mainThread?.topMethods) {
            for (const m of mainThread.topMethods) {
              const lookupKey = m.packageName ? `${m.packageName}.${m.name}`.replace(/\.+/g, '.') : m.name
              const src = this.lookupSource(sourceIndex, lookupKey, m.name)
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
      limitations.push('来源列表已提取，但所有来源均缺少占比数据，无法判断各来源的真实开销权重')
    }

    // Report thread method detail limitations
    const threadsWithMethods = threads.filter(t => t.topMethods && t.topMethods.length > 0)
    if (threads.length > 0 && threadsWithMethods.length === 0) {
      limitations.push('线程数据未包含方法级调用栈，无法定位具体热点方法')
    }

    // If sources exist but none have thread evidence, note it
    if (sources.length > 0 && sourcesWithPercent.length === 0) {
      limitations.push('缺少完整 profiler 调用树 + 来源占比数据，建议使用 /spark profiler --timeout 120 重新采集以获取方法级热点和精确占比')
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

    // Collect methods from the call tree (spark uses recursive children).
    // Spark sampler nodes use { className, methodName, time, children, childrenRefs }.
    const children = node?.children || node?.nodes || node?.methods || []
    if (Array.isArray(children) && children.length > 0) {
      // Walk the call tree to collect all methods with their times
      const allMethods = this.collectMethodsFromTree(children, 0)
      // Sort by time descending, take top 30
      allMethods.sort((a, b) => (b.time || 0) - (a.time || 0))
      // Calculate total time for percent computation
      const totalTime = allMethods.reduce((sum, m) => sum + (m.time || 0), 0)
      thread.topMethods = allMethods.slice(0, 30).map(m => this.parseMethodNode(m, totalTime))
    }

    return thread
  }

  /**
   * Recursively collect method nodes from the spark call tree.
   * Each node has: className, methodName, time, children, childrenRefs
   * Returns flat array with { className, methodName, time, children, ... }
   */
  private collectMethodsFromTree(nodes: any[], depth: number): any[] {
    const result: any[] = []
    const maxDepth = 50
    if (depth > maxDepth) return result

    for (const node of nodes) {
      if (!node) continue
      result.push(node)
      const subChildren = node?.children || []
      if (Array.isArray(subChildren) && subChildren.length > 0) {
        result.push(...this.collectMethodsFromTree(subChildren, depth + 1))
      }
    }
    return result
  }

  private parseMethodNode(node: any, totalTime?: number): any {
    if (!node) return { name: 'unknown' }
    // Spark sampler format: { className, methodName, time, ... }
    // Other formats: { name, percent, ... }
    const methodDisplayName = node?.methodName
      ? `${node.className || ''}.${node.methodName}`.replace(/^\./, '')
      : node?.name || node?.method || node?.className || 'unknown'

    const pkgName = node?.packageName || node?.package || node?.className || undefined

    // Calculate percent from time
    let percent: number | undefined = this.toNumber(node?.percent) ?? this.toNumber(node?.totalPercent)
    if (percent == null && totalTime != null && totalTime > 0 && this.toNumber(node?.time) != null) {
      percent = (this.toNumber(node!.time)! / totalTime) * 100
    }

    return {
      name: methodDisplayName,
      packageName: pkgName,
      source: node?.source || node?.origin,
      percent,
      selfPercent: this.toNumber(node?.selfPercent) ?? this.toNumber(node?.selfTimePercent),
      totalPercent: percent,
    }
  }

  // ========== Source-to-method mapping (from full=true classSources/methodSources) ==========

  /**
   * Build a reverse index from class/method descriptor to source name.
   * Spark full=true data has classSources and methodSources objects.
   */
  private buildSourceIndex(full: any): Map<string, string> {
    const index = new Map<string, string>()

    // classSources: maps class ref ID → source name
    // e.g. { "1": "forge", "2": "minecraft", ... }
    // But in JSON, it might be { "net.minecraft.server.MinecraftServer": "minecraft", ... }
    const classSources = full?.classSources
    if (classSources && typeof classSources === 'object') {
      for (const [key, val] of Object.entries(classSources) as [string, any][]) {
        if (typeof val === 'string') {
          index.set(key, val)
        }
      }
    }

    // methodSources: maps method descriptor → source name
    const methodSources = full?.methodSources
    if (methodSources && typeof methodSources === 'object') {
      for (const [key, val] of Object.entries(methodSources) as [string, any][]) {
        if (typeof val === 'string') {
          index.set(key, val)
        }
      }
    }

    return index
  }

  /**
   * Look up which source a method belongs to.
   * Tries exact match, then partial, then class-only match.
   */
  private lookupSource(index: Map<string, string>, fullMethodName: string, shortName: string): string | undefined {
    if (index.size === 0) return undefined

    // Exact match
    if (index.has(fullMethodName)) return index.get(fullMethodName)
    if (index.has(shortName)) return index.get(shortName)

    // Try matching by class name prefix
    for (const [key, src] of index.entries()) {
      if (fullMethodName.includes(key) || key.includes(fullMethodName.split('.')[0] || '')) {
        return src
      }
    }

    return undefined
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

    return 'unknown'
  }
}

export const sparkNormalizer = new SparkNormalizer()
