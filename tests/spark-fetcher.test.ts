import { describe, it, expect } from 'vitest'
import { SparkFetcher } from '../src/modules/spark/spark-fetcher.service.js'

// Access private methods for testing via type assertion
function makeFetcher() {
  return new SparkFetcher() as any
}

// ---- Fixtures ----

const healthFixtureTopLevel = {
  metadata: {
    platform: { name: 'Paper', version: '1.20.4' },
    sparkVersion: '1.10.0',
    durationSeconds: 120,
  },
  health: {
    tps: { last1m: 19.8, avg: 19.5, min: 15.0, max: 20.0 },
    mspt: { mean: 35.2, median: 32.1, p95: 48.0, max: 55.0 },
    cpu: { process: 45.0, system: 12.0 },
    memory: { used: 2147483648, max: 4294967296 },
  },
}

const samplerFixtureTopLevel = {
  metadata: {
    platform: { name: 'Purpur', version: '1.21' },
  },
  sampler: {
    threads: {
      'Server thread': {
        totalPercent: 75.5,
        methods: [
          { name: 'tick', percent: 45.2, packageName: 'net.minecraft.server' },
          { name: 'tickEntity', percent: 12.3, packageName: 'net.minecraft.server' },
        ],
      },
      'Netty Epoll': {
        totalPercent: 8.2,
        methods: [{ name: 'eventLoop', percent: 6.1 }],
      },
    },
    sources: {
      'net.minecraft.server': { percent: 55.0 },
      'net.minecraftforge': { percent: 8.0 },
    },
  },
}

const heapFixture = {
  metadata: { type: 'heap' },
  heap: {
    objects: 150000,
    classes: 8500,
  },
}

const profilerWithThreads = {
  type: 'profiler',
  threads: [
    { name: 'Server thread', percent: 65.0, children: [{ name: 'tick', percent: 40.0 }] },
    { name: 'Worker-1', percent: 10.0 },
  ],
}

const deepTpsFixture = {
  metadata: {
    platform: { name: 'Folia', version: '1.20.6' },
  },
  data: {
    tps: { mean: 17.5, min: 10.0, max: 20.0 },
  },
}

const mergedFixture = {
  metadata: { platform: { name: 'Paper', version: '1.20.4' } },
  full: {
    type: 'profiler',
    profiler: {
      threads: [
        { name: 'Server thread', percent: 70.0, children: [{ name: 'tick', percent: 50.0 }] },
      ],
    },
  },
}

const unknownFixtureEmpty = {
  metadata: { platform: { name: 'Unknown' } },
}

const metadataTypeSampler = {
  metadata: { type: 'sampler', platform: { name: 'Paper' } },
}

const metadataTypeHealth = {
  metadata: { type: 'health', platform: { name: 'Spigot' } },
}

// ---- Tests ----

describe('SparkFetcher — report type detection', () => {
  const fetcher = makeFetcher()

  describe('detectReportType (private)', () => {
    it('should detect health from top-level health.tps', () => {
      expect(fetcher.detectReportType(healthFixtureTopLevel)).toBe('health')
    })

    it('should detect sampler from top-level sampler.threads', () => {
      expect(fetcher.detectReportType(samplerFixtureTopLevel)).toBe('sampler')
    })

    it('should detect heap from top-level heap.objects', () => {
      expect(fetcher.detectReportType(heapFixture)).toBe('heap')
    })

    it('should detect profiler from top-level type=profiler + threads array', () => {
      expect(fetcher.detectReportType(profilerWithThreads)).toBe('sampler')
    })

    it('should detect health from deep data.tps', () => {
      expect(fetcher.detectReportType(deepTpsFixture)).toBe('health')
    })

    it('should detect sampler from metadata.type=sampler', () => {
      expect(fetcher.detectReportType(metadataTypeSampler)).toBe('sampler')
    })

    it('should detect health from metadata.type=health', () => {
      expect(fetcher.detectReportType(metadataTypeHealth)).toBe('health')
    })

    it('should return unknown for empty fixture', () => {
      expect(fetcher.detectReportType(unknownFixtureEmpty)).toBe('unknown')
    })
  })

  describe('hasAnyKeyDeep (private)', () => {
    it('should find key at top level', () => {
      expect(fetcher.hasAnyKeyDeep({ tps: 20 }, ['tps'])).toBe(true)
    })

    it('should find key at depth 3', () => {
      expect(fetcher.hasAnyKeyDeep({ a: { b: { sampler: {} } } }, ['sampler'])).toBe(true)
    })

    it('should return false for missing key', () => {
      expect(fetcher.hasAnyKeyDeep({ a: { b: {} } }, ['sampler'])).toBe(false)
    })

    it('should scan arrays up to limit', () => {
      const arr = Array.from({ length: 30 }, (_, i) => i === 27 ? { tps: 20 } : {})
      expect(fetcher.hasAnyKeyDeep(arr, ['tps'])).toBe(false) // beyond limit 20
    })

    it('should find key in array within limit', () => {
      const arr = Array.from({ length: 10 }, (_, i) => i === 7 ? { tps: 20 } : {})
      expect(fetcher.hasAnyKeyDeep(arr, ['tps'])).toBe(true)
    })
  })

  describe('extractRawData', () => {
    it('should extract health report with correct fields', () => {
      const result = fetcher.extractRawData('abc123', healthFixtureTopLevel)
      expect(result.code).toBe('abc123')
      expect(result.reportType).toBe('health')
      expect(result.platform).toBe('Paper')
      expect(result.minecraftVersion).toBe('1.20.4')
      expect(result.sparkVersion).toBe('1.10.0')
      expect(result.durationSeconds).toBe(120)
    })

    it('should extract sampler report with correct fields', () => {
      const result = fetcher.extractRawData('def456', samplerFixtureTopLevel)
      expect(result.reportType).toBe('sampler')
      expect(result.platform).toBe('Purpur')
    })
  })

  describe('mergeRawAndFull', () => {
    it('should detect profiler type from full data', () => {
      const rawData = {
        code: 'abc',
        reportType: 'unknown' as const,
        platform: 'Paper',
        rawJson: mergedFixture.metadata,
      }
      const merged = fetcher.mergeRawAndFull(rawData, mergedFixture.full)
      expect(merged.reportType).toBe('sampler') // profiler maps to sampler
      expect(merged.rawJson).toHaveProperty('metadata')
      expect(merged.rawJson).toHaveProperty('full')
    })

    it('should keep rawData fields when full has none', () => {
      const rawData = {
        code: 'abc',
        reportType: 'health' as const,
        platform: 'Spigot',
        minecraftVersion: '1.19.4',
        rawJson: { metadata: {} },
      }
      const merged = fetcher.mergeRawAndFull(rawData, {})
      expect(merged.reportType).toBe('health')
      expect(merged.platform).toBe('Spigot')
      expect(merged.minecraftVersion).toBe('1.19.4')
    })
  })
})
