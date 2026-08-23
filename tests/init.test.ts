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
    expect(detection.tokenFiles.map((c) => c.file)).toEqual(['src/styles/tokens.css'])
    expect(detection.tokenFiles[0]?.hint).toBe('4 token declaration(s)')
    expect(detection.tailwind).toBe(true)
    expect(detection.storybook).toBe(true)
    expect(detection.dsPackages).toEqual(['@acme/ui'])
    expect(detection.base).toBe('origin/main')
  })

  it('ranks a dedicated token file above a generated bundle embedding a few vars', async () => {
    await makeProject()
    const noise = Array.from({ length: 300 }, (_, i) => `.c${i} { color: red; }`).join('\n')
    await writeFile(
      join(dir, 'src/styles/app.css'),
      `:root { --x: 1px; --y: 2px; --z: 3px; }\n${noise}\n`,
    )
    const detection = await detectProject(dir)
    const files = detection.tokenFiles.map((c) => c.file)
    expect(files.indexOf('src/styles/tokens.css')).toBeLessThan(files.indexOf('src/styles/app.css'))
  })

  it('scans hidden design/token directories but not other hidden dirs', async () => {
    await makeProject()
    const tokensCss = ':root {\n  --a: #111;\n  --b: #222;\n  --c: #333;\n}\n'
    await mkdir(join(dir, '.design-sync/generated'), { recursive: true })
    await writeFile(join(dir, '.design-sync/generated/theme-tokens.css'), tokensCss)
    await mkdir(join(dir, '.cache'), { recursive: true })
    await writeFile(join(dir, '.cache/tokens.css'), tokensCss)
    const detection = await detectProject(dir)
    const files = detection.tokenFiles.map((c) => c.file)
    expect(files).toContain('.design-sync/generated/theme-tokens.css')
    expect(files).not.toContain('.cache/tokens.css')
  })

  it('detects JS/TS theme modules containing literal colors', async () => {
    await makeProject()
    await mkdir(join(dir, 'src/design'), { recursive: true })
    await writeFile(
      join(dir, 'src/design/theme.ts'),
      "export const palette = { a: '#111111', b: '#222222', c: '#333333' }\n",
    )
    await writeFile(join(dir, 'src/design/theme-map.ts'), "export const map = { a: 'b' }\n")
    const detection = await detectProject(dir)
    const byFile = new Map(detection.tokenFiles.map((c) => [c.file, c.hint]))
    expect(byFile.get('src/design/theme.ts')).toBe('3 color literal(s)')
    // No literals, but token-ish name + exports: proposed anyway, labeled as such.
    expect(byFile.get('src/design/theme-map.ts')).toBe('name match, no literal values found')
    const files = detection.tokenFiles.map((c) => c.file)
    expect(files.indexOf('src/design/theme.ts')).toBeLessThan(files.indexOf('src/design/theme-map.ts'))
  })

  it('ranks Tailwind @theme files first', async () => {
    await makeProject()
    await writeFile(
      join(dir, 'src/styles/theme.css'),
      '@theme {\n  --color-primary: #3B82F6;\n}\n',
    )
    const detection = await detectProject(dir)
    expect(detection.tokenFiles[0]?.file).toBe('src/styles/theme.css')
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
