import { readFile } from 'node:fs/promises'
import scss from 'postcss-scss'
import { classifyValue } from './classify.js'
import type { DesignToken } from './types.js'

export interface CssTokenOptions {
  /** Also read Sass `$name: value` declarations as tokens. */
  scssVariables: boolean
}

/**
 * Extract design tokens from CSS/SCSS custom properties (`--name: value`) and,
 * when enabled, Sass variables (`$name: value`). postcss-scss is a superset
 * syntax, so plain CSS parses fine too.
 */
export async function loadCssTokens(
  file: string,
  options: CssTokenOptions = { scssVariables: true },
): Promise<DesignToken[]> {
  const source = await readFile(file, 'utf8')
  const root = scss.parse(source, { from: file })
  const seen = new Set<string>()
  const tokens: DesignToken[] = []
  root.walkDecls((decl) => {
    const isCustomProperty = decl.prop.startsWith('--')
    const isScssVariable = options.scssVariables && decl.prop.startsWith('$')
    if (!isCustomProperty && !isScssVariable) return
    // `$gap: 8px !default;` defines 8px; the flag is not part of the value.
    const value = decl.value.replace(/\s*!(default|global)\s*$/, '')
    const key = `${decl.prop}:${value}`
    if (seen.has(key)) return
    seen.add(key)
    tokens.push({
      name: decl.prop,
      value,
      source: file,
      ...classifyValue(value),
    })
  })
  return tokens
}
