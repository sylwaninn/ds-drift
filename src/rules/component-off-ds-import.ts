import picomatch from 'picomatch'
import type { Rule } from '../types.js'

/** Packages that legitimately export PascalCase values but are not UI kits. */
const SKIP_RE = /^(react|react-dom|next)(\/|$)/

export const componentOffDsImport: Rule = {
  id: 'component/off-ds-import',
  meta: { description: 'UI component imported from outside the design system packages' },
  check(context) {
    const patterns = context.config.dsPackages
    if (patterns === undefined || patterns.length === 0) return [] // no whitelist -> rule off
    const isDsPackage = picomatch(patterns)
    return context.candidates.flatMap((candidate) => {
      if (candidate.kind !== 'import') return []
      const specifier = candidate.value
      if (specifier.startsWith('.') || specifier.startsWith('/')) return [] // local imports
      if (SKIP_RE.test(specifier) || isDsPackage(specifier)) return []
      const names = candidate.importNames ?? []
      if (names.length === 0) return []
      return [
        {
          ruleId: this.id,
          file: candidate.file,
          line: candidate.line,
          column: candidate.column,
          found: specifier,
          message: `${names.join(', ')} imported from "${specifier}". Expected a design system package (${patterns.join(', ')})`,
        },
      ]
    })
  },
}
