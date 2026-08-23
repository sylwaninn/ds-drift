import { describe, expect, it } from 'vitest'
import { resolveConfig } from '../src/config.js'
import { buildJsonReport, renderJson, JSON_SCHEMA_VERSION } from '../src/reporters/json.js'
import { renderGithub } from '../src/reporters/github.js'
import { renderTerminal } from '../src/reporters/terminal.js'
import type { RunResult } from '../src/engine.js'
import type { Finding } from '../src/types.js'

const config = resolveConfig({ tokens: ['tokens.css'] }, '/repo')

const findings: Finding[] = [
  {
    ruleId: 'color/hardcoded-exact-token',
    file: 'src/app.css',
    line: 2,
    column: 10,
    found: '#3b82f6',
    suggestion: 'var(--color-primary)',
    message: '#3b82f6 duplicates token --color-primary. Use var(--color-primary)',
  },
  {
    ruleId: 'spacing/off-scale',
    file: 'src/app.css',
    line: 5,
    column: 3,
    found: '13px',
    suggestion: 'var(--spacing-4)',
    message: '13px is off the spacing scale. Nearest token: --spacing-4 (16px)',
  },
]

const result: RunResult = {
  findings,
  mode: 'diff',
  base: 'origin/main',
  filesScanned: 1,
  score: 93,
  passed: true,
}

describe('json reporter', () => {
  it('produces a versioned, stable report', () => {
    const report = buildJsonReport(result, config)
    expect(report.schemaVersion).toBe(JSON_SCHEMA_VERSION)
    expect(report).toMatchObject({
      score: 93,
      failUnder: 80,
      passed: true,
      mode: 'diff',
      base: 'origin/main',
      summary: {
        total: 2,
        byRule: { 'color/hardcoded-exact-token': 1, 'spacing/off-scale': 1 },
      },
    })
    expect(report.findings[0]?.weight).toBe(5)
    expect(report.findings[1]?.weight).toBe(2)
  })

  it('round-trips through JSON', () => {
    const parsed = JSON.parse(renderJson(result, config))
    expect(parsed.findings).toHaveLength(2)
  })
})

describe('github reporter', () => {
  it('emits one ::warning per finding plus a score notice', () => {
    const output = renderGithub(result, config).split('\n')
    expect(output).toHaveLength(3)
    expect(output[0]).toBe(
      '::warning file=src/app.css,line=2,col=10,title=ds-drift color/hardcoded-exact-token::#3b82f6 duplicates token --color-primary. Use var(--color-primary)',
    )
    expect(output[2]).toBe('::notice title=ds-drift::Drift score 93/100 (threshold 80)')
  })

  it('emits ::error and escapes control characters when failing', () => {
    const failing: RunResult = {
      ...result,
      score: 40,
      passed: false,
      findings: [{ ...findings[0]!, file: 'we,ird:file.css', message: 'a%b\nc' }],
    }
    const output = renderGithub(failing, config).split('\n')
    expect(output[0]).toContain('file=we%2Cird%3Afile.css')
    expect(output[0]).toContain('::a%25b%0Ac')
    expect(output[1]).toBe('::error title=ds-drift::Drift score 40/100, below threshold 80')
  })
})

describe('terminal reporter', () => {
  it('groups by file and shows the score', () => {
    const output = renderTerminal(result, config)
    expect(output).toContain('src/app.css')
    expect(output).toContain('color/hardcoded-exact-token')
    expect(output).toContain('Drift score: 93/100 (threshold 80)')
    expect(output).toContain('✖ 2 finding(s)')
  })

  it('prints the score for a clean run', () => {
    const clean: RunResult = { ...result, findings: [], score: 100 }
    const output = renderTerminal(clean, config)
    expect(output).toContain('No design system drift detected')
    expect(output).toContain('100/100')
  })
})
