export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: {
    code: string
    message: string
    requestId?: string
  }
  requestId?: string
}

export interface AnalyzeRequest {
  url: string
}

export interface AnalyzeResponse {
  reportId: string
  status: string
  sparkCode: string
  reused: boolean
  reuseReason?: string | null
}

export interface ReportStatus {
  reportId: string
  sparkCode?: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  progress: number
  stage: string | null
  message: string | null
  errorCode?: string | null
  errorMessage?: string | null
}

export interface AiResult {
  one_sentence_summary: string
  severity: string
  beginner_explanation: BeginnerExplanation | string  // object (canonical) or string (legacy compat)
  key_evidence: KeyEvidence[]
  suspected_causes: SuspectedCause[]
  fix_plan: FixPlanItem[]
  retest_commands: (RetestCommand | string)[]  // object[] (canonical) or string[] (legacy)
  missing_information: (MissingInfo | string)[]  // object[] (canonical) or string[] (legacy)
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

export interface KeyEvidence {
  title: string
  explanation: string
  confidence: 'high' | 'medium' | 'low'
}

export interface SuspectedCause {
  rank: number
  name: string
  category: string
  reason: string
  confidence: 'high' | 'medium' | 'low'
  how_to_verify: string
}

export interface FixPlanItem {
  priority: number
  action: string
  difficulty: 'easy' | 'medium' | 'hard'
  risk: 'low' | 'medium' | 'high'
  expected_effect: string
}

export interface PublicReport {
  reportId: string
  sparkCode?: string
  sparkUrl?: string
  reportType?: string
  status: string
  severity?: string
  summary?: string
  progress?: number
  stage?: string | null
  message?: string | null
  errorCode?: string | null
  errorMessage?: string | null
  createdAt?: string
  completedAt?: string | null
  normalizedSummary?: Record<string, unknown> | null
  ruleAnalysis?: Record<string, unknown> | null
  aiResult?: AiResult | null
  markdownReport?: string
  isFallback?: boolean
}

// Admin types

export interface LoginRequest {
  username: string
  password: string
}

export interface LoginResponse {
  token: string
  user: AdminUser
}

export interface AdminUser {
  id: string
  username: string
  role: string
  lastLoginAt?: string
}

export interface AiSettings {
  provider: string
  baseUrl: string
  model: string
  apiKeyMasked?: string
  temperature: number
  maxTokens: number
  timeoutMs: number
  enabled: boolean
  updatedAt?: string
}

export interface AiSettingsUpdate {
  provider?: string
  baseUrl?: string
  apiKey?: string
  model?: string
  temperature?: number
  maxTokens?: number
  timeoutMs?: number
  enabled?: boolean
}

export interface AiTestResult {
  ok: boolean
  latencyMs?: number
  model?: string
  responsePreview?: string
  error?: string
}

export interface SystemSettings {
  settings: {
    saveRawSparkData: boolean
    saveNormalizedSummary: boolean
    saveAiResult: boolean
    autoCleanupDays: number
    sparkFetchTimeoutMs: number
    sparkRawMaxBytes: number
    sparkFullMaxBytes: number
    aiTimeoutMs: number
    publicRateLimitPerMinute: number
    publicRateLimitPerDay: number
    maxConcurrency: number
    reuseCompletedReport: boolean
    reuseReportTtlSeconds: number
  }
}

export interface SystemSettingsUpdate {
  settings: Partial<SystemSettings['settings']>
}

export interface PromptTemplate {
  id: string
  name: string
  type: string
  content: string
  isDefault: boolean
  version: number
  createdAt: string
  updatedAt: string
}

export interface PromptListResponse {
  prompts: PromptTemplate[]
  total?: number
  page?: number
  pageSize?: number
  items?: PromptTemplate[]
}

export interface PromptCreateRequest {
  name: string
  type: string
  content: string
}

export interface PromptUpdateRequest {
  name?: string
  content?: string
  type?: string
}

export interface AdminReport {
  id: string
  sparkCode: string
  sparkUrl: string
  reportType: string
  status: string
  progress: number
  stage: string | null
  severity?: string
  summary?: string
  errorCode?: string | null
  errorMessage?: string | null
  platform?: string
  minecraftVersion?: string
  sparkVersion?: string
  serverBrand?: string
  durationSeconds?: number
  clientIpHash?: string
  startedAt?: string | null
  completedAt?: string | null
  createdAt: string
  expiresAt?: string | null
  rawMetadataJson?: Record<string, unknown> | null
  normalizedJson?: Record<string, unknown> | null
  ruleAnalysisJson?: Record<string, unknown> | null
  analysisResult?: AdminAnalysisResult | null
}

export interface AdminAnalysisResult {
  severity?: string
  summary?: string
  aiResultJson?: AiResult | null
  markdownReport?: string
  isFallback: boolean
  model?: string
  inputTokens?: number
  outputTokens?: number
  promptTemplateId?: string
  promptVersion?: number
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

export interface ReportsQuery {
  status?: string
  sparkCode?: string
  severity?: string
  reportType?: string
  createdFrom?: string
  createdTo?: string
  page?: number
  pageSize?: number
  sortBy?: string
  sortOrder?: string
}

export interface QueueStatus {
  pending: number
  processing: number
  maxConcurrency: number
  uptime: number
  lastJobStartedAt?: string | null
  lastJobCompletedAt?: string | null
}

export interface LogEntry {
  id: string
  level: string
  module: string
  message: string
  contextJson?: string | null
  createdAt: string
}

export interface LogsQuery {
  level?: string
  module?: string
  page?: number
  pageSize?: number
}

export interface CleanupRequest {
  olderThanDays?: number
  dryRun?: boolean
}

export interface ChangePasswordRequest {
  currentPassword: string
  newPassword: string
  confirmPassword: string
}

export interface ChangePasswordResponse {
  changed: boolean
}

export interface CleanupResponse {
  matched: number
  deleted: number
  dryRun: boolean
  matchedAnalysisResults?: number
  deletedAnalysisResults?: number
  matchedLogs?: number
  deletedLogs?: number
  message?: string
}
