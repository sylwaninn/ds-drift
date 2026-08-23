import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { RuleId } from './config.js'
import type { Finding } from './types.js'

/**
 * Autofix is limited to mechanical, always-safe rewrites: replacing a color
 * that duplicates a token exactly. Near-token and off-scale findings need
 * human judgment and are never touched.
 */
export const FIXABLE_RULES: ReadonlySet<RuleId> = new Set<RuleId>(['color/hardcoded-exact-token'])

/** A `var()` reference works in CSS, style objects and Tailwind brackets; `$vars` only in SCSS. */
export function isApplicableSuggestion(suggestion: string, file: string): boolean {
  if (suggestion.startsWith('var(')) return true
  if (suggestion.startsWith('$')) return file.endsWith('.scss')
  return false
}

export function fixableFindings(findings: Finding[]): Finding[] {
  return findings.filter(
    (f) =>
      FIXABLE_RULES.has(f.ruleId) &&
      f.suggestion !== undefined &&
      isApplicableSuggestion(f.suggestion, f.file),
  )
}

export interface FixSummary {
  fixed: number
  files: number
}

/** Apply fixable findings to the files on disk. Skips any finding whose text moved. */
export async function applyFixes(findings: Finding[], rootDir: string): Promise<FixSummary> {
  const byFile = new Map<string, Finding[]>()
  for (const finding of fixableFindings(findings)) {
    const group = byFile.get(finding.file) ?? []
    group.push(finding)
    byFile.set(finding.file, group)
  }
  let fixed = 0
  let files = 0
  for (const [file, group] of byFile) {
    const abs = resolve(rootDir, file)
    const source = await readFile(abs, 'utf8')
    const lineStarts = computeLineStarts(source)
    // Apply bottom-up so earlier replacements never shift later positions.
    group.sort((a, b) => b.line - a.line || b.column - a.column)
    let next = source
    let touched = false
    for (const finding of group) {
      const lineStart = lineStarts[finding.line - 1]
      if (lineStart === undefined) continue
      const index = lineStart + finding.column - 1
      if (next.slice(index, index + finding.found.length) !== finding.found) continue
      next = next.slice(0, index) + finding.suggestion! + next.slice(index + finding.found.length)
      touched = true
      fixed++
    }
    if (touched) {
      await writeFile(abs, next)
      files++
    }
  }
  return { fixed, files }
}

function computeLineStarts(source: string): number[] {
  const starts = [0]
  for (let i = 0; i < source.length; i++) {
    if (source[i] === '\n') starts.push(i + 1)
  }
  return starts
}
