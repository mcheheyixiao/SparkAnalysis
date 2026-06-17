import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { adminAuthService } from '../modules/admin/admin-auth.service.js'

declare module 'fastify' {
  interface FastifyRequest {
    adminUser?: {
      sub: string
      username: string
      role: string
    }
  }
}

export async function registerAuthPlugin(fastify: FastifyInstance) {
  fastify.decorateRequest('adminUser', undefined)

  // Hook: verify JWT for /api/admin/* routes
  fastify.addHook('onRequest', async (request: FastifyRequest) => {
    // Only apply to /api/admin/* routes
    if (!request.url.startsWith('/api/admin/')) return

    // Skip auth endpoints
    if (request.url === '/api/admin/auth/login') return

    const authHeader = request.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw { statusCode: 401, code: 'UNAUTHORIZED', message: '请先登录' }
    }

    const token = authHeader.slice(7)
    const payload = adminAuthService.verifyToken(token)
    ;(request as any).adminUser = payload
  })
}
