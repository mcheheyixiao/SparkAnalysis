import 'dotenv/config'
import { buildApp } from './app.js'
import { env } from './config/env.js'
import { prisma } from './plugins/prisma.js'
import { InMemoryJobQueueService } from './modules/queue/in-memory-queue.js'
import { settingsService } from './modules/settings/settings.service.js'
import { setQueueService } from './modules/public/public.routes.js'
import { setQueueStatusGetter } from './modules/admin/admin.routes.js'

async function main() {
  const app = await buildApp()

  // ---- Queue service ----
  const maxConcurrency = await settingsService.getNumber('maxConcurrency')
  const queueService = new InMemoryJobQueueService(maxConcurrency || 2)
  setQueueService(queueService)
  setQueueStatusGetter(() => queueService.getStats())

  // ---- Startup recovery: mark pending/processing as failed ----
  try {
    const stale = await prisma.sparkReport.updateMany({
      where: { status: { in: ['pending', 'processing'] } },
      data: {
        status: 'failed',
        errorCode: 'SERVER_RESTARTED',
        errorMessage: '服务器重启导致本次分析中断，请重新提交 spark 链接',
        completedAt: new Date(),
      },
    })
    if (stale.count > 0) {
      app.log.warn(`Marked ${stale.count} stale reports as SERVER_RESTARTED`)
    }
  } catch (err) {
    app.log.error({ err }, 'Failed to recover stale reports on startup')
  }

  // ---- Graceful shutdown ----
  let shuttingDown = false

  async function gracefulShutdown(signal: string) {
    if (shuttingDown) return
    shuttingDown = true
    app.log.info(`Received ${signal}, shutting down gracefully...`)
    try {
      if (queueService) {
        await queueService.shutdown()
      }
      await app.close()
      await prisma.$disconnect()
      app.log.info('Shutdown complete')
      process.exit(0)
    } catch (err) {
      app.log.error({ err }, 'Error during shutdown')
      process.exit(1)
    }
  }

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
  process.on('SIGINT', () => gracefulShutdown('SIGINT'))

  // ---- Listen ----
  await app.listen({ port: env.PORT, host: '0.0.0.0' })
  app.log.info(`Server running on port ${env.PORT} (${env.NODE_ENV})`)
}

main().catch((err) => {
  console.error('Failed to start server:', err)
  process.exit(1)
})
