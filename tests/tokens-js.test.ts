import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { loadTokens, loadTokensSync } from '../src/tokens/index.js'
import { tokensFromModule } from '../src/tokens/js.js'

const fixture = fileURLToPath(new URL('./fixtures/tokens-theme.ts', import.meta.url))

describe('JS/TS theme modules as token sources', () => {
  it('walks the default export into dot-path tokens', async () => {
    const tokens = await loadTokens([fixture], '/')
    const byName = new Map(tokens.map((t) => [t.name, t]))
    expect(byName.get('colors.primary')).toMatchObject({ kind: 'color', value: '#3B82F6' })
    expect(byName.get('colors.surface')?.kind).toBe('color') // bare triplet
    expect(byName.get('typography.family')?.kind).toBe('other')
  })

  it('reads named exports under their export name', async () => {
    const tokens = await loadTokens([fixture], '/')
    const byName = new Map(tokens.map((t) => [t.name, t]))
    expect(byName.get('spacing.1')).toMatchObject({ kind: 'spacing', px: 4 })
    expect(byName.get('spacing.4')).toMatchObject({ kind: 'spacing', px: 16 })
  })

  it('treats numbers as px only under spacing-ish keys', async () => {
    const tokens = await loadTokens([fixture], '/')
    expect(tokens.find((t) => t.name === 'typography.fontWeight')).toBeUndefined()
  })

  it('skips functions and survives cycles', () => {
    const cyclic: Record<string, unknown> = { colors: { primary: '#fff' } }
    cyclic.self = cyclic
    const tokens = tokensFromModule({ default: cyclic }, 'theme.ts')
    expect(tokens.map((t) => t.name)).toEqual(['colors.primary'])
    expect(tokensFromModule({ default: { fn: () => '#fff' } }, 't.ts')).toEqual([])
  })

  it('loads synchronously too (ESLint plugin path)', () => {
    const tokens = loadTokensSync([fixture], '/')
    expect(tokens.some((t) => t.name === 'colors.primary')).toBe(true)
  })
})
