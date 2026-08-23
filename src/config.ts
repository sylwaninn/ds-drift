import { dirname, resolve } from 'node:path'
import { cosmiconfig, type Loader } from 'cosmiconfig'
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

const ruleIdSchema = z.enum(RULE_IDS)

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
  weights: z.partialRecord(ruleIdSchema, z.number().nonnegative()).default({}),
  /** Per-rule enable/disable, e.g. { "spacing/off-scale": false }. */
  rules: z.partialRecord(ruleIdSchema, z.boolean()).default({}),
  /** Glob patterns of files to skip entirely. */
  ignore: z.array(z.string()).default([]),
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

const explorer = cosmiconfig('ds-drift', {
  searchPlaces: [
    'ds-drift.config.ts',
    'ds-drift.config.js',
    'ds-drift.config.mjs',
    'ds-drift.config.cjs',
    'ds-drift.config.json',
    'package.json',
  ],
  loaders: { '.ts': tsLoader },
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
