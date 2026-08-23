import { matchColor, tokenRef } from './color-match.js'
import type { Rule } from '../types.js'

export const colorHardcodedNearToken: Rule = {
  id: 'color/hardcoded-near-token',
  meta: { description: 'Hardcoded color within deltaE threshold of a design token' },
  check(context) {
    const threshold = context.config.colorDeltaE
    return context.candidates.flatMap((candidate) => {
      if (candidate.kind !== 'color') return []
      const match = matchColor(candidate.value, context.tokens)
      if (match === undefined || match.exact || match.deltaE >= threshold) return []
      const ref = tokenRef(match.token)
      const delta = match.deltaE.toFixed(1)
      return [
        {
          ruleId: this.id,
          file: candidate.file,
          line: candidate.line,
          column: candidate.column,
          found: candidate.value,
          suggestion: ref,
          message: `${candidate.value} is ΔE ${delta} from token ${match.token.name}. Use ${ref}`,
        },
      ]
    })
  },
}
