import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { init, CONFIG_FILENAME } from '../src/init.js'

let dir: string

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('ds-drift init', () => {
  it('writes a commented config file', async () => {
    dir = await mkdtemp(join(tmpdir(), 'ds-drift-init-'))
    const target = await init(dir)
    expect(target).toBe(join(dir, CONFIG_FILENAME))
    const content = await readFile(target, 'utf8')
    expect(content).toContain("import { defineConfig } from 'ds-drift'")
    expect(content).toContain('tokens:')
    expect(content).toContain('// dsPackages:')
  })

  it('refuses to overwrite an existing config', async () => {
    dir = await mkdtemp(join(tmpdir(), 'ds-drift-init-'))
    await init(dir)
    await expect(init(dir)).rejects.toThrow(/already exists/)
  })
})
