import type { SparkRawData, NormalizedSummary, NormalizedThread, NormalizedSource } from './spark.types.js'

export class SparkNormalizer {
  normalize(rawData: SparkRawData): NormalizedSummary {
    const limitations: string[] = []
    const raw = rawData.rawJson as any
    const metadata = raw?.metadata || raw || {}

    // ---- Server info ----
    const platform = metadata?.platform || raw?.platform || {}
    const system = metadata?.system || raw?.system || {}

    const server = {
      platform: platform?.name || platform?.type || system?.platform || rawData.platform,
      minecraftVersion: platform?.version || system?.minecraftVersion || rawData.minecraftVersion,
      sparkVersion: metadata?.sparkVersion || raw?.sparkVersion || rawData.sparkVersion,
      serverBrand: platform?.brand || system?.serverBrand || rawData.serverBrand,
      environment: system?.environment,
    }

    // ---- Timing ----
    const timing = {
      createdAt: metadata?.createdAt || raw?.createdAt,
      durationSeconds: metadata?.durationSeconds || raw?.durationSeconds || rawData.durationSeconds,
    }

    // ---- Health ----
    const health: NormalizedSummary['health'] = {}
    const rawHealth = raw?.health || {}

    // TPS
    if (rawHealth?.tps || raw?.tps) {
      const tps = rawHealth?.tps || raw?.tps
      health.tps = {
        latest: tps?.last1m ?? tps?.latest,
        mean: tps?.avg ?? tps?.mean,
        min: tps?.min,
        max: tps?.max,
      }
    }

    // MSPT
    if (rawHealth?.mspt || raw?.mspt) {
      const mspt = rawHealth?.mspt || raw?.mspt
      health.mspt = {
        mean: mspt?.mean ?? mspt?.avg,
        median: mspt?.median ?? mspt?.p50,
        p95: mspt?.p95,
        max: mspt?.max,
      }
    }

    // CPU
    if (rawHealth?.cpu || raw?.cpu) {
      const cpu = rawHealth?.cpu || raw?.cpu
      health.cpu = {
        process: cpu?.process ?? cpu?.processLoad,
        system: cpu?.system ?? cpu?.systemLoad,
      }
    }

    // Memory
    if (rawHealth?.memory || raw?.memory) {
      const mem = rawHealth?.memory || raw?.memory
      const used = mem?.used ?? mem?.usedBytes
      const max = mem?.max ?? mem?.maxBytes ?? mem?.total
      health.memory = {
        usedMB: used ? Math.round(used / (1024 * 1024)) : undefined,
        maxMB: max ? Math.round(max / (1024 * 1024)) : undefined,
        usagePercent: max && used ? Math.round((used / max) * 100) : mem?.usagePercent ?? mem?.usage,
      }
    }

    // GC
    if (rawHealth?.gc || raw?.gc) {
      const gc = rawHealth?.gc || raw?.gc
      health.gc = {
        collectors: gc?.collectors,
        frequency: gc?.frequency,
        warning: gc?.warning,
      }
    }

    // ---- Profiler (sampler data) ----
    const profiler = this.extractProfiler(raw, rawData.reportType, limitations)

    return {
      code: rawData.code,
      reportType: rawData.reportType,
      server,
      timing,
      health,
      profiler,
      limitations,
    }
  }

  private extractProfiler(
    raw: any,
    reportType: string,
    limitations: string[],
  ): NormalizedSummary['profiler'] {
    const threads: NormalizedThread[] = []
    const sources: NormalizedSource[] = []
    const suspiciousMethods: NormalizedSummary['profiler']['suspiciousMethods'] = []

    // Sampler data
    const sampler = raw?.sampler || raw
    const rawThreads = sampler?.threads || raw?.threads

    if (rawThreads && typeof rawThreads === 'object') {
      for (const [name, data] of Object.entries(rawThreads) as [string, any][]) {
        const thread: NormalizedThread = {
          name,
          type: this.classifyThreadType(name),
          totalPercent: data?.totalPercent ?? data?.percent,
        }

        // Extract top methods
        const methods = data?.methods || data?.children || []
        if (Array.isArray(methods) && methods.length > 0) {
          thread.topMethods = methods.slice(0, 10).map((m: any) => ({
            name: m.name || m.method || 'unknown',
            packageName: m.packageName || m.package || m.className,
            source: m.source || m.origin,
            percent: m.percent || m.totalPercent,
            selfPercent: m.selfPercent || m.selfTimePercent,
            totalPercent: m.totalPercent || m.percent,
          }))
        }

        threads.push(thread)
      }
    } else if (reportType === 'sampler') {
      limitations.push('线程调用树完整解析需要 full data，当前仅基于 raw metadata')
    }

    // Sources
    const rawSources = sampler?.sources || raw?.sources
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

    return { threads, sources, suspiciousMethods }
  }

  private classifyThreadType(name: string): NormalizedThread['type'] {
    const lower = name.toLowerCase()
    if (lower.includes('server thread') || lower.includes('main') && !lower.includes('worker'))
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
