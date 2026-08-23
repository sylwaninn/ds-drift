import type { ResolvedConfig } from '../config.js'
import type { RunResult } from '../engine.js'

/**
 * GitHub Actions workflow commands: findings surface as PR annotations
 * with no extra infrastructure.
 * https://docs.github.com/en/actions/reference/workflow-commands-for-github-actions
 */
export function renderGithub(result: RunResult, config: ResolvedConfig): string {
  const lines = result.findings.map((finding) => {
    const props = [
      `file=${escapeProperty(finding.file)}`,
      `line=${finding.line}`,
      `col=${finding.column}`,
      `title=${escapeProperty(`ds-drift ${finding.ruleId}`)}`,
    ].join(',')
    return `::warning ${props}::${escapeData(finding.message)}`
  })
  lines.push(
    result.passed
      ? `::notice title=ds-drift::${escapeData(`Drift score ${result.score}/100 (threshold ${config.failUnder})`)}`
      : `::error title=ds-drift::${escapeData(`Drift score ${result.score}/100, below threshold ${config.failUnder}`)}`,
  )
  return lines.join('\n')
}

function escapeData(value: string): string {
  return value.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A')
}

function escapeProperty(value: string): string {
  return escapeData(value).replaceAll(':', '%3A').replaceAll(',', '%2C')
}
