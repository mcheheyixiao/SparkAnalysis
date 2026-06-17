import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'
import { v4 as uuidv4 } from 'uuid'

declare module 'fastify' {
  interface FastifyRequest {
    requestId: string
  }
}

async function requestIdPlugin(fastify: FastifyInstance) {
  fastify.decorateRequest('requestId', '')

  fastify.addHook('onRequest', async (request) => {
    const id = (request.headers['x-request-id'] as string) || uuidv4()
    request.requestId = id
  })

  fastify.addHook('onSend', async (request, reply) => {
    if (request.requestId) {
      reply.header('X-Request-Id', request.requestId)
    }
  })
}

export default fp(requestIdPlugin, { name: 'request-id' })
