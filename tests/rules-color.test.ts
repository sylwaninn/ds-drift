import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { resolveConfig } from '../src/config.js'
import { colorHardcodedExactToken } from '../src/rules/color-hardcoded-exact-token.js'
import { colorHardcodedNearToken } from '../src/rules/color-hardcoded-near-token.js'
import { loadTokens, type DesignToken } from '../src/tokens/index.js'
import type { Candidate, RuleContext } from '../src/types.js'

const fixture = fileURLToPath(new URL('./fixtures/tokens.css', import.meta.url))

let tokens: DesignToken[]
beforeAll(async () => {
  tokens = await loadTokens([fixture], '/')
})

const candidate = (value: string): Candidate => ({
  kind: 'color',
  value,
  file: 'app.css',
  line: 3,
  column: 10,
  prop: 'color',
})

function context(values: string[], overrides: object = {}): RuleContext {
  const config = resolveConfig({ tokens: ['tokens.css'], ...overrides }, '/')
  return { candidates: values.map(candidate), tokens, config }
}

describe('color/hardcoded-exact-token', () => {
  it('flags a hex duplicating a token, case-insensitively', () => {
    const findings = colorHardcodedExactToken.check(context(['#3b82f6']))
    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({
      ruleId: 'color/hardcoded-exact-token',
      found: '#3b82f6',
      suggestion: 'var(--color-primary)',
      line: 3,
      column: 10,
    })
  })

  it('flags rgb() notation duplicating a hex token', () => {
    const findings = colorHardcodedExactToken.check(context(['rgb(59, 130, 246)']))
    expect(findings).toHaveLength(1)
    expect(findings[0]?.suggestion).toBe('var(--color-primary)')
  })

  it('flags shorthand hex (#fff) against the expanded token', () => {
    const findings = colorHardcodedExactToken.check(context(['#fff']))
    expect(findings).toHaveLength(1)
    expect(findings[0]?.suggestion).toBe('var(--color-white)')
  })

  it('ignores colors far from every token', () => {
    expect(colorHardcodedExactToken.check(context(['#ff00ff']))).toHaveLength(0)
  })

  it('does not match a translucent value against an opaque token', () => {
    expect(colorHardcodedExactToken.check(context(['rgb(59 130 246 / 0.5)']))).toHaveLength(0)
  })
})

describe('color/hardcoded-near-token', () => {
  it('flags a color within the deltaE threshold and suggests the nearest token', () => {
    const findings = colorHardcodedNearToken.check(context(['#3a81f5']))
    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({
      ruleId: 'color/hardcoded-near-token',
      suggestion: 'var(--color-primary)',
    })
    expect(findings[0]?.message).toMatch(/ΔE \d+\.\d/)
  })

  it('flags hsl() that rounds near (but not onto) a token', () => {
    const findings = colorHardcodedNearToken.check(context(['hsl(217, 91%, 60%)']))
    expect(findings).toHaveLength(1)
    expect(findings[0]?.suggestion).toBe('var(--color-primary)')
  })

  it('does not double-report exact duplicates', () => {
    expect(colorHardcodedNearToken.check(context(['#3b82f6']))).toHaveLength(0)
  })

  it('ignores colors beyond the threshold', () => {
    expect(colorHardcodedNearToken.check(context(['#ff00ff']))).toHaveLength(0)
  })

  it('respects a custom colorDeltaE threshold', () => {
    const findings = colorHardcodedNearToken.check(context(['#3a81f5'], { colorDeltaE: 0.1 }))
    expect(findings).toHaveLength(0)
  })

  it('skips translucent values whose alpha matches no token', () => {
    expect(colorHardcodedNearToken.check(context(['rgb(59 130 246 / 0.5)']))).toHaveLength(0)
  })
})
