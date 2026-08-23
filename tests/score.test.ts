import { describe, expect, it } from 'vitest'
import { DEFAULT_WEIGHTS } from '../src/config.js'
import { computeScore } from '../src/score.js'
import type { Finding } from '../src/types.js'
import type { RuleId } from '../src/config.js'

const finding = (ruleId: RuleId): Finding => ({
  ruleId,
  file: 'a.css',
  line: 1,
  column: 1,
  found: 'x',
  message: 'm',
})

describe('computeScore', () => {
  it('starts at 100 with no findings', () => {
    expect(computeScore([], DEFAULT_WEIGHTS)).toBe(100)
  })

  it('subtracts the configured weight per finding', () => {
    const findings = [
      finding('color/hardcoded-exact-token'), // 5
      finding('color/hardcoded-near-token'), // 3
      finding('spacing/off-scale'), // 2
      finding('spacing/off-scale'), // 2
      finding('component/off-ds-import'), // 4
    ]
    expect(computeScore(findings, DEFAULT_WEIGHTS)).toBe(100 - 16)
  })

  it('floors at 0', () => {
    const findings = Array.from({ length: 30 }, () => finding('color/hardcoded-exact-token'))
    expect(computeScore(findings, DEFAULT_WEIGHTS)).toBe(0)
  })

  it('uses custom weights', () => {
    const weights = { ...DEFAULT_WEIGHTS, 'spacing/off-scale': 50 }
    expect(computeScore([finding('spacing/off-scale')], weights)).toBe(50)
  })
})
