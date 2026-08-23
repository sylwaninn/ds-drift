import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { loadConfig, resolveConfig, DEFAULT_WEIGHTS } from '../src/config.js'

let tempDirs: string[] = []

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'ds-drift-config-'))
  tempDirs.push(dir)
  return dir
}

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })))
  tempDirs = []
})

describe('resolveConfig', () => {
  it('applies defaults', () => {
    const config = resolveConfig({ tokens: ['tokens.css'] }, '/repo')
    expect(config.base).toBe('origin/main')
    expect(config.failUnder).toBe(80)
    expect(config.colorDeltaE).toBe(5)
    expect(config.weights).toEqual(DEFAULT_WEIGHTS)
    expect(config.tokenFiles).toEqual([resolve('/repo', 'tokens.css')])
  })

  it('merges custom weights over defaults', () => {
    const config = resolveConfig(
      { tokens: ['t.css'], weights: { 'spacing/off-scale': 10 } },
      '/repo',
    )
    expect(config.weights['spacing/off-scale']).toBe(10)
    expect(config.weights['color/hardcoded-exact-token']).toBe(5)
  })

  it('rejects empty token list', () => {
    expect(() => resolveConfig({ tokens: [] }, '/repo')).toThrow(/Invalid ds-drift config/)
  })

  it('normalizes tailwind shorthand and applies sass defaults', () => {
    expect(resolveConfig({ tokens: ['t.css'] }, '/').tailwind).toEqual({ enabled: false })
    expect(resolveConfig({ tokens: ['t.css'], tailwind: true }, '/').tailwind).toEqual({
      enabled: true,
    })
    expect(resolveConfig({ tokens: ['t.css'], tailwind: {} }, '/').tailwind).toEqual({
      enabled: true,
    })
    expect(resolveConfig({ tokens: ['t.css'] }, '/').sass).toEqual({ variables: true })
    expect(resolveConfig({ tokens: ['t.css'], sass: { variables: false } }, '/').sass).toEqual({
      variables: false,
    })
  })

  it('rejects unknown rule ids in weights', () => {
    expect(() =>
      resolveConfig({ tokens: ['t.css'], weights: { 'color/nope': 1 } }, '/repo'),
    ).toThrow(/Invalid ds-drift config/)
  })
})

describe('loadConfig', () => {
  it('loads a JSON config file and resolves paths against its directory', async () => {
    const dir = await makeTempDir()
    await writeFile(
      join(dir, 'ds-drift.config.json'),
      JSON.stringify({ tokens: ['design/tokens.css'], failUnder: 90 }),
    )
    const config = await loadConfig({ cwd: dir })
    expect(config.failUnder).toBe(90)
    expect(config.rootDir).toBe(dir)
    expect(config.tokenFiles).toEqual([join(dir, 'design/tokens.css')])
  })

  it('loads a TypeScript config file via jiti', async () => {
    const dir = await makeTempDir()
    await writeFile(
      join(dir, 'ds-drift.config.ts'),
      `const config = { tokens: ['tokens.json'] as string[], base: 'origin/develop' }\nexport default config\n`,
    )
    const config = await loadConfig({ cwd: dir })
    expect(config.base).toBe('origin/develop')
    expect(config.tokens).toEqual(['tokens.json'])
  })

  it('throws a friendly error when no config exists', async () => {
    const dir = await makeTempDir()
    await expect(loadConfig({ cwd: dir })).rejects.toThrow(/ds-drift init/)
  })
})
