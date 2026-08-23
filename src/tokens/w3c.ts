import { readFile } from 'node:fs/promises'
import { classifyValue, lengthToPx } from './classify.js'
import type { DesignToken } from './types.js'

/**
 * W3C Design Tokens draft ingestion (https://tr.designtokens.org/format/).
 * Supported: nested groups, `$type` inheritance from groups, `{group.token}`
 * aliases, `dimension` values as strings ("1rem") or objects ({value, unit}),
 * `color` values as strings. Unsupported shapes classify as `other`.
 */
export async function loadW3cTokens(file: string): Promise<DesignToken[]> {
  const doc: unknown = JSON.parse(await readFile(file, 'utf8'))
  if (!isRecord(doc)) throw new Error(`${file}: expected a JSON object at the root`)
  const tokens: DesignToken[] = []
  walk(doc, [], undefined, doc, file, tokens)
  return tokens
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function walk(
  node: Record<string, unknown>,
  path: string[],
  inheritedType: string | undefined,
  doc: Record<string, unknown>,
  file: string,
  out: DesignToken[],
): void {
  const type = typeof node.$type === 'string' ? node.$type : inheritedType
  if ('$value' in node) {
    const token = buildToken(path.join('.'), node.$value, type, doc, file)
    if (token) out.push(token)
    return
  }
  for (const [key, child] of Object.entries(node)) {
    if (key.startsWith('$')) continue
    if (isRecord(child)) walk(child, [...path, key], type, doc, file, out)
  }
}

const ALIAS_RE = /^\{([^}]+)\}$/

function buildToken(
  name: string,
  rawValue: unknown,
  type: string | undefined,
  doc: Record<string, unknown>,
  file: string,
): DesignToken | undefined {
  const resolved = resolveAlias(rawValue, type, doc)
  if (resolved === undefined) return undefined
  const { value, type: resolvedType } = resolved

  if (resolvedType === 'dimension') {
    const str = dimensionToString(value)
    const px = str === undefined ? undefined : lengthToPx(str)
    if (str === undefined || px === undefined) {
      return { name, value: stringify(value), kind: 'other', source: file }
    }
    return { name, value: str, kind: 'spacing', px, source: file }
  }

  if (typeof value !== 'string') {
    return { name, value: stringify(value), kind: 'other', source: file }
  }

  if (resolvedType === 'color') {
    const classified = classifyValue(value)
    return classified.kind === 'color'
      ? { name, value, source: file, ...classified }
      : { name, value, kind: 'other', source: file }
  }

  // No (or unknown) $type: fall back to value-shape classification.
  return { name, value, source: file, ...classifyValue(value) }
}

/** Follow `{path.to.token}` aliases within the same document, with a cycle guard. */
function resolveAlias(
  value: unknown,
  type: string | undefined,
  doc: Record<string, unknown>,
): { value: unknown; type: string | undefined } | undefined {
  const visited = new Set<string>()
  let current = value
  let currentType = type
  while (typeof current === 'string') {
    const m = ALIAS_RE.exec(current)
    if (!m || m[1] === undefined) break
    const ref = m[1]
    if (visited.has(ref)) return undefined
    visited.add(ref)
    const target = lookup(doc, ref.split('.'))
    if (!isRecord(target) || !('$value' in target)) return undefined
    current = target.$value
    if (typeof target.$type === 'string') currentType = target.$type
  }
  return { value: current, type: currentType }
}

function lookup(doc: Record<string, unknown>, path: string[]): unknown {
  let node: unknown = doc
  for (const segment of path) {
    if (!isRecord(node)) return undefined
    node = node[segment]
  }
  return node
}

function dimensionToString(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (isRecord(value) && typeof value.value === 'number' && typeof value.unit === 'string') {
    return `${value.value}${value.unit}`
  }
  return undefined
}

function stringify(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value)
}
