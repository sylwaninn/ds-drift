import { resolve, extname } from 'node:path'
import { loadCssTokens, type CssTokenOptions } from './css.js'
import { loadW3cTokens } from './w3c.js'
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
