import { describe, it, expect } from 'vitest'
import { SparkNormalizer } from '../spark-normalizer.service.js'
import { SparkRuleAnalyzer } from '../spark-rule-analyzer.service.js'
import type { SparkRawData, NormalizedSummary, NormalizedEntityDistributionSummary } from '../spark.types.js'

// ── Helpers ──────────────────────────────────────────────────────

function makeSparkRaw(overrides: Partial<any> = {}): SparkRawData {
  return {
    code: 'testCode',
    reportType: 'sampler',
    platform: 'Forge',
    minecraftVersion: '1.19.2',
    rawJson: overrides.raw || null,
  }
}

function normalize(raw: any): NormalizedSummary {
  const normalizer = new SparkNormalizer()
  const rawData = makeSparkRaw({ raw })
  return normalizer.normalize(rawData)
}

// ── 1. Real structure fixture test ──────────────────────────────

describe('Entity Distribution - Real fixture', () => {
  it('should extract entity distribution from spark metadata.platformStatistics.world', () => {
    const raw = {
      type: 'sampler',
      metadata: {
        platformStatistics: {
          world: {
            totalEntities: 1213,
            entityCounts: {
              'minecraft:item': 257,
              'minecraft:skeleton': 91,
              'minecraft:enderman': 77,
            },
            worlds: [
              {
                name: 'overworld',
                totalEntities: 978,
                regions: [
                  {
                    totalEntities: 10,
                    chunks: [
                      {
                        x: 1,
                        z: 2,
                        totalEntities: 10,
                        entityCounts: {
                          'minecraft:item': 8,
                          'minecraft:zombie': 2,
                        },
                      },
                    ],
                  },
                ],
              },
            ],
          },
        },
      },
    }

    const result = normalize(raw)
    const dist = result.health.entityDistribution

    expect(dist).toBeDefined()
    expect(dist!.totalEntities).toBe(1213)
    expect(dist!.totalTypes).toBe(3)
    expect(dist!.globalTopTypes[0].type).toBe('minecraft:item')
    expect(dist!.globalTopTypes[0].count).toBe(257)
    expect(dist!.globalTopTypes[0].ratio).toBeCloseTo(0.2119, 2)

    // World
    expect(dist!.worlds).toHaveLength(1)
    expect(dist!.worlds[0].world).toBe('overworld')
    expect(dist!.worlds[0].totalEntities).toBe(978)

    // Hot chunks
    expect(dist!.hotChunks).toBeDefined()
    expect(dist!.hotChunks![0].chunkX).toBe(1)
    expect(dist!.hotChunks![0].chunkZ).toBe(2)
    expect(dist!.hotChunks![0].approxBlockX).toBe(16)
    expect(dist!.hotChunks![0].approxBlockZ).toBe(32)
    expect(dist!.hotChunks![0].totalEntities).toBe(10)
    expect(dist!.hotChunks![0].topTypes[0].type).toBe('minecraft:item')
    expect(dist!.hotChunks![0].topTypes[0].count).toBe(8)
  })
})

// ── 2. Summarization test ───────────────────────────────────────

describe('Entity Distribution - Summarization', () => {
  it('should limit globalTopTypes to 15 and world topTypes to 10', () => {
    // Construct 25 entity types
    const entityCounts: Record<string, number> = {}
    for (let i = 1; i <= 25; i++) {
      entityCounts[`minecraft:entity_${i}`] = 100 - i
    }
    // Total = 100+99+...+76 = (100+76)*25/2 = 2200
    const totalEntities = 2200

    const raw = {
      type: 'sampler',
      metadata: {
        platformStatistics: {
          world: {
            totalEntities,
            entityCounts,
            worlds: [
              {
                name: 'overworld',
                totalEntities: 1500,
                regions: [
                  {
                    totalEntities: 100,
                    chunks: [
                      ...Array.from({ length: 18 }, (_, i) => ({
                        x: i,
                        z: i + 1,
                        totalEntities: 10 * (i + 1),
                        entityCounts: {
                          [`minecraft:entity_${i + 1}`]: 10 * (i + 1),
                        },
                      })),
                    ],
                  },
                ],
              },
            ],
          },
        },
      },
    }

    const result = normalize(raw)
    const dist = result.health.entityDistribution

    expect(dist).toBeDefined()

    // Global top types limited to 15
    expect(dist!.globalTopTypes.length).toBeLessThanOrEqual(15)
    expect(dist!.totalTypes).toBe(25)

    // World top types limited to 10 (aggregated from chunks, so 18 types)
    const overworld = dist!.worlds.find(w => w.world === 'overworld')
    expect(overworld).toBeDefined()
    expect(overworld!.topTypes.length).toBeLessThanOrEqual(10)
    expect(overworld!.otherTypesCount).toBeGreaterThan(0)
    expect(overworld!.otherEntitiesTotal).toBeGreaterThan(0)
  })
})

// ── 3. Risk identification test ─────────────────────────────────

describe('Entity Distribution - Risk identification', () => {
  it('should classify high-risk entities correctly', () => {
    const raw = {
      type: 'sampler',
      metadata: {
        platformStatistics: {
          world: {
            totalEntities: 3000,
            entityCounts: {
              'minecraft:item': 1200,
              'minecraft:villager': 350,
              'minecraft:experience_orb': 600,
              'minecraft:armor_stand': 520,
              'minecraft:item_frame': 510,
              'minecraft:glow_item_frame': 490,
              'lootr:lootr_minecart': 350,
              'minecraft:cow': 50,
              'minecraft:pig': 30,
            },
          },
        },
      },
    }

    const result = normalize(raw)
    const dist = result.health.entityDistribution

    expect(dist).toBeDefined()

    const findType = (type: string) =>
      dist!.globalTopTypes.find(t => t.type === type)

    expect(findType('minecraft:item')!.riskLevel).toBe('high')
    expect(findType('minecraft:villager')!.riskLevel).toBe('high')
    expect(findType('minecraft:experience_orb')!.riskLevel).toBe('high')
    expect(findType('minecraft:armor_stand')!.riskLevel).toBe('high')
    expect(findType('minecraft:item_frame')!.riskLevel).toBe('high')
    expect(findType('lootr:lootr_minecart')!.riskLevel).toBe('high')

    // Verify risk flags
    expect(dist!.riskFlags).toContain('minecraft:item')
    expect(dist!.riskFlags).toContain('minecraft:villager')
    expect(dist!.riskFlags).toContain('minecraft:experience_orb')
    expect(dist!.riskFlags).toContain('实体总数超过1000，需观察')
  })
})

// ── 4. Medium risk test (real test.json data level) ─────────────

describe('Entity Distribution - Medium risk (real data level)', () => {
  it('should classify minecraft:item=257 as medium risk', () => {
    const raw = {
      type: 'sampler',
      metadata: {
        platformStatistics: {
          world: {
            totalEntities: 1213,
            entityCounts: {
              'minecraft:item': 257,
              'minecraft:skeleton': 91,
            },
          },
        },
      },
    }

    const result = normalize(raw)
    const dist = result.health.entityDistribution

    expect(dist).toBeDefined()

    const itemStat = dist!.globalTopTypes.find(t => t.type === 'minecraft:item')
    expect(itemStat).toBeDefined()
    expect(itemStat!.riskLevel).toBe('medium')
    expect(itemStat!.riskReason).toContain('掉落物数量偏高')

    // 1213 total entities → low/context risk, no severe flag
    expect(dist!.riskFlags).toContain('实体总数超过1000，需观察')
    expect(dist!.riskFlags).not.toContain('实体总数过高')
  })
})

// ── 5. No entity distribution does not break normalize ──────────

describe('Entity Distribution - No data fallback', () => {
  it('should return undefined entityDistribution when no entity data exists', () => {
    const raw = {
      type: 'sampler',
      metadata: {
        platformStatistics: {
          tps: { last1m: 18.5, last5m: 19.0, last15m: 19.2 },
          playerCount: 5,
          memory: { heap: { used: 4176988672, committed: 6836715520 } },
        },
      },
    }

    const result = normalize(raw)

    // Entity distribution should be undefined
    expect(result.health.entityDistribution).toBeUndefined()

    // But other health data should still be extracted
    expect(result.health.tps).toBeDefined()
    expect(result.health.tps!.latest).toBe(18.5)
    expect(result.health.playerCount).toBe(5)
    expect(result.health.memory).toBeDefined()
    // Verify no exceptions — normalizer produced valid output
    expect(result.code).toBe('testCode')
  })

  it('should survive invalid entityCounts without breaking', () => {
    const raw = {
      type: 'sampler',
      metadata: {
        platformStatistics: {
          world: {
            totalEntities: 100,
            entityCounts: {
              '': 50,
              '[object Object]': 100,
              'minecraft:valid': -1,
              'minecraft:item': 0,
            },
          },
        },
      },
    }

    const result = normalize(raw)
    const dist = result.health.entityDistribution

    // Should exist with totalEntities but no valid types
    expect(dist).toBeDefined()
    expect(dist!.totalEntities).toBe(100)
    // All entries should be filtered out (empty key, [object Object], count <= 0)
    expect(dist!.totalTypes).toBe(0)
    expect(dist!.globalTopTypes).toHaveLength(0)
  })
})

// ── 6. RuleAnalyzer tests ───────────────────────────────────────

describe('RuleAnalyzer - Entity distribution', () => {
  function makeDistSummary(overrides: Partial<NormalizedEntityDistributionSummary> = {}): NormalizedEntityDistributionSummary {
    return {
      totalEntities: overrides.totalEntities ?? 100,
      totalTypes: overrides.totalTypes ?? 2,
      worlds: overrides.worlds ?? [],
      globalTopTypes: overrides.globalTopTypes ?? [],
      riskFlags: overrides.riskFlags ?? [],
      ...overrides,
    }
  }

  function makeBaseData(dist: NormalizedEntityDistributionSummary | undefined): NormalizedSummary {
    return {
      code: 'testCode',
      reportType: 'sampler',
      server: {},
      timing: {},
      health: {
        entityDistribution: dist,
      },
      profiler: {
        threads: [],
        sources: [],
        suspiciousMethods: [],
      },
      limitations: [],
    }
  }

  it('should flag totalEntities >= 10000 as high confidence', () => {
    const analyzer = new SparkRuleAnalyzer()
    const dist = makeDistSummary({ totalEntities: 12000 })
    const data = makeBaseData(dist)

    const result = analyzer.analyze(data)

    const evidence = result.evidence.find(e => e.title.includes('实体总数过高'))
    expect(evidence).toBeDefined()
    expect(evidence!.confidence).toBe('high')
    expect(evidence!.canBeRootCause).toBe(true)

    const cause = result.suspectedCauses.find(c => c.category === 'entity' && c.name.includes('实体数量过高'))
    expect(cause).toBeDefined()
    expect(cause!.confidence).toBe('high')

    expect(result.recommendedCommands.some(c => c.includes('health') || c.includes('profiler'))).toBe(true)
  })

  it('should flag totalEntities >= 5000 as medium confidence', () => {
    const analyzer = new SparkRuleAnalyzer()
    const dist = makeDistSummary({ totalEntities: 6000 })
    const data = makeBaseData(dist)

    const result = analyzer.analyze(data)

    const evidence = result.evidence.find(e => e.title.includes('实体总数偏高'))
    expect(evidence).toBeDefined()
    expect(evidence!.confidence).toBe('medium')

    const cause = result.suspectedCauses.find(c => c.category === 'entity' && c.name.includes('实体数量偏高'))
    expect(cause).toBeDefined()
    expect(cause!.confidence).toBe('medium')
  })

  it('should flag totalEntities >= 1000 as low confidence only', () => {
    const analyzer = new SparkRuleAnalyzer()
    const dist = makeDistSummary({ totalEntities: 1500 })
    const data = makeBaseData(dist)

    const result = analyzer.analyze(data)

    const evidence = result.evidence.find(e => e.title.includes('观察线索'))
    expect(evidence).toBeDefined()
    expect(evidence!.confidence).toBe('low')
    expect(evidence!.canBeRootCause).toBe(false)

    // Should NOT add a suspected cause for low confidence
    const entityCauses = result.suspectedCauses.filter(c => c.category === 'entity')
    expect(entityCauses).toHaveLength(0)
  })

  it('should flag high-risk entity types', () => {
    const analyzer = new SparkRuleAnalyzer()
    const dist = makeDistSummary({
      totalEntities: 2000,
      globalTopTypes: [
        {
          type: 'minecraft:item',
          count: 1200,
          riskLevel: 'high',
          riskReason: '掉落物数量极高，可能造成实体 tick 压力',
          ratio: 0.6,
        },
        {
          type: 'minecraft:skeleton',
          count: 91,
          riskLevel: undefined,
          ratio: 0.0455,
        },
      ],
    })
    const data = makeBaseData(dist)

    const result = analyzer.analyze(data)

    const evidence = result.evidence.find(e => e.title.includes('高风险实体类型集中'))
    expect(evidence).toBeDefined()
    expect(evidence!.confidence).toBe('high')

    const cause = result.suspectedCauses.find(c => c.name.includes('高风险实体类型堆积'))
    expect(cause).toBeDefined()
    expect(cause!.confidence).toBe('high')
  })

  it('should NOT add entity evidence when entityDistribution is undefined', () => {
    const analyzer = new SparkRuleAnalyzer()
    const data = makeBaseData(undefined)

    const result = analyzer.analyze(data)

    const entityEvidence = result.evidence.filter(e =>
      e.title.includes('实体') || e.type === 'system_metric' && e.detail.includes('entity')
    )
    // No entity-specific evidence should be generated
    expect(entityEvidence).toHaveLength(0)
  })
})
