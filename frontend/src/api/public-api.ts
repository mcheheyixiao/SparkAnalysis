import http from './http'
import type { AnalyzeRequest, AnalyzeResponse, ReportStatus, PublicReport } from './types'

export async function submitAnalysis(data: AnalyzeRequest): Promise<AnalyzeResponse> {
  const res = await http.post('/public/analyze', data)
  return (res.data as any).data
}

export async function getReportStatus(reportId: string): Promise<ReportStatus> {
  const res = await http.get(`/public/reports/${reportId}/status`)
  return (res.data as any).data
}

export async function getPublicReport(reportId: string): Promise<PublicReport> {
  const res = await http.get(`/public/reports/${reportId}`)
  return (res.data as any).data
}
