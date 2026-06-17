import { prisma } from '../../plugins/prisma.js'
import { safeJsonParse } from '../../utils/json.js'

export class SettingsService {
  async getString(key: string): Promise<string> {
    const setting = await prisma.systemSetting.findUnique({ where: { key } })
    return setting?.value ?? ''
  }

  async getNumber(key: string): Promise<number> {
    const value = await this.getString(key)
    const n = Number(value)
    return isNaN(n) ? 0 : n
  }

  async getBoolean(key: string): Promise<boolean> {
    const value = await this.getString(key)
    return value === 'true'
  }

  async getJson<T = Record<string, unknown>>(key: string): Promise<T> {
    const value = await this.getString(key)
    return safeJsonParse<T>(value, {} as T)
  }

  async getAllSettings(): Promise<Record<string, string>> {
    const settings = await prisma.systemSetting.findMany()
    const result: Record<string, string> = {}
    for (const s of settings) {
      result[s.key] = s.value
    }
    return result
  }

  async updateSettings(updates: Record<string, string>): Promise<void> {
    for (const [key, value] of Object.entries(updates)) {
      await prisma.systemSetting.upsert({
        where: { key },
        update: { value },
        create: { key, value },
      })
    }
  }
}

export const settingsService = new SettingsService()
