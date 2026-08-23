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

// Bare channel triplets, the Tailwind `rgb(var(--x) / <alpha>)` and shadcn
// patterns: `--color-primary: 10 10 10` or `--background: 222.2 84% 4.9%`.
const RGB_TRIPLET_RE = /^(\d{1,3})[ ,]+(\d{1,3})[ ,]+(\d{1,3})$/
const HSL_TRIPLET_RE = /^(-?[\d.]+)(?:deg)?[ ,]+([\d.]+)%[ ,]+([\d.]+)%$/

function parseBareTriplet(value: string) {
  const rgb = RGB_TRIPLET_RE.exec(value)
  if (rgb !== null) {
    const [r, g, b] = [rgb[1]!, rgb[2]!, rgb[3]!].map(Number)
    if (r! <= 255 && g! <= 255 && b! <= 255) return parse(`rgb(${r} ${g} ${b})`)
    return undefined
  }
  const hsl = HSL_TRIPLET_RE.exec(value)
  if (hsl !== null) return parse(`hsl(${hsl[1]} ${hsl[2]}% ${hsl[3]}%)`)
  return undefined
}

/** Classify a raw token value into color / spacing / other, with normalized fields. */
export function classifyValue(value: string): Pick<DesignToken, 'kind' | 'color' | 'px'> {
  const trimmed = value.trim()
  const px = lengthToPx(trimmed)
  if (px !== undefined) return { kind: 'spacing', px }
  const color = parse(trimmed) ?? parseBareTriplet(trimmed)
  if (color !== undefined) return { kind: 'color', color }
  return { kind: 'other' }
}
