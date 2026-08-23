import { readFile, writeFile } from 'node:fs/promises'
import type { Finding } from './types.js'

/**
 * A baseline records existing drift so a legacy codebase can adopt ds-drift
 * (including --all mode) without a day-one failing score. Fingerprints skip
 * line numbers on purpose: moving a line must not resurface an accepted
 * finding. Each fingerprint carries a count, so only that many occurrences
 * are absorbed; the N+1th identical drift is reported again.
 */
export interface BaselineFile {
  version: 1
  findings: Record<string, number>
}

function fingerprint(finding: Finding): string {
  return `${finding.ruleId}|${finding.file}|${finding.found}`
}

export function buildBaseline(findings: Finding[]): BaselineFile {
  const counts: Record<string, number> = {}
  for (const finding of findings) {
    const key = fingerprint(finding)
    counts[key] = (counts[key] ?? 0) + 1
  }
  const sorted = Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)))
  return { version: 1, findings: sorted }
}

export async function writeBaseline(path: string, findings: Finding[]): Promise<number> {
  const baseline = buildBaseline(findings)
  await writeFile(path, `${JSON.stringify(baseline, null, 2)}\n`)
  return findings.length
}

/** Returns undefined when no baseline file exists at `path`. */
export async function readBaseline(path: string): Promise<BaselineFile | undefined> {
  let source: string
  try {
    source = await readFile(path, 'utf8')
  } catch {
    return undefined
  }
  const parsed = JSON.parse(source) as BaselineFile
  if (parsed.version !== 1 || typeof parsed.findings !== 'object') {
    throw new Error(`${path}: unsupported baseline format`)
  }
  return parsed
}

export interface BaselineResult {
  findings: Finding[]
  /** How many findings the baseline absorbed. */
  baselined: number
}

export function applyBaseline(findings: Finding[], baseline: BaselineFile): BaselineResult {
  const remaining = { ...baseline.findings }
  const kept: Finding[] = []
  let baselined = 0
  for (const finding of findings) {
    const key = fingerprint(finding)
    if ((remaining[key] ?? 0) > 0) {
      remaining[key]!--
      baselined++
    } else {
      kept.push(finding)
    }
  }
  return { findings: kept, baselined }
}
