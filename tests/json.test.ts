import { describe, it, expect } from 'vitest'
import { safeJsonParse, safeJsonStringify, attemptJsonRepair } from '../src/utils/json.js'

describe('safeJsonParse', () => {
  it('should parse valid JSON', () => {
    const result = safeJsonParse('{"name":"test","value":42}', null)
    expect(result).toEqual({ name: 'test', value: 42 })
  })

  it('should return fallback for invalid JSON', () => {
    const fallback = { default: true }
    const result = safeJsonParse('not json at all', fallback)
    expect(result).toBe(fallback)
  })

  it('should return fallback for null input', () => {
    const fallback = { empty: true }
    expect(safeJsonParse(null, fallback)).toBe(fallback)
  })

  it('should return fallback for undefined input', () => {
    const fallback = { empty: true }
    expect(safeJsonParse(undefined, fallback)).toBe(fallback)
  })

  it('should return fallback for empty string', () => {
    const fallback = { empty: true }
    expect(safeJsonParse('', fallback)).toBe(fallback)
  })
})

describe('safeJsonStringify', () => {
  it('should stringify a plain object', () => {
    const result = safeJsonStringify({ a: 1, b: 'two' })
    expect(result).toBe('{"a":1,"b":"two"}')
  })

  it('should stringify an array', () => {
    const result = safeJsonStringify([1, 2, 3])
    expect(result).toBe('[1,2,3]')
  })

  it('should return "{}" for circular references', () => {
    const obj: Record<string, unknown> = {}
    obj.self = obj
    const result = safeJsonStringify(obj)
    expect(result).toBe('{}')
  })
})

describe('attemptJsonRepair', () => {
  it('should extract and parse a ```json block', () => {
    const input = 'Some text\n```json\n{"key":"value"}\n```\nMore text'
    const result = attemptJsonRepair(input)
    expect(result).toEqual({ key: 'value' })
  })

  it('should extract and parse a ``` any block (no language tag)', () => {
    const input = 'Before\n```\n{"num":123}\n```\nAfter'
    const result = attemptJsonRepair(input)
    expect(result).toEqual({ num: 123 })
  })

  it('should remove trailing commas before closing braces', () => {
    const input = '{"a":1,"b":2,}'
    const result = attemptJsonRepair(input)
    expect(result).toEqual({ a: 1, b: 2 })
  })

  it('should remove trailing commas before closing brackets', () => {
    const input = '{"items":[1,2,3,]}'
    const result = attemptJsonRepair(input)
    expect(result).toEqual({ items: [1, 2, 3] })
  })

  it('should remove BOM from input', () => {
    const input = '﻿{"x":true}'
    const result = attemptJsonRepair(input)
    expect(result).toEqual({ x: true })
  })

  it('should return null for completely invalid input', () => {
    const result = attemptJsonRepair('this is not json at all')
    expect(result).toBeNull()
  })

  it('should return null for empty string', () => {
    expect(attemptJsonRepair('')).toBeNull()
  })

  it('should handle JSON inside a markdown code block with trailing commas', () => {
    const input = '```json\n{"name":"hello","count":5,}\n```'
    const result = attemptJsonRepair(input)
    expect(result).toEqual({ name: 'hello', count: 5 })
  })
})
