import { randomUUID } from 'crypto'
import { prisma } from '../../plugins/prisma.js'
import { AppError } from '../../utils/errors.js'

export type PromptType = 'system' | 'user' | 'json_schema' | 'beginner' | 'advanced'

export class PromptService {
  async list(type?: PromptType) {
    const where: any = {}
    if (type) where.type = type
    return prisma.promptTemplate.findMany({
      where,
      orderBy: [{ type: 'asc' }, { isDefault: 'desc' }, { createdAt: 'desc' }],
    })
  }

  async findById(id: string) {
    const tmpl = await prisma.promptTemplate.findUnique({ where: { id } })
    if (!tmpl) throw new AppError('REPORT_NOT_FOUND', 'Prompt 模板不存在')
    return tmpl
  }

  async getDefaultByType(type: PromptType) {
    return prisma.promptTemplate.findFirst({
      where: { type, isDefault: true },
    })
  }

  async create(data: {
    name: string
    type: PromptType
    content: string
  }) {
    return prisma.promptTemplate.create({
      data: {
        id: randomUUID(),
        name: data.name,
        type: data.type,
        content: data.content,
        isDefault: false,
        version: 1,
      },
    })
  }

  async update(id: string, data: { name?: string; content?: string }) {
    const tmpl = await this.findById(id)
    return prisma.promptTemplate.update({
      where: { id },
      data: {
        ...data,
        version: { increment: 1 },
      },
    })
  }

  async delete(id: string) {
    const tmpl = await this.findById(id)

    // Don't allow deleting the only default system template
    if (tmpl.type === 'system' && tmpl.isDefault) {
      const systemCount = await prisma.promptTemplate.count({
        where: { type: 'system', isDefault: true },
      })
      if (systemCount <= 1) {
        throw new AppError('FORBIDDEN', '不允许删除唯一的默认系统提示词模板')
      }
    }

    await prisma.promptTemplate.delete({ where: { id } })
  }

  async setDefault(id: string) {
    const tmpl = await this.findById(id)

    // Transaction: unset all defaults for this type, then set target
    await prisma.$transaction([
      prisma.promptTemplate.updateMany({
        where: { type: tmpl.type, isDefault: true },
        data: { isDefault: false },
      }),
      prisma.promptTemplate.update({
        where: { id },
        data: { isDefault: true },
      }),
    ])
  }
}

export const promptService = new PromptService()
