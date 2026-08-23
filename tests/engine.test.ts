import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { resolveConfig } from '../src/config.js'
import { run, type RunResult } from '../src/engine.js'

const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url))

const DRIFT_CSS = `.a {
  color: #3b82f6; /* ds-drift-ignore */
  /* ds-drift-ignore spacing/off-scale */
  margin: 13px;
  padding: 13px; /* ds-drift-ignore color/hardcoded-exact-token */
}
`

let dir: string
let result: RunResult

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'ds-drift-engine-'))
  await cp(fixture('tokens.css'), join(dir, 'tokens.css'))
  await cp(fixture('Widget.tsx'), join(dir, 'src/Widget.tsx'), { recursive: true })
  await writeFile(join(dir, 'src/drift.css'), DRIFT_CSS)
  await mkdir(join(dir, 'skipme'), { recursive: true })
  await writeFile(join(dir, 'skipme/bad.css'), '.x { color: #3b82f6; }\n')
  const config = resolveConfig(
    {
      tokens: ['tokens.css'],
      dsPackages: ['@acme/ui', '@acme/ui/*'],
      ignore: ['skipme/**'],
    },
    dir,
  )
  result = await run(config, { all: true })
})

afterAll(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('engine --all run', () => {
  it('excludes token files and ignored globs from scanning', () => {
    expect(result.filesScanned).toBe(2)
    expect(result.findings.every((f) => f.file !== 'tokens.css')).toBe(true)
    expect(result.findings.every((f) => !f.file.startsWith('skipme/'))).toBe(true)
  })

  it('applies line-level ignores across css and tsx', () => {
    const driftCss = result.findings.filter((f) => f.file === 'src/drift.css')
    // color on line 2 ignored; margin line 4 rule-ignored; padding line 5 has a
    // wrong-rule ignore so its off-scale finding survives.
    expect(driftCss.map((f) => [f.ruleId, f.line])).toEqual([['spacing/off-scale', 5]])
    // span color on line 20 is covered by the JSX ignore comment on line 19
    expect(result.findings.some((f) => f.file === 'src/Widget.tsx' && f.line === 20)).toBe(false)
    // the @headlessui/react import is covered by a rule-scoped ignore on the line above
    expect(result.findings.some((f) => f.found === '@headlessui/react')).toBe(false)
  })

  it('reports drift across parsers and rules, sorted by file/line', () => {
    const widget = result.findings.filter((f) => f.file === 'src/Widget.tsx')
    expect(widget.map((f) => [f.ruleId, f.line])).toEqual([
      ['component/off-ds-import', 4],
      ['color/hardcoded-exact-token', 11],
      ['spacing/off-scale', 12],
      ['color/hardcoded-near-token', 18],
      ['spacing/off-scale', 18],
    ])
  })

  it('honors per-rule disabling', async () => {
    const config = resolveConfig(
      { tokens: ['tokens.css'], rules: { 'spacing/off-scale': false } },
      dir,
    )
    const filtered = await run(config, { all: true })
    expect(filtered.findings.some((f) => f.ruleId === 'spacing/off-scale')).toBe(false)
  })
})
