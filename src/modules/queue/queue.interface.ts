export interface IAnalysisJob {
  reportId: string
  sparkCode: string
}

export interface IQueueStats {
  pending: number
  processing: number
  maxConcurrency: number
  uptime?: number
  lastJobStartedAt?: string
  lastJobCompletedAt?: string
}

export interface IJobQueueService {
  enqueue(job: IAnalysisJob): Promise<void>
  getStats(): IQueueStats
  shutdown(): Promise<void>
}
