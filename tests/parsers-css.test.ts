import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { extractCssCandidates } from '../src/parsers/css.js'

const fixturePath = fileURLToPath(new URL('./fixtures/app.css', import.meta.url))

async function fixtureCandidates() {
  const source = await readFile(fixturePath, 'utf8')
  return extractCssCandidates(source, 'app.css')
}

describe('CSS candidate extraction', () => {
  it('extracts hex, rgb() and hsl() colors with positions', async () => {
    const candidates = await fixtureCandidates()
    const colors = candidates.filter((c) => c.kind === 'color')
    expect(colors.map((c) => c.value)).toEqual([
      '#3b82f6',
      'rgb(30, 64, 175)',
      '#ff00ff',
      '#3a81f5',
      'rgb(59 130 246 / 0.5)',
      'hsl(217, 91%, 60%)',
    ])
    const first = colors[0]!
    expect(first).toMatchObject({ line: 2, prop: 'color' })
    expect(first.column).toBe(10) // "  color: " -> value starts at column 10
  })

  it('extracts px/rem lengths with the owning property', async () => {
    const candidates = await fixtureCandidates()
    const lengths = candidates.filter((c) => c.kind === 'length')
    expect(lengths.map((c) => [c.value, c.prop])).toEqual([
      ['1px', 'border'],
      ['13px', 'padding'],
      ['0.5rem', 'padding'],
      ['1rem', 'margin-top'],
      ['1px', 'box-shadow'],
      ['2px', 'box-shadow'],
    ])
  })

  it('does not extract from var() references or hex fragments', async () => {
    const candidates = await fixtureCandidates()
    expect(candidates.some((c) => c.value.includes('var('))).toBe(false)
    // No half-matched hex like "#3b8" from "#3b82f6"
    expect(candidates.filter((c) => c.kind === 'color').every((c) => c.value.length !== 4 || c.value === '#fff')).toBe(true)
  })

  it('parses SCSS syntax (nesting, // comments)', () => {
    const scss = `.a {\n  // comment\n  .b { color: #123456; }\n}\n`
    const candidates = extractCssCandidates(scss, 'x.scss')
    expect(candidates).toHaveLength(1)
    expect(candidates[0]).toMatchObject({ value: '#123456', line: 3 })
  })
})
