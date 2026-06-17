import Fastify from 'fastify'
import helmet from 'helmet'
import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import { env } from './config/env.js'
import { registerErrorHandler } from './plugins/error-handler.js'
import { prisma } from './plugins/prisma.js'

export async function buildApp() {
  const fastify = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      transport: env.NODE_ENV === 'development'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
    },
    bodyLimit: 1048576, // 1MB default
  })

  // ---- Security headers ----
  await fastify.register(import('@fastify/helmet'), {
    contentSecurityPolicy: false,
  })

  // ---- CORS ----
  const origins = env.CORS_ORIGIN.split(',').map(s => s.trim()).filter(Boolean)
  await fastify.register(cors, {
    origin: origins.length > 0 ? origins : true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
  })

  // ---- Rate Limit ----
  await fastify.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    keyGenerator: (request) => {
      return request.ip
    },
  })

  // ---- Request ID ----
  fastify.addHook('onRequest', async (request) => {
    const { v4: uuidv4 } = await import('uuid')
    const id = (request.headers['x-request-id'] as string) || uuidv4()
    ;(request as any).requestId = id
  })

  fastify.addHook('onSend', async (request, reply) => {
    const rid = (request as any).requestId
    if (rid) reply.header('X-Request-Id', rid)
  })

  // ---- Error handler ----
  registerErrorHandler(fastify)

  // ---- Health check ----
  fastify.get('/api/health', async () => ({
    success: true,
    data: { status: 'ok', uptime: process.uptime() },
  }))

  // ---- Plugins ready ----
  await fastify.ready()
  return fastify
}
