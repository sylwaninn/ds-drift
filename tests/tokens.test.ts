import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { loadTokens, classifyValue } from '../src/tokens/index.js'

const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url))

describe('classifyValue', () => {
  it('classifies hex colors, including shorthand', () => {
    expect(classifyValue('#3B82F6').kind).toBe('color')
    expect(classifyValue('#fff').kind).toBe('color')
  })

  it('classifies rgb()/hsl() colors', () => {
    expect(classifyValue('rgb(220, 38, 38)').kind).toBe('color')
    expect(classifyValue('hsl(217, 91%, 60%)').kind).toBe('color')
  })

  it('classifies px/rem lengths as spacing with px normalization', () => {
    expect(classifyValue('0.25rem')).toMatchObject({ kind: 'spacing', px: 4 })
    expect(classifyValue('6px')).toMatchObject({ kind: 'spacing', px: 6 })
  })

  it('classifies everything else as other', () => {
    expect(classifyValue('system-ui, sans-serif').kind).toBe('other')
    expect(classifyValue('0 1px 2px rgb(0 0 0 / 0.05)').kind).toBe('other')
    expect(classifyValue('50%').kind).toBe('other')
  })
})

describe('CSS token ingestion', () => {
  it('reads custom properties and classifies them', async () => {
    const tokens = await loadTokens([fixture('tokens.css')], '/')
    const byName = new Map(tokens.map((t) => [t.name, t]))

    expect(byName.get('--color-primary')).toMatchObject({ kind: 'color', value: '#3B82F6' })
    expect(byName.get('--color-white')?.kind).toBe('color')
    expect(byName.get('--color-danger')?.kind).toBe('color')
    expect(byName.get('--spacing-1')).toMatchObject({ kind: 'spacing', px: 4 })
    expect(byName.get('--spacing-4')).toMatchObject({ kind: 'spacing', px: 16 })
    expect(byName.get('--radius-md')).toMatchObject({ kind: 'spacing', px: 6 })
    expect(byName.get('--font-sans')?.kind).toBe('other')
    expect(byName.get('--shadow-sm')?.kind).toBe('other')
  })

  it('dedupes identical redeclarations', async () => {
    const tokens = await loadTokens([fixture('tokens.css')], '/')
    expect(tokens.filter((t) => t.name === '--color-primary')).toHaveLength(1)
  })
})

describe('W3C JSON token ingestion', () => {
  it('reads tokens with group $type inheritance and dot-path names', async () => {
    const tokens = await loadTokens([fixture('tokens.json')], '/')
    const byName = new Map(tokens.map((t) => [t.name, t]))

    expect(byName.get('color.primary')).toMatchObject({ kind: 'color', value: '#3B82F6' })
    expect(byName.get('space.sm')).toMatchObject({ kind: 'spacing', px: 8 })
    expect(byName.get('space.md')).toMatchObject({ kind: 'spacing', px: 16, value: '16px' })
  })

  it('resolves {aliases} within the document', async () => {
    const tokens = await loadTokens([fixture('tokens.json')], '/')
    const brand = tokens.find((t) => t.name === 'color.brand')
    expect(brand).toMatchObject({ kind: 'color', value: '#3B82F6' })
  })

  it('classifies untyped tokens by value shape', async () => {
    const tokens = await loadTokens([fixture('tokens.json')], '/')
    const byName = new Map(tokens.map((t) => [t.name, t]))
    expect(byName.get('misc.untyped-color')?.kind).toBe('color')
    expect(byName.get('misc.shadow')?.kind).toBe('other')
  })

  it('drops alias cycles instead of hanging', async () => {
    const tokens = await loadTokens([fixture('tokens.json')], '/')
    expect(tokens.find((t) => t.name === 'broken.loop-a')).toBeUndefined()
  })
})

describe('loadTokens dispatch', () => {
  it('rejects unsupported extensions', async () => {
    await expect(loadTokens(['tokens.yaml'], '/')).rejects.toThrow(/Unsupported token file type/)
  })
})
