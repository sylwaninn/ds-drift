import { lengthToPx } from '../tokens/classify.js'
import { scanValue } from './scan.js'

/**
 * Tailwind arbitrary-value extraction. Targets the escape hatch that bypasses
 * the design system: `bg-[#3b82f6]`, `p-[13px]`, `-m-[0.8rem]`. Regular
 * utilities (`p-4`, `bg-primary`) come from the theme and are left alone.
 */

export interface TailwindMatch {
  kind: 'color' | 'length'
  /** Normalized value: underscores decoded, negative prefix applied. */
  value: string
  /** 0-based offset within the scanned text, pointing at the bracket content. */
  index: number
  /** CSS property the utility maps to; set for spacing utilities only. */
  prop?: string
}

/** Spacing utilities mapped to the property checked by spacing/off-scale. */
const SPACING_UTILITIES: Record<string, string> = {
  p: 'padding',
  px: 'padding-inline',
  py: 'padding-block',
  ps: 'padding-inline-start',
  pe: 'padding-inline-end',
  pt: 'padding-top',
  pr: 'padding-right',
  pb: 'padding-bottom',
  pl: 'padding-left',
  m: 'margin',
  mx: 'margin-inline',
  my: 'margin-block',
  ms: 'margin-inline-start',
  me: 'margin-inline-end',
  mt: 'margin-top',
  mr: 'margin-right',
  mb: 'margin-bottom',
  ml: 'margin-left',
  gap: 'gap',
  'gap-x': 'column-gap',
  'gap-y': 'row-gap',
  'space-x': 'margin-inline',
  'space-y': 'margin-block',
  inset: 'inset',
  'inset-x': 'inset-inline',
  'inset-y': 'inset-block',
  top: 'top',
  right: 'right',
  bottom: 'bottom',
  left: 'left',
  start: 'inset-inline-start',
  end: 'inset-inline-end',
}

const UTILITY_RE = /^(-)?([a-z][a-z0-9-]*)-\[([^\]]+)\](?:\/[\w.%]+)?$/

/** Scan a class attribute string for arbitrary values worth checking. */
export function scanTailwindClasses(text: string): TailwindMatch[] {
  const matches: TailwindMatch[] = []
  for (const token of text.matchAll(/\S+/g)) {
    const { utility, offset } = stripVariants(token[0])
    const parsed = UTILITY_RE.exec(utility)
    if (parsed === null) continue
    const [, negative, name, rawValue] = parsed
    // Tailwind encodes spaces as underscores inside brackets (same length, so
    // offsets into the original text stay valid).
    const value = rawValue!.replace(/_/g, ' ')
    const valueIndex = token.index + offset + utility.indexOf('[') + 1

    const colors = scanValue(value).filter((v) => v.kind === 'color')
    if (colors.length > 0) {
      for (const color of colors) {
        matches.push({ kind: 'color', value: color.value, index: valueIndex + color.index })
      }
      continue
    }

    const prop = SPACING_UTILITIES[name!]
    if (prop !== undefined && lengthToPx(value) !== undefined) {
      matches.push({
        kind: 'length',
        value: negative === '-' ? `-${value.trim()}` : value.trim(),
        index: valueIndex,
        prop,
      })
    }
  }
  return matches
}

/** Drop variant prefixes (`hover:`, `md:`, `[&:hover]:`), tracking the offset of what remains. */
function stripVariants(token: string): { utility: string; offset: number } {
  let depth = 0
  let start = 0
  for (let i = 0; i < token.length; i++) {
    const ch = token[i]
    if (ch === '[') depth++
    else if (ch === ']') depth--
    else if (ch === ':' && depth === 0) start = i + 1
  }
  return { utility: token.slice(start), offset: start }
}
