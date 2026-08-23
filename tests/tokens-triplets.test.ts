import { describe, expect, it } from 'vitest'
import { formatHex } from 'culori'
import { classifyValue } from '../src/tokens/classify.js'
import { cssTokensFromSource } from '../src/tokens/css.js'
import { matchColor } from '../src/rules/color-match.js'

describe('bare channel triplet tokens', () => {
  it('classifies bare RGB triplets as colors (Tailwind rgb(var()) pattern)', () => {
    const classified = classifyValue('10 10 10')
    expect(classified.kind).toBe('color')
    expect(formatHex(classified.color!)).toBe('#0a0a0a')
    expect(classifyValue('245, 245, 245').kind).toBe('color')
  })

  it('classifies bare HSL triplets as colors (shadcn pattern)', () => {
    const classified = classifyValue('222.2 84% 4.9%')
    expect(classified.kind).toBe('color')
    expect(classifyValue('0 0% 100%').kind).toBe('color')
  })

  it('rejects out-of-range and non-triplet values', () => {
    expect(classifyValue('300 10 10').kind).toBe('other')
    expect(classifyValue('10 10').kind).toBe('other')
    expect(classifyValue('10 10 10 10').kind).toBe('other')
  })

  it('matches hardcoded hex in code against triplet tokens', () => {
    const tokens = cssTokensFromSource(
      ':root {\n  --color-primary: 10 10 10;\n  --color-danger: 233 75 53;\n}\n',
      'theme-tokens.css',
    )
    const match = matchColor('#0a0a0a', tokens)
    expect(match?.exact).toBe(true)
    expect(match?.token.name).toBe('--color-primary')
  })
})
