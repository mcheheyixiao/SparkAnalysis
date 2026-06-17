// ---- Spark URL parser result ----
export interface ParsedSparkUrl {
  code: string
  normalizedUrl: string
  rawMetadataUrl: string
}

// ---- Raw spark metadata (from ?raw=1) ----
export interface SparkRawData {
  code: string
  reportType: 'sampler' | 'heap' | 'health' | 'unknown'
  platform?: string
  minecraftVersion?: string
  sparkVersion?: string
  serverBrand?: string
  durationSeconds?: number
  rawJson: unknown // the full raw JSON (not stored by default)
}

// ---- Normalized structured summary ----
export interface NormalizedSummary {
  code: string
  reportType: 'sampler' | 'heap' | 'health' | 'unknown'
  server: {
    platform?: string
    minecraftVersion?: string
    sparkVersion?: string
    serverBrand?: string
    environment?: string
  }
  timing: {
    createdAt?: string
    durationSeconds?: number
  }
  health: {
    tps?: {
      latest?: number
      mean?: number
      min?: number
      max?: number
    }
    mspt?: {
      mean?: number
      median?: number
      p95?: number
      max?: number
    }
    cpu?: {
      process?: number
      system?: number
    }
    memory?: {
      usedMB?: number
      maxMB?: number
      usagePercent?: number
    }
    gc?: {
      collectors?: string[]
      frequency?: string
      warning?: string
    }
  }
  profiler: {
    threads: NormalizedThread[]
    sources: NormalizedSource[]
    suspiciousMethods: SuspiciousMethod[]
  }
  limitations: string[]
}

export interface NormalizedThread {
  name: string
  type: 'main' | 'async' | 'worker' | 'unknown'
  totalPercent?: number
  topMethods?: NormalizedMethod[]
}

export interface NormalizedMethod {
  name: string
  packageName?: string
  source?: string
  percent?: number
  selfPercent?: number
  totalPercent?: number
}

export interface NormalizedSource {
  name: string
  type: 'plugin' | 'mod' | 'minecraft' | 'java' | 'unknown'
  totalPercent?: number
  evidence?: string[]
}

export interface SuspiciousMethod {
  method: string
  reason: string
  confidence: 'high' | 'medium' | 'low'
}

// ---- Rule analysis result ----
export interface RuleAnalysisResult {
  severity: 'normal' | 'low' | 'medium' | 'high' | 'critical'
  summary: string
  evidence: RuleEvidence[]
  suspectedCauses: SuspectedCause[]
  recommendedCommands: string[]
  limitations: string[]
}

export interface RuleEvidence {
  title: string
  detail: string
  confidence: 'high' | 'medium' | 'low'
}

export interface SuspectedCause {
  name: string
  category: 'plugin' | 'mod' | 'world' | 'entity' | 'chunk' | 'redstone' | 'memory' | 'jvm' | 'database' | 'unknown'
  reason: string
  priority: number
  confidence: 'high' | 'medium' | 'low'
}
