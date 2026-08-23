import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { extractTsxCandidates } from '../src/parsers/tsx.js'

const fixturePath = fileURLToPath(new URL('./fixtures/Widget.tsx', import.meta.url))

async function fixtureCandidates() {
  const source = await readFile(fixturePath, 'utf8')
  return extractTsxCandidates(source, 'Widget.tsx')
}

describe('TSX candidate extraction', () => {
  it('collects component imports with PascalCase names, skipping type-only and lowercase', async () => {
    const imports = (await fixtureCandidates()).filter((c) => c.kind === 'import')
    expect(imports.map((c) => [c.value, c.importNames])).toEqual([
      ['react', ['React']],
      ['@acme/ui', ['Button']],
      ['@mui/material', ['Card', 'List']],
      ['@headlessui/react', ['Tabs']], // ignore comments are applied by the engine, not the parser
    ])
  })

  it('scans string values in inline style objects', async () => {
    const candidates = await fixtureCandidates()
    const color = candidates.find((c) => c.value === '#3a81f5')
    expect(color).toMatchObject({ kind: 'color', prop: 'color', line: 18 })
    const padding = candidates.find((c) => c.value === '0.5rem')
    expect(padding).toMatchObject({ kind: 'length', prop: 'padding', line: 18 })
  })

  it('treats numeric style values as px lengths (React semantics)', async () => {
    const candidates = await fixtureCandidates()
    const marginTop = candidates.find((c) => c.prop === 'margin-top')
    expect(marginTop).toMatchObject({ kind: 'length', value: '13px', line: 18 })
  })

  it('scans styled-components tagged templates with property context', async () => {
    const candidates = await fixtureCandidates()
    const color = candidates.find((c) => c.value === '#3b82f6' && c.line === 11)
    expect(color).toMatchObject({ kind: 'color', prop: 'color' })
    const margin = candidates.find((c) => c.value === '13px' && c.line === 12)
    expect(margin).toMatchObject({ kind: 'length', prop: 'margin' })
  })

  it('does not scan template interpolation expressions', async () => {
    const candidates = await fixtureCandidates()
    // "4px" after the ${...} span has no prop context but is still a candidate;
    // nothing from inside the arrow function leaks out.
    const fourPx = candidates.find((c) => c.value === '4px')
    expect(fourPx?.prop).toBeUndefined()
    expect(candidates.some((c) => c.value.includes('props'))).toBe(false)
  })

  it('collects PascalCase namespace imports', () => {
    const source = `import * as Icons from 'lucide-react'\nimport * as helpers from './helpers'\n`
    const candidates = extractTsxCandidates(source, 'N.tsx')
    expect(candidates).toEqual([
      expect.objectContaining({ kind: 'import', value: 'lucide-react', importNames: ['Icons'] }),
    ])
  })

  it('ignores var() references in templates', async () => {
    const candidates = await fixtureCandidates()
    expect(candidates.some((c) => c.line === 14 && c.kind === 'color')).toBe(false)
  })
})
