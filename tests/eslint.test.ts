import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Linter } from 'eslint'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import plugin, { clearProjectContextCache } from '../src/eslint.js'

const appDir = fileURLToPath(new URL('./fixtures/eslint-app', import.meta.url))
const appFile = join(appDir, 'App.jsx')

const CODE = `import { Card } from '@mui/material'
import { Button } from '@acme/ui'

export const App = () => (
  <div style={{ color: '#3b82f6' }} className="p-[13px]">
    {/* ds-drift-ignore color/hardcoded-near-token */}
    <Card style={{ color: '#3a81f5' }} />
    <Button />
  </div>
)
`

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const FLAT_CONFIG: any = [
  {
    files: ['**/*.jsx'],
    plugins: { 'ds-drift': plugin },
    rules: { 'ds-drift/drift': 'warn' },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
]

// Linter resolves flat configs relative to its cwd; pin it to the linted file's dir.
function lint(code: string, filename: string) {
  return new Linter({ cwd: dirname(filename) }).verify(code, FLAT_CONFIG, filename)
}

let scratch: string | undefined

beforeEach(() => clearProjectContextCache())

afterAll(async () => {
  if (scratch !== undefined) await rm(scratch, { recursive: true, force: true })
})

describe('eslint plugin', () => {
  it('reports the same findings as the CLI, honoring ds-drift-ignore', () => {
    const messages = lint(CODE, appFile)
    const summaries = messages.map((m) => [m.line, m.message.split('.')[0]])
    expect(summaries).toEqual([
      [1, 'Card imported from "@mui/material"'],
      [5, '#3b82f6 duplicates token --color-primary'],
      [5, '13px is off the spacing scale'],
    ])
    // near-token on line 7 suppressed by the JSX ignore comment on line 6
    expect(messages.some((m) => m.line === 7)).toBe(false)
  })

  it('reports 1-based lines and 0-based-converted columns pointing at the value', () => {
    const [, exact] = lint(CODE, appFile)
    const line = CODE.split('\n')[exact!.line - 1]!
    expect(line.slice(exact!.column - 1, exact!.column - 1 + '#3b82f6'.length)).toBe('#3b82f6')
  })

  it('fixes exact token duplicates via the ESLint fixer', () => {
    const { output } = new Linter({ cwd: appDir }).verifyAndFix(CODE, FLAT_CONFIG, {
      filename: appFile,
    })
    expect(output).toContain("color: 'var(--color-primary)'")
    expect(output).toContain("color: '#3a81f5'") // near-token: never auto-fixed
  })

  it('stays silent in a project without a ds-drift config', async () => {
    scratch = await mkdtemp(join(tmpdir(), 'ds-drift-eslint-'))
    const messages = lint(CODE, join(scratch, 'App.jsx'))
    expect(messages).toEqual([])
  })

  it('exposes a recommended flat config', () => {
    const recommended = plugin.configs.recommended as { rules: Record<string, string> }
    expect(recommended.rules['ds-drift/drift']).toBe('warn')
  })
})
