import { writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

export const CONFIG_FILENAME = 'ds-drift.config.ts'

export const CONFIG_TEMPLATE = `import { defineConfig } from 'ds-drift'

export default defineConfig({
  // Design token sources: CSS/SCSS custom properties and/or W3C design-tokens JSON.
  // Paths are relative to this file. These files are never analyzed for drift.
  tokens: ['src/styles/tokens.css'],

  // Base ref for the diff: ds-drift analyzes lines added in \`git diff <base>...HEAD\`.
  // base: 'origin/main',

  // Exit with code 1 when the drift score (0-100) drops below this.
  // failUnder: 80,

  // Max CIEDE2000 distance for color/hardcoded-near-token.
  // colorDeltaE: 5,

  // Tolerance in px when snapping lengths to the spacing scale.
  // spacingTolerancePx: 0.5,

  // Score subtracted per finding (defaults shown).
  // weights: {
  //   'color/hardcoded-exact-token': 5,
  //   'color/hardcoded-near-token': 3,
  //   'spacing/off-scale': 2,
  //   'component/off-ds-import': 4,
  // },

  // Disable individual rules.
  // rules: { 'spacing/off-scale': false },

  // Glob patterns of files to skip entirely.
  // ignore: ['**/*.stories.tsx', 'legacy/**'],

  // Design system package patterns. component/off-ds-import only runs when set:
  // importing a PascalCase component from any other package is flagged.
  // dsPackages: ['@acme/ui', '@acme/ui/*'],
})
`

/** Write a commented starter config. Returns the created path; throws if one exists. */
export async function init(cwd: string): Promise<string> {
  const target = join(cwd, CONFIG_FILENAME)
  if (existsSync(target)) {
    throw new Error(`${CONFIG_FILENAME} already exists; not overwriting.`)
  }
  await writeFile(target, CONFIG_TEMPLATE)
  return target
}
