import scss from 'postcss-scss'
import { scanValue } from './scan.js'
import { scanTailwindClasses } from './tailwind.js'
import type { Candidate } from '../types.js'

export interface ParserOptions {
  /** Scan Tailwind arbitrary values (className attributes, @apply directives). */
  tailwind?: boolean
}

/** Extract color/length candidates from CSS/SCSS source. `label` is the reported file path. */
export function extractCssCandidates(
  source: string,
  label: string,
  options: ParserOptions = {},
): Candidate[] {
  const candidates: Candidate[] = []
  const root = scss.parse(source, { from: label })
  root.walkDecls((decl) => {
    // Offset of the value within the decl node ("prop" + ": ").
    const valueOffset = decl.prop.length + (decl.raws.between ?? ': ').length
    for (const match of scanValue(decl.value)) {
      const pos = decl.positionBy({ index: valueOffset + match.index })
      candidates.push({
        kind: match.kind,
        value: match.value,
        file: label,
        line: pos.line,
        column: pos.column,
        prop: decl.prop.toLowerCase(),
      })
    }
  })
  if (options.tailwind === true) {
    root.walkAtRules('apply', (atRule) => {
      // Offset of params within the at-rule node ("@" + name + spacing).
      const paramsOffset = 1 + atRule.name.length + (atRule.raws.afterName ?? ' ').length
      for (const match of scanTailwindClasses(atRule.params)) {
        const pos = atRule.positionBy({ index: paramsOffset + match.index })
        const candidate: Candidate = {
          kind: match.kind,
          value: match.value,
          file: label,
          line: pos.line,
          column: pos.column,
        }
        if (match.prop !== undefined) candidate.prop = match.prop
        candidates.push(candidate)
      }
    })
  }
  return candidates
}
