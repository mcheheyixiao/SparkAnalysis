import { describe, it, expect } from 'vitest'
import {
  buildMarkdownReportFromAiResult,
  buildFallbackMarkdownReport,
  normalizeMarkdownReport,
} from '../src/modules/reports/markdown-report.builder.js'
import type { AiAnalysisOutput } from '../src/modules/ai/ai.types.js'
import type { RuleAnalysisResult } from '../src/modules/spark/spark.types.js'

// ── Helpers ──────────────────────────────────────────────────

function makeAIResult(overrides: Partial<AiAnalysisOutput> = {}): AiAnalysisOutput {
  return {
    one_sentence_summary: '服务器 TPS 偏低，主线程负载过高',
    severity: 'medium',
    beginner_explanation: 'TPS 像服务器心跳，当前偏低说明负载偏高',
    key_evidence: [
      { title: 'TPS 仅 13.95', explanation: '远低于正常值 20', confidence: 'high' },
      { title: 'MSPT 最高 120ms', explanation: '偶尔尖刺高', confidence: 'medium' },
    ],
    suspected_causes: [
      {
        rank: 1,
        name: '实体数量过多',
        category: '实体',
        reason: '实体 AI 占用大量主线程时间',
        confidence: 'medium',
        how_to_verify: '使用 /spark health 查看实体数量',
      },
    ],
    fix_plan: [
      {
        priority: 1,
        action: '降低实体渲染距离',
        difficulty: 'easy',
        risk: 'low',
        expected_effect: '减少区块加载和实体 AI 开销',
      },
    ],
    retest_commands: ['/spark profiler --timeout 300'],
    missing_information: ['在线人数', 'GC 数据'],
    markdown_report: '# 总结\n服务器 TPS 偏低\n\n## 小白解释\nTPS 偏低说明负载偏高',
    ...overrides,
  }
}

function makeRuleAnalysis(overrides: Partial<RuleAnalysisResult> = {}): RuleAnalysisResult {
  return {
    severity: 'medium',
    summary: 'TPS 检测到偏低，疑似主线程负载过高',
    evidence: [
      { title: 'TPS 低于 15', detail: '当前 TPS 仅 13.95，正常为 20', confidence: 'high' },
    ],
    suspectedCauses: [
      {
        name: '实体 AI 过高',
        category: 'entity',
        reason: '实体 AI 占用大量主线程时间',
        priority: 1,
        confidence: 'medium',
      },
    ],
    recommendedCommands: ['/spark profiler --timeout 300', '/spark health'],
    limitations: ['缺少主线程堆栈', '缺少 GC 数据'],
    ...overrides,
  }
}

// ── buildMarkdownReportFromAiResult ───────────────────────────

describe('buildMarkdownReportFromAiResult', () => {
  it('should use ai.markdown_report when it is valid Markdown', () => {
    const ai = makeAIResult({ markdown_report: '# 总结\n一切正常' })
    const result = buildMarkdownReportFromAiResult(ai)
    expect(result).toContain('# 总结')
    expect(result).toContain('一切正常')
  })

  it('should NOT use ai.markdown_report when it looks like JSON', () => {
    const ai = makeAIResult({ markdown_report: '{"one_sentence_summary":"test"}' })
    const result = buildMarkdownReportFromAiResult(ai)
    // Should NOT contain raw JSON
    expect(result).not.toContain('{"one_sentence_summary"')
    // Should build from structured fields instead
    expect(result).toContain('# 总结')
    expect(result).toContain('服务器 TPS 偏低')
  })

  it('should build markdown from structured fields when markdown_report is empty', () => {
    const ai = makeAIResult({ markdown_report: '' })
    const result = buildMarkdownReportFromAiResult(ai)
    expect(result).toContain('# 总结')
    expect(result).toContain('TPS 仅 13.95')
  })

  it('should include key_evidence when present (building from structured fields)', () => {
    // Set markdown_report empty to force structured field building
    const ai = makeAIResult({ markdown_report: '' })
    const result = buildMarkdownReportFromAiResult(ai)
    expect(result).toContain('## 关键证据')
    expect(result).toContain('TPS 仅 13.95')
  })

  it('should include suspected_causes when present (building from structured fields)', () => {
    const ai = makeAIResult({ markdown_report: '' })
    const result = buildMarkdownReportFromAiResult(ai)
    expect(result).toContain('## 疑似原因')
    expect(result).toContain('实体数量过多')
  })

  it('should include fix_plan when present (building from structured fields)', () => {
    const ai = makeAIResult({ markdown_report: '' })
    const result = buildMarkdownReportFromAiResult(ai)
    expect(result).toContain('## 修复建议')
    expect(result).toContain('降低实体渲染距离')
  })

  it('should include missing_information when present (building from structured fields)', () => {
    const ai = makeAIResult({ markdown_report: '' })
    const result = buildMarkdownReportFromAiResult(ai)
    expect(result).toContain('## 缺失信息')
    expect(result).toContain('在线人数')
  })

  it('should handle empty arrays gracefully', () => {
    const ai = makeAIResult({
      key_evidence: [],
      suspected_causes: [],
      fix_plan: [],
      retest_commands: [],
      missing_information: [],
      markdown_report: '',
    })
    const result = buildMarkdownReportFromAiResult(ai)
    // Should still produce a valid output without errors
    expect(result).toContain('# 总结')
    expect(typeof result).toBe('string')
  })
})

// ── buildFallbackMarkdownReport ───────────────────────────────

describe('buildFallbackMarkdownReport', () => {
  it('should generate clean fallback report', () => {
    const result = buildFallbackMarkdownReport({
      summary: 'TPS 偏低',
      severity: 'medium',
      ruleAnalysis: makeRuleAnalysis(),
      reason: 'AI_INVALID_JSON',
    })

    expect(result).toContain('# 总结')
    expect(result).toContain('AI 结构化输出解析失败')
    expect(result).not.toContain('{')
    expect(result).not.toContain('AI 返回内容格式异常')
  })

  it('should NOT contain raw AI JSON', () => {
    const result = buildFallbackMarkdownReport({
      summary: 'TPS 偏低',
      severity: 'high',
      reason: 'AI_INVALID_JSON',
    })

    // Must not contain JSON markers or raw JSON
    expect(result).not.toContain('{')
    expect(result).not.toContain('"one_sentence_summary"')
    expect(result).not.toContain('"severity"')
  })

  it('should include rule analysis evidence when available', () => {
    const ra = makeRuleAnalysis()
    const result = buildFallbackMarkdownReport({
      summary: ra.summary,
      severity: ra.severity,
      ruleAnalysis: ra,
    })

    expect(result).toContain('TPS 低于 15')
    expect(result).toContain('已发现的关键线索')
  })

  it('should include recommended commands when available', () => {
    const ra = makeRuleAnalysis()
    const result = buildFallbackMarkdownReport({
      summary: ra.summary,
      severity: ra.severity,
      ruleAnalysis: ra,
    })

    expect(result).toContain('/spark profiler')
  })

  it('should include limitations when available', () => {
    const ra = makeRuleAnalysis()
    const result = buildFallbackMarkdownReport({
      summary: ra.summary,
      severity: ra.severity,
      ruleAnalysis: ra,
    })

    expect(result).toContain('缺少主线程堆栈')
  })

  it('should work with minimal input', () => {
    const result = buildFallbackMarkdownReport({
      summary: '数据不足',
      severity: 'normal',
    })

    expect(result).toContain('# 总结')
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(50)
  })
})

// ── normalizeMarkdownReport ───────────────────────────────────

describe('normalizeMarkdownReport', () => {
  it('should return storedMarkdownReport when valid', () => {
    const result = normalizeMarkdownReport({
      storedMarkdownReport: '# 正常报告\n内容',
    })
    expect(result).toBe('# 正常报告\n内容')
  })

  it('should NOT return storedMarkdownReport when it looks like JSON', () => {
    const result = normalizeMarkdownReport({
      storedMarkdownReport: '{"one_sentence_summary":"test","severity":"low"}',
      summary: 'fallback summary',
      severity: 'low',
    })
    // Must NOT return the JSON string
    expect(result).not.toContain('{"one_sentence_summary"')
    // Should generate clean markdown
    expect(result).toContain('# 总结')
  })

  it('should extract markdown_report from JSON-like stored content', () => {
    const aiJson = JSON.stringify({
      one_sentence_summary: 'TPS偏低',
      severity: 'medium',
      markdown_report: '# 从JSON提取\n这是正常的报告',
      beginner_explanation: '测试',
      key_evidence: [],
      suspected_causes: [],
      fix_plan: [],
      retest_commands: [],
      missing_information: [],
    })
    const result = normalizeMarkdownReport({
      storedMarkdownReport: aiJson,
    })
    expect(result).toContain('从JSON提取')
    expect(result).toContain('# 从JSON提取')
  })

  it('should build from aiResultJson when storedMarkdownReport is missing', () => {
    const ai = makeAIResult()
    const result = normalizeMarkdownReport({
      storedMarkdownReport: null,
      aiResultJson: ai,
    })
    expect(result).toContain('# 总结')
    expect(result).toContain('服务器 TPS 偏低')
  })

  it('should build fallback when all inputs are missing', () => {
    const result = normalizeMarkdownReport({
      summary: '无法分析',
      severity: 'normal',
    })
    expect(result).toContain('# 总结')
    expect(typeof result).toBe('string')
  })

  it('should build fallback from ruleAnalysis when no other input', () => {
    const ra = makeRuleAnalysis()
    const result = normalizeMarkdownReport({
      ruleAnalysis: ra,
      summary: ra.summary,
      severity: ra.severity,
    })
    expect(result).toContain('规则预分析')
    expect(result).toContain('TPS 低于 15')
  })

  it('should handle old data where storedMarkdownReport is raw AI JSON', () => {
    // Simulate the old bad behavior: raw AI output stored as markdownReport
    const rawAiText = '{"one_sentence_summary":"TPS 偏低","severity":"medium","markdown_report":"# 报告\\n内容截断'
    const result = normalizeMarkdownReport({
      storedMarkdownReport: rawAiText,
      summary: 'TPS偏低',
      severity: 'medium',
    })
    // Should never return raw JSON
    expect(result).not.toContain('{"one_sentence_summary"')
    expect(result).toContain('# 总结')
  })
})
