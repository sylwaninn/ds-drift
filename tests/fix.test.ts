import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { applyFixes, fixableFindings, isApplicableSuggestion } from '../src/fix.js'
import type { Finding } from '../src/types.js'

let dir = ''

afterEach(async () => {
  if (dir !== '') await rm(dir, { recursive: true, force: true })
  dir = ''
})

const finding = (overrides: Partial<Finding>): Finding => ({
  ruleId: 'color/hardcoded-exact-token',
  file: 'app.css',
  line: 1,
  column: 1,
  found: '#3b82f6',
  suggestion: 'var(--color-primary)',
  message: 'm',
  ...overrides,
})

describe('fixableFindings', () => {
  it('keeps only exact-token findings with a usable suggestion', () => {
    const findings = [
      finding({}),
      finding({ ruleId: 'color/hardcoded-near-token' }),
      finding({ ruleId: 'spacing/off-scale', suggestion: 'var(--spacing-4)' }),
      finding({ suggestion: '$color-primary', file: 'app.css' }),
      finding({ suggestion: '$color-primary', file: 'app.scss' }),
      finding({ suggestion: 'color.primary' }),
    ]
    const fixable = fixableFindings(findings)
    expect(fixable).toHaveLength(2)
    expect(fixable[1]?.file).toBe('app.scss')
  })

  it('limits $variables to scss files', () => {
    expect(isApplicableSuggestion('$x', 'a.scss')).toBe(true)
    expect(isApplicableSuggestion('$x', 'a.css')).toBe(false)
    expect(isApplicableSuggestion('var(--x)', 'a.tsx')).toBe(true)
  })
})

describe('applyFixes', () => {
  it('replaces values in place, bottom-up, including two on one line', async () => {
    dir = await mkdtemp(join(tmpdir(), 'ds-drift-fix-'))
    await writeFile(join(dir, 'app.css'), '.a { color: #3b82f6; border-color: #3b82f6; }\n')
    const summary = await applyFixes(
      [
        finding({ line: 1, column: 13 }),
        finding({ line: 1, column: 36 }),
      ],
      dir,
    )
    expect(summary).toEqual({ fixed: 2, files: 1 })
    expect(await readFile(join(dir, 'app.css'), 'utf8')).toBe(
      '.a { color: var(--color-primary); border-color: var(--color-primary); }\n',
    )
  })

  it('skips findings whose text no longer matches', async () => {
    dir = await mkdtemp(join(tmpdir(), 'ds-drift-fix-'))
    await writeFile(join(dir, 'app.css'), '.a { color: #ffffff; }\n')
    const summary = await applyFixes([finding({ line: 1, column: 13 })], dir)
    expect(summary).toEqual({ fixed: 0, files: 0 })
    expect(await readFile(join(dir, 'app.css'), 'utf8')).toContain('#ffffff')
  })
})
