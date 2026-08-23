import { matchColor, tokenRef } from './color-match.js'
import type { Rule } from '../types.js'

export const colorHardcodedExactToken: Rule = {
  id: 'color/hardcoded-exact-token',
  meta: { description: 'Hardcoded color that duplicates a design token exactly' },
  check(context) {
    return context.candidates.flatMap((candidate) => {
      if (candidate.kind !== 'color') return []
      const match = matchColor(candidate.value, context.tokens)
      if (match === undefined || !match.exact) return []
      const ref = tokenRef(match.token)
      return [
        {
          ruleId: this.id,
          file: candidate.file,
          line: candidate.line,
          column: candidate.column,
          found: candidate.value,
          suggestion: ref,
          message: `${candidate.value} duplicates token ${match.token.name}. Use ${ref}`,
        },
      ]
    })
  },
}
