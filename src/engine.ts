import { readdir, readFile } from 'node:fs/promises'
import { extname, join, relative, resolve, sep } from 'node:path'
import picomatch from 'picomatch'
import { changedLines, gitRoot, isLineChanged, type ChangedRange } from './diff.js'
import { buildIgnoreMap, isSuppressed, type IgnoreMap } from './ignores.js'
import { loadTokens } from './tokens/index.js'
import { extractCssCandidates } from './parsers/css.js'
import { extractTsxCandidates } from './parsers/tsx.js'
import { allRules } from './rules/index.js'
import { computeScore } from './score.js'
import type { ResolvedConfig } from './config.js'
import type { Candidate, Finding } from './types.js'

const SUPPORTED_EXT = new Set(['.css', '.scss', '.tsx', '.jsx'])
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'coverage'])

export interface RunOptions {
  /** Scan whole files instead of only lines added in the diff. */
  all?: boolean
}

export interface RunResult {
  findings: Finding[]
  mode: 'diff' | 'all'
  /** Base ref used in diff mode. */
  base?: string
  filesScanned: number
  /** Drift score 0-100. */
  score: number
  /** score >= config.failUnder */
  passed: boolean
}

export async function run(config: ResolvedConfig, options: RunOptions = {}): Promise<RunResult> {
  const tokens = await loadTokens(config.tokens, config.rootDir)
  const mode = options.all ? 'all' : 'diff'

  // Collect target files as { abs, rel } with rel posix-relative to the config root.
  let targets: Array<{ abs: string; rel: string; ranges?: ChangedRange[] }>
  if (mode === 'all') {
    const files: string[] = []
    await walkDir(config.rootDir, files)
    targets = files.map((abs) => ({ abs, rel: toPosix(relative(config.rootDir, abs)) }))
  } else {
    const root = await gitRoot(config.rootDir)
    const changed = await changedLines(config.base, config.rootDir)
    targets = []
    for (const [rootRel, ranges] of changed) {
      const abs = resolve(root, rootRel)
      const rel = relative(config.rootDir, abs)
      if (rel.startsWith('..')) continue // outside the analyzed root
      targets.push({ abs, rel: toPosix(rel), ranges })
    }
  }

  const tokenFiles = new Set(config.tokenFiles)
  const isIgnored = config.ignore.length > 0 ? picomatch(config.ignore, { dot: true }) : () => false
  targets = targets.filter(
    (t) =>
      SUPPORTED_EXT.has(extname(t.rel).toLowerCase()) &&
      !tokenFiles.has(t.abs) &&
      !isIgnored(t.rel),
  )

  const candidates: Candidate[] = []
  const ignoreMaps = new Map<string, IgnoreMap>()
  for (const target of targets) {
    const source = await readFile(target.abs, 'utf8')
    ignoreMaps.set(target.rel, buildIgnoreMap(source))
    let fileCandidates = extractCandidates(source, target.rel)
    if (mode === 'diff') {
      fileCandidates = fileCandidates.filter((c) => isLineChanged(target.ranges, c.line))
    }
    candidates.push(...fileCandidates)
  }

  const enabledRules = allRules.filter((rule) => config.rules[rule.id] !== false)
  const context = { candidates, tokens, config }
  const findings = enabledRules
    .flatMap((rule) => rule.check(context))
    .filter((f) => !isSuppressed(ignoreMaps.get(f.file), f.line, f.ruleId))
    .sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column)

  const score = computeScore(findings, config.weights)
  const result: RunResult = {
    findings,
    mode,
    filesScanned: targets.length,
    score,
    passed: score >= config.failUnder,
  }
  if (mode === 'diff') result.base = config.base
  return result
}

function extractCandidates(source: string, rel: string): Candidate[] {
  const ext = extname(rel).toLowerCase()
  if (ext === '.css' || ext === '.scss') return extractCssCandidates(source, rel)
  return extractTsxCandidates(source, rel)
}

async function walkDir(dir: string, out: string[]): Promise<void> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue
      await walkDir(join(dir, entry.name), out)
    } else if (entry.isFile() && SUPPORTED_EXT.has(extname(entry.name).toLowerCase())) {
      out.push(join(dir, entry.name))
    }
  }
}

function toPosix(p: string): string {
  return p.split(sep).join('/')
}
