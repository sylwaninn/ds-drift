import type { Color } from 'culori'

export type TokenKind = 'color' | 'spacing' | 'other'

export interface DesignToken {
  /** Reference name as usable in code: `--color-primary` (CSS) or `color.primary` (W3C JSON). */
  name: string
  /** Raw value as written in the source file. */
  value: string
  kind: TokenKind
  /** File the token was read from. */
  source: string
  /** Parsed color, present when kind === 'color'. */
  color?: Color
  /** Length normalized to px (1rem = 16px), present when kind === 'spacing'. */
  px?: number
}
