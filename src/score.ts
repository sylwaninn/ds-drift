import type { RuleId } from './config.js'
import type { Finding } from './types.js'

/** Drift score: start at 100, subtract the rule weight per finding, floor at 0. */
export function computeScore(findings: Finding[], weights: Record<RuleId, number>): number {
  const penalty = findings.reduce((sum, finding) => sum + weights[finding.ruleId], 0)
  return Math.max(0, 100 - penalty)
}
