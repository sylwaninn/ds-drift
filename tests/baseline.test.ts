import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { applyBaseline, buildBaseline, readBaseline, writeBaseline } from '../src/baseline.js'
import { resolveConfig } from '../src/config.js'
import { run } from '../src/engine.js'
import type { Finding } from '../src/types.js'

const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url))

let dir = ''

afterEach(async () => {
  if (dir !== '') await rm(dir, { recursive: true, force: true })
  dir = ''
})

const finding = (file: string, found: string, line = 1): Finding => ({
  ruleId: 'color/hardcoded-exact-token',
  file,
  line,
  column: 1,
  found,
  message: 'm',
})

describe('baseline core', () => {
  it('absorbs exactly the recorded number of occurrences', () => {
    const recorded = [finding('a.css', '#3b82f6', 1), finding('a.css', '#3b82f6', 9)]
    const baseline = buildBaseline(recorded)
    const now = [
      finding('a.css', '#3b82f6', 4), // moved line: still absorbed
      finding('a.css', '#3b82f6', 8),
      finding('a.css', '#3b82f6', 20), // third occurrence: reported
      finding('b.css', '#3b82f6'), // other file: reported
    ]
    const { findings, baselined } = applyBaseline(now, baseline)
    expect(baselined).toBe(2)
    expect(findings.map((f) => [f.file, f.line])).toEqual([
      ['a.css', 20],
      ['b.css', 1],
    ])
  })

  it('round-trips through the file format', async () => {
    dir = await mkdtemp(join(tmpdir(), 'ds-drift-baseline-'))
    const path = join(dir, '.ds-drift.baseline.json')
    await writeBaseline(path, [finding('a.css', '#fff')])
    const baseline = await readBaseline(path)
    expect(baseline).toEqual({ version: 1, findings: { 'color/hardcoded-exact-token|a.css|#fff': 1 } })
    expect(await readBaseline(join(dir, 'missing.json'))).toBeUndefined()
  })
})

describe('baseline in the engine', () => {
  it('subtracts the baseline and reports the count', async () => {
    dir = await mkdtemp(join(tmpdir(), 'ds-drift-baseline-'))
    await cp(fixture('tokens.css'), join(dir, 'tokens.css'))
    await writeFile(join(dir, 'legacy.css'), '.a { color: #3b82f6; margin: 13px; }\n')
    const config = resolveConfig({ tokens: ['tokens.css'] }, dir)

    const before = await run(config, { all: true, baseline: false })
    expect(before.findings).toHaveLength(2)

    await writeBaseline(join(dir, config.baseline), before.findings)
    const after = await run(config, { all: true })
    expect(after.findings).toHaveLength(0)
    expect(after.baselined).toBe(2)
    expect(after.score).toBe(100)

    // New drift on top of the baseline is still reported.
    await writeFile(join(dir, 'legacy.css'), '.a { color: #3b82f6; margin: 13px; gap: 7px; }\n')
    const withNew = await run(config, { all: true })
    expect(withNew.findings.map((f) => f.found)).toEqual(['7px'])
    expect(withNew.baselined).toBe(2)
  })

  it('rejects an unsupported baseline format', async () => {
    dir = await mkdtemp(join(tmpdir(), 'ds-drift-baseline-'))
    const path = join(dir, 'bad.json')
    await writeFile(path, '{"version": 99}')
    await expect(readBaseline(path)).rejects.toThrow(/unsupported baseline format/)
  })
})
