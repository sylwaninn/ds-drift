import { createJiti } from 'jiti'
import { classifyValue } from './classify.js'
import type { DesignToken } from './types.js'

/**
 * JS/TS theme modules as token sources: the module is loaded (through jiti,
 * like the config file) and its exports are walked. String leaves classify
 * like any other token value (hex, rgb(), bare triplets, px/rem); numeric
 * leaves count as px, but only under a spacing-ish key (`spacing: { 1: 4 }`),
 * so fontWeight: 700 never becomes a 700px spacing token. Token names are the
 * dot paths (`colors.primary`, `lightTokens.background`).
 */

const MAX_DEPTH = 8
const SPACING_SEGMENT_RE = /^(spacing|space|sizes?|gap|insets?|radii|radius)$/i

export async function loadJsTokens(file: string): Promise<DesignToken[]> {
  const jiti = createJiti(import.meta.url)
  return tokensFromModule(await jiti.import(file), file)
}

export function loadJsTokensSync(file: string): DesignToken[] {
  const jiti = createJiti(import.meta.url)
  return tokensFromModule(jiti(file), file)
}

/** Exported for tests. Walks a module namespace (or any object) into tokens. */
export function tokensFromModule(mod: unknown, file: string): DesignToken[] {
  const tokens: DesignToken[] = []
  const seen = new Set<object>()
  if (!isRecordLike(mod)) return tokens
  const ns = mod as Record<string, unknown>
  if (isRecordLike(ns.default)) {
    walk(ns.default as object, [], 0, seen, file, tokens)
  }
  for (const [key, value] of Object.entries(ns)) {
    if (key === 'default') continue
    visit(value, [key], 0, seen, file, tokens)
  }
  return tokens
}

function isRecordLike(value: unknown): value is object {
  return typeof value === 'object' && value !== null
}

function walk(
  node: object,
  path: string[],
  depth: number,
  seen: Set<object>,
  file: string,
  out: DesignToken[],
): void {
  if (depth > MAX_DEPTH || seen.has(node)) return
  seen.add(node)
  const entries = Array.isArray(node)
    ? node.map((value, index) => [String(index), value] as const)
    : Object.entries(node)
  for (const [key, value] of entries) {
    visit(value, [...path, key], depth + 1, seen, file, out)
  }
}

function visit(
  value: unknown,
  path: string[],
  depth: number,
  seen: Set<object>,
  file: string,
  out: DesignToken[],
): void {
  if (typeof value === 'string') {
    if (value.length === 0 || value.length > 100) return
    out.push({ name: path.join('.'), value, source: file, ...classifyValue(value) })
  } else if (typeof value === 'number' && Number.isFinite(value)) {
    if (path.some((segment) => SPACING_SEGMENT_RE.test(segment))) {
      out.push({ name: path.join('.'), value: `${value}px`, kind: 'spacing', px: value, source: file })
    }
  } else if (isRecordLike(value)) {
    walk(value, path, depth, seen, file, out)
  }
  // functions, booleans, null, undefined: not token material
}
