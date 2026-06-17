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

export interface AiConfig {
  provider: string
  baseUrl: string
  apiKeyEncrypted: string
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
