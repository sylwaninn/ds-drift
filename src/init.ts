import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readdir, readFile, realpath, writeFile } from 'node:fs/promises'
import { extname, join, relative, sep } from 'node:path'
import { promisify } from 'node:util'
import * as p from '@clack/prompts'
import pc from 'picocolors'

const exec = promisify(execFile)

export const CONFIG_FILENAME = 'ds-drift.config.ts'

/** What `ds-drift init` could figure out on its own by inspecting the project. */
export interface TokenCandidate {
  /** Relative posix path. */
  file: string
  /** Why it was proposed, shown as a hint in the wizard ("38 token declarations"). */
  hint: string
}

export interface ProjectDetection {
  /** Candidate token files, best match first. */
  tokenFiles: TokenCandidate[]
  tailwind: boolean
  storybook: boolean
  /** Dependency names that look like a design system package. */
  dsPackages: string[]
  /** Detected default branch of origin, e.g. "origin/main". */
  base: string
}

export interface InitChoices {
  tokens: string[]
  failUnder: number
  tailwind: boolean
  dsPackages: string[]
  ignore: string[]
  base: string
}

export interface InitOptions {
  cwd: string
  /** Skip prompts and accept detected defaults (also forced when stdin is not a TTY). */
  yes?: boolean
  /** Overwrite an existing config file. */
  force?: boolean
}

const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'coverage', 'public', 'out'])
const MAX_DEPTH = 5
const MAX_FILES = 2000
const MAX_FILE_SIZE = 512 * 1024
// --tw-* are Tailwind's internal plumbing variables, not design tokens.
const CUSTOM_PROP_RE = /--(?!tw-)[\w-]+\s*:/g
const SCSS_VAR_RE = /^\s*\$[\w-]+\s*:/gm
const HEX_RE = /#[0-9a-fA-F]{3,8}\b/g
const BARE_TRIPLET_RE = /['"`]\d{1,3}[ ,]+\d{1,3}[ ,]+\d{1,3}['"`]/g
const DS_DEP_RE = /design-system|(^@[\w-]+\/(ui|design|components|tokens)$)/
const JS_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'])
const TOKEN_NAME_RE = /theme|token|palette|colou?r|design/i
/** Directories whose whole content is token material (palette.ts, spacing.ts...). */
const TOKEN_DIR_RE = /(^|\/)(design|design-tokens|tokens?|themes?|foundations?)(\/|$)/i
const TEST_FILE_RE = /\.(test|spec|stories)\./

/** Inspect the project: token file candidates, Tailwind, Storybook, DS deps, base branch. */
export async function detectProject(cwd: string): Promise<ProjectDetection> {
  // Symlinked tmp/workspace layouts: relative paths must share one real base.
  cwd = await realpath(cwd).catch(() => cwd)
  const deps = await readDependencies(cwd)
  const depNames = Object.keys(deps)

  const ranked: Array<TokenCandidate & { score: number }> = []
  const state = { visited: 0 }
  await scanDir(cwd, cwd, 0, state, ranked)

  // Monorepos: tokens often live in a sibling workspace package
  // (node_modules/@acme/shared symlinked to ../../packages/shared).
  for (const workspace of await findWorkspacePackages(cwd, depNames)) {
    const wsCandidates: Array<TokenCandidate & { score: number }> = []
    await scanDir(workspace.dir, cwd, 0, state, wsCandidates)
    for (const candidate of wsCandidates) {
      ranked.push({ ...candidate, hint: `${candidate.hint} · ${workspace.name}` })
    }
  }
  ranked.sort((a, b) => b.score - a.score)

  return {
    tokenFiles: ranked.slice(0, 10).map(({ file, hint }) => ({ file, hint })),
    tailwind: depNames.includes('tailwindcss'),
    storybook: depNames.some((d) => d === 'storybook' || d.startsWith('@storybook/')),
    dsPackages: depNames.filter((d) => DS_DEP_RE.test(d)),
    base: await detectBase(cwd),
  }
}

/**
 * Dependencies that resolve to a directory outside node_modules are linked
 * workspace packages; their src/ is worth scanning for token files.
 */
async function findWorkspacePackages(
  cwd: string,
  depNames: string[],
): Promise<Array<{ name: string; dir: string }>> {
  const found: Array<{ name: string; dir: string }> = []
  for (const name of depNames.slice(0, 100)) {
    try {
      const real = await realpath(join(cwd, 'node_modules', ...name.split('/')))
      if (real.includes(`${sep}node_modules${sep}`)) continue
      const src = join(real, 'src')
      found.push({ name, dir: existsSync(src) ? src : real })
    } catch {
      // not installed or not a resolvable link
    }
    if (found.length >= 20) break
  }
  return found
}

async function readDependencies(cwd: string): Promise<Record<string, string>> {
  try {
    const pkg = JSON.parse(await readFile(join(cwd, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }
    return { ...pkg.dependencies, ...pkg.devDependencies }
  } catch {
    return {}
  }
}

async function scanDir(
  dir: string,
  root: string,
  depth: number,
  state: { visited: number },
  out: Array<TokenCandidate & { score: number }>,
): Promise<void> {
  if (depth > MAX_DEPTH || state.visited > MAX_FILES) return
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (state.visited++ > MAX_FILES) return
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue
      // Hidden dirs are skipped except tool-generated token homes (.design-sync/...).
      if (entry.name.startsWith('.') && !/design|token|theme/i.test(entry.name)) continue
      await scanDir(join(dir, entry.name), root, depth + 1, state, out)
      continue
    }
    if (!entry.isFile()) continue
    const ext = extname(entry.name).toLowerCase()
    const abs = join(dir, entry.name)
    const rel = relative(root, abs).split(sep).join('/')
    if (ext === '.css' || ext === '.scss') {
      const candidate = await scoreStylesheet(abs, entry.name)
      if (candidate !== undefined) out.push({ file: rel, ...candidate })
    } else if (ext === '.json' && /token/i.test(entry.name)) {
      const source = await safeRead(abs)
      if (source !== undefined && source.includes('"$value"')) {
        out.push({ file: rel, score: 60, hint: 'W3C design tokens' })
      }
    } else if (JS_EXTS.has(ext) && !entry.name.endsWith('.d.ts') && !TEST_FILE_RE.test(entry.name)) {
      const inTokenDir = TOKEN_DIR_RE.test(rel.slice(0, rel.length - entry.name.length))
      if (TOKEN_NAME_RE.test(entry.name) || inTokenDir) {
        const candidate = await scoreThemeModule(abs, inTokenDir)
        if (candidate !== undefined) out.push({ file: rel, ...candidate })
      }
    }
  }
}

/**
 * Stylesheet likelihood: token declarations weighted by their density in the
 * file, so a dedicated theme-tokens.css outranks a generated app bundle that
 * happens to embed a few variables. Token-ish filenames get a bonus.
 */
async function scoreStylesheet(
  abs: string,
  name: string,
): Promise<{ score: number; hint: string } | undefined> {
  const source = await safeRead(abs)
  if (source === undefined) return undefined
  const customProps = source.match(CUSTOM_PROP_RE)?.length ?? 0
  const scssVars = abs.endsWith('.scss') ? (source.match(SCSS_VAR_RE)?.length ?? 0) : 0
  const count = customProps + scssVars
  const isTheme = source.includes('@theme')
  if (count < 3 && !isTheme) return undefined
  const lines = source.split('\n').filter((l) => l.trim() !== '').length || 1
  let score = count * (count / lines)
  if (isTheme) score += 100
  if (TOKEN_NAME_RE.test(name)) score += 50
  return { score, hint: `${count} token declaration(s)` }
}

/**
 * JS/TS theme module likelihood. Literal colors (hex or bare triplets) are the
 * strong signal; a token-ish filename with exports but no literals is still
 * proposed, low-ranked and labeled, because the real values may live behind
 * imports the wizard cannot follow.
 */
async function scoreThemeModule(
  abs: string,
  inTokenDir: boolean,
): Promise<{ score: number; hint: string } | undefined> {
  const source = await safeRead(abs)
  if (source === undefined) return undefined
  const literals = (source.match(HEX_RE)?.length ?? 0) + (source.match(BARE_TRIPLET_RE)?.length ?? 0)
  if (literals >= 3) {
    return { score: literals + 50, hint: `${literals} color literal(s)` }
  }
  // No-literal fallback: plain modules only. Components (.tsx/.jsx) and hooks
  // (use-*) match theme-ish names all the time without ever defining tokens.
  const ext = extname(abs).toLowerCase()
  const name = abs.split(sep).pop() ?? ''
  if (ext !== '.tsx' && ext !== '.jsx' && !/^use[-A-Z_.]/.test(name) && /^\s*export\b/m.test(source)) {
    return inTokenDir
      ? { score: 8, hint: 'in a design tokens directory' }
      : { score: 5, hint: 'name match, no literal values found' }
  }
  return undefined
}

async function safeRead(abs: string): Promise<string | undefined> {
  try {
    const source = await readFile(abs, 'utf8')
    return source.length > MAX_FILE_SIZE ? undefined : source
  } catch {
    return undefined
  }
}

async function detectBase(cwd: string): Promise<string> {
  try {
    const { stdout } = await exec('git', ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], {
      cwd,
    })
    const ref = stdout.trim()
    return ref === '' ? 'origin/main' : ref
  } catch {
    return 'origin/main'
  }
}

/** Entry point for `ds-drift init`. Returns the path of the written config. */
export async function runInit(options: InitOptions): Promise<string> {
  const target = join(options.cwd, CONFIG_FILENAME)
  if (existsSync(target) && options.force !== true) {
    throw new Error(`${CONFIG_FILENAME} already exists; re-run with --force to overwrite.`)
  }
  const detection = await detectProject(options.cwd)
  const interactive =
    options.yes !== true && process.stdin.isTTY === true && process.stdout.isTTY === true
  const choices = interactive ? await promptChoices(detection) : defaultChoices(detection)
  await writeFile(target, generateConfig(choices))
  if (!interactive) printSummary(choices)
  return target
}

function defaultChoices(detection: ProjectDetection): InitChoices {
  return {
    tokens: detection.tokenFiles.slice(0, 3).map((c) => c.file),
    failUnder: 80,
    tailwind: detection.tailwind,
    dsPackages: detection.dsPackages.flatMap((d) => [d, `${d}/*`]),
    ignore: detection.storybook ? ['**/*.stories.*'] : [],
    base: detection.base,
  }
}

async function promptChoices(detection: ProjectDetection): Promise<InitChoices> {
  p.intro(pc.bgCyan(pc.black(' ds-drift init ')))

  const MANUAL = '__manual__'
  let tokens: string[] = []
  if (detection.tokenFiles.length > 0) {
    const selected = guard(
      await p.multiselect({
        message: 'Token sources (files defining your design tokens)',
        options: [
          ...detection.tokenFiles.map((c) => ({ value: c.file, label: c.file, hint: c.hint })),
          { value: MANUAL, label: 'Enter another path…', hint: 'type it yourself' },
        ],
        initialValues: detection.tokenFiles.slice(0, 3).map((c) => c.file),
        required: false,
      }),
    )
    tokens = selected.filter((value) => value !== MANUAL)
    if (selected.includes(MANUAL)) tokens.push(...(await promptManualPaths(tokens.length === 0)))
  }
  if (tokens.length === 0) {
    tokens = await promptManualPaths(true)
  }

  const failUnder = Number.parseInt(
    guard(
      await p.text({
        message: 'Fail threshold: CI exits 1 below this drift score (0-100)',
        initialValue: '80',
        validate: (v) => {
          const n = Number.parseInt(v ?? '', 10)
          return Number.isInteger(n) && n >= 0 && n <= 100 ? undefined : 'Enter a number between 0 and 100.'
        },
      }),
    ),
    10,
  )

  const tailwind = guard(
    await p.confirm({
      message: detection.tailwind
        ? 'Tailwind detected. Scan arbitrary values (bg-[#3b82f6], p-[13px])?'
        : 'Scan Tailwind arbitrary values (bg-[#3b82f6], p-[13px])?',
      initialValue: detection.tailwind,
    }),
  )

  const dsRaw = guard(
    await p.text({
      message: 'Design system packages (comma separated; empty disables component/off-ds-import)',
      initialValue: detection.dsPackages.flatMap((d) => [d, `${d}/*`]).join(', '),
      placeholder: '@acme/ui, @acme/ui/*',
      defaultValue: '',
    }),
  )
  const dsPackages = dsRaw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '')

  const ignore =
    detection.storybook &&
    guard(
      await p.confirm({
        message: 'Storybook detected. Ignore *.stories.* files?',
        initialValue: true,
      }),
    )
      ? ['**/*.stories.*']
      : []

  p.outro(`Config written. Try it: ${pc.cyan('pnpm ds-drift')} (or ${pc.cyan('ds-drift --all')})`)

  return { tokens, failUnder, tailwind, dsPackages, ignore, base: detection.base }
}

/** Free-text token paths, comma separated. `required` blocks empty input. */
async function promptManualPaths(required: boolean): Promise<string[]> {
  const raw = guard(
    await p.text({
      message: 'Token file path(s), comma separated (.css, .scss, .json, .ts, .js)',
      placeholder: 'src/styles/tokens.css, src/design/theme.ts',
      defaultValue: '',
      validate: (v) =>
        required && (v === undefined || v.trim() === '')
          ? 'At least one token file is required.'
          : undefined,
    }),
  )
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '')
}

function guard<T>(value: T | symbol): T {
  if (p.isCancel(value)) {
    p.cancel('Init cancelled; nothing written.')
    process.exit(1)
  }
  return value as T
}

function printSummary(choices: InitChoices): void {
  const ds = choices.dsPackages.length > 0 ? choices.dsPackages.join(', ') : 'none (rule off)'
  console.log(
    [
      `${pc.green('Created')} ${CONFIG_FILENAME}`,
      `  tokens:     ${choices.tokens.length > 0 ? choices.tokens.join(', ') : pc.yellow('none detected, edit the config')}`,
      `  failUnder:  ${choices.failUnder}`,
      `  tailwind:   ${choices.tailwind}`,
      `  dsPackages: ${ds}`,
    ].join('\n'),
  )
}

/** Render the config file: chosen values inline, everything else as commented docs. */
export function generateConfig(choices: InitChoices): string {
  const tokens =
    choices.tokens.length > 0
      ? choices.tokens.map((t) => `'${t.replace(/'/g, "\\'")}'`).join(', ')
      : `'src/styles/tokens.css'`
  const lines: string[] = [
    `import { defineConfig } from 'ds-drift'`,
    ``,
    `export default defineConfig({`,
    `  // Design token sources: .css/.scss (custom properties, $variables),`,
    `  // W3C .json, or JS/TS theme modules. Paths are relative to this file;`,
    `  // these files are never analyzed for drift.`,
    `  tokens: [${tokens}],`,
    ``,
    `  // Exit with code 1 when the drift score (0-100) drops below this.`,
    `  failUnder: ${choices.failUnder},`,
    ``,
  ]
  lines.push(
    `  // Scan Tailwind arbitrary values (bg-[#3b82f6], p-[13px]) in class attributes and @apply.`,
    choices.tailwind ? `  tailwind: true,` : `  // tailwind: true,`,
    ``,
    `  // Design system package patterns; component/off-ds-import only runs when set.`,
    choices.dsPackages.length > 0
      ? `  dsPackages: [${choices.dsPackages.map((d) => `'${d}'`).join(', ')}],`
      : `  // dsPackages: ['@acme/ui', '@acme/ui/*'],`,
    ``,
    `  // Glob patterns of files to skip entirely.`,
    choices.ignore.length > 0
      ? `  ignore: [${choices.ignore.map((g) => `'${g}'`).join(', ')}],`
      : `  // ignore: ['**/*.stories.tsx', 'legacy/**'],`,
    ``,
    `  // Base ref for the diff: lines added since the merge-base with this ref.`,
    choices.base === 'origin/main' ? `  // base: 'origin/main',` : `  base: '${choices.base}',`,
    ``,
    `  // Max CIEDE2000 distance for color/hardcoded-near-token.`,
    `  // colorDeltaE: 5,`,
    ``,
    `  // Tolerance in px when snapping lengths to the spacing scale.`,
    `  // spacingTolerancePx: 0.5,`,
    ``,
    `  // Score subtracted per finding (defaults shown).`,
    `  // weights: {`,
    `  //   'color/hardcoded-exact-token': 5,`,
    `  //   'color/hardcoded-near-token': 3,`,
    `  //   'spacing/off-scale': 2,`,
    `  //   'component/off-ds-import': 4,`,
    `  // },`,
    ``,
    `  // Disable individual rules.`,
    `  // rules: { 'spacing/off-scale': false },`,
    ``,
    `  // Read $variables from .scss token files (on by default).`,
    `  // sass: { variables: false },`,
    `})`,
    ``,
  )
  return lines.join('\n')
}
