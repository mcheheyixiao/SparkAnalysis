import type { FastifyRequest } from 'fastify'

export function getClientIp(request: FastifyRequest): string {
  const xff = request.headers['x-forwarded-for']
  if (typeof xff === 'string') {
    return xff.split(',')[0].trim()
  }
  if (Array.isArray(xff) && xff.length > 0) {
    return xff[0].trim()
  }
  const xri = request.headers['x-real-ip']
  if (typeof xri === 'string') {
    return xri.trim()
  }
  return request.ip
}
