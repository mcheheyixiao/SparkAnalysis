import type { NormalizedSummary, RuleAnalysisResult, RuleEvidence, SuspectedCause } from './spark.types.js'
import { safeJsonStringify } from '../../utils/json.js'

export class SparkRuleAnalyzer {
  analyze(normalized: NormalizedSummary): RuleAnalysisResult {
    const evidence: RuleEvidence[] = []
    const suspectedCauses: SuspectedCause[] = []
    const recommendedCommands: string[] = []
    const limitations: string[] = [...normalized.limitations]

    // 1. TPS Analysis
    this.analyzeTps(normalized, evidence, suspectedCauses, recommendedCommands)

    // 2. MSPT Analysis
    this.analyzeMspt(normalized, evidence, suspectedCauses, recommendedCommands)

    // 3. Main thread analysis
    this.analyzeMainThread(normalized, evidence, suspectedCauses)

    // 4. GC/Memory analysis
    this.analyzeMemory(normalized, evidence, suspectedCauses, recommendedCommands)

    // 5. Keyword scanning
    this.scanKeywords(normalized, evidence, suspectedCauses)

    // Determine severity
    const severity = this.determineSeverity(evidence)

    // Build summary
    const summary = this.buildSummary(severity, evidence, suspectedCauses)

    return {
      severity,
      summary,
      evidence,
      suspectedCauses,
      recommendedCommands: [...new Set(recommendedCommands)],
      limitations,
    }
  }

  private analyzeTps(
    data: NormalizedSummary,
    evidence: RuleEvidence[],
    causes: SuspectedCause[],
    commands: string[],
  ) {
    const tps = data.health.tps
    if (!tps) return

    if (tps.mean != null && tps.mean < 19.5) {
      evidence.push({
        title: 'TPS 偏低',
        detail: `平均 TPS 为 ${tps.mean.toFixed(1)}（目标 20），服务器存在性能问题`,
        confidence: 'high',
      })
    }

    if (tps.min != null && tps.min < 15) {
      evidence.push({
        title: '严重卡顿',
        detail: `最低 TPS 为 ${tps.min.toFixed(1)}，服务器存在严重卡顿`,
        confidence: 'high',
      })
    }

    if (tps.max != null && tps.min != null && tps.max - tps.min > 5) {
      evidence.push({
        title: 'TPS 波动较大',
        detail: `TPS 范围 ${tps.min.toFixed(1)}-${tps.max.toFixed(1)}，波动 ${(tps.max - tps.min).toFixed(1)}，服务器性能不稳定`,
        confidence: 'medium',
      })
    }

    if (tps.mean != null && tps.mean < 19) {
      commands.push('/spark sampler --duration 60', '/spark health --duration 60')
    }
  }

  private analyzeMspt(
    data: NormalizedSummary,
    evidence: RuleEvidence[],
    causes: SuspectedCause[],
    commands: string[],
  ) {
    const mspt = data.health.mspt
    if (!mspt) return

    if (mspt.mean != null) {
      if (mspt.mean >= 50) {
        evidence.push({
          title: 'MSPT 过高 — 明显卡顿风险',
          detail: `平均 MSPT ${mspt.mean.toFixed(1)}ms（阈值 50ms），服务器每 tick 计算时间严重超出预算`,
          confidence: 'high',
        })
      } else if (mspt.mean >= 40) {
        evidence.push({
          title: 'MSPT 接近压力边界',
          detail: `平均 MSPT ${mspt.mean.toFixed(1)}ms，接近 50ms 上限，高负载时可能卡顿`,
          confidence: 'medium',
        })
      }
    }

    if (mspt.max != null && mspt.mean != null && mspt.max > mspt.mean * 1.5) {
      evidence.push({
        title: '偶发 MSPT 峰值',
        detail: `最大 MSPT ${mspt.max.toFixed(1)}ms 明显高于平均 ${mspt.mean.toFixed(1)}ms，存在偶发卡顿`,
        confidence: 'medium',
      })
    }

    if (mspt.mean != null && mspt.mean >= 45) {
      commands.push('/spark profiler --timeout 120')
    }
  }

  private analyzeMainThread(
    data: NormalizedSummary,
    evidence: RuleEvidence[],
    causes: SuspectedCause[],
  ) {
    const mainThread = data.profiler.threads.find(
      t => t.type === 'main',
    )

    if (!mainThread || !mainThread.totalPercent) return

    if (mainThread.totalPercent >= 60) {
      evidence.push({
        title: '主线程瓶颈',
        detail: `主线程占用 ${mainThread.totalPercent.toFixed(1)}%，服务器主要卡在主线程处理上`,
        confidence: 'high',
      })

      // Check methods for common patterns
      const methods = mainThread.topMethods || []
      for (const m of methods) {
        const name = (m.name || '').toLowerCase()

        if (name.includes('tick') && (m.percent || 0) > 30) {
          causes.push({
            name: 'Tick 循环过载',
            category: 'world',
            reason: `主线程 tick 方法占比 ${m.percent?.toFixed(1)}%，需要进一步分析 tick 内部消耗`,
            priority: 1,
            confidence: 'high',
          })
        }
      }
    }
  }

  private analyzeMemory(
    data: NormalizedSummary,
    evidence: RuleEvidence[],
    causes: SuspectedCause[],
    commands: string[],
  ) {
    const mem = data.health.memory
    if (!mem) return

    if (mem.usagePercent != null && mem.usagePercent > 85) {
      evidence.push({
        title: '内存使用率高',
        detail: `内存使用率 ${mem.usagePercent}%（${mem.usedMB ?? '?'}MB/${mem.maxMB ?? '?'}MB），接近上限`,
        confidence: 'high',
      })
      causes.push({
        name: '内存压力',
        category: 'memory',
        reason: `内存使用率 ${mem.usagePercent}%，建议检查是否有内存泄漏或需要调整 JVM 参数`,
        priority: 2,
        confidence: 'medium',
      })
      commands.push('/spark heap')
    }

    if (data.health.gc?.warning) {
      evidence.push({
        title: 'GC 警告',
        detail: data.health.gc.warning,
        confidence: 'medium',
      })
    }
  }

  private scanKeywords(
    data: NormalizedSummary,
    evidence: RuleEvidence[],
    causes: SuspectedCause[],
  ) {
    const keywordMap: Record<string, { category: SuspectedCause['category']; label: string }> = {
      chunk: { category: 'chunk', label: '区块加载' },
      region: { category: 'chunk', label: '区域文件' },
      ticket: { category: 'chunk', label: '区块 ticket' },
      entity: { category: 'entity', label: '实体处理' },
      mob: { category: 'entity', label: '生物 AI' },
      pathfind: { category: 'entity', label: '寻路算法' },
      brain: { category: 'entity', label: '生物大脑' },
      redstone: { category: 'redstone', label: '红石运算' },
      'block update': { category: 'redstone', label: '方块更新' },
      hopper: { category: 'redstone', label: '漏斗' },
      inventory: { category: 'redstone', label: '物品栏操作' },
      database: { category: 'database', label: '数据库' },
      mysql: { category: 'database', label: 'MySQL' },
      sqlite: { category: 'database', label: 'SQLite' },
      hikari: { category: 'database', label: 'HikariCP 连接池' },
      luckperms: { category: 'plugin', label: 'LuckPerms' },
      essentials: { category: 'plugin', label: 'Essentials' },
      dynmap: { category: 'plugin', label: 'Dynmap' },
      squaremap: { category: 'plugin', label: 'Squaremap' },
      bluemap: { category: 'plugin', label: 'BlueMap' },
      'world save': { category: 'world', label: '世界保存' },
      autosave: { category: 'world', label: '自动保存' },
      network: { category: 'unknown', label: '网络处理' },
      packet: { category: 'unknown', label: '数据包' },
      allocation: { category: 'memory', label: '内存分配' },
      garbage: { category: 'memory', label: 'GC' },
    }

    // Scan thread method names
    for (const thread of data.profiler.threads) {
      const methods = thread.topMethods || []
      for (const m of methods) {
        const fullName = `${m.packageName || ''} ${m.name || ''}`.toLowerCase()
        for (const [keyword, info] of Object.entries(keywordMap)) {
          if (fullName.includes(keyword) && (m.percent || 0) > 1) {
            // Don't auto-blame plugins — just note them as sources
            if (info.category === 'plugin') {
              evidence.push({
                title: `检测到插件 ${info.label}`,
                detail: `${info.label} 在主线程有一定占比，需结合上下文判断是否为主要瓶颈`,
                confidence: 'low',
              })
            }
          }
        }
      }
    }

    // Scan source names
    for (const source of data.profiler.sources) {
      const name = source.name.toLowerCase()
      if (name.includes('luckperms') || name.includes('essentials') || name.includes('dynmap')) {
        evidence.push({
          title: `检测到来源: ${source.name}`,
          detail: `${source.name} 总占比 ${source.totalPercent?.toFixed(1) ?? '?'}%，可能是性能因素之一（不一定是主要问题）`,
          confidence: 'low',
        })
      }
    }
  }

  private determineSeverity(evidence: RuleEvidence[]): RuleAnalysisResult['severity'] {
    const highConfidenceIssues = evidence.filter(e => e.confidence === 'high')
    const hasCritical = highConfidenceIssues.some(
      e => e.title.includes('严重') || e.title.includes('内存使用率') || e.title.includes('明显卡顿'),
    )

    if (hasCritical && highConfidenceIssues.length >= 3) return 'critical'
    if (hasCritical) return 'high'
    if (highConfidenceIssues.length >= 2) return 'medium'
    if (evidence.length >= 1) return 'low'
    return 'normal'
  }

  private buildSummary(
    severity: string,
    evidence: RuleEvidence[],
    causes: SuspectedCause[],
  ): string {
    if (evidence.length === 0) return '未检测到明显性能问题'
    const top = evidence.filter(e => e.confidence === 'high').slice(0, 3)
    if (top.length > 0) {
      return top.map(e => e.title).join('；')
    }
    return evidence.slice(0, 2).map(e => e.title).join('；')
  }
}

export const sparkRuleAnalyzer = new SparkRuleAnalyzer()
