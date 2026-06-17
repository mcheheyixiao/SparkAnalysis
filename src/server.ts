import { buildApp } from './app.js'
import { env } from './config/env.js'
import { prisma } from './plugins/prisma.js'

let queueService: { shutdown: () => Promise<void> } | null = null

async function main() {
  const app = await buildApp()

  // ---- Startup recovery: mark pending/processing as failed ----
  try {
    const stale = await prisma.sparkReport.updateMany({
      where: { status: { in: ['pending', 'processing'] } },
      data: {
        status: 'failed',
        errorCode: 'SERVER_RESTARTED',
        errorMessage: 'サーバー再起動により分析が中断されました。Sparkリンクを再送信してください',
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
  async function gracefulShutdown(signal: string) {
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

export function setQueueService(qs: { shutdown: () => Promise<void> }) {
  queueService = qs
}
