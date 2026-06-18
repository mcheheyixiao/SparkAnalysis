import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { SparkRuleAnalyzer } from '../../spark/spark-rule-analyzer.service.js'
import type { NormalizedSummary } from '../../spark/spark.types.js'
import { promptBuilder } from '../prompt-builder.service.js'
import {
  aiOutputSchema,
  normalizeBeginnerExplanation,
  normalizeRetestCommands,
  normalizeMissingInfo,
} from '../ai-analysis.service.js'
import { buildMarkdownReportFromAiResult } from '../../reports/markdown-report.builder.js'
import type { AiDiagnosisResult } from '../ai.types.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

function loadKPy1L2N05SFixture(): NormalizedSummary {
  const raw = readFileSync(
    resolve(__dirname, '../../../../tests/fixtures/spark/kPy1L2N05S.normalized.fixture.json'),
    'utf-8',
  )
  return JSON.parse(raw) as NormalizedSummary
}

describe('AI Pipeline Integration (kPy1L2N05S)', () => {
  const fixture = loadKPy1L2N05SFixture()
  const analyzer = new SparkRuleAnalyzer()
  const ruleAnalysis = analyzer.analyze(fixture)

  describe('Prompt building with evidence context', () => {
    it('should build prompts without throwing', async () => {
      const prompts = await promptBuilder.build(fixture, ruleAnalysis, 'sampler')
      expect(prompts.systemPrompt).toBeTruthy()
      expect(prompts.userPrompt).toBeTruthy()
      expect(prompts.jsonSchema).toBeTruthy()
    })

    it('should include evidence context with TPS in user prompt', async () => {
      const prompts = await promptBuilder.build(fixture, ruleAnalysis, 'sampler')
      // Evidence context should contain TPS data
      expect(prompts.userPrompt).toContain('证据上下文')
      expect(prompts.userPrompt).toContain('TPS')
      expect(prompts.userPrompt).toContain('13.949')
    })

    it('should include evidence context with MSPT in user prompt', async () => {
      const prompts = await promptBuilder.build(fixture, ruleAnalysis, 'sampler')
      expect(prompts.userPrompt).toContain('MSPT')
    })

    it('should include evidence context with main thread methods', async () => {
      const prompts = await promptBuilder.build(fixture, ruleAnalysis, 'sampler')
      expect(prompts.userPrompt).toContain('主线程 Top 方法')
    })

    it('should include evidence context with limitations', async () => {
      const prompts = await promptBuilder.build(fixture, ruleAnalysis, 'sampler')
      expect(prompts.userPrompt).toContain('已知数据限制')
    })

    it('should include source confidence summary', async () => {
      const prompts = await promptBuilder.build(fixture, ruleAnalysis, 'sampler')
      expect(prompts.userPrompt).toContain('来源置信度摘要')
    })
  })

  describe('Schema acceptance for simulated AI responses', () => {
    it('should accept new-format JSON (object beginner_explanation, object retest_commands)', () => {
      const simulatedNewFormat = {
        one_sentence_summary: '服务器TPS偏低(13.95)，MSPT偏高，主线程存在压力但具体根因需要更多profiler数据',
        severity: 'high' as const,
        beginner_explanation: {
          summary: '你的Forge模组服TPS只有13.95，玩家可能感受到延迟和卡顿',
          details: 'MSPT最高达到120ms以上，远超50ms的警戒线。主线程堆栈显示部分时间花在实体tick和区块相关操作上，但缺少细粒度的profiler方法栈数据，无法准确判定是哪个模组导致的。建议在卡顿时运行/spark profiler采集更详细的方法级调用树。',
        },
        key_evidence: [
          {
            title: 'TPS仅13.95',
            explanation: '远低于正常值20，服务器每秒只能完成约14个游戏tick',
            confidence: 'high' as const,
          },
          {
            title: 'MSPT平均71.6ms，最大120ms+',
            explanation: '每次tick平均耗时71.6ms，远超50ms警戒线，最大尖刺超过120ms',
            confidence: 'high' as const,
          },
        ],
        suspected_causes: [
          {
            rank: 1,
            name: '主线程负载过高',
            category: '未知' as const,
            reason: 'TPS和MSPT指标明确显示主线程处理能力不足，但缺少profiler方法级调用树，无法定位具体来源',
            confidence: 'medium' as const,
            how_to_verify: '运行 /spark profiler --timeout 300 在卡顿时采集方法级调用树',
          },
        ],
        fix_plan: [
          {
            priority: 1,
            action: '运行 profiler 采集方法级数据',
            difficulty: 'easy' as const,
            risk: 'low' as const,
            expected_effect: '获取主线程热点方法，精确定位瓶颈来源',
          },
          {
            priority: 2,
            action: '检查并优化实体数量和AI',
            difficulty: 'medium' as const,
            risk: 'low' as const,
            expected_effect: '减少实体tick对主线程的占用',
          },
        ],
        retest_commands: [
          { command: '/spark profiler --timeout 300', description: '在卡顿时采集5分钟profiler' },
          { command: '/spark health', description: '查看当前健康状态' },
        ],
        missing_information: [
          { question: '缺少profiler方法级调用树', why: '无法判断主线程热点具体来自哪个模组的方法' },
          { question: '缺少GC数据', why: '无法判断是否存在GC压力' },
          { question: '缺少在线人数', why: '无法判断当前负载是否正常' },
        ],
      }

      const result = aiOutputSchema.safeParse(simulatedNewFormat)
      expect(result.success).toBe(true)
    })

    it('should accept old-format JSON (string beginner_explanation, string[] arrays)', () => {
      const simulatedOldFormat = {
        one_sentence_summary: 'TPS偏低，服务器存在性能压力',
        severity: 'high' as const,
        beginner_explanation: '你的服务器TPS只有13.95，低于正常值20，玩家可能感觉到延迟',
        key_evidence: [],
        suspected_causes: [],
        fix_plan: [],
        retest_commands: ['/spark profiler', '/spark health'],
        missing_information: ['缺少profiler数据', '缺少GC数据'],
      }

      const result = aiOutputSchema.safeParse(simulatedOldFormat)
      expect(result.success).toBe(true)
    })

    it('should NOT fallback for valid new-format JSON (the core fix)', () => {
      // This simulates what the AI would actually return with the upgraded prompt.
      // The test name is key: this is the exact scenario that was broken before.
      const simulatedAiOutput = {
        one_sentence_summary: 'TPS偏低，MSPT超标，需要profiler精确定位',
        severity: 'high',
        beginner_explanation: {
          summary: '服务器性能压力较大',
          details: 'TPS仅13.95，MSPT平均71.6ms，建议进一步排查',
        },
        key_evidence: [
          { title: 'TPS偏低', explanation: '均值13.95', confidence: 'high' },
        ],
        suspected_causes: [
          { rank: 1, name: '主线程压力', category: '未知', reason: 'MSPT超标', confidence: 'medium', how_to_verify: '运行profiler' },
        ],
        fix_plan: [
          { priority: 1, action: '运行profiler采集详细数据', difficulty: 'easy', risk: 'low', expected_effect: '精确定位瓶颈' },
        ],
        retest_commands: [
          { command: '/spark profiler --timeout 300', description: '采集详细profiler' },
        ],
        missing_information: [
          { question: '缺少方法级调用树', why: '无法定位具体瓶颈' },
        ],
      }

      const result = aiOutputSchema.safeParse(simulatedAiOutput)
      // If this fails, the fallback would trigger — this MUST succeed
      expect(result.success).toBe(true)

      // Verify all required fields are present
      if (result.success) {
        const data = result.data
        expect(data.one_sentence_summary).toBeTruthy()
        expect(data.severity).toBe('high')
        expect(data.key_evidence.length).toBeGreaterThan(0)
        expect(data.retest_commands.length).toBeGreaterThan(0)
      }
    })

    it('should normalize old-format to canonical and generate valid markdown', () => {
      const simulatedOldFormat = {
        one_sentence_summary: 'TPS偏低，MSPT超标',
        severity: 'high' as const,
        beginner_explanation: '服务器TPS仅13.95',
        key_evidence: [
          { title: 'TPS偏低', explanation: '13.95', confidence: 'high' as const },
        ],
        suspected_causes: [
          { rank: 1, name: '主线程压力', category: '未知', reason: 'MSPT高', confidence: 'medium' as const, how_to_verify: '运行profiler' },
        ],
        fix_plan: [
          { priority: 1, action: '采集profiler', difficulty: 'easy' as const, risk: 'low' as const, expected_effect: '定位瓶颈' },
        ],
        retest_commands: ['/spark profiler'],
        missing_information: ['缺少profiler方法栈'],
      }

      const validated = aiOutputSchema.safeParse(simulatedOldFormat)
      expect(validated.success).toBe(true)
      if (!validated.success) return

      // Normalize to canonical
      const canonical: AiDiagnosisResult = {
        one_sentence_summary: validated.data.one_sentence_summary,
        severity: validated.data.severity,
        beginner_explanation: normalizeBeginnerExplanation(validated.data.beginner_explanation),
        key_evidence: validated.data.key_evidence,
        suspected_causes: validated.data.suspected_causes,
        fix_plan: validated.data.fix_plan,
        retest_commands: normalizeRetestCommands(validated.data.retest_commands),
        missing_information: normalizeMissingInfo(validated.data.missing_information),
      }

      // Verify normalization
      expect(typeof canonical.beginner_explanation).toBe('object')
      expect(canonical.beginner_explanation.summary).toBe('服务器TPS仅13.95')
      expect(canonical.retest_commands[0]).toEqual({ command: '/spark profiler' })
      expect(canonical.missing_information[0]).toEqual({ question: '缺少profiler方法栈' })

      // Generate markdown from canonical
      const markdown = buildMarkdownReportFromAiResult(canonical)
      expect(markdown).toContain('# 总结')
      expect(markdown).toContain('TPS偏低，MSPT超标')
      expect(markdown).toContain('## 小白解释')
      expect(markdown).toContain('## 关键证据')
      expect(markdown).toContain('## 疑似原因')
      expect(markdown).toContain('## 修复建议')
      expect(markdown).toContain('## 复测命令')
      expect(markdown).toContain('## 缺失信息')

      // Must NOT be JSON
      expect(markdown.trim().startsWith('{')).toBe(false)
      expect(markdown.trim().startsWith('[')).toBe(false)
    })
  })
})
