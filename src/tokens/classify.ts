import { parse } from 'culori'
import type { DesignToken } from './types.js'

const LENGTH_RE = /^-?(?:\d+\.?\d*|\.\d+)(px|rem)$/

/** Length in px if the value is a px/rem length, else undefined. 1rem = 16px. */
export function lengthToPx(value: string): number | undefined {
  const trimmed = value.trim()
  const m = LENGTH_RE.exec(trimmed)
  if (!m) return undefined
  const n = Number.parseFloat(trimmed)
  return m[1] === 'rem' ? n * 16 : n
}

/** Classify a raw token value into color / spacing / other, with normalized fields. */
export function classifyValue(value: string): Pick<DesignToken, 'kind' | 'color' | 'px'> {
  const trimmed = value.trim()
  const px = lengthToPx(trimmed)
  if (px !== undefined) return { kind: 'spacing', px }
  const color = parse(trimmed)
  if (color !== undefined) return { kind: 'color', color }
  return { kind: 'other' }
}
