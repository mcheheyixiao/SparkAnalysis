import { describe, it, expect } from 'vitest'
import { SparkNormalizer } from '../src/modules/spark/spark-normalizer.service.js'
import type { SparkRawData } from '../src/modules/spark/spark.types.js'

function makeRaw(overrides: Partial<SparkRawData> = {}): SparkRawData {
  return {
    code: 'test123',
    reportType: 'health',
    rawJson: {},
    ...overrides,
  }
}

// ---- Tests ----

describe('SparkNormalizer', () => {
  const normalizer = new SparkNormalizer()

  describe('Health extraction', () => {
    it('should extract TPS from top-level health.tps', () => {
      const raw = makeRaw({
        reportType: 'health',
        rawJson: {
          health: {
            tps: { last1m: 19.8, avg: 19.5, min: 15.0, max: 20.0 },
          },
        },
      })
      const result = normalizer.normalize(raw)
      expect(result.health.tps?.latest).toBe(19.8)
      expect(result.health.tps?.mean).toBe(19.5)
      expect(result.health.tps?.min).toBe(15.0)
      expect(result.health.tps?.max).toBe(20.0)
    })

    it('should extract TPS from deep data.tps path', () => {
      const raw = makeRaw({
        reportType: 'health',
        rawJson: {
          data: {
            tps: { mean: 16.0, min: 8.0, max: 20.0 },
          },
        },
      })
      const result = normalizer.normalize(raw)
      expect(result.health.tps?.mean).toBe(16.0)
    })

    it('should extract MSPT from health.mspt', () => {
      const raw = makeRaw({
        reportType: 'health',
        rawJson: {
          health: {
            mspt: { mean: 35.2, median: 32.1, p95: 48.0, max: 55.0 },
          },
        },
      })
      const result = normalizer.normalize(raw)
      expect(result.health.mspt?.mean).toBe(35.2)
      expect(result.health.mspt?.median).toBe(32.1)
      expect(result.health.mspt?.p95).toBe(48.0)
    })

    it('should extract memory with bytes-to-MB conversion', () => {
      const raw = makeRaw({
        reportType: 'health',
        rawJson: {
          health: {
            memory: { used: 2147483648, max: 4294967296 },
          },
        },
      })
      const result = normalizer.normalize(raw)
      expect(result.health.memory?.usedMB).toBe(2048)
      expect(result.health.memory?.maxMB).toBe(4096)
    })

    it('should not convert already-MB memory values', () => {
      const raw = makeRaw({
        reportType: 'health',
        rawJson: {
          health: {
            memory: { used: 512, max: 1024 },
          },
        },
      })
      const result = normalizer.normalize(raw)
      // Values < 1000 are treated as MB already
      expect(result.health.memory?.usedMB).toBe(512)
    })

    it('should extract CPU from health.cpu', () => {
      const raw = makeRaw({
        reportType: 'health',
        rawJson: {
          health: {
            cpu: { process: 45.0, system: 12.0 },
          },
        },
      })
      const result = normalizer.normalize(raw)
      expect(result.health.cpu?.process).toBe(45.0)
    })

    it('should add limitation when no health data in health report', () => {
      const raw = makeRaw({
        reportType: 'health',
        rawJson: { metadata: { platform: { name: 'Paper' } } },
      })
      const result = normalizer.normalize(raw)
      expect(result.health.tps).toBeUndefined()
      expect(result.limitations).toContainEqual(
        expect.stringContaining('未从 raw/full 数据中提取到 TPS')
      )
    })

    it('should provide debug info with top-level keys', () => {
      const raw = makeRaw({
        rawJson: { metadata: {}, health: { tps: { mean: 20 } } },
      })
      const result = normalizer.normalize(raw)
      expect(result.debug).toBeDefined()
      expect(result.debug!.rawTopLevelKeys).toContain('metadata')
      expect(result.debug!.rawTopLevelKeys).toContain('health')
      expect(result.debug!.extractionHints).toBeDefined()
    })
  })

  describe('Profiler extraction', () => {
    it('should extract threads from object format', () => {
      const raw = makeRaw({
        reportType: 'sampler',
        rawJson: {
          sampler: {
            threads: {
              'Server thread': {
                totalPercent: 75.5,
                methods: [
                  { name: 'tick', percent: 45.2 },
                ],
              },
              'Netty Epoll': {
                totalPercent: 8.2,
                methods: [
                  { name: 'eventLoop', percent: 6.1 },
                ],
              },
            },
          },
        },
      })
      const result = normalizer.normalize(raw)
      expect(result.profiler.threads).toHaveLength(2)
      const mainThread = result.profiler.threads.find(t => t.type === 'main')
      expect(mainThread).toBeDefined()
      expect(mainThread!.totalPercent).toBe(75.5)
      expect(mainThread!.topMethods).toHaveLength(1)
      expect(mainThread!.topMethods![0].name).toBe('tick')
    })

    it('should extract threads from array format', () => {
      const raw = makeRaw({
        reportType: 'sampler',
        rawJson: {
          threads: [
            { name: 'Server thread', percent: 65.0, children: [{ name: 'tick', percent: 40.0 }] },
            { name: 'Worker-1', percent: 10.0 },
          ],
        },
      })
      const result = normalizer.normalize(raw)
      expect(result.profiler.threads).toHaveLength(2)
      expect(result.profiler.threads[0].name).toBe('Server thread')
      expect(result.profiler.threads[0].totalPercent).toBe(65.0)
    })

    it('should extract threads from full data (merged)', () => {
      const raw = makeRaw({
        reportType: 'sampler',
        rawJson: {
          metadata: {},
          full: {
            profiler: {
              threads: [
                { name: 'Server thread', percent: 70.0, children: [] },
              ],
            },
          },
        },
      })
      const result = normalizer.normalize(raw)
      expect(result.profiler.threads).toHaveLength(1)
      expect(result.profiler.threads[0].name).toBe('Server thread')
    })

    it('should extract sources', () => {
      const raw = makeRaw({
        reportType: 'sampler',
        rawJson: {
          sampler: {
            sources: {
              'net.minecraft.server': { percent: 55.0 },
              'net.minecraftforge': { percent: 8.0 },
            },
          },
        },
      })
      const result = normalizer.normalize(raw)
      expect(result.profiler.sources).toHaveLength(2)
      const modSource = result.profiler.sources.find(s => s.type === 'mod')
      expect(modSource).toBeDefined()
    })

    it('should add limitation for sampler without thread/source data', () => {
      const raw = makeRaw({
        reportType: 'sampler',
        rawJson: { metadata: { platform: { name: 'Paper' } } },
      })
      const result = normalizer.normalize(raw)
      expect(result.profiler.threads).toHaveLength(0)
      expect(result.limitations).toContainEqual(
        expect.stringContaining('未从 raw/full 数据中提取到 sampler/profiler 线程数据')
      )
    })
  })

  describe('Server info extraction', () => {
    it('should extract platform from metadata.platform.name', () => {
      const raw = makeRaw({
        rawJson: {
          metadata: { platform: { name: 'Paper', version: '1.20.4' } },
        },
      })
      const result = normalizer.normalize(raw)
      expect(result.server.platform).toBe('Paper')
      expect(result.server.minecraftVersion).toBe('1.20.4')
    })

    it('should extract platform from nested platform object', () => {
      const raw = makeRaw({
        rawJson: {
          platform: { name: 'Purpur', version: '1.21' },
        },
      })
      const result = normalizer.normalize(raw)
      expect(result.server.platform).toBe('Purpur')
    })

    it('should use rawData fields as fallback', () => {
      const raw = makeRaw({
        reportType: 'health',
        platform: 'Spigot',
        minecraftVersion: '1.19.4',
        sparkVersion: '1.9.0',
        rawJson: { metadata: {} },
      })
      const result = normalizer.normalize(raw)
      expect(result.server.platform).toBe('Spigot')
      expect(result.server.minecraftVersion).toBe('1.19.4')
    })
  })

  describe('GC extraction (P6)', () => {
    it('should extract GC from metadata.platformStatistics.gc (object format)', () => {
      const raw = makeRaw({
        reportType: 'sampler',
        rawJson: {
          metadata: {
            platformStatistics: {
              gc: {
                'G1 Young Generation': { total: 30, avgTime: 23.07 },
                'G1 Old Generation': { total: 0, avgTime: 0 },
              },
            },
          },
        },
      })
      const result = normalizer.normalize(raw)
      expect(result.health.gc).toBeDefined()
      expect(result.health.gc!.collectors).toHaveLength(2)
      const young = result.health.gc!.collectors.find(c => c.name === 'G1 Young Generation')
      expect(young).toBeDefined()
      expect(young!.collections).toBe(30)
      expect(young!.averageTimeMs).toBeCloseTo(23.07)
      const old = result.health.gc!.collectors.find(c => c.name === 'G1 Old Generation')
      expect(old).toBeDefined()
      expect(old!.collections).toBe(0)
      expect(result.health.gc!.hasOldGc).toBe(false)
    })

    it('should extract GC from metadata.platformStatistics.gc (array format)', () => {
      const raw = makeRaw({
        reportType: 'sampler',
        rawJson: {
          metadata: {
            platformStatistics: {
              gc: [
                { name: 'G1 Young Generation', collections: 100, timeMs: 4567 },
                { name: 'G1 Old Generation', collections: 5, timeMs: 1200 },
              ],
            },
          },
        },
      })
      const result = normalizer.normalize(raw)
      expect(result.health.gc).toBeDefined()
      expect(result.health.gc!.collectors).toHaveLength(2)
      expect(result.health.gc!.hasOldGc).toBe(true)
      expect(result.health.gc!.totalCollections).toBe(105)
    })

    it('should extract GC from nested collectors format', () => {
      const raw = makeRaw({
        reportType: 'sampler',
        rawJson: {
          metadata: {
            platformStatistics: {
              gc: {
                collectors: [
                  { name: 'G1 Young Generation', collections: 50, timeMs: 2000 },
                ],
              },
            },
          },
        },
      })
      const result = normalizer.normalize(raw)
      expect(result.health.gc).toBeDefined()
      expect(result.health.gc!.collectors).toHaveLength(1)
      expect(result.health.gc!.collectors[0].name).toBe('G1 Young Generation')
      expect(result.health.gc!.collectors[0].collections).toBe(50)
    })

    it('should not return empty GC object when no GC data exists', () => {
      const raw = makeRaw({
        reportType: 'health',
        rawJson: { metadata: { platform: { name: 'Paper' } } },
      })
      const result = normalizer.normalize(raw)
      expect(result.health.gc).toBeUndefined()
    })

    it('should not say "missing GC" when GC data is present', () => {
      const raw = makeRaw({
        reportType: 'sampler',
        rawJson: {
          metadata: {
            platformStatistics: {
              gc: {
                'G1 Young Generation': { total: 10, avgTime: 15.0 },
              },
            },
          },
        },
      })
      const result = normalizer.normalize(raw)
      // GC should be extracted, not empty
      expect(result.health.gc).toBeDefined()
      expect(result.health.gc!.collectors).toBeDefined()
      expect(result.health.gc!.collectors!.length).toBeGreaterThan(0)
    })
  })

  describe('Util: toNumber', () => {
    it('should convert valid numbers', () => {
      const n = (normalizer as any).toNumber('19.5')
      expect(n).toBe(19.5)
    })

    it('should return undefined for invalid', () => {
      expect((normalizer as any).toNumber(undefined)).toBeUndefined()
      expect((normalizer as any).toNumber('abc')).toBeUndefined()
    })
  })

  describe('Util: bytesToMB', () => {
    it('should convert large byte values to MB', () => {
      expect((normalizer as any).bytesToMB(2147483648)).toBe(2048)
    })

    it('should keep small values as-is', () => {
      expect((normalizer as any).bytesToMB(512)).toBe(512)
    })
  })
})
