/**
 * Line-level ignore comments (line comments and block comments both work):
 *   `// ds-drift-ignore`                   (all rules)
 *   `// ds-drift-ignore spacing/off-scale` (specific rules)
 * A comment suppresses findings on its own line and on the line below.
 */

const MARKER = 'ds-drift-ignore'

export type IgnoreMap = Map<number, 'all' | Set<string>>

export function buildIgnoreMap(source: string): IgnoreMap {
  const map: IgnoreMap = new Map()
  source.split('\n').forEach((text, i) => {
    const index = text.indexOf(MARKER)
    if (index === -1) return
    // Only honor the marker inside a comment opener on the same line.
    if (!/\/\/|\/\*/.test(text.slice(0, index))) return
    const after = text.slice(index + MARKER.length).replace(/\*\/.*$/, '')
    const ruleIds = after
      .trim()
      .split(/[,\s]+/)
      .filter((part) => part.includes('/'))
    const line = i + 1
    const existing = map.get(line)
    if (ruleIds.length === 0) {
      map.set(line, 'all')
    } else if (existing !== 'all') {
      const set = existing instanceof Set ? existing : new Set<string>()
      for (const id of ruleIds) set.add(id)
      map.set(line, set)
    }
  })
  return map
}

/** True when a finding at `line` for `ruleId` is covered by an ignore on that line or the one above. */
export function isSuppressed(map: IgnoreMap | undefined, line: number, ruleId: string): boolean {
  if (map === undefined) return false
  for (const at of [line, line - 1]) {
    const entry = map.get(at)
    if (entry === 'all' || (entry instanceof Set && entry.has(ruleId))) return true
  }
  return false
}
