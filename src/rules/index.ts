import { colorHardcodedExactToken } from './color-hardcoded-exact-token.js'
import { colorHardcodedNearToken } from './color-hardcoded-near-token.js'
import { componentOffDsImport } from './component-off-ds-import.js'
import { spacingOffScale } from './spacing-off-scale.js'
import type { Rule } from '../types.js'

/** All built-in rules. Add new rules here; the engine never needs to change. */
export const allRules: Rule[] = [
  colorHardcodedExactToken,
  colorHardcodedNearToken,
  spacingOffScale,
  componentOffDsImport,
]
