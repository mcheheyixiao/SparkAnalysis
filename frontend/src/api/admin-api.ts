import http from './http'
import type {
  LoginRequest,
  LoginResponse,
  AdminUser,
  AiSettings,
  AiSettingsUpdate,
  AiTestResult,
  SystemSettings,
  SystemSettingsUpdate,
  PromptTemplate,
  PromptListResponse,
  PromptCreateRequest,
  PromptUpdateRequest,
  AdminReport,
  PaginatedResponse,
  ReportsQuery,
  QueueStatus,
  LogEntry,
  LogsQuery,
  CleanupRequest,
  CleanupResponse,
} from './types'

function extractData<T>(res: any): T {
  return res.data.data
}

// Auth
export async function login(data: LoginRequest): Promise<LoginResponse> {
  const res = await http.post('/admin/auth/login', data)
  return extractData<LoginResponse>(res)
}

export async function logout(): Promise<void> {
  await http.post('/admin/auth/logout')
}

export async function getMe(): Promise<AdminUser> {
  const res = await http.get('/admin/auth/me')
  const data = extractData<{ user: AdminUser } | AdminUser>(res)
  // Handle both response shapes
  if ('user' in data) return data.user
  return data as AdminUser
}

// AI Settings
export async function getAiSettings(): Promise<AiSettings> {
  const res = await http.get('/admin/settings/ai')
  return extractData<AiSettings>(res)
}

export async function updateAiSettings(data: AiSettingsUpdate): Promise<AiSettings> {
  const res = await http.put('/admin/settings/ai', data)
  return extractData<AiSettings>(res)
}

export async function testAiConnection(data?: Partial<AiSettingsUpdate>): Promise<AiTestResult> {
  const res = await http.post('/admin/settings/ai/test', data || {})
  return extractData<AiTestResult>(res)
}

// System Settings
export async function getSystemSettings(): Promise<SystemSettings> {
  const res = await http.get('/admin/settings/system')
  return extractData<SystemSettings>(res)
}

export async function updateSystemSettings(data: SystemSettingsUpdate): Promise<SystemSettings> {
  const res = await http.put('/admin/settings/system', data)
  return extractData<SystemSettings>(res)
}

// Prompt Templates
export async function getPrompts(type?: string): Promise<PromptListResponse> {
  const params = type ? { type } : {}
  const res = await http.get('/admin/prompts', { params })
  return extractData<PromptListResponse>(res)
}

export async function getPrompt(id: string): Promise<PromptTemplate> {
  const res = await http.get(`/admin/prompts/${id}`)
  return extractData<{ prompt: PromptTemplate }>(res).prompt
}

export async function createPrompt(data: PromptCreateRequest): Promise<PromptTemplate> {
  const res = await http.post('/admin/prompts', data)
  return extractData<{ prompt: PromptTemplate }>(res).prompt
}

export async function updatePrompt(id: string, data: PromptUpdateRequest): Promise<PromptTemplate> {
  const res = await http.put(`/admin/prompts/${id}`, data)
  return extractData<{ prompt: PromptTemplate }>(res).prompt
}

export async function deletePrompt(id: string): Promise<void> {
  await http.delete(`/admin/prompts/${id}`)
}

export async function setDefaultPrompt(id: string): Promise<PromptTemplate> {
  const res = await http.post(`/admin/prompts/${id}/set-default`)
  return extractData<{ prompt: PromptTemplate }>(res).prompt
}

// Reports (Admin)
export async function getAdminReports(query: ReportsQuery = {}): Promise<PaginatedResponse<AdminReport>> {
  const res = await http.get('/admin/reports', { params: query })
  const data = extractData<any>(res)
  // Handle both response shapes
  if (data.reports) {
    return { items: data.reports, total: data.total, page: data.page, pageSize: data.pageSize }
  }
  return data
}

export async function getAdminReport(id: string): Promise<AdminReport> {
  const res = await http.get(`/admin/reports/${id}`)
  const data = extractData<{ report: AdminReport }>(res)
  return data.report
}

export async function deleteAdminReport(id: string): Promise<void> {
  await http.delete(`/admin/reports/${id}`)
}

export async function cleanupReports(data: CleanupRequest): Promise<CleanupResponse> {
  const res = await http.post('/admin/reports/cleanup', data)
  return extractData<CleanupResponse>(res)
}

// Queue
export async function getQueueStatus(): Promise<QueueStatus> {
  const res = await http.get('/admin/queue/status')
  return extractData<QueueStatus>(res)
}

// Logs
export async function getLogs(query: LogsQuery = {}): Promise<PaginatedResponse<LogEntry>> {
  const res = await http.get('/admin/logs', { params: query })
  const data = extractData<any>(res)
  if (data.logs) {
    return { items: data.logs, total: data.total, page: data.page, pageSize: data.pageSize }
  }
  return data
}
