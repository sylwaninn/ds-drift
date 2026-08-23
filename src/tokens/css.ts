import { readFile } from 'node:fs/promises'
import scss from 'postcss-scss'
import { classifyValue } from './classify.js'
import type { DesignToken } from './types.js'

/**
 * Extract design tokens from CSS/SCSS custom properties (`--name: value`).
 * postcss-scss is a superset syntax, so plain CSS parses fine too.
 */
export async function loadCssTokens(file: string): Promise<DesignToken[]> {
  const source = await readFile(file, 'utf8')
  const root = scss.parse(source, { from: file })
  const seen = new Set<string>()
  const tokens: DesignToken[] = []
  root.walkDecls((decl) => {
    if (!decl.prop.startsWith('--')) return
    const key = `${decl.prop}:${decl.value}`
    if (seen.has(key)) return
    seen.add(key)
    tokens.push({
      name: decl.prop,
      value: decl.value,
      source: file,
      ...classifyValue(decl.value),
    })
  })
  return tokens
}
