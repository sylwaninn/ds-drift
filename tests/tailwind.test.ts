import { describe, expect, it } from 'vitest'
import { scanTailwindClasses } from '../src/parsers/tailwind.js'
import { extractCssCandidates } from '../src/parsers/css.js'
import { extractTsxCandidates } from '../src/parsers/tsx.js'

describe('scanTailwindClasses', () => {
  it('extracts arbitrary colors from any utility', () => {
    expect(scanTailwindClasses('bg-[#3b82f6]')).toEqual([
      { kind: 'color', value: '#3b82f6', index: 4 },
    ])
    expect(scanTailwindClasses('text-[#3a81f5]')[0]).toMatchObject({ kind: 'color' })
  })

  it('decodes underscores in bracket values', () => {
    const [match] = scanTailwindClasses('bg-[rgb(59_130_246)]')
    expect(match).toMatchObject({ kind: 'color', value: 'rgb(59 130 246)' })
  })

  it('keeps the color when an opacity modifier is present', () => {
    expect(scanTailwindClasses('bg-[#3b82f6]/50')[0]).toMatchObject({
      kind: 'color',
      value: '#3b82f6',
    })
  })

  it('maps spacing utilities to their CSS property', () => {
    expect(scanTailwindClasses('p-[13px]')[0]).toMatchObject({
      kind: 'length',
      value: '13px',
      prop: 'padding',
    })
    expect(scanTailwindClasses('gap-x-[0.5rem]')[0]).toMatchObject({ prop: 'column-gap' })
    expect(scanTailwindClasses('mt-[7px]')[0]).toMatchObject({ prop: 'margin-top' })
  })

  it('handles negative utilities and variant prefixes', () => {
    expect(scanTailwindClasses('-m-[13px]')[0]).toMatchObject({ value: '-13px', prop: 'margin' })
    expect(scanTailwindClasses('hover:md:p-[13px]')[0]).toMatchObject({ prop: 'padding' })
    expect(scanTailwindClasses('[&:hover]:p-[13px]')[0]).toMatchObject({ prop: 'padding' })
  })

  it('ignores lengths on non-spacing utilities', () => {
    expect(scanTailwindClasses('w-[13px] text-[14px] h-[3px]')).toEqual([])
  })

  it('ignores regular theme utilities', () => {
    expect(scanTailwindClasses('p-4 bg-primary hover:bg-primary/50 flex')).toEqual([])
  })

  it('reports offsets pointing at the bracket content', () => {
    const source = 'flex p-[13px]'
    const [match] = scanTailwindClasses(source)
    expect(source.slice(match!.index, match!.index + 4)).toBe('13px')
  })
})

describe('tailwind in TSX class attributes', () => {
  const SOURCE = `export const Chip = () => (
  <div className="p-[13px] bg-[#3b82f6] rounded">
    <span className={\`m-[9px] \${'x'} gap-[7px]\`} />
    <i class="pt-[5px]" />
  </div>
)
`

  it('scans string and template className chunks when enabled', () => {
    const candidates = extractTsxCandidates(SOURCE, 'Chip.tsx', { tailwind: true })
    expect(candidates.map((c) => [c.kind, c.value, c.prop ?? null])).toEqual([
      ['length', '13px', 'padding'],
      ['color', '#3b82f6', null],
      ['length', '9px', 'margin'],
      ['length', '7px', 'gap'],
      ['length', '5px', 'padding-top'],
    ])
    const first = candidates[0]!
    expect(first.line).toBe(2)
    expect(SOURCE.split('\n')[first.line - 1]!.slice(first.column - 1, first.column + 3)).toBe('13px')
  })

  it('extracts nothing when tailwind is disabled', () => {
    expect(extractTsxCandidates(SOURCE, 'Chip.tsx')).toEqual([])
  })
})

describe('tailwind in class-name builder calls', () => {
  const SOURCE = `import { cn } from './utils'
import { cva } from 'class-variance-authority'

const button = cva('rounded p-[13px]', {
  variants: { tone: { brand: 'bg-[#3b82f6]', plain: 'bg-white' } },
})

export const Chip = (props: { active: boolean }) => (
  <div className={cn('base', props.active && 'm-[9px]', { 'gap-[7px]': props.active })}>
    <span className={props.active ? 'pt-[5px]' : 'pt-2'} />
  </div>
)
`

  it('scans cn()/cva() arguments, object keys and ternary branches', () => {
    const candidates = extractTsxCandidates(SOURCE, 'Chip.tsx', { tailwind: true })
    expect(candidates.map((c) => c.value).sort()).toEqual([
      '#3b82f6',
      '13px',
      '5px',
      '7px',
      '9px',
    ])
  })

  it('scans twMerge/twJoin arguments', () => {
    const source = `const x = twMerge('p-[13px]', props.className)\n`
    const candidates = extractTsxCandidates(source, 'X.tsx', { tailwind: true })
    expect(candidates.map((c) => c.value)).toEqual(['13px'])
  })

  it('does not double-count a cn() call inside className', () => {
    const source = `const x = <a className={cn('p-[13px]')} />\n`
    const candidates = extractTsxCandidates(source, 'X.tsx', { tailwind: true })
    expect(candidates).toHaveLength(1)
  })
})

describe('tailwind in @apply directives', () => {
  const SOURCE = `.btn {
  @apply p-[13px] bg-[#3b82f6] rounded;
}
`

  it('scans @apply params when enabled', () => {
    const candidates = extractCssCandidates(SOURCE, 'btn.css', { tailwind: true })
    expect(candidates.map((c) => [c.kind, c.value])).toEqual([
      ['length', '13px'],
      ['color', '#3b82f6'],
    ])
    expect(candidates[0]).toMatchObject({ line: 2, prop: 'padding' })
  })

  it('ignores @apply when disabled', () => {
    expect(extractCssCandidates(SOURCE, 'btn.css')).toEqual([])
  })
})
