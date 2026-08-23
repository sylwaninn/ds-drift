import type { ResolvedConfig } from '../config.js'
import type { RunResult } from '../engine.js'

/**
 * Stable machine-readable output. Bump schemaVersion on breaking shape changes.
 */
export const JSON_SCHEMA_VERSION = 1

export interface JsonReport {
  schemaVersion: number
  score: number
  failUnder: number
  passed: boolean
  mode: 'diff' | 'all'
  base?: string
  filesScanned: number
  summary: { total: number; byRule: Record<string, number> }
  findings: Array<{
    ruleId: string
    file: string
    line: number
    column: number
    found: string
    suggestion?: string
    message: string
    weight: number
  }>
}

export function buildJsonReport(result: RunResult, config: ResolvedConfig): JsonReport {
  const byRule: Record<string, number> = {}
  for (const finding of result.findings) {
    byRule[finding.ruleId] = (byRule[finding.ruleId] ?? 0) + 1
  }
  const report: JsonReport = {
    schemaVersion: JSON_SCHEMA_VERSION,
    score: result.score,
    failUnder: config.failUnder,
    passed: result.passed,
    mode: result.mode,
    filesScanned: result.filesScanned,
    summary: { total: result.findings.length, byRule },
    findings: result.findings.map((f) => ({ ...f, weight: config.weights[f.ruleId] })),
  }
  if (result.base !== undefined) report.base = result.base
  return report
}

export function renderJson(result: RunResult, config: ResolvedConfig): string {
  return JSON.stringify(buildJsonReport(result, config), null, 2)
}
