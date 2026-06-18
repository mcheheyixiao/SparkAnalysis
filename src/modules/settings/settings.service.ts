import { prisma } from '../../plugins/prisma.js'
import { safeJsonParse } from '../../utils/json.js'

/** Supported value types for system settings. */
export type SettingValue = string | number | boolean

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

  /**
   * Returns all settings with values parsed back to their native types.
   * The DB stores everything as strings; this method tries to parse numbers
   * and booleans so the API response matches what the frontend expects.
   */
  async getAllSettings(): Promise<Record<string, SettingValue>> {
    const settings = await prisma.systemSetting.findMany()
    const result: Record<string, SettingValue> = {}
    for (const s of settings) {
      result[s.key] = parseSettingValue(s.value)
    }
    return result
  }

  /**
   * Update settings. Accepts string | number | boolean values.
   * All values are stored as JSON strings in the DB.
   */
  async updateSettings(updates: Record<string, SettingValue>): Promise<void> {
    for (const [key, value] of Object.entries(updates)) {
      const stringValue = typeof value === 'string' ? value : JSON.stringify(value)
      await prisma.systemSetting.upsert({
        where: { key },
        update: { value: stringValue },
        create: { key, value: stringValue },
      })
    }
  }
}

/**
 * Try to parse a stored string value back to its native type.
 * Numbers and booleans are returned as their JS types;
 * everything else stays as string.
 */
function parseSettingValue(raw: string): SettingValue {
  if (raw === 'true') return true
  if (raw === 'false') return false
  // Check if it's an integer number
  if (/^-?\d+$/.test(raw)) {
    const n = Number(raw)
    if (!isNaN(n) && Number.isSafeInteger(n)) return n
  }
  return raw
}

export const settingsService = new SettingsService()
