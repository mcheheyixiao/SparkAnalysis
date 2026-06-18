import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { SparkNormalizer } from '../src/modules/spark/spark-normalizer.service.js'
import { SparkRuleAnalyzer } from '../src/modules/spark/spark-rule-analyzer.service.js'
import { buildDisplayMarkdownReport, buildFallbackMarkdownReport, buildMarkdownReportFromAiResult, looksLikeJsonText } from '../src/modules/reports/markdown-report.builder.js'
import type { NormalizedSummary, SparkRawData } from '../src/modules/spark/spark.types.js'
import type { AiAnalysisOutput } from '../src/modules/ai/ai.types.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

function loadFixture(name: string): NormalizedSummary {
  const raw = readFileSync(resolve(__dirname, 'fixtures/spark', name), 'utf-8')
  return JSON.parse(raw) as NormalizedSummary
}

describe('kPy1L2N05S regression', () => {
  const fixture = loadFixture('kPy1L2N05S.normalized.fixture.json')

  describe('Normalizer output', () => {
    it('should extract TPS 13.95 (low TPS)', () => {
      expect(fixture.health.tps).toBeDefined()
      expect(fixture.health.tps!.mean).toBeCloseTo(13.95, 0)
      expect(fixture.health.tps!.latest).toBeCloseTo(13.95, 0)
    })

    it('should extract MSPT (high MSPT)', () => {
      expect(fixture.health.mspt).toBeDefined()
      expect(fixture.health.mspt!.mean).toBeGreaterThan(50)
      expect(fixture.health.mspt!.max).toBeGreaterThan(100)
    })

    it('should extract main thread top methods', () => {
      const mainThread = fixture.profiler.threads.find(t => t.type === 'main')
      expect(mainThread).toBeDefined()
      expect(mainThread!.topMethods).toBeDefined()
      expect(mainThread!.topMethods!.length).toBeGreaterThan(0)
    })

    it('should classify sources as mod on Forge platform', () => {
      for (const s of fixture.profiler.sources) {
        expect(s.type).toBe('mod')
      }
    })

    it('should have ftbessentials in source list', () => {
      const ftb = fixture.profiler.sources.find(s => s.name === 'ftbessentials')
      expect(ftb).toBeDefined()
      expect(ftb!.type).toBe('mod')
    })

    it('should report limitations about missing source percentages', () => {
      const hasSourceLimitation = fixture.limitations.some(
        l => l.includes('占比数据') || l.includes('profiler')
      )
      expect(hasSourceLimitation).toBe(true)
    })
  })

  describe('RuleAnalyzer', () => {
    const analyzer = new SparkRuleAnalyzer()
    const result = analyzer.analyze(fixture)

    it('should detect TPS as low with high confidence', () => {
      const tpsEvidence = result.evidence.find(e => e.title.includes('TPS'))
      expect(tpsEvidence).toBeDefined()
      expect(tpsEvidence!.confidence).toBe('high')
    })

    it('should detect MSPT as high with high confidence', () => {
      const msptEvidence = result.evidence.find(e => e.title.includes('MSPT'))
      expect(msptEvidence).toBeDefined()
      expect(msptEvidence!.confidence).toBe('high')
    })

    it('should NOT classify ftbessentials as a suspected cause', () => {
      const ftbCause = result.suspectedCauses.find(
        c => c.name.toLowerCase().includes('ftbessentials') || c.name.toLowerCase().includes('essentials')
      )
      expect(ftbCause).toBeUndefined()
    })

    it('should classify ftbessentials evidence as low confidence', () => {
      const ftbEvidence = result.evidence.find(e => e.title.includes('ftbessentials'))
      if (ftbEvidence) {
        expect(ftbEvidence.confidence).toBe('low')
      }
    })

    it('should have severity high (not low) due to TPS+MSPT issues', () => {
      expect(result.severity).toBe('high')
    })

    it('should NOT have ftbessentials as main summary', () => {
      expect(result.summary).not.toContain('ftbessentials')
    })

    it('should recommend profiler command for deeper analysis', () => {
      const hasProfiler = result.recommendedCommands.some(c => c.includes('profiler'))
      expect(hasProfiler).toBe(true)
    })
  })

  describe('Fallback markdown', () => {
    it('should not contain raw AI JSON', () => {
      const md = buildFallbackMarkdownReport({
        summary: 'test',
        severity: 'medium',
        ruleAnalysis: {
          severity: 'medium',
          summary: 'test',
          evidence: [
            { title: '来源线索：ftbessentials', detail: '缺少占比数据', confidence: 'low' }
          ],
          suspectedCauses: [],
          recommendedCommands: [],
          limitations: [],
        },
        reason: 'AI_INVALID_JSON',
      })

      // Must not start with { or [
      expect(md.trim().startsWith('{')).toBe(false)
      expect(md.trim().startsWith('[')).toBe(false)
      // Must not contain raw JSON fragments
      expect(md).not.toContain('"one_sentence_summary"')
    })

    it('should not concatenate raw AI text into markdown', () => {
      const md = buildFallbackMarkdownReport({
        summary: 'test',
        severity: 'medium',
        reason: 'AI_INVALID_JSON',
      })

      expect(md).not.toContain('AI 返回内容格式异常')
      expect(md).toContain('AI 结构化输出解析失败')
      expect(typeof md).toBe('string')
      expect(md.length).toBeGreaterThan(50)
    })
  })

  describe('looksLikeJsonText', () => {
    it('should detect JSON objects', () => {
      expect(looksLikeJsonText('{"key": "value"}')).toBe(true)
      expect(looksLikeJsonText('{ "a": 1 }')).toBe(true)
    })

    it('should detect JSON arrays', () => {
      expect(looksLikeJsonText('[1, 2, 3]')).toBe(true)
    })

    it('should reject normal markdown', () => {
      expect(looksLikeJsonText('# 总结\nTPS 偏低')).toBe(false)
      expect(looksLikeJsonText('这是正常文本')).toBe(false)
      expect(looksLikeJsonText('')).toBe(false)
    })

    it('should reject non-strings', () => {
      expect(looksLikeJsonText(null)).toBe(false)
      expect(looksLikeJsonText(undefined)).toBe(false)
      expect(looksLikeJsonText(123 as any)).toBe(false)
    })
  })

  describe('Markdown report API shape', () => {
    it('should return markdown that does not start with { or [', () => {
      const mockAiResult: AiAnalysisOutput = {
        one_sentence_summary: 'TPS 偏低，MSPT 过高',
        severity: 'high',
        beginner_explanation: '服务器卡顿是因为...',
        key_evidence: [
          { title: 'TPS 偏低', explanation: 'TPS 13.95', confidence: 'high' }
        ],
        suspected_causes: [],
        fix_plan: [],
        retest_commands: [],
        missing_information: [],
        markdown_report: '# 总结\nTPS 偏低，需要进一步分析',
      }

      const md = buildDisplayMarkdownReport({
        aiResult: mockAiResult,
        summary: 'TPS 偏低',
        severity: 'high',
      })

      expect(md.trim().startsWith('{')).toBe(false)
      expect(md.trim().startsWith('[')).toBe(false)
      expect(md).toContain('# 总结')
    })

    it('should not use AI markdown_report when it looks like JSON', () => {
      const mockAiResult: AiAnalysisOutput = {
        one_sentence_summary: 'TPS 偏低',
        severity: 'medium',
        beginner_explanation: 'test',
        key_evidence: [],
        suspected_causes: [],
        fix_plan: [],
        retest_commands: [],
        missing_information: [],
        markdown_report: '{"one_sentence_summary":"TPS 偏低","severity":"medium"}',
      }

      const md = buildDisplayMarkdownReport({
        aiResult: mockAiResult,
        summary: 'TPS 偏低',
        severity: 'medium',
      })

      // Should build from structured fields, not use the JSON string
      expect(md.trim().startsWith('{')).toBe(false)
      expect(md).toContain('# 总结')
      expect(md).not.toContain('"one_sentence_summary"')
    })
  })
})
