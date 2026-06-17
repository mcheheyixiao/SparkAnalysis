import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import { randomUUID } from 'crypto'
import { prisma } from '../../plugins/prisma.js'
import { env } from '../../config/env.js'
import { AppError } from '../../utils/errors.js'
import { logService } from '../logs/log.service.js'
import type { FastifyRequest } from 'fastify'

export interface JwtPayload {
  sub: string
  username: string
  role: string
  iat: number
  exp: number
}

export class AdminAuthService {
  async login(username: string, password: string, request: FastifyRequest) {
    const user = await prisma.adminUser.findUnique({ where: { username } })
    if (!user) {
      throw new AppError('INVALID_CREDENTIALS', '用户名或密码错误')
    }

    if (!user.enabled) {
      throw new AppError('ACCOUNT_DISABLED', '账号已被禁用')
    }

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) {
      // Audit log for failed login
      await logService.write('warn', 'auth', 'Login failed', {
        username,
        ip: (request as any).requestId ? 'masked' : 'masked',
      })
      throw new AppError('INVALID_CREDENTIALS', '用户名或密码错误')
    }

    // Generate JWT
    const payload: Omit<JwtPayload, 'iat' | 'exp'> = {
      sub: user.id,
      username: user.username,
      role: user.role,
    }

    const token = jwt.sign(payload, env.JWT_SECRET, {
      expiresIn: env.JWT_EXPIRES_IN as any,
    })

    // Update last login
    await prisma.adminUser.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    })

    // Audit log
    await prisma.adminAuditLog.create({
      data: {
        id: randomUUID(),
        adminUserId: user.id,
        action: 'login',
        detailJson: JSON.stringify({ ip: 'masked' }),
      },
    })

    return {
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
      },
    }
  }

  async getMe(adminUserId: string) {
    const user = await prisma.adminUser.findUnique({ where: { id: adminUserId } })
    if (!user) {
      throw new AppError('UNAUTHORIZED', '用户不存在')
    }
    return {
      id: user.id,
      username: user.username,
      role: user.role,
      lastLoginAt: user.lastLoginAt,
    }
  }

  async logout(adminUserId: string) {
    await prisma.adminAuditLog.create({
      data: {
        id: randomUUID(),
        adminUserId,
        action: 'logout',
      },
    })
    return { success: true }
  }

  verifyToken(token: string): JwtPayload {
    try {
      return jwt.verify(token, env.JWT_SECRET) as JwtPayload
    } catch {
      throw new AppError('UNAUTHORIZED', '登录已过期，请重新登录')
    }
  }
}

export const adminAuthService = new AdminAuthService()
