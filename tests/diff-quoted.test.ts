import { describe, expect, it } from 'vitest'
import { parseUnifiedDiff } from '../src/diff.js'

describe('parseUnifiedDiff quoted paths', () => {
  it('unquotes paths git wraps in double quotes', () => {
    const diff = [
      'diff --git "a/src/we \\"ird\\".css" "b/src/we \\"ird\\".css"',
      '--- "a/src/we \\"ird\\".css"',
      '+++ "b/src/we \\"ird\\".css"',
      '@@ -0,0 +1 @@',
      '+.x { color: red; }',
      '',
    ].join('\n')
    const changed = parseUnifiedDiff(diff)
    expect(changed.get('src/we "ird".css')).toEqual([{ start: 1, end: 1 }])
  })

  it('leaves plain paths with spaces untouched', () => {
    const diff = ['+++ b/src/two words.css', '@@ -0,0 +2,2 @@'].join('\n')
    const changed = parseUnifiedDiff(diff)
    expect(changed.get('src/two words.css')).toEqual([{ start: 2, end: 3 }])
  })
})
