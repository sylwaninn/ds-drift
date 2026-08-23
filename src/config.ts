import { dirname, resolve } from 'node:path'
import { cosmiconfig, cosmiconfigSync, type Loader, type LoaderSync } from 'cosmiconfig'
import { createJiti } from 'jiti'
import { z } from 'zod'

export const RULE_IDS = [
  'color/hardcoded-exact-token',
  'color/hardcoded-near-token',
  'spacing/off-scale',
  'component/off-ds-import',
] as const

export type RuleId = (typeof RULE_IDS)[number]

export const DEFAULT_WEIGHTS: Record<RuleId, number> = {
  'color/hardcoded-exact-token': 5,
  'color/hardcoded-near-token': 3,
  'spacing/off-scale': 2,
  'component/off-ds-import': 4,
}

/**
 * Record keyed by rule ids. Hand-rolled instead of z.partialRecord: that API
 * only exists in recent zod 4.x, and monorepo overrides can resolve ds-drift
 * against an older zod at runtime.
 */
function ruleRecord<V>(valueSchema: z.ZodType<V>) {
  return z
    .record(z.string(), valueSchema)
    .superRefine((value, ctx) => {
      for (const key of Object.keys(value)) {
        if (!(RULE_IDS as readonly string[]).includes(key)) {
          ctx.addIssue({
            code: 'custom',
            message: `Unknown rule id "${key}". Known rules: ${RULE_IDS.join(', ')}`,
            path: [key],
          })
        }
      }
    })
    .transform((value) => value as Partial<Record<RuleId, V>>)
}

const configSchema = z.object({
  /** Token source files (.css, .scss, or W3C .json), relative to the config file. */
  tokens: z.array(z.string()).min(1),
  /** Base ref for the diff: `git diff -U0 <base>...HEAD`. */
  base: z.string().default('origin/main'),
  /** Exit with code 1 when the drift score is below this. */
  failUnder: z.number().min(0).max(100).default(80),
  /** Max deltaE (CIEDE2000) for color/hardcoded-near-token. */
  colorDeltaE: z.number().positive().default(5),
  /** Tolerance in px when snapping lengths to the spacing scale. */
  spacingTolerancePx: z.number().nonnegative().default(0.5),
  /** Score subtracted per finding, per rule. Merged over built-in defaults. */
  weights: ruleRecord(z.number().nonnegative()).default({}),
  /** Per-rule enable/disable, e.g. { "spacing/off-scale": false }. */
  rules: ruleRecord(z.boolean()).default({}),
  /** Glob patterns of files to skip entirely. */
  ignore: z.array(z.string()).default([]),
  /** Baseline file (relative to the config); written by --update-baseline, subtracted from runs. */
  baseline: z.string().default('.ds-drift.baseline.json'),
  /**
   * Design system package patterns (e.g. "@acme/ui", "@acme/ui/*").
   * component/off-ds-import only runs when this is set.
   */
  dsPackages: z.array(z.string()).optional(),
  /**
   * Tailwind support: scan arbitrary values (bg-[#3b82f6], p-[13px]) in
   * className/class attributes and @apply directives. `true` is shorthand
   * for { enabled: true }.
   */
  tailwind: z
    .union([z.boolean(), z.object({ enabled: z.boolean().default(true) })])
    .transform((v) => (typeof v === 'boolean' ? { enabled: v } : v))
    .default({ enabled: false }),
  /** Sass support. `variables`: read `$name: value` from token files as tokens. */
  sass: z
    .object({ variables: z.boolean().default(true) })
    .default({ variables: true }),
})

/** Shape accepted in ds-drift.config.*; every field except `tokens` is optional. */
export type DsDriftConfig = z.input<typeof configSchema>

export interface ResolvedConfig extends z.output<typeof configSchema> {
  weights: Record<RuleId, number>
  /** Directory of the config file; token paths and analysis are relative to it. */
  rootDir: string
  /** Absolute paths of the token source files (never analyzed for drift). */
  tokenFiles: string[]
}

/** Identity helper for typed `ds-drift.config.ts` files. */
export function defineConfig(config: DsDriftConfig): DsDriftConfig {
  return config
}

const tsLoader: Loader = async (filepath) => {
  const jiti = createJiti(import.meta.url, { interopDefault: true })
  const mod = await jiti.import(filepath)
  const record = mod as Record<string, unknown>
  return record.default ?? mod
}

// jiti instances are also callable synchronously (CommonJS-style transform).
const tsLoaderSync: LoaderSync = (filepath) => {
  const jiti = createJiti(import.meta.url, { interopDefault: true })
  const mod = jiti(filepath) as Record<string, unknown>
  return mod.default ?? mod
}

const SEARCH_PLACES = [
  'ds-drift.config.ts',
  'ds-drift.config.js',
  'ds-drift.config.mjs',
  'ds-drift.config.cjs',
  'ds-drift.config.json',
  'package.json',
]

const explorer = cosmiconfig('ds-drift', {
  searchPlaces: SEARCH_PLACES,
  loaders: { '.ts': tsLoader },
})

// No .mjs here: ESM can't be loaded synchronously. jiti transforms .ts/.js/.cjs
// (ESM syntax included) in-process, which covers every other config flavor.
const explorerSync = cosmiconfigSync('ds-drift', {
  searchPlaces: SEARCH_PLACES.filter((place) => !place.endsWith('.mjs')),
  loaders: { '.ts': tsLoaderSync, '.js': tsLoaderSync, '.cjs': tsLoaderSync },
})

export interface LoadConfigOptions {
  /** Explicit config file path (skips searching). */
  configPath?: string
  /** Search start directory. Defaults to process.cwd(). */
  cwd?: string
}

export async function loadConfig(options: LoadConfigOptions = {}): Promise<ResolvedConfig> {
  const cwd = options.cwd ?? process.cwd()
  const result = options.configPath
    ? await explorer.load(resolve(cwd, options.configPath))
    : await explorer.search(cwd)
  if (!result || result.isEmpty) {
    throw new Error('No ds-drift config found. Run `ds-drift init` to create one.')
  }
  return resolveConfig(result.config, dirname(result.filepath))
}

/** Synchronous variant of loadConfig, for callers that cannot await (e.g. ESLint rules). */
export function loadConfigSync(options: LoadConfigOptions = {}): ResolvedConfig {
  const cwd = options.cwd ?? process.cwd()
  const result = options.configPath
    ? explorerSync.load(resolve(cwd, options.configPath))
    : explorerSync.search(cwd)
  if (!result || result.isEmpty) {
    throw new Error('No ds-drift config found. Run `ds-drift init` to create one.')
  }
  return resolveConfig(result.config, dirname(result.filepath))
}

/** Validate a raw config object and apply defaults. Exported for tests and init. */
export function resolveConfig(raw: unknown, rootDir: string): ResolvedConfig {
  const parsed = configSchema.safeParse(raw)
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n')
    throw new Error(`Invalid ds-drift config:\n${details}`)
  }
  const config = parsed.data
  return {
    ...config,
    weights: { ...DEFAULT_WEIGHTS, ...config.weights },
    rootDir,
    tokenFiles: config.tokens.map((file) => resolve(rootDir, file)),
  }
}
