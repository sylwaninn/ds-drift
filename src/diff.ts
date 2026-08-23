import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const exec = promisify(execFile)

export interface ChangedRange {
  /** 1-based, inclusive. */
  start: number
  end: number
}

/** Added line ranges per file, keyed by repo-root-relative posix path. */
export type ChangedLines = Map<string, ChangedRange[]>

export async function gitRoot(cwd: string): Promise<string> {
  try {
    const { stdout } = await exec('git', ['rev-parse', '--show-toplevel'], { cwd })
    return stdout.trim()
  } catch (error) {
    throw new Error(
      'Not inside a git repository. Diff mode needs git: run ds-drift from a repo, or pass --all to scan whole files.',
      { cause: error },
    )
  }
}

/** Lines added between base and HEAD (`git diff -U0 <base>...HEAD`). */
export async function changedLines(base: string, cwd: string): Promise<ChangedLines> {
  let stdout: string
  try {
    ;({ stdout } = await exec(
      'git',
      // quotepath=off keeps non-ASCII paths readable in the +++ headers
      ['-c', 'core.quotepath=off', 'diff', '-U0', '--no-color', '--diff-filter=ACMR', `${base}...HEAD`],
      { cwd, maxBuffer: 64 * 1024 * 1024 },
    ))
  } catch (error) {
    const stderr = (error as { stderr?: string }).stderr?.trim()
    throw new Error(`git diff against "${base}" failed${stderr ? `: ${stderr}` : ''}`, {
      cause: error,
    })
  }
  return parseUnifiedDiff(stdout)
}

const HUNK_RE = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/

/** Parse unified diff output into added line ranges per file. Exported for tests. */
export function parseUnifiedDiff(diff: string): ChangedLines {
  const changed: ChangedLines = new Map()
  let currentFile: string | undefined
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++ ')) {
      const target = unquotePath(line.slice(4).trim())
      currentFile = target.startsWith('b/') ? target.slice(2) : undefined
      continue
    }
    const hunk = HUNK_RE.exec(line)
    if (!hunk || currentFile === undefined) continue
    const start = Number.parseInt(hunk[1]!, 10)
    const count = hunk[2] === undefined ? 1 : Number.parseInt(hunk[2], 10)
    if (count === 0) continue // pure deletion
    const ranges = changed.get(currentFile) ?? []
    ranges.push({ start, end: start + count - 1 })
    changed.set(currentFile, ranges)
  }
  return changed
}

export function isLineChanged(ranges: ChangedRange[] | undefined, line: number): boolean {
  return ranges !== undefined && ranges.some((r) => line >= r.start && line <= r.end)
}

/** Git double-quotes paths containing specials (`+++ "b/a \"b\".css"`); undo the simple escapes. */
function unquotePath(target: string): string {
  if (!target.startsWith('"') || !target.endsWith('"')) return target
  return target
    .slice(1, -1)
    .replace(/\\([\\"tn])/g, (_, c: string) => (c === 't' ? '\t' : c === 'n' ? '\n' : c))
}
