import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { detectProject, generateConfig, runInit, CONFIG_FILENAME } from '../src/init.js'
import { resolveConfig } from '../src/config.js'

let dir: string

async function makeProject(): Promise<string> {
  dir = await mkdtemp(join(tmpdir(), 'ds-drift-init-'))
  await mkdir(join(dir, 'src/styles'), { recursive: true })
  await writeFile(
    join(dir, 'src/styles/tokens.css'),
    ':root {\n  --color-primary: #3B82F6;\n  --color-danger: #DC2626;\n  --spacing-1: 0.25rem;\n  --spacing-2: 0.5rem;\n}\n',
  )
  await writeFile(join(dir, 'src/styles/app.css'), '.a { color: red; }\n')
  await writeFile(
    join(dir, 'package.json'),
    JSON.stringify({
      name: 'app',
      dependencies: { '@acme/ui': '1.0.0', react: '19.0.0' },
      devDependencies: { tailwindcss: '4.0.0', storybook: '9.0.0' },
    }),
  )
  return dir
}

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('detectProject', () => {
  it('finds token files, Tailwind, Storybook and DS packages', async () => {
    await makeProject()
    const detection = await detectProject(dir)
    expect(detection.tokenFiles).toEqual(['src/styles/tokens.css'])
    expect(detection.tailwind).toBe(true)
    expect(detection.storybook).toBe(true)
    expect(detection.dsPackages).toEqual(['@acme/ui'])
    expect(detection.base).toBe('origin/main')
  })

  it('ranks Tailwind @theme files first', async () => {
    await makeProject()
    await writeFile(
      join(dir, 'src/styles/theme.css'),
      '@theme {\n  --color-primary: #3B82F6;\n}\n',
    )
    const detection = await detectProject(dir)
    expect(detection.tokenFiles[0]).toBe('src/styles/theme.css')
  })

  it('handles a project with nothing to detect', async () => {
    dir = await mkdtemp(join(tmpdir(), 'ds-drift-init-'))
    const detection = await detectProject(dir)
    expect(detection.tokenFiles).toEqual([])
    expect(detection.tailwind).toBe(false)
    expect(detection.dsPackages).toEqual([])
  })
})

describe('runInit (non-interactive)', () => {
  it('writes a config from detected defaults that resolveConfig accepts', async () => {
    await makeProject()
    const target = await runInit({ cwd: dir, yes: true })
    expect(target).toBe(join(dir, CONFIG_FILENAME))
    const content = await readFile(target, 'utf8')
    expect(content).toContain("tokens: ['src/styles/tokens.css']")
    expect(content).toContain('failUnder: 80')
    expect(content).toContain('tailwind: true')
    expect(content).toContain("dsPackages: ['@acme/ui', '@acme/ui/*']")
    expect(content).toContain("ignore: ['**/*.stories.*']")
  })

  it('refuses to overwrite without --force', async () => {
    await makeProject()
    await runInit({ cwd: dir, yes: true })
    await expect(runInit({ cwd: dir, yes: true })).rejects.toThrow(/--force/)
    await expect(runInit({ cwd: dir, yes: true, force: true })).resolves.toBeDefined()
  })
})

describe('generateConfig', () => {
  it('produces a config object that validates', () => {
    const content = generateConfig({
      tokens: ['tokens.css'],
      failUnder: 90,
      tailwind: true,
      dsPackages: ['@acme/ui'],
      ignore: [],
      base: 'origin/develop',
    })
    // Extract the object literal and validate it through the real schema.
    const objectSource = content.slice(content.indexOf('({') + 1, content.lastIndexOf(')'))
    const raw: unknown = new Function(`return ${objectSource}`)()
    const config = resolveConfig(raw, '/repo')
    expect(config.failUnder).toBe(90)
    expect(config.tailwind).toEqual({ enabled: true })
    expect(config.base).toBe('origin/develop')
  })

  it('comments out everything not chosen', () => {
    const content = generateConfig({
      tokens: [],
      failUnder: 80,
      tailwind: false,
      dsPackages: [],
      ignore: [],
      base: 'origin/main',
    })
    expect(content).toContain('// tailwind: true,')
    expect(content).toContain("// dsPackages: ['@acme/ui', '@acme/ui/*'],")
    expect(content).toContain("// base: 'origin/main',")
  })
})
