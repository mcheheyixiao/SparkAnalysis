export function safeJsonParse<T>(json: string | null | undefined, fallback: T): T {
  if (!json) return fallback
  try {
    return JSON.parse(json) as T
  } catch {
    return fallback
  }
}

export function safeJsonStringify(obj: unknown): string {
  try {
    return JSON.stringify(obj)
  } catch {
    return '{}'
  }
}

/**
 * Attempt to repair malformed AI JSON output.
 * Returns parsed object or null if irreparable.
 */
export function attemptJsonRepair(raw: string): object | null {
  if (!raw) return null

  // 1. Remove BOM
  let cleaned = raw.replace(/^﻿/, '').trim()

  // 2. Extract ```json ... ``` code block
  const jsonBlock = cleaned.match(/```json\s*([\s\S]*?)```/)
  if (jsonBlock) {
    cleaned = jsonBlock[1].trim()
  } else {
    // 3. Extract ``` ... ``` any code block
    const anyBlock = cleaned.match(/```\s*([\s\S]*?)```/)
    if (anyBlock) {
      cleaned = anyBlock[1].trim()
    }
  }

  // 4. Extract outermost { ... }
  const braceMatch = cleaned.match(/\{[\s\S]*\}/)
  if (braceMatch) {
    cleaned = braceMatch[0]
  }

  // 5. Remove trailing commas (before } or ])
  cleaned = cleaned.replace(/,(\s*[}\]])/g, '$1')

  // 6. Try parse
  try {
    return JSON.parse(cleaned)
  } catch {
    return null
  }
}
