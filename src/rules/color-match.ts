import { differenceCiede2000, formatHex8, parse } from 'culori'
import type { DesignToken } from '../tokens/types.js'

const deltaE = differenceCiede2000()

export interface ColorMatch {
  token: DesignToken
  deltaE: number
  /** Same color after normalization (alpha included). */
  exact: boolean
}

/**
 * Nearest color token by CIEDE2000. Tokens whose alpha differs by more than
 * 0.01 from the candidate are skipped: a translucent value is not a duplicate
 * of an opaque token.
 */
export function matchColor(value: string, tokens: DesignToken[]): ColorMatch | undefined {
  const color = parse(value)
  if (color === undefined) return undefined
  const alpha = color.alpha ?? 1
  let best: ColorMatch | undefined
  for (const token of tokens) {
    if (token.kind !== 'color' || token.color === undefined) continue
    if (Math.abs(alpha - (token.color.alpha ?? 1)) > 0.01) continue
    const d = deltaE(color, token.color)
    if (best === undefined || d < best.deltaE) {
      best = { token, deltaE: d, exact: false }
    }
  }
  if (best !== undefined) {
    best.exact = formatHex8(color) === formatHex8(best.token.color!)
  }
  return best
}

/** How to write the token in code: `var(--x)` for CSS tokens, the dot-path name otherwise. */
export function tokenRef(token: DesignToken): string {
  return token.name.startsWith('--') ? `var(${token.name})` : token.name
}
