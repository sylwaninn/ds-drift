import { describe, expect, it } from 'vitest'
import { resolveConfig } from '../src/config.js'
import { componentOffDsImport } from '../src/rules/component-off-ds-import.js'
import type { Candidate, RuleContext } from '../src/types.js'

const importCandidate = (value: string, names: string[]): Candidate => ({
  kind: 'import',
  value,
  file: 'Widget.tsx',
  line: 2,
  column: 1,
  importNames: names,
})

function context(candidates: Candidate[], overrides: object = {}): RuleContext {
  const config = resolveConfig({ tokens: ['tokens.css'], ...overrides }, '/')
  return { candidates, tokens: [], config }
}

const WHITELIST = { dsPackages: ['@acme/ui', '@acme/ui/*'] }

describe('component/off-ds-import', () => {
  it('flags components imported from outside the whitelist', () => {
    const findings = componentOffDsImport.check(
      context([importCandidate('@mui/material', ['Card', 'List'])], WHITELIST),
    )
    expect(findings).toHaveLength(1)
    expect(findings[0]?.message).toContain('Card, List')
    expect(findings[0]?.message).toContain('@acme/ui')
  })

  it('accepts design system and subpath imports', () => {
    const candidates = [
      importCandidate('@acme/ui', ['Button']),
      importCandidate('@acme/ui/button', ['Button']),
    ]
    expect(componentOffDsImport.check(context(candidates, WHITELIST))).toHaveLength(0)
  })

  it('skips relative imports and react/next', () => {
    const candidates = [
      importCandidate('./LocalThing', ['LocalThing']),
      importCandidate('react', ['React']),
      importCandidate('react-dom/client', ['Root']),
      importCandidate('next/link', ['Link']),
    ]
    expect(componentOffDsImport.check(context(candidates, WHITELIST))).toHaveLength(0)
  })

  it('is disabled entirely when no whitelist is configured', () => {
    const findings = componentOffDsImport.check(
      context([importCandidate('@mui/material', ['Card'])]),
    )
    expect(findings).toHaveLength(0)
  })
})
