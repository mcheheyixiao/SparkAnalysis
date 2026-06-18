import { describe, it, expect } from 'vitest'
import {
  aiOutputSchema,
  normalizeBeginnerExplanation,
  normalizeRetestCommands,
  normalizeMissingInfo,
} from '../ai-analysis.service.js'

// ── Test data ──────────────────────────────────────────────────────

const NEW_FORMAT_JSON = {
  one_sentence_summary: 'TPS正常，服务器无明显性能问题',
  severity: 'normal' as const,
  beginner_explanation: {
    summary: '你的服务器目前运行正常',
    details: 'TPS保持在19.8以上，MSPT平均35ms，没有发现主线程阻塞或内存压力。',
  },
  key_evidence: [
    {
      title: 'TPS稳定',
      explanation: 'TPS保持在19.5以上，说明服务器主循环正常',
      confidence: 'high' as const,
    },
    {
      title: 'MSPT正常',
      explanation: 'MSPT平均35ms，远低于50ms警戒线',
      confidence: 'high' as const,
    },
  ],
  suspected_causes: [],
  fix_plan: [
    {
      priority: 1,
      action: '保持当前配置，定期监控',
      difficulty: 'easy' as const,
      risk: 'low' as const,
      expected_effect: '维持当前良好状态',
    },
  ],
  retest_commands: [
    { command: '/spark profiler --timeout 300', description: '在高峰期运行profiler采样5分钟' },
    { command: '/spark health', description: '查看健康报告' },
  ],
  missing_information: [
    { question: '缺少高峰期数据', why: '当前报告可能是在低负载时采集的' },
    { question: '缺少GC详细数据', why: '无法判断GC频率和耗时' },
  ],
  markdown_report: '一些AI生成的markdown...',
}

const OLD_FORMAT_JSON = {
  one_sentence_summary: 'TPS正常，服务器无明显性能问题',
  severity: 'normal' as const,
  beginner_explanation: '你的服务器目前运行正常，TPS保持在19.8以上。',
  key_evidence: [
    {
      title: 'TPS稳定',
      explanation: 'TPS保持在19.5以上',
      confidence: 'high' as const,
    },
  ],
  suspected_causes: [],
  fix_plan: [],
  retest_commands: ['/spark profiler --timeout 300', '/spark health'],
  missing_information: ['缺少高峰期数据', '缺少GC详细数据'],
  markdown_report: '一些AI生成的markdown...',
}

const MIXED_FORMAT_JSON = {
  one_sentence_summary: '混合格式测试',
  severity: 'medium' as const,
  beginner_explanation: '旧版字符串格式的小白解释',
  key_evidence: [],
  suspected_causes: [],
  fix_plan: [],
  retest_commands: [
    { command: '/spark profiler', description: '新版对象格式' },
    '/spark health',  // 旧版字符串格式
  ],
  missing_information: [
    '旧版字符串缺失信息',
    { question: '新版对象缺失信息', why: '需要更多数据' },
  ],
  markdown_report: '',
}

// Sample that mimics what the kPy1L2N05S spark report might produce
const SAMPLE_KPY1L2N05S = {
  one_sentence_summary: '服务器TPS略低，主线程存在一定的区块加载压力',
  severity: 'medium' as const,
  beginner_explanation: {
    summary: '你的服务器TPS偶尔低于19，主要原因是主线程在处理区块加载时有轻微延迟',
    details: '采样数据显示主线程部分时间花在区块加载和实体处理上。',
  },
  key_evidence: [
    {
      title: 'TPS偶尔低于19',
      explanation: '采样期间TPS均值为18.5，最低降至15',
      confidence: 'high' as const,
    },
    {
      title: '主线程区块加载占比',
      explanation: '主线程约15%的时间花在WorldServer.chunkLoad相关调用',
      confidence: 'medium' as const,
    },
  ],
  suspected_causes: [
    {
      rank: 1,
      name: '区块加载压力',
      category: '区块' as const,
      reason: '主线程chunkLoad相关方法占比偏高，可能由于玩家移动或世界生成导致',
      confidence: 'medium' as const,
      how_to_verify: '使用 /spark profiler 在卡顿发生时重新采样，对比 chunk load 占比',
    },
  ],
  fix_plan: [
    {
      priority: 1,
      action: '降低视距（view-distance）至8',
      difficulty: 'easy' as const,
      risk: 'low' as const,
      expected_effect: '减少需要加载的区块数量，预计TPS提升1-2',
    },
    {
      priority: 2,
      action: '安装 Chunky 插件预生成世界',
      difficulty: 'medium' as const,
      risk: 'low' as const,
      expected_effect: '预生成后可大幅减少运行时区块加载',
    },
  ],
  retest_commands: [
    { command: '/spark profiler --timeout 300', description: '在卡顿发生时运行profiler采样5分钟' },
  ],
  missing_information: [
    { question: '缺少完整方法栈', why: '当前采样粒度不足以精确定位chunkLoad内部调用' },
  ],
  markdown_report: '',
}

// ── Tests ──────────────────────────────────────────────────────────

describe('aiOutputSchema', () => {
  describe('new format (canonical)', () => {
    it('should pass Zod validation with new format JSON', () => {
      const result = aiOutputSchema.safeParse(NEW_FORMAT_JSON)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.one_sentence_summary).toBe('TPS正常，服务器无明显性能问题')
        expect(typeof result.data.beginner_explanation).toBe('object')
        expect(result.data.retest_commands).toHaveLength(2)
        expect(result.data.missing_information).toHaveLength(2)
      }
    })

    it('should preserve object beginner_explanation through validation', () => {
      const result = aiOutputSchema.safeParse(NEW_FORMAT_JSON)
      expect(result.success).toBe(true)
      if (result.success) {
        const be = result.data.beginner_explanation
        expect(typeof be).toBe('object')
        if (typeof be === 'object') {
          expect(be.summary).toBe('你的服务器目前运行正常')
          expect(be.details).toBe('TPS保持在19.8以上，MSPT平均35ms，没有发现主线程阻塞或内存压力。')
        }
      }
    })

    it('should preserve object retest_commands through validation', () => {
      const result = aiOutputSchema.safeParse(NEW_FORMAT_JSON)
      expect(result.success).toBe(true)
      if (result.success) {
        const first = result.data.retest_commands[0]
        expect(typeof first).toBe('object')
        if (typeof first === 'object') {
          expect(first.command).toBe('/spark profiler --timeout 300')
          expect(first.description).toBe('在高峰期运行profiler采样5分钟')
        }
      }
    })
  })

  describe('old format (legacy)', () => {
    it('should pass Zod validation with old format JSON', () => {
      const result = aiOutputSchema.safeParse(OLD_FORMAT_JSON)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.one_sentence_summary).toBe('TPS正常，服务器无明显性能问题')
        // Old format beginner_explanation is a string
        expect(typeof result.data.beginner_explanation).toBe('string')
      }
    })

    it('should accept string retest_commands array', () => {
      const result = aiOutputSchema.safeParse(OLD_FORMAT_JSON)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.retest_commands).toHaveLength(2)
        expect(typeof result.data.retest_commands[0]).toBe('string')
      }
    })

    it('should accept string missing_information array', () => {
      const result = aiOutputSchema.safeParse(OLD_FORMAT_JSON)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.missing_information).toHaveLength(2)
        expect(typeof result.data.missing_information[0]).toBe('string')
      }
    })
  })

  describe('mixed format', () => {
    it('should pass Zod validation with mixed old/new formats', () => {
      const result = aiOutputSchema.safeParse(MIXED_FORMAT_JSON)
      expect(result.success).toBe(true)
    })

    it('should handle mixed retest_commands (object + string)', () => {
      const result = aiOutputSchema.safeParse(MIXED_FORMAT_JSON)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.retest_commands).toHaveLength(2)
        expect(typeof result.data.retest_commands[0]).toBe('object')
        expect(typeof result.data.retest_commands[1]).toBe('string')
      }
    })

    it('should handle mixed missing_information (object + string)', () => {
      const result = aiOutputSchema.safeParse(MIXED_FORMAT_JSON)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.missing_information).toHaveLength(2)
        expect(typeof result.data.missing_information[0]).toBe('string')
        expect(typeof result.data.missing_information[1]).toBe('object')
      }
    })
  })

  describe('kPy1L2N05S sample', () => {
    it('should pass Zod validation without triggering fallback', () => {
      const result = aiOutputSchema.safeParse(SAMPLE_KPY1L2N05S)
      expect(result.success).toBe(true)
    })

    it('should have expected severity and evidence', () => {
      const result = aiOutputSchema.safeParse(SAMPLE_KPY1L2N05S)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.severity).toBe('medium')
        expect(result.data.key_evidence).toHaveLength(2)
        expect(result.data.suspected_causes).toHaveLength(1)
        expect(result.data.retest_commands).toHaveLength(1)
        expect(result.data.missing_information).toHaveLength(1)
      }
    })
  })

  describe('edge cases', () => {
    it('should accept empty arrays for all list fields', () => {
      const empty = {
        one_sentence_summary: '空数据',
        severity: 'normal' as const,
        beginner_explanation: { summary: '' },
        key_evidence: [],
        suspected_causes: [],
        fix_plan: [],
        retest_commands: [],
        missing_information: [],
      }
      const result = aiOutputSchema.safeParse(empty)
      expect(result.success).toBe(true)
    })

    it('should accept extra unknown fields (passthrough)', () => {
      const withExtra = {
        ...NEW_FORMAT_JSON,
        extra_field: 'should be ignored',
        another_extra: { nested: true },
      }
      const result = aiOutputSchema.safeParse(withExtra)
      expect(result.success).toBe(true)
    })
  })
})

// ── Normalization tests ────────────────────────────────────────────

describe('normalizeBeginnerExplanation', () => {
  it('should normalize string to object', () => {
    const result = normalizeBeginnerExplanation('简单的解释')
    expect(result).toEqual({ summary: '简单的解释' })
  })

  it('should preserve object with summary only', () => {
    const result = normalizeBeginnerExplanation({ summary: '标题' })
    expect(result).toEqual({ summary: '标题' })
  })

  it('should preserve object with summary and details', () => {
    const result = normalizeBeginnerExplanation({ summary: '标题', details: '详情' })
    expect(result).toEqual({ summary: '标题', details: '详情' })
  })

  it('should handle null/undefined', () => {
    expect(normalizeBeginnerExplanation(null)).toEqual({ summary: '' })
    expect(normalizeBeginnerExplanation(undefined)).toEqual({ summary: '' })
  })
})

describe('normalizeRetestCommands', () => {
  it('should normalize string[] to object[]', () => {
    const result = normalizeRetestCommands(['cmd1', 'cmd2'])
    expect(result).toEqual([
      { command: 'cmd1' },
      { command: 'cmd2' },
    ])
  })

  it('should preserve object[]', () => {
    const result = normalizeRetestCommands([
      { command: 'cmd1', description: 'desc1' },
      { command: 'cmd2' },
    ])
    expect(result).toEqual([
      { command: 'cmd1', description: 'desc1' },
      { command: 'cmd2' },
    ])
  })

  it('should handle mixed array', () => {
    const result = normalizeRetestCommands([
      { command: 'cmd1', description: 'desc1' },
      'cmd2',
    ])
    expect(result).toEqual([
      { command: 'cmd1', description: 'desc1' },
      { command: 'cmd2' },
    ])
  })

  it('should handle non-array', () => {
    expect(normalizeRetestCommands(null)).toEqual([])
    expect(normalizeRetestCommands('not array')).toEqual([])
  })
})

describe('normalizeMissingInfo', () => {
  it('should normalize string[] to object[]', () => {
    const result = normalizeMissingInfo(['信息1', '信息2'])
    expect(result).toEqual([
      { question: '信息1' },
      { question: '信息2' },
    ])
  })

  it('should preserve object[]', () => {
    const result = normalizeMissingInfo([
      { question: '问题1', why: '原因1' },
      { question: '问题2' },
    ])
    expect(result).toEqual([
      { question: '问题1', why: '原因1' },
      { question: '问题2' },
    ])
  })

  it('should handle non-array', () => {
    expect(normalizeMissingInfo(null)).toEqual([])
    expect(normalizeMissingInfo('not array')).toEqual([])
  })
})

describe('full normalization round-trip', () => {
  it('should normalize old format to canonical AiDiagnosisResult', () => {
    const validated = aiOutputSchema.safeParse(OLD_FORMAT_JSON)
    expect(validated.success).toBe(true)
    if (validated.success) {
      // Apply normalizations
      const canonical = {
        one_sentence_summary: validated.data.one_sentence_summary,
        severity: validated.data.severity,
        beginner_explanation: normalizeBeginnerExplanation(validated.data.beginner_explanation),
        key_evidence: validated.data.key_evidence,
        suspected_causes: validated.data.suspected_causes,
        fix_plan: validated.data.fix_plan,
        retest_commands: normalizeRetestCommands(validated.data.retest_commands),
        missing_information: normalizeMissingInfo(validated.data.missing_information),
      }

      // All normalized fields should be objects
      expect(typeof canonical.beginner_explanation).toBe('object')
      expect(canonical.beginner_explanation.summary).toBe('你的服务器目前运行正常，TPS保持在19.8以上。')
      expect(canonical.retest_commands[0]).toEqual({ command: '/spark profiler --timeout 300' })
      expect(canonical.missing_information[0]).toEqual({ question: '缺少高峰期数据' })
    }
  })

  it('should keep new format unchanged through normalization', () => {
    const validated = aiOutputSchema.safeParse(NEW_FORMAT_JSON)
    expect(validated.success).toBe(true)
    if (validated.success) {
      const canonical = {
        one_sentence_summary: validated.data.one_sentence_summary,
        severity: validated.data.severity,
        beginner_explanation: normalizeBeginnerExplanation(validated.data.beginner_explanation),
        key_evidence: validated.data.key_evidence,
        suspected_causes: validated.data.suspected_causes,
        fix_plan: validated.data.fix_plan,
        retest_commands: normalizeRetestCommands(validated.data.retest_commands),
        missing_information: normalizeMissingInfo(validated.data.missing_information),
      }

      expect(canonical.beginner_explanation).toEqual({
        summary: '你的服务器目前运行正常',
        details: 'TPS保持在19.8以上，MSPT平均35ms，没有发现主线程阻塞或内存压力。',
      })
      expect(canonical.retest_commands[0]).toEqual({
        command: '/spark profiler --timeout 300',
        description: '在高峰期运行profiler采样5分钟',
      })
      expect(canonical.missing_information[1]).toEqual({
        question: '缺少GC详细数据',
        why: '无法判断GC频率和耗时',
      })
    }
  })
})
