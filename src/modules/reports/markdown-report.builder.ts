import type { AiAnalysisOutput } from '../ai/ai.types.js'
import type { RuleAnalysisResult } from '../spark/spark.types.js'

// ── Helpers ──────────────────────────────────────────────────────

function looksLikeJsonText(text: string): boolean {
  const trimmed = text.trim()
  return trimmed.startsWith('{') || trimmed.startsWith('[')
}

function safeStr(s: unknown, fallback = ''): string {
  if (typeof s === 'string' && s.length > 0) return s
  return fallback
}

function list(items: string[]): string {
  return items.map((i) => `- ${i}`).join('\n')
}

// ── From successful AI structured result ────────────────────────

export function buildMarkdownReportFromAiResult(ai: AiAnalysisOutput): string {
  // If ai.markdown_report is already valid Markdown, use it directly
  if (ai.markdown_report && !looksLikeJsonText(ai.markdown_report)) {
    return ai.markdown_report
  }

  // Otherwise build from structured fields
  const lines: string[] = []

  lines.push('# 总结')
  lines.push('')
  lines.push(ai.one_sentence_summary || '(未提供总结)')
  lines.push('')

  if (ai.beginner_explanation) {
    lines.push('## 小白解释')
    lines.push('')
    lines.push(ai.beginner_explanation)
    lines.push('')
  }

  if (ai.key_evidence?.length) {
    lines.push('## 关键证据')
    lines.push('')
    for (const e of ai.key_evidence) {
      if (e.title) {
        const conf = e.confidence === 'high' ? '🔴高' : e.confidence === 'medium' ? '🟡中' : '🟢低'
        lines.push(`- **${e.title}** (${conf}置信)`)
        if (e.explanation) lines.push(`  ${e.explanation}`)
      }
    }
    lines.push('')
  }

  if (ai.suspected_causes?.length) {
    lines.push('## 疑似原因')
    lines.push('')
    for (const c of ai.suspected_causes) {
      const conf = c.confidence === 'high' ? '高' : c.confidence === 'medium' ? '中' : '低'
      lines.push(`### #${c.rank} ${c.name} (${conf}置信)`)
      if (c.reason) lines.push(c.reason)
      if (c.how_to_verify) lines.push(`\n验证方法：${c.how_to_verify}`)
      lines.push('')
    }
  }

  if (ai.fix_plan?.length) {
    lines.push('## 修复建议')
    lines.push('')
    for (const f of ai.fix_plan) {
      const diff =
        f.difficulty === 'easy' ? '简单' : f.difficulty === 'medium' ? '中等' : '困难'
      const risk = f.risk === 'low' ? '低' : f.risk === 'medium' ? '中' : '高'
      lines.push(`### ${f.priority}. ${f.action}`)
      lines.push(`难度：${diff} | 风险：${risk}`)
      if (f.expected_effect) lines.push(`预期效果：${f.expected_effect}`)
      lines.push('')
    }
  }

  if (ai.retest_commands?.length) {
    lines.push('## 复测命令')
    lines.push('')
    lines.push(list(ai.retest_commands))
    lines.push('')
  }

  if (ai.missing_information?.length) {
    lines.push('## 缺失信息')
    lines.push('')
    lines.push(list(ai.missing_information))
    lines.push('')
  }

  return lines.join('\n')
}

// ── Fallback from rule analysis ─────────────────────────────────

export function buildFallbackMarkdownReport(input: {
  summary: string
  severity: string
  ruleAnalysis?: RuleAnalysisResult
  reason?: string
}): string {
  const lines: string[] = []

  const reasonText =
    input.reason === 'AI_INVALID_JSON'
      ? 'AI 结构化输出解析失败，系统已自动使用规则预分析生成可读报告。'
      : 'AI 分析未能完成，以下报告基于规则预分析生成。'

  // Severity label
  const sevLabel: Record<string, string> = {
    normal: '正常',
    low: '低风险',
    medium: '中等风险',
    high: '高风险',
    critical: '严重',
  }

  lines.push('# 总结')
  lines.push('')
  lines.push(reasonText)
  lines.push('')
  lines.push(
    `当前报告显示严重等级为 **${sevLabel[input.severity] || input.severity}**。${
      input.summary || '请查看下方分析详情。'
    }`,
  )
  lines.push('')

  lines.push('## 小白解释')
  lines.push('')
  lines.push(
    input.summary ||
      'TPS 像服务器心跳，正常接近 20。如果 TPS 偏低，说明服务器每秒能完成的游戏循环变少，玩家可能感觉方块延迟、怪物卡顿或聊天变慢。',
  )
  lines.push(
    '当前系统基于规则预分析数据生成了以下报告。虽然 AI 未能完成完整分析，但以下内容仍可作为初步排查参考。',
  )
  lines.push('')

  if (input.ruleAnalysis) {
    const ra = input.ruleAnalysis

    if (ra.evidence?.length) {
      lines.push('## 已发现的关键线索')
      lines.push('')
      for (const e of ra.evidence) {
        const conf = e.confidence === 'high' ? '🔴' : e.confidence === 'medium' ? '🟡' : '🟢'
        lines.push(`- ${conf} **${e.title}**：${e.detail}`)
      }
      lines.push('')
    }

    if (ra.suspectedCauses?.length) {
      lines.push('## 规则预分析：疑似原因')
      lines.push('')
      for (const c of ra.suspectedCauses) {
        lines.push(`- **${c.name}**（${c.category}）：${c.reason}`)
      }
      lines.push('')
    }

    if (ra.recommendedCommands?.length) {
      lines.push('## 建议的下一步')
      lines.push('')
      lines.push(list(ra.recommendedCommands))
      lines.push('')
    }

    if (ra.limitations?.length) {
      lines.push('## 缺失信息')
      lines.push('')
      lines.push(list(ra.limitations))
      lines.push('')
    }
  }

  lines.push('## 建议')
  lines.push('')
  lines.push('1. 在卡顿发生时重新运行 spark profiler。')
  lines.push('2. 对比 TPS / MSPT，关注主线程热点。')
  lines.push('3. 不要直接删除所有插件或模组。')
  lines.push('4. 每次只改一项配置并复测。')
  lines.push('')

  return lines.join('\n')
}

// ── Normalize stored markdown for public API ────────────────────

export function normalizeMarkdownReport(params: {
  storedMarkdownReport?: string | null
  aiResultJson?: AiAnalysisOutput | null
  ruleAnalysis?: RuleAnalysisResult | null
  summary?: string | null
  severity?: string | null
}): string {
  const { storedMarkdownReport, aiResultJson, ruleAnalysis, summary, severity } = params

  // 1. If storedMarkdownReport is valid non-JSON markdown, return it
  if (storedMarkdownReport && !looksLikeJsonText(storedMarkdownReport)) {
    return storedMarkdownReport
  }

  // 2. If storedMarkdownReport looks like JSON, try to extract from it
  if (storedMarkdownReport && looksLikeJsonText(storedMarkdownReport)) {
    try {
      const parsed = JSON.parse(storedMarkdownReport)
      if (parsed?.markdown_report && typeof parsed.markdown_report === 'string' && !looksLikeJsonText(parsed.markdown_report)) {
        return parsed.markdown_report
      }
      // If it's a full AI result JSON, build markdown from it
      if (parsed?.one_sentence_summary) {
        return buildMarkdownReportFromAiResult(parsed as AiAnalysisOutput)
      }
    } catch {
      // Can't parse — fall through to fallback
    }
  }

  // 3. If we have aiResultJson, build from it
  if (aiResultJson && aiResultJson.one_sentence_summary) {
    return buildMarkdownReportFromAiResult(aiResultJson)
  }

  // 4. Fallback from rule analysis
  return buildFallbackMarkdownReport({
    summary: summary || '报告内容暂不可用',
    severity: severity || 'normal',
    ruleAnalysis: ruleAnalysis || undefined,
    reason: 'AI_INVALID_JSON',
  })
}
