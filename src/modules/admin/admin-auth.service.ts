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
  // Rate limiter: 10 attempts per 15 minutes per IP
  private rateLimitMap = new Map<string, { count: number; windowStart: number }>()
  private readonly RATE_LIMIT_MAX = 10
  private readonly RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000 // 15 minutes

  private checkRateLimit(ip: string): void {
    const now = Date.now()
    const entry = this.rateLimitMap.get(ip)

    if (!entry || now - entry.windowStart > this.RATE_LIMIT_WINDOW_MS) {
      // Start a new window
      this.rateLimitMap.set(ip, { count: 1, windowStart: now })
      return
    }

    if (entry.count >= this.RATE_LIMIT_MAX) {
      throw new AppError('RATE_LIMIT_EXCEEDED', '登录尝试过于频繁，请15分钟后再试')
    }

    entry.count++
  }

  async login(username: string, password: string, request: FastifyRequest) {
    // Rate limiting — check before any credential validation
    const ip = request.ip
    this.checkRateLimit(ip)

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

  async changePassword(adminUserId: string, currentPassword: string, newPassword: string) {
    const user = await prisma.adminUser.findUnique({ where: { id: adminUserId } })

    if (!user || !user.enabled) {
      throw new AppError('UNAUTHORIZED', '用户不存在或已被禁用')
    }

    const valid = await bcrypt.compare(currentPassword, user.passwordHash)
    if (!valid) {
      throw new AppError('INVALID_CURRENT_PASSWORD', '当前密码错误')
    }

    const same = await bcrypt.compare(newPassword, user.passwordHash)
    if (same) {
      throw new AppError('PASSWORD_UNCHANGED', '新密码不能与当前密码相同')
    }

    const passwordHash = await bcrypt.hash(newPassword, 12)

    await prisma.adminUser.update({
      where: { id: user.id },
      data: { passwordHash },
    })

    await prisma.adminAuditLog.create({
      data: {
        id: randomUUID(),
        adminUserId: user.id,
        action: 'change_password',
        targetType: 'admin_user',
        targetId: user.id,
      },
    })

    await logService.write('info', 'auth', 'Admin password changed', {
      adminUserId: user.id,
      username: user.username,
    })

    return { changed: true }
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
