import { describe, it, expect } from 'vitest'
import { SparkRuleAnalyzer } from '../src/modules/spark/spark-rule-analyzer.service.js'
import type { NormalizedSummary } from '../src/modules/spark/spark.types.js'

function makeEmpty(): NormalizedSummary {
  return {
    code: 'test',
    reportType: 'unknown',
    server: {},
    timing: {},
    health: {},
    profiler: { threads: [], sources: [], suspiciousMethods: [] },
    limitations: [],
  }
}

describe('SparkRuleAnalyzer', () => {
  const analyzer = new SparkRuleAnalyzer() as any

  describe('hasEnoughData', () => {
    it('should return false for completely empty data', () => {
      const result = analyzer.hasEnoughData(makeEmpty())
      expect(result).toBe(false)
    })

    it('should return true when TPS data exists', () => {
      const n = makeEmpty()
      n.health.tps = { mean: 19.0 }
      expect(analyzer.hasEnoughData(n)).toBe(true)
    })

    it('should return true when MSPT data exists', () => {
      const n = makeEmpty()
      n.health.mspt = { mean: 35.0 }
      expect(analyzer.hasEnoughData(n)).toBe(true)
    })

    it('should return true when memory data exists', () => {
      const n = makeEmpty()
      n.health.memory = { usedMB: 2048, maxMB: 4096 }
      expect(analyzer.hasEnoughData(n)).toBe(true)
    })

    it('should return true when profiler threads exist', () => {
      const n = makeEmpty()
      n.profiler.threads = [{ name: 'Server thread', type: 'main', totalPercent: 75 }]
      expect(analyzer.hasEnoughData(n)).toBe(true)
    })

    it('should return true when profiler sources exist', () => {
      const n = makeEmpty()
      n.profiler.sources = [{ name: 'net.minecraft', type: 'minecraft', totalPercent: 50 }]
      expect(analyzer.hasEnoughData(n)).toBe(true)
    })
  })

  describe('analyze', () => {
    it('should return insufficient data summary when no data', () => {
      const result = (analyzer as SparkRuleAnalyzer).analyze(makeEmpty())
      expect(result.summary).toBe('报告数据解析不足，无法确认是否存在性能问题')
      expect(result.severity).toBe('normal')
      expect(result.limitations).toContainEqual(
        expect.stringContaining('数据解析不足')
      )
    })

    it('should detect TPS issues', () => {
      const n = makeEmpty()
      n.health.tps = { mean: 17.0, min: 10.0, max: 20.0 }
      const result = (analyzer as SparkRuleAnalyzer).analyze(n)
      expect(result.evidence.some((e: any) => e.title.includes('TPS 偏低'))).toBe(true)
      expect(result.summary).not.toBe('报告数据解析不足，无法确认是否存在性能问题')
    })

    it('should detect MSPT issues', () => {
      const n = makeEmpty()
      n.health.mspt = { mean: 55.0, max: 80.0 }
      const result = (analyzer as SparkRuleAnalyzer).analyze(n)
      expect(result.evidence.some((e: any) => e.title.includes('MSPT 过高'))).toBe(true)
    })

    it('should detect main thread bottleneck', () => {
      const n = makeEmpty()
      n.profiler.threads = [
        {
          name: 'Server thread',
          type: 'main',
          totalPercent: 75,
          topMethods: [{ name: 'tick', percent: 50, packageName: 'net.minecraft.server' }],
        },
      ]
      const result = (analyzer as SparkRuleAnalyzer).analyze(n)
      expect(result.evidence.some((e: any) => e.title.includes('主线程瓶颈'))).toBe(true)
    })

    it('should recommend spark commands for low TPS', () => {
      const n = makeEmpty()
      n.health.tps = { mean: 17.0, min: 12.0, max: 20.0 }
      const result = (analyzer as SparkRuleAnalyzer).analyze(n)
      expect(result.recommendedCommands.length).toBeGreaterThan(0)
    })
  })
})
