#!/usr/bin/env node
import { createRequire } from 'node:module'
import { cac } from 'cac'
import pc from 'picocolors'
import { loadConfig } from './config.js'
import { run } from './engine.js'
import { init } from './init.js'
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
}

const cli = cac('ds-drift')

cli
  .command('', 'Analyze the current git diff for design system drift')
  .option('--all', 'Scan whole files instead of only added lines')
  .option('--base <ref>', 'Base ref for the diff (overrides config)')
  .option('--format <format>', `Output format: ${FORMATS.join(' | ')}`, { default: 'terminal' })
  .option('--config <path>', 'Path to the config file')
  .action(async (flags: CheckFlags) => {
    const format = (flags.format ?? 'terminal') as Format
    if (!FORMATS.includes(format)) {
      throw new Error(`Unknown format "${format}". Expected one of: ${FORMATS.join(', ')}`)
    }
    const config = await loadConfig(flags.config !== undefined ? { configPath: flags.config } : {})
    if (flags.base !== undefined) config.base = flags.base
    const result = await run(config, { all: flags.all ?? false })
    console.log(RENDERERS[format](result, config))
    if (!result.passed) process.exitCode = 1
  })

cli.command('init', 'Create a commented ds-drift.config.ts').action(async () => {
  const target = await init(process.cwd())
  console.log(pc.green(`Created ${target}`))
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
