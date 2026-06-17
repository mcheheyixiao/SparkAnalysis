import { randomUUID } from 'crypto'
import { prisma } from '../../plugins/prisma.js'
import { safeJsonStringify } from '../../utils/json.js'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export class LogService {
  async write(
    level: LogLevel,
    module: string,
    message: string,
    context?: Record<string, unknown>,
  ) {
    try {
      await prisma.systemLog.create({
        data: {
          id: randomUUID(),
          level,
          module,
          message,
          contextJson: context ? safeJsonStringify(context) : null,
        },
      })
    } catch {
      // Log writing should never crash the app
    }
  }

  async query(options: {
    level?: string
    module?: string
    page?: number
    pageSize?: number
  }) {
    const { page = 1, pageSize = 50 } = options
    const where: any = {}
    if (options.level) where.level = options.level
    if (options.module) where.module = options.module

    const [total, logs] = await Promise.all([
      prisma.systemLog.count({ where }),
      prisma.systemLog.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
    ])

    return { total, logs, page, pageSize }
  }
}

export const logService = new LogService()
