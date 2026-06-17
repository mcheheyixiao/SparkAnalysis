import Fastify from 'fastify'
import fastifyHelmet from '@fastify/helmet'
import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import { env } from './config/env.js'
import { registerErrorHandler } from './plugins/error-handler.js'
import requestIdPlugin from './plugins/request-id.js'
import { registerAuthPlugin } from './plugins/auth.js'
import { publicRoutes, setQueueService } from './modules/public/public.routes.js'
import { adminRoutes, setQueueStatusGetter } from './modules/admin/admin.routes.js'

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
  await fastify.register(fastifyHelmet, {
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
  await fastify.register(requestIdPlugin)

  // ---- Error handler ----
  registerErrorHandler(fastify)

  // ---- Auth plugin (must be before routes) ----
  await registerAuthPlugin(fastify)

  // ---- Routes ----
  await fastify.register(publicRoutes)
  await fastify.register(adminRoutes)

  // ---- Health check ----
  fastify.get('/api/health', async () => ({
    success: true,
    data: { status: 'ok', uptime: process.uptime() },
  }))

  // ---- Plugins ready ----
  await fastify.ready()
  return fastify
}
