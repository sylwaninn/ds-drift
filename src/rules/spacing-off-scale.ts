import { tokenRef } from './color-match.js'
import { lengthToPx } from '../tokens/classify.js'
import { isSpacingProp } from '../parsers/scan.js'
import type { Rule } from '../types.js'

export const spacingOffScale: Rule = {
  id: 'spacing/off-scale',
  meta: { description: 'px/rem length on a spacing property that is not on the token scale' },
  check(context) {
    const scaleTokens = context.tokens.filter((t) => t.kind === 'spacing' && t.px !== undefined)
    if (scaleTokens.length === 0) return []
    const tolerance = context.config.spacingTolerancePx
    return context.candidates.flatMap((candidate) => {
      if (candidate.kind !== 'length') return []
      if (candidate.prop === undefined || !isSpacingProp(candidate.prop)) return []
      const px = lengthToPx(candidate.value)
      if (px === undefined) return []
      // Negative margins mirror the scale, so compare magnitudes. Zero is always on scale.
      const magnitude = Math.abs(px)
      if (magnitude <= tolerance) return []
      let nearest = scaleTokens[0]!
      for (const token of scaleTokens) {
        if (Math.abs(token.px! - magnitude) < Math.abs(nearest.px! - magnitude)) nearest = token
      }
      if (Math.abs(nearest.px! - magnitude) <= tolerance) return []
      const ref = tokenRef(nearest)
      return [
        {
          ruleId: this.id,
          file: candidate.file,
          line: candidate.line,
          column: candidate.column,
          found: candidate.value,
          suggestion: ref,
          message: `${candidate.value} is off the spacing scale. Nearest token: ${nearest.name} (${nearest.px}px)`,
        },
      ]
    })
  },
}
