import type { ResolvedConfig, RuleId } from './config.js'
import type { DesignToken } from './tokens/types.js'

export type CandidateKind = 'color' | 'length' | 'import'

/** A value extracted from source code that a rule may flag. */
export interface Candidate {
  kind: CandidateKind
  /** The literal as found: '#3b82f5', '13px', or a module specifier for imports. */
  value: string
  /** Path relative to the config root, posix separators. */
  file: string
  /** 1-based. */
  line: number
  /** 1-based. */
  column: number
  /** CSS property (or camelCase style key normalized to kebab-case) the value appears in. */
  prop?: string
  /** For kind 'import': imported component names (PascalCase ones). */
  importNames?: string[]
}

export interface Finding {
  ruleId: RuleId
  file: string
  line: number
  column: number
  /** The offending value as written. */
  found: string
  /** Suggested replacement, e.g. `var(--color-primary)` or `color.primary`. */
  suggestion?: string
  message: string
}

export interface RuleContext {
  candidates: Candidate[]
  tokens: DesignToken[]
  config: ResolvedConfig
}

export interface Rule {
  id: RuleId
  meta: { description: string }
  check(context: RuleContext): Finding[]
}
