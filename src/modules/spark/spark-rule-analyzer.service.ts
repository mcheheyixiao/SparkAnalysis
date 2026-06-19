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

    // 5. Entity distribution analysis
    this.analyzeEntityDistribution(normalized, evidence, suspectedCauses, recommendedCommands)

    // 6. Keyword scanning
    this.scanKeywords(normalized, evidence, suspectedCauses)

    // Determine severity
    const severity = this.determineSeverity(evidence)

    // Check data adequacy
    const insufficientData = !this.hasEnoughData(normalized)

    // Build summary
    const summary = this.buildSummary(severity, evidence, suspectedCauses, insufficientData)

    // If data is insufficient, add explicit limitation
    if (insufficientData) {
      limitations.push('报告数据解析不足，无法确认是否存在性能问题')
    }

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

    // Check mean first; if not available, fall back to latest
    const effectiveTps = tps.mean ?? tps.latest

    if (effectiveTps != null && effectiveTps < 19.5) {
      evidence.push({
        title: 'TPS 偏低',
        detail: `TPS 为 ${effectiveTps.toFixed(1)}（目标 20），服务器存在性能问题`,
        confidence: 'high',
        type: 'health_issue',
        canBeRootCause: false,
      })
    }

    if (tps.min != null && tps.min < 15) {
      evidence.push({
        title: '严重卡顿',
        detail: `最低 TPS 为 ${tps.min.toFixed(1)}，服务器存在严重卡顿`,
        confidence: 'high',
        type: 'health_issue',
        canBeRootCause: false,
      })
    }

    if (tps.max != null && tps.min != null && tps.max - tps.min > 5) {
      evidence.push({
        title: 'TPS 波动较大',
        detail: `TPS 范围 ${tps.min.toFixed(1)}-${tps.max.toFixed(1)}，波动 ${(tps.max - tps.min).toFixed(1)}，服务器性能不稳定`,
        confidence: 'medium',
        type: 'health_issue',
        canBeRootCause: false,
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

    // Use mean, or fall back to median
    const effectiveMean = mspt.mean ?? mspt.median

    if (effectiveMean != null) {
      if (effectiveMean >= 50) {
        evidence.push({
          title: 'MSPT 过高 — 明显卡顿风险',
          detail: `MSPT ${effectiveMean.toFixed(1)}ms（阈值 50ms），服务器每 tick 计算时间严重超出预算`,
          confidence: 'high',
          type: 'health_issue',
          canBeRootCause: false,
        })
      } else if (effectiveMean >= 40) {
        evidence.push({
          title: 'MSPT 接近压力边界',
          detail: `MSPT ${effectiveMean.toFixed(1)}ms，接近 50ms 上限，高负载时可能卡顿`,
          confidence: 'medium',
          type: 'health_issue',
          canBeRootCause: false,
        })
      }
    }

    if (mspt.max != null && effectiveMean != null && mspt.max > effectiveMean * 1.5) {
      evidence.push({
        title: '偶发 MSPT 峰值',
        detail: `最大 MSPT ${mspt.max.toFixed(1)}ms 明显高于平均 ${effectiveMean.toFixed(1)}ms，存在偶发卡顿`,
        confidence: 'medium',
        type: 'health_issue',
        canBeRootCause: false,
      })
    }

    if (effectiveMean != null && effectiveMean >= 45) {
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
        type: 'system_metric',
        canBeRootCause: false,
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
    if (mem) {
      if (mem.usagePercent != null && mem.usagePercent > 85) {
        evidence.push({
          title: '内存使用率高',
          detail: `内存使用率 ${mem.usagePercent}%（${mem.usedMB ?? '?'}MB/${mem.maxMB ?? '?'}MB），接近上限`,
          confidence: 'high',
          type: 'system_metric',
          canBeRootCause: false,
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
    }

    // ── GC analysis (P6) ──
    this.analyzeGc(data, evidence, causes, commands)
  }

  private analyzeGc(
    data: NormalizedSummary,
    evidence: RuleEvidence[],
    causes: SuspectedCause[],
    _commands: string[],
  ) {
    const gc = data.health.gc
    if (!gc || !gc.collectors || gc.collectors.length === 0) return

    const collectors = gc.collectors

    // Check for existing GC warning from raw data
    if (gc.warning) {
      evidence.push({
        title: 'GC 警告',
        detail: gc.warning,
        confidence: 'medium',
        type: 'system_metric',
        canBeRootCause: false,
      })
    }

    // Check average time per collector
    for (const c of collectors) {
      // High average GC time (>100ms) → medium warning
      if (c.averageTimeMs != null && c.averageTimeMs > 100) {
        evidence.push({
          title: `${c.name} 平均耗时偏高`,
          detail: `${c.name} 平均每次 GC 耗时 ${c.averageTimeMs.toFixed(1)}ms，超过 100ms 阈值。GC 就像服务器清理内存垃圾的保洁——偶尔清理很正常；但如果每次清理太久，服务器可能会短暂停顿。`,
          confidence: 'medium',
          type: 'system_metric',
          canBeRootCause: false,
        })
      }

      // Very high max GC time (>500ms) → high warning
      if (c.maxTimeMs != null && c.maxTimeMs > 500) {
        evidence.push({
          title: `${c.name} 单次 GC 耗时过长`,
          detail: `${c.name} 单次 GC 最大耗时 ${c.maxTimeMs.toFixed(1)}ms，超过 500ms。需要结合 TPS/MSPT 时间线判断是否在此时段发生卡顿。`,
          confidence: 'high',
          type: 'system_metric',
          canBeRootCause: false,
        })
      }
    }

    // Old GC analysis
    if (gc.hasOldGc) {
      const oldTimeMs = gc.oldTimeMs || 0
      const oldCollections = gc.oldCollections || 0

      let conf: 'high' | 'medium' | 'low' = 'medium'
      if (oldTimeMs > 1000 || oldCollections > 10) conf = 'high'
      else if (oldTimeMs > 100 || oldCollections > 0) conf = 'medium'
      else conf = 'low'

      evidence.push({
        title: '检测到 Old GC（老年代回收）',
        detail: `Old GC 共 ${oldCollections} 次，累计耗时 ${oldTimeMs}ms。Old GC 通常会造成较长时间的停顿（Stop-The-World），但如果缺少采样时长和暂停分布数据，不能单独断言 Old GC 是 TPS 下降的根因。当前 spark metadata 中检测到 G1 Young / Old Generation GC 统计，该数据可用于判断是否存在频繁 Young GC 或 Old GC，但如果缺少采样时长和暂停分布，不能单独断言 GC 是 TPS 下降的根因。`,
        confidence: conf,
        type: 'system_metric',
        canBeRootCause: conf !== 'low',
      })

      if (conf !== 'low') {
        causes.push({
          name: 'GC 压力（Old Generation）',
          category: 'jvm',
          reason: `Old GC 累计 ${oldCollections} 次 / ${oldTimeMs}ms，可能造成停顿。建议结合 spark health 报告和 JVM 参数进一步分析。`,
          priority: 2,
          confidence: conf,
        })
      }
    }

    // High total GC time without clear cause
    if (gc.totalTimeMs != null && gc.totalTimeMs > 5000 && !gc.hasOldGc) {
      evidence.push({
        title: 'GC 总耗时较高',
        detail: `所有 GC 收集器累计耗时 ${gc.totalTimeMs}ms，但没有 Old GC。频繁 Young GC 通常影响较小，但如缺少采样时长，无法判断频率是否异常。当前 GC 不是主要证据。`,
        confidence: 'low',
        type: 'system_metric',
        canBeRootCause: false,
      })
    }

    // If GC data looks normal, explicitly note it
    const hasGcIssues = evidence.some(e =>
      e.title.includes('GC') || e.title.includes('Old GC') || e.type === 'system_metric' && e.title.includes('平均耗时')
    )
    if (!hasGcIssues && !gc.warning) {
      // GC data exists but looks normal — don't flag anything
      // This is intentional: normal GC should not generate evidence
    }
  }

  private analyzeEntityDistribution(
    data: NormalizedSummary,
    evidence: RuleEvidence[],
    causes: SuspectedCause[],
    commands: string[],
  ): void {
    const dist = data.health.entityDistribution
    if (!dist) return

    const totalEntities = dist.totalEntities
    const globalTopTypes = dist.globalTopTypes || []

    // 1. Total entity count analysis
    if (totalEntities != null) {
      if (totalEntities >= 10000) {
        evidence.push({
          title: '实体总数过高',
          detail: `当前世界实体总数 ${totalEntities}，超过 10000，高实体数量可能造成实体 tick、碰撞、AI 或清理压力。`,
          confidence: 'high',
          type: 'system_metric',
          canBeRootCause: true,
        })
        causes.push({
          name: '实体数量过高',
          category: 'entity',
          reason: '实体总数明显偏高，可能造成主线程实体 tick 压力；需结合 profiler 热点确认。',
          priority: 2,
          confidence: 'high',
        })
        commands.push('/spark health --upload', '/spark profiler start --timeout 300')
      } else if (totalEntities >= 5000) {
        evidence.push({
          title: '实体总数偏高',
          detail: `当前世界实体总数 ${totalEntities}，超过 5000，实体数量偏高可能造成 tick 和 AI 处理压力。`,
          confidence: 'medium',
          type: 'system_metric',
          canBeRootCause: true,
        })
        causes.push({
          name: '实体数量偏高',
          category: 'entity',
          reason: '实体总数偏高，可能造成主线程实体 tick 压力；需结合 profiler 热点确认。',
          priority: 2,
          confidence: 'medium',
        })
        commands.push('/spark health --upload', '/spark profiler start --timeout 300')
      } else if (totalEntities >= 1000) {
        evidence.push({
          title: '实体总数超过 1000（观察线索）',
          detail: `世界实体总数 ${totalEntities}，超过 1000，属于需要结合 TPS/MSPT 和 profiler 继续观察的实体压力线索。`,
          confidence: 'low',
          type: 'system_metric',
          canBeRootCause: false,
        })
      }
    }

    // 2. High/medium risk entity types
    const riskyTypes = globalTopTypes.filter(
      t => t.riskLevel === 'high' || t.riskLevel === 'medium'
    )
    const hasHighRisk = riskyTypes.some(t => t.riskLevel === 'high')

    if (riskyTypes.length > 0) {
      const top3 = riskyTypes.slice(0, 3)
        .map(t => `${t.type}=${t.count}`)
        .join(', ')

      const confidence = hasHighRisk ? 'high' : 'medium'

      evidence.push({
        title: '高风险实体类型集中',
        detail: `高风险实体类型: ${top3}${riskyTypes.length > 3 ? ' 等' : ''}。${riskyTypes[0]?.riskReason || '掉落物/经验球/村民/展示框/矿车等实体数量偏高，可能造成实体处理压力。'}`,
        confidence,
        type: 'system_metric',
        canBeRootCause: true,
      })

      causes.push({
        name: '高风险实体类型堆积',
        category: 'entity',
        reason: '掉落物/经验球/村民/展示框/矿车等实体数量偏高，可能造成实体处理压力；需要结合 profiler 中 entity/tick/aiStep/collision/pathfind 热点确认。',
        priority: 2,
        confidence,
      })

      // Recommend profiler commands if not already present
      if (!commands.some(c => c.includes('profiler'))) {
        commands.push('/spark profiler start --timeout 300')
      }
      if (!commands.some(c => c.includes('health'))) {
        commands.push('/spark health --upload')
      }
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
                type: 'source_hint',
                canBeRootCause: false,
              })
            }
          }
        }
      }
    }

    // Scan source names for known patterns
    // NOTE: These are LOW-confidence clues ONLY. Source names alone (without
    // main-thread method evidence and percentage data) do NOT constitute
    // sufficient evidence to blame a specific mod/plugin.
    for (const source of data.profiler.sources) {
      const name = source.name.toLowerCase()
      if (name.includes('luckperms') || name.includes('essentials') || name.includes('dynmap') || name.includes('ftb')) {
        const hasPercent = source.totalPercent != null && source.totalPercent > 0
        const hasThreadEvidence = source.evidence && source.evidence.length > 0
          && source.evidence.some((e: string) => e.includes('主线程'))

        if (hasPercent && hasThreadEvidence) {
          // Source has method-level evidence on main thread → medium/high
          const conf = source.totalPercent! >= 15 ? 'high' : source.totalPercent! >= 5 ? 'medium' : 'low'
          evidence.push({
            title: `疑似性能瓶颈：${source.name}`,
            detail: hasPercent && source.totalPercent != null
              ? `${source.name} 在主线程方法中累计占比 ${source.totalPercent!.toFixed(1)}%，${source.evidence?.[0] || ''}`
              : `${source.name} 在主线程方法中出现，但占比数据不完整`,
            confidence: conf,
            type: 'suspected_cause',
            canBeRootCause: conf !== 'low',
          })
        } else if (hasPercent && !hasThreadEvidence) {
          // Has percent but no main thread evidence → still low confidence
          evidence.push({
            title: `来源线索：${source.name}`,
            detail: `${source.name} 累计占比 ${source.totalPercent!.toFixed(1)}%，但未确认是否出现在主线程关键方法中。缺少主线程方法栈证据，不能直接认定为性能瓶颈。`,
            confidence: 'low',
            type: 'source_hint',
            canBeRootCause: false,
          })
        } else {
          // No percent, no thread evidence → just a name in the mod list
          const detail = `${source.name} 在来源列表中出现，但缺少占比数据和主线程方法栈证据。\n仅凭来源名称无法判断其真实性能开销。该来源可能是正常运行的模组，也可能是卡顿相关方，但当前采样数据不足以做出判断。`
          evidence.push({
            title: `低置信来源线索：${source.name}`,
            detail,
            confidence: 'low',
            type: 'source_hint',
            canBeRootCause: false,
          })
        }
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

  /**
   * Check if there's enough data to make a meaningful analysis.
   * Returns false if all data channels are empty.
   */
  private hasEnoughData(normalized: NormalizedSummary): boolean {
    const health = normalized.health
    const profiler = normalized.profiler

    // Check health data
    const hasHealthData = !!(
      health.tps || health.mspt || health.memory || health.cpu || health.gc
    )

    // Check profiler data
    const hasProfilerData = !!(
      profiler.threads.length > 0 || profiler.sources.length > 0
    )

    return hasHealthData || hasProfilerData
  }

  private buildSummary(
    severity: string,
    evidence: RuleEvidence[],
    causes: SuspectedCause[],
    insufficientData = false,
  ): string {
    if (insufficientData) return '报告数据解析不足，无法确认是否存在性能问题'
    if (evidence.length === 0) return '未检测到明显性能问题'

    // Prioritize high-confidence evidence for the summary
    const high = evidence.filter(e => e.confidence === 'high').slice(0, 3)
    if (high.length > 0) {
      return high.map(e => e.title).join('；')
    }

    const medium = evidence.filter(e => e.confidence === 'medium').slice(0, 2)
    if (medium.length > 0) {
      return medium.map(e => e.title).join('；')
    }

    // For low-confidence-only evidence, make it clear these are clues, not conclusions
    return '发现若干低置信度线索，建议采集更详细的 profiler 数据进一步分析'
  }
}

export const sparkRuleAnalyzer = new SparkRuleAnalyzer()
