// ── Canonical AiDiagnosisResult (new unified structure) ──────────

export interface AiDiagnosisResult {
  one_sentence_summary: string
  severity: 'normal' | 'low' | 'medium' | 'high' | 'critical'
  beginner_explanation: BeginnerExplanation
  key_evidence: AiKeyEvidence[]
  suspected_causes: AiSuspectedCause[]
  fix_plan: AiFixPlanItem[]
  retest_commands: RetestCommand[]
  missing_information: MissingInfo[]
  /** NOT trusted from AI — backend generates this from structured fields */
  markdown_report?: string
}

export interface BeginnerExplanation {
  summary: string
  details?: string
}

export interface RetestCommand {
  command: string
  description?: string
}

export interface MissingInfo {
  question: string
  why?: string
}

// ── Sub-types (unchanged from legacy) ──────────────────────────────

export interface AiKeyEvidence {
  title: string
  explanation: string
  confidence: 'high' | 'medium' | 'low'
}

export interface AiSuspectedCause {
  rank: number
  name: string
  category: string
  reason: string
  confidence: 'high' | 'medium' | 'low'
  how_to_verify: string
}

export interface AiFixPlanItem {
  priority: number
  action: string
  difficulty: 'easy' | 'medium' | 'hard'
  risk: 'low' | 'medium' | 'high'
  expected_effect: string
}

// ── Legacy AiAnalysisOutput (kept for backward compat) ─────────────
// This matches the OLD flat format. Code that receives old-format
// JSON uses this type before normalization.

export interface AiAnalysisOutputLegacy {
  one_sentence_summary: string
  severity: 'normal' | 'low' | 'medium' | 'high' | 'critical'
  beginner_explanation: string
  key_evidence: AiKeyEvidence[]
  suspected_causes: AiSuspectedCause[]
  fix_plan: AiFixPlanItem[]
  retest_commands: string[]
  missing_information: string[]
  markdown_report: string
}

/**
 * Union of old and new shapes — what AI might return.
 * After normalization it always becomes AiDiagnosisResult.
 */
export type AiAnalysisOutputRaw = AiDiagnosisResult | AiAnalysisOutputLegacy

/**
 * Alias for backward compatibility with existing code.
 * New code should use AiDiagnosisResult directly.
 */
export type AiAnalysisOutput = AiDiagnosisResult

// ── Runtime AI configuration ───────────────────────────────────────

/**
 * NOTE: `apiKey` is the DECRYPTED plaintext key, NOT the DB-stored ciphertext.
 * The DB field is still called `apiKeyEncrypted` in the Prisma schema.
 */
export interface AiConfig {
  provider: string
  baseUrl: string
  apiKey: string
  model: string
  temperature: number
  maxTokens: number
  timeoutMs: number
  enabled: boolean
}

export interface BuiltPrompts {
  systemPrompt: string
  userPrompt: string
  jsonSchema: string
}
