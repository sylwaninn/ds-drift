/** Regex-level extraction of color/length literals from CSS-ish value text. */

export interface ValueMatch {
  kind: 'color' | 'length'
  value: string
  /** 0-based offset within the scanned text. */
  index: number
}

// Longest hex forms first so #3B82F6 doesn't half-match as #3B8.
const HEX_RE = /#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{4}|[0-9a-f]{3})\b/gi
const FN_COLOR_RE = /\b(?:rgba?|hsla?)\(\s*[^)]*\)/gi
// Negative lookbehind keeps us out of identifiers, hex digits and numbers like "1.5e3px".
const LENGTH_RE = /(?<![\w.#-])-?(?:\d+\.?\d*|\.\d+)(?:px|rem)\b/g

/** Properties whose lengths must sit on the spacing scale. */
export function isSpacingProp(prop: string): boolean {
  const p = prop.toLowerCase()
  return (
    p.startsWith('margin') ||
    p.startsWith('padding') ||
    p.startsWith('inset') ||
    p === 'gap' ||
    p.endsWith('-gap') ||
    p === 'top' ||
    p === 'right' ||
    p === 'bottom' ||
    p === 'left'
  )
}

/** Extract color and length literals with their offsets from a value string. */
export function scanValue(text: string): ValueMatch[] {
  const matches: ValueMatch[] = []
  for (const re of [HEX_RE, FN_COLOR_RE]) {
    re.lastIndex = 0
    for (const m of text.matchAll(re)) {
      matches.push({ kind: 'color', value: m[0], index: m.index })
    }
  }
  LENGTH_RE.lastIndex = 0
  for (const m of text.matchAll(LENGTH_RE)) {
    matches.push({ kind: 'length', value: m[0], index: m.index })
  }
  return matches.sort((a, b) => a.index - b.index)
}

/** camelCase style key to kebab-case CSS property (marginTop -> margin-top). */
export function camelToKebab(key: string): string {
  return key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)
}
