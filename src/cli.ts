#!/usr/bin/env node
import { createRequire } from 'node:module'
import { cac } from 'cac'
import pc from 'picocolors'
import { resolve } from 'node:path'
import { writeBaseline } from './baseline.js'
import { loadConfig } from './config.js'
import { run } from './engine.js'
import { applyFixes } from './fix.js'
import { runInit } from './init.js'
import { renderGithub } from './reporters/github.js'
import { renderJson } from './reporters/json.js'
import { renderTerminal } from './reporters/terminal.js'

const pkg = createRequire(import.meta.url)('../package.json') as { version: string }

const FORMATS = ['terminal', 'json', 'github'] as const
type Format = (typeof FORMATS)[number]

const RENDERERS: Record<Format, typeof renderTerminal> = {
  terminal: renderTerminal,
  json: renderJson,
  github: renderGithub,
}

interface CheckFlags {
  all?: boolean
  base?: string
  format?: string
  config?: string
  fix?: boolean
  updateBaseline?: boolean
}

const cli = cac('ds-drift')

cli
  .command('', 'Analyze the current git diff for design system drift')
  .option('--all', 'Scan whole files instead of only added lines')
  .option('--base <ref>', 'Base ref for the diff (overrides config)')
  .option('--format <format>', `Output format: ${FORMATS.join(' | ')}`, { default: 'terminal' })
  .option('--config <path>', 'Path to the config file')
  .option('--fix', 'Rewrite exact token duplicates to the token reference')
  .option('--update-baseline', 'Record current findings as the accepted baseline')
  .action(async (flags: CheckFlags) => {
    const format = (flags.format ?? 'terminal') as Format
    if (!FORMATS.includes(format)) {
      throw new Error(`Unknown format "${format}". Expected one of: ${FORMATS.join(', ')}`)
    }
    const config = await loadConfig(flags.config !== undefined ? { configPath: flags.config } : {})
    if (flags.base !== undefined) config.base = flags.base
    const all = flags.all ?? false

    if (flags.updateBaseline === true) {
      const result = await run(config, { all, baseline: false })
      const count = await writeBaseline(resolve(config.rootDir, config.baseline), result.findings)
      console.log(pc.green(`Baseline written: ${config.baseline} (${count} finding(s) recorded)`))
      return
    }

    let result = await run(config, { all })
    if (flags.fix === true) {
      const summary = await applyFixes(result.findings, config.rootDir)
      if (summary.fixed > 0) {
        // stderr keeps --format json/github output parseable
        console.error(pc.green(`Fixed ${summary.fixed} finding(s) in ${summary.files} file(s).`))
        result = await run(config, { all })
      }
    }
    console.log(RENDERERS[format](result, config))
    if (!result.passed) process.exitCode = 1
  })

cli
  .command('init', 'Create ds-drift.config.ts (detects tokens, Tailwind, DS packages)')
  .option('--yes', 'Accept detected defaults without prompting')
  .option('--force', 'Overwrite an existing config file')
  .action(async (flags: { yes?: boolean; force?: boolean }) => {
    await runInit({ cwd: process.cwd(), yes: flags.yes ?? false, force: flags.force ?? false })
  })

cli.help()
cli.version(pkg.version)

try {
  cli.parse(process.argv, { run: false })
  await cli.runMatchedCommand()
} catch (error) {
  console.error(pc.red(error instanceof Error ? error.message : String(error)))
  process.exitCode = 2
}
