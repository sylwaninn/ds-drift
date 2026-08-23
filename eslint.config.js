import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist/', 'tests/fixtures/', 'coverage/'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // Used deliberately after explicit guards (e.g. non-empty array reduce seeds).
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
)
