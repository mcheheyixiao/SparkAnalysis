import { prisma } from '../../plugins/prisma.js'
import { logService } from '../logs/log.service.js'
import { analysisPipeline } from './analysis-pipeline.js'
import type { IAnalysisJob, IJobQueueService, IQueueStats } from './queue.interface.js'

export class InMemoryJobQueueService implements IJobQueueService {
  private pending: IAnalysisJob[] = []
  private processing = new Set<string>()      // reportId
  private sparkCodeLocks = new Set<string>()  // sparkCode
  private maxConcurrency: number
  private activeCount = 0
  private shuttingDown = false
  private lastJobStartedAt: Date | null = null
  private lastJobCompletedAt: Date | null = null
  private startTime = Date.now()

  constructor(maxConcurrency: number = 2) {
    this.maxConcurrency = maxConcurrency
  }

  async enqueue(job: IAnalysisJob): Promise<void> {
    if (this.shuttingDown) {
      // Mark as failed immediately
      await prisma.sparkReport.update({
        where: { id: job.reportId },
        data: {
          status: 'failed',
          errorCode: 'SERVER_SHUTDOWN',
          errorMessage: '服务器正在关闭，请稍后重试',
          completedAt: new Date(),
        },
      })
      return
    }

    // Skip if already processing
    if (this.processing.has(job.reportId)) return

    // Skip if same sparkCode is already being processed
    if (this.sparkCodeLocks.has(job.sparkCode)) return

    // Skip if already in pending queue
    if (this.pending.some(j => j.reportId === job.reportId)) return

    this.pending.push(job)
    this.processNext()
  }

  private processNext(): void {
    if (this.shuttingDown) return
    if (this.activeCount >= this.maxConcurrency) return
    if (this.pending.length === 0) return

    const job = this.pending.shift()!
    if (!job) return

    this.sparkCodeLocks.add(job.sparkCode)
    this.processing.add(job.reportId)
    this.activeCount++
    this.lastJobStartedAt = new Date()

    // Update report as processing
    prisma.sparkReport.update({
      where: { id: job.reportId },
      data: {
        status: 'processing',
        stage: 'fetching_spark',
        progress: 15,
        startedAt: new Date(),
        lockedAt: new Date(),
      },
    }).catch(() => {})

    // Execute pipeline async
    analysisPipeline.execute(job)
      .finally(() => {
        this.processing.delete(job.reportId)
        this.sparkCodeLocks.delete(job.sparkCode)
        this.activeCount--
        this.lastJobCompletedAt = new Date()
        this.processNext() // Start next job
      })
  }

  getStats(): IQueueStats {
    return {
      pending: this.pending.length,
      processing: this.processing.size,
      maxConcurrency: this.maxConcurrency,
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      lastJobStartedAt: this.lastJobStartedAt?.toISOString(),
      lastJobCompletedAt: this.lastJobCompletedAt?.toISOString(),
    }
  }

  async shutdown(): Promise<void> {
    this.shuttingDown = true

    // Wait for processing jobs (max 30s)
    const maxWaitMs = 30000
    const startWait = Date.now()

    while (this.processing.size > 0 && Date.now() - startWait < maxWaitMs) {
      await new Promise(resolve => setTimeout(resolve, 500))
    }

    // Mark remaining processing as SERVER_SHUTDOWN
    const remainingProcessing = [...this.processing]
    if (remainingProcessing.length > 0) {
      await prisma.sparkReport.updateMany({
        where: { id: { in: remainingProcessing } },
        data: {
          status: 'failed',
          errorCode: 'SERVER_SHUTDOWN',
          errorMessage: '服务器关闭导致本次分析中断，请重新提交 spark 链接',
          completedAt: new Date(),
        },
      })
    }

    // Mark pending as SERVER_SHUTDOWN
    const remainingPending = [...this.pending]
    if (remainingPending.length > 0) {
      await prisma.sparkReport.updateMany({
        where: { id: { in: remainingPending.map(j => j.reportId) } },
        data: {
          status: 'failed',
          errorCode: 'SERVER_SHUTDOWN',
          errorMessage: '服务器关闭导致本次分析中断，请重新提交 spark 链接',
          completedAt: new Date(),
        },
      })
    }

    this.processing.clear()
    this.sparkCodeLocks.clear()
    this.pending = []
    this.activeCount = 0

    await logService.write('info', 'queue', 'Queue shutdown complete', {
      remainingProcessing: remainingProcessing.length,
      remainingPending: remainingPending.length,
    })
  }
}
