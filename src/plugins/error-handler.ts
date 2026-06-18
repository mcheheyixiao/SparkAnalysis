import { FastifyInstance } from 'fastify'
import { AppError } from '../utils/errors.js'
import { ZodError } from 'zod'

export async function registerErrorHandler(fastify: FastifyInstance) {
  fastify.setErrorHandler(async (error, request, reply) => {
    const requestId = (request as { requestId?: string }).requestId

    // AppError — known error codes
    if (error instanceof AppError) {
      return reply.status(error.httpStatus).send({
        success: false,
        error: {
          code: error.code,
          message: error.message,
          requestId: requestId || error.requestId,
        },
      })
    }

    // Zod validation errors
    if (error instanceof ZodError) {
      const firstIssue = error.issues[0]
      return reply.status(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: firstIssue?.message || '请求参数验证失败',
          requestId,
        },
      })
    }

    // Narrow remaining errors to access runtime properties
    const err = error as Error & { validation?: unknown; statusCode?: number; message: string; code?: string }

    // Fastify validation errors
    if (err.validation) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: err.message || '请求参数验证失败',
          requestId,
        },
      })
    }

    // Fastify framework errors with their own status codes (e.g. body/content-type/content-length)
    if (err.code?.startsWith('FST_') && err.statusCode) {
      return reply.status(err.statusCode).send({
        success: false,
        error: {
          code: 'BAD_REQUEST',
          message: err.message || '请求格式错误',
          requestId,
        },
      })
    }

    // Rate limit
    if (err.statusCode === 429) {
      return reply.status(429).send({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: '请求过于频繁，请稍后再试',
          requestId,
        },
      })
    }

    // Payload too large
    if (err.statusCode === 413) {
      return reply.status(413).send({
        success: false,
        error: {
          code: 'PAYLOAD_TOO_LARGE',
          message: '请求体超过大小限制',
          requestId,
        },
      })
    }

    // Unknown error — log full details but return sanitized
    fastify.log.error({ err: error, requestId }, 'Unhandled error')

    return reply.status(500).send({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: '服务器内部错误',
        requestId,
      },
    })
  })
}
