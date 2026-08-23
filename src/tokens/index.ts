import { readFileSync } from 'node:fs'
import { resolve, extname } from 'node:path'
import { cssTokensFromSource, loadCssTokens, type CssTokenOptions } from './css.js'
import { loadW3cTokens, w3cTokensFromSource } from './w3c.js'
import type { DesignToken } from './types.js'

export type { DesignToken, TokenKind } from './types.js'
export type { CssTokenOptions } from './css.js'
export { classifyValue, lengthToPx } from './classify.js'

/** Load and classify tokens from a list of CSS/SCSS/W3C-JSON files (paths relative to baseDir). */
export async function loadTokens(
  files: string[],
  baseDir: string,
  options: CssTokenOptions = { scssVariables: true },
): Promise<DesignToken[]> {
  const all: DesignToken[] = []
  for (const file of files) {
    const abs = resolve(baseDir, file)
    const ext = extname(abs).toLowerCase()
    if (ext === '.css' || ext === '.scss') {
      all.push(...(await loadCssTokens(abs, options)))
    } else if (ext === '.json') {
      all.push(...(await loadW3cTokens(abs)))
    } else {
      throw new Error(`Unsupported token file type "${ext}": ${file} (expected .css, .scss or .json)`)
    }
  }
  return all
}

/** Synchronous variant of loadTokens, for callers that cannot await (e.g. ESLint rules). */
export function loadTokensSync(
  files: string[],
  baseDir: string,
  options: CssTokenOptions = { scssVariables: true },
): DesignToken[] {
  const all: DesignToken[] = []
  for (const file of files) {
    const abs = resolve(baseDir, file)
    const ext = extname(abs).toLowerCase()
    if (ext === '.css' || ext === '.scss') {
      all.push(...cssTokensFromSource(readFileSync(abs, 'utf8'), abs, options))
    } else if (ext === '.json') {
      all.push(...w3cTokensFromSource(readFileSync(abs, 'utf8'), abs))
    } else {
      throw new Error(`Unsupported token file type "${ext}": ${file} (expected .css, .scss or .json)`)
    }
  }
  return all
}
