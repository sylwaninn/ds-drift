import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { resolveConfig } from '../src/config.js'
import { spacingOffScale } from '../src/rules/spacing-off-scale.js'
import { loadTokens, type DesignToken } from '../src/tokens/index.js'
import type { Candidate, RuleContext } from '../src/types.js'

// Scale from tokens.css: 4, 8, 16, 32 (spacing-*) and 6 (radius-md)
const fixture = fileURLToPath(new URL('./fixtures/tokens.css', import.meta.url))

let tokens: DesignToken[]
beforeAll(async () => {
  tokens = await loadTokens([fixture], '/')
})

const length = (value: string, prop = 'margin'): Candidate => ({
  kind: 'length',
  value,
  file: 'app.css',
  line: 5,
  column: 3,
  prop,
})

function context(candidates: Candidate[], overrides: object = {}, tokenSet = tokens): RuleContext {
  const config = resolveConfig({ tokens: ['tokens.css'], ...overrides }, '/')
  return { candidates, tokens: tokenSet, config }
}

describe('spacing/off-scale', () => {
  it('flags a px length off the scale and suggests the nearest token', () => {
    const findings = spacingOffScale.check(context([length('13px')]))
    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({
      ruleId: 'spacing/off-scale',
      found: '13px',
      suggestion: 'var(--spacing-4)',
    })
    expect(findings[0]?.message).toContain('16px')
  })

  it('accepts values on the scale, whether px or the rem equivalent', () => {
    expect(spacingOffScale.check(context([length('8px')]))).toHaveLength(0)
    expect(spacingOffScale.check(context([length('0.5rem')]))).toHaveLength(0)
  })

  it('treats zero as always on scale', () => {
    expect(spacingOffScale.check(context([length('0px')]))).toHaveLength(0)
  })

  it('compares negative lengths by magnitude', () => {
    expect(spacingOffScale.check(context([length('-8px')]))).toHaveLength(0)
    expect(spacingOffScale.check(context([length('-13px')]))).toHaveLength(1)
  })

  it('only checks spacing properties', () => {
    expect(spacingOffScale.check(context([length('13px', 'border')]))).toHaveLength(0)
    expect(spacingOffScale.check(context([length('13px', 'font-size')]))).toHaveLength(0)
    expect(spacingOffScale.check(context([length('13px', 'gap')]))).toHaveLength(1)
    expect(spacingOffScale.check(context([length('13px', 'padding-inline')]))).toHaveLength(1)
  })

  it('respects a custom tolerance', () => {
    expect(spacingOffScale.check(context([length('13px')], { spacingTolerancePx: 3 }))).toHaveLength(0)
  })

  it('does nothing when no spacing tokens exist', () => {
    const colorOnly = tokens.filter((t) => t.kind !== 'spacing')
    expect(spacingOffScale.check(context([length('13px')], {}, colorOnly))).toHaveLength(0)
  })
})
