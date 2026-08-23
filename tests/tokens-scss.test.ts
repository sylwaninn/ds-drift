import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { loadTokens } from '../src/tokens/index.js'

const fixture = fileURLToPath(new URL('./fixtures/tokens.scss', import.meta.url))

describe('SCSS variable tokens', () => {
  it('reads $variables alongside custom properties', async () => {
    const tokens = await loadTokens([fixture], '/')
    const byName = new Map(tokens.map((t) => [t.name, t]))
    expect(byName.get('$color-primary')).toMatchObject({ kind: 'color', value: '#3B82F6' })
    expect(byName.get('$spacing-sm')).toMatchObject({ kind: 'spacing', px: 8 })
    expect(byName.get('--color-white')?.kind).toBe('color')
  })

  it('strips !default flags from values', async () => {
    const tokens = await loadTokens([fixture], '/')
    const accent = tokens.find((t) => t.name === '$color-accent')
    expect(accent).toMatchObject({ kind: 'color', value: '#F59E0B' })
  })

  it('classifies computed Sass expressions as other', async () => {
    const tokens = await loadTokens([fixture], '/')
    expect(tokens.find((t) => t.name === '$spacing-computed')?.kind).toBe('other')
  })

  it('skips $variables when sass.variables is disabled', async () => {
    const tokens = await loadTokens([fixture], '/', { scssVariables: false })
    expect(tokens.some((t) => t.name.startsWith('$'))).toBe(false)
    expect(tokens.some((t) => t.name === '--color-white')).toBe(true)
  })
})
