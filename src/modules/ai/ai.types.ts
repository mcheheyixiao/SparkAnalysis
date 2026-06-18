export interface AiAnalysisOutput {
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

/**
 * Runtime AI configuration passed to providers.
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
