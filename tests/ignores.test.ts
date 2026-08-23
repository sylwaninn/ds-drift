import { describe, expect, it } from 'vitest'
import { buildIgnoreMap, isSuppressed } from '../src/ignores.js'

describe('ignore comments', () => {
  it('suppresses all rules on the same line and the line below', () => {
    const map = buildIgnoreMap(['a', 'color: #fff; /* ds-drift-ignore */', 'margin: 13px;'].join('\n'))
    expect(isSuppressed(map, 2, 'color/hardcoded-exact-token')).toBe(true)
    expect(isSuppressed(map, 3, 'spacing/off-scale')).toBe(true)
    expect(isSuppressed(map, 4, 'spacing/off-scale')).toBe(false)
  })

  it('supports // comments and rule-scoped ignores', () => {
    const map = buildIgnoreMap('// ds-drift-ignore spacing/off-scale\nmargin: 13px')
    expect(isSuppressed(map, 2, 'spacing/off-scale')).toBe(true)
    expect(isSuppressed(map, 2, 'color/hardcoded-exact-token')).toBe(false)
  })

  it('supports several rule ids, comma or space separated', () => {
    const map = buildIgnoreMap('/* ds-drift-ignore spacing/off-scale, color/hardcoded-near-token */')
    expect(isSuppressed(map, 1, 'spacing/off-scale')).toBe(true)
    expect(isSuppressed(map, 1, 'color/hardcoded-near-token')).toBe(true)
    expect(isSuppressed(map, 1, 'color/hardcoded-exact-token')).toBe(false)
  })

  it('works inside JSX comment braces', () => {
    const map = buildIgnoreMap('{/* ds-drift-ignore */}\n<span style={{ color: "#fff" }} />')
    expect(isSuppressed(map, 2, 'color/hardcoded-exact-token')).toBe(true)
  })

  it('requires a comment opener before the marker', () => {
    const map = buildIgnoreMap('const x = "ds-drift-ignore"')
    expect(isSuppressed(map, 1, 'spacing/off-scale')).toBe(false)
  })
})
