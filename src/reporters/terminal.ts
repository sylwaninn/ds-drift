import pc from 'picocolors'
import type { ResolvedConfig } from '../config.js'
import type { RunResult } from '../engine.js'
import type { Finding } from '../types.js'

export function renderTerminal(result: RunResult, config: ResolvedConfig): string {
  const lines: string[] = []
  const scope =
    result.mode === 'diff' ? `diff vs ${result.base ?? 'origin/main'}` : 'full scan'
  lines.push(pc.dim(`ds-drift · ${scope} · ${result.filesScanned} file(s)`))
  lines.push('')

  const scoreLine = result.passed
    ? `Drift score: ${result.score}/100 (threshold ${config.failUnder})`
    : `Drift score: ${result.score}/100, below threshold ${config.failUnder}`
  if (result.baselined > 0) {
    lines.push(pc.dim(`${result.baselined} baselined finding(s) hidden (${config.baseline})`))
    lines.push('')
  }
  if (result.findings.length === 0) {
    lines.push(pc.green('✔ No design system drift detected.'))
    lines.push(pc.green(scoreLine))
    return lines.join('\n')
  }

  for (const [file, findings] of groupByFile(result.findings)) {
    lines.push(pc.bold(pc.cyan(file)))
    for (const finding of findings) {
      const position = pc.dim(`${finding.line}:${finding.column}`.padEnd(7))
      const value = finding.suggestion
        ? `${pc.red(finding.found)} ${pc.dim('→')} ${pc.green(finding.suggestion)}`
        : pc.red(finding.found)
      lines.push(`  ${position} ${value}  ${pc.dim(finding.ruleId)}`)
    }
    lines.push('')
  }

  const byRule = new Map<string, number>()
  for (const finding of result.findings) {
    byRule.set(finding.ruleId, (byRule.get(finding.ruleId) ?? 0) + 1)
  }
  const breakdown = [...byRule].map(([id, n]) => `${n} ${id}`).join(', ')
  lines.push(pc.red(`✖ ${result.findings.length} finding(s)`) + pc.dim(` (${breakdown})`))
  lines.push(result.passed ? pc.green(scoreLine) : pc.red(scoreLine))
  return lines.join('\n')
}

function groupByFile(findings: Finding[]): Map<string, Finding[]> {
  const groups = new Map<string, Finding[]>()
  for (const finding of findings) {
    const group = groups.get(finding.file) ?? []
    group.push(finding)
    groups.set(finding.file, group)
  }
  return groups
}
