import scss from 'postcss-scss'
import { scanValue } from './scan.js'
import type { Candidate } from '../types.js'

/** Extract color/length candidates from CSS/SCSS source. `label` is the reported file path. */
export function extractCssCandidates(source: string, label: string): Candidate[] {
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
  return candidates
}
