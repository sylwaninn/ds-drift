import { readdir, readFile } from 'node:fs/promises'
import { extname, join, relative, resolve, sep } from 'node:path'
import picomatch from 'picomatch'
import { applyBaseline, readBaseline } from './baseline.js'
import { changedLines, gitRoot, isLineChanged, type ChangedRange } from './diff.js'
import { buildIgnoreMap, isSuppressed, type IgnoreMap } from './ignores.js'
import { loadTokens } from './tokens/index.js'
import { extractCssCandidates } from './parsers/css.js'
import { extractTsxCandidates } from './parsers/tsx.js'
import { allRules } from './rules/index.js'
import { computeScore } from './score.js'
import type { ResolvedConfig } from './config.js'
import type { Candidate, Finding } from './types.js'

const SUPPORTED_EXT = new Set(['.css', '.scss', '.tsx', '.jsx', '.ts', '.js'])
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'coverage'])

/** Analyzable file, excluding declaration files (type-world, no real values). */
function isAnalyzable(rel: string): boolean {
  return SUPPORTED_EXT.has(extname(rel).toLowerCase()) && !rel.endsWith('.d.ts')
}

export interface RunOptions {
  /** Scan whole files instead of only lines added in the diff. */
  all?: boolean
  /** Set false to skip subtracting the baseline file (used when rewriting it). */
  baseline?: boolean
}

export interface RunResult {
  findings: Finding[]
  mode: 'diff' | 'all'
  /** Base ref used in diff mode. */
  base?: string
  filesScanned: number
  /** Findings absorbed by the baseline file. */
  baselined: number
  /** Drift score 0-100. */
  score: number
  /** score >= config.failUnder */
  passed: boolean
}

export async function run(config: ResolvedConfig, options: RunOptions = {}): Promise<RunResult> {
  const tokens = await loadTokens(config.tokens, config.rootDir, {
    scssVariables: config.sass.variables,
  })
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
  targets = targets.filter((t) => isAnalyzable(t.rel) && !tokenFiles.has(t.abs) && !isIgnored(t.rel))

  const parserOptions = { tailwind: config.tailwind.enabled }
  const candidates: Candidate[] = []
  const ignoreMaps = new Map<string, IgnoreMap>()
  for (const target of targets) {
    const source = await readFile(target.abs, 'utf8')
    ignoreMaps.set(target.rel, buildIgnoreMap(source))
    let fileCandidates = extractCandidates(source, target.rel, parserOptions)
    if (mode === 'diff') {
      fileCandidates = fileCandidates.filter((c) => isLineChanged(target.ranges, c.line))
    }
    candidates.push(...fileCandidates)
  }

  const enabledRules = allRules.filter((rule) => config.rules[rule.id] !== false)
  const context = { candidates, tokens, config }
  let findings = enabledRules
    .flatMap((rule) => rule.check(context))
    .filter((f) => !isSuppressed(ignoreMaps.get(f.file), f.line, f.ruleId))
    .sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column)

  let baselined = 0
  if (options.baseline !== false) {
    const baseline = await readBaseline(resolve(config.rootDir, config.baseline))
    if (baseline !== undefined) ({ findings, baselined } = applyBaseline(findings, baseline))
  }

  const score = computeScore(findings, config.weights)
  const result: RunResult = {
    findings,
    mode,
    filesScanned: targets.length,
    baselined,
    score,
    passed: score >= config.failUnder,
  }
  if (mode === 'diff') result.base = config.base
  return result
}

function extractCandidates(
  source: string,
  rel: string,
  options: { tailwind: boolean },
): Candidate[] {
  const ext = extname(rel).toLowerCase()
  if (ext === '.css' || ext === '.scss') return extractCssCandidates(source, rel, options)
  return extractTsxCandidates(source, rel, options)
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
