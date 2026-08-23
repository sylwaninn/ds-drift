import { createRequire } from 'node:module'
import { dirname, extname, relative, sep } from 'node:path'
import picomatch from 'picomatch'
import { loadConfigSync, type ResolvedConfig } from './config.js'
import { buildIgnoreMap, isSuppressed } from './ignores.js'
import { extractTsxCandidates } from './parsers/tsx.js'
import { allRules } from './rules/index.js'
import { FIXABLE_RULES, isApplicableSuggestion } from './fix.js'
import { loadTokensSync, type DesignToken } from './tokens/index.js'

const pkg = createRequire(import.meta.url)('../package.json') as { version: string }

/*
 * Minimal structural types for the parts of the ESLint rule API we touch,
 * so eslint stays out of the dependency tree (the plugin is a plain object).
 */
interface EslintPosition {
  line: number
  /** 0-based, unlike ds-drift findings. */
  column: number
}
interface EslintSourceCode {
  text: string
  getIndexFromLoc(loc: EslintPosition): number
}
interface EslintFixer {
  replaceTextRange(range: [number, number], text: string): unknown
}
interface EslintRuleContext {
  filename: string
  sourceCode: EslintSourceCode
  options: unknown[]
  report(descriptor: {
    loc: { start: EslintPosition; end: EslintPosition }
    message: string
    fix?: (fixer: EslintFixer) => unknown
  }): void
}

interface ProjectContext {
  config: ResolvedConfig
  tokens: DesignToken[]
  isIgnored: (rel: string) => boolean
}

/**
 * One project context per directory: monorepo packages each resolve their own
 * ds-drift config (cosmiconfig searches upward from the linted file).
 */
const contextCache = new Map<string, ProjectContext | null>()

function getProjectContext(fromDir: string, configPath: string | undefined): ProjectContext | null {
  const key = configPath ?? fromDir
  const cached = contextCache.get(key)
  if (cached !== undefined) return cached
  let context: ProjectContext | null
  try {
    const config = configPath !== undefined
      ? loadConfigSync({ configPath, cwd: fromDir })
      : loadConfigSync({ cwd: fromDir })
    const tokens = loadTokensSync(config.tokens, config.rootDir, {
      scssVariables: config.sass.variables,
    })
    const isIgnored =
      config.ignore.length > 0 ? picomatch(config.ignore, { dot: true }) : () => false
    context = { config, tokens, isIgnored }
  } catch {
    // No config found (or unreadable): the rule stays silent instead of
    // erroring on every file of a project that does not use ds-drift.
    context = null
  }
  contextCache.set(key, context)
  return context
}

/** Test hook: drop memoized configs (e.g. after writing fixture files). */
export function clearProjectContextCache(): void {
  contextCache.clear()
}

const SCANNABLE = new Set(['.tsx', '.jsx', '.ts', '.js'])

const driftRule = {
  meta: {
    type: 'suggestion' as const,
    fixable: 'code' as const,
    docs: {
      description:
        'Report design system drift (hardcoded token colors, off-scale spacing, off-DS imports) using the project ds-drift config',
      url: 'https://github.com/sylwaninn/ds-drift#rules',
    },
    schema: [
      {
        type: 'object',
        properties: { config: { type: 'string' } },
        additionalProperties: false,
      },
    ],
  },
  create(context: EslintRuleContext): Record<string, () => void> {
    const filename = context.filename
    if (!SCANNABLE.has(extname(filename).toLowerCase())) return {}
    const options = (context.options[0] ?? {}) as { config?: string }
    const project = getProjectContext(dirname(filename), options.config)
    if (project === null) return {}
    const rel = relative(project.config.rootDir, filename).split(sep).join('/')
    if (rel.startsWith('..')) return {}
    if (project.config.tokenFiles.includes(filename) || project.isIgnored(rel)) return {}

    return {
      Program(): void {
        const text = context.sourceCode.text
        const candidates = extractTsxCandidates(text, rel, {
          tailwind: project.config.tailwind.enabled,
        })
        if (candidates.length === 0) return
        const ignoreMap = buildIgnoreMap(text)
        const ruleContext = { candidates, tokens: project.tokens, config: project.config }
        for (const rule of allRules) {
          if (project.config.rules[rule.id] === false) continue
          for (const finding of rule.check(ruleContext)) {
            if (isSuppressed(ignoreMap, finding.line, finding.ruleId)) continue
            const start = { line: finding.line, column: finding.column - 1 }
            const end = { line: finding.line, column: finding.column - 1 + finding.found.length }
            const fixable =
              FIXABLE_RULES.has(finding.ruleId) &&
              finding.suggestion !== undefined &&
              isApplicableSuggestion(finding.suggestion, rel)
            context.report({
              loc: { start, end },
              message: finding.message,
              ...(fixable
                ? {
                    fix: (fixer: EslintFixer) => {
                      const index = context.sourceCode.getIndexFromLoc(start)
                      if (text.slice(index, index + finding.found.length) !== finding.found) {
                        return null
                      }
                      return fixer.replaceTextRange(
                        [index, index + finding.found.length],
                        finding.suggestion!,
                      )
                    },
                  }
                : {}),
            })
          }
        }
      },
    }
  },
}

const plugin = {
  meta: { name: 'ds-drift', version: pkg.version },
  rules: { drift: driftRule },
  configs: {} as Record<string, unknown>,
}

/** Flat config preset: `import dsDrift from 'ds-drift/eslint'` then `dsDrift.configs.recommended`. */
plugin.configs.recommended = {
  name: 'ds-drift/recommended',
  plugins: { 'ds-drift': plugin },
  rules: { 'ds-drift/drift': 'warn' },
}

export default plugin
