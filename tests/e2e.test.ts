import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, rm, writeFile, cp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const exec = promisify(execFile)

const projectRoot = dirname(fileURLToPath(new URL('.', import.meta.url)))
const cliPath = join(projectRoot, 'dist/cli.js')
const tokensFixture = fileURLToPath(new URL('./fixtures/tokens.css', import.meta.url))

const BASE_CSS = `.legacy {
  color: #1e40af; /* pre-existing drift: must NOT be reported in diff mode */
}
`

const FEATURE_CSS = `${BASE_CSS}
.new {
  color: #3b82f6;
  margin: 13px;
}
`

const FEATURE_TSX = `import { Dialog } from '@radix-ui/themes'
import { Button } from '@acme/ui'

export const New = () => (
  <div style={{ padding: '0.5rem', gap: 7 }}>
    {/* ds-drift-ignore color/hardcoded-near-token */}
    <span style={{ color: '#3a81f5' }} />
    <Dialog />
    <Button />
  </div>
)
`

const CONFIG = {
  tokens: ['tokens.css'],
  base: 'main',
  dsPackages: ['@acme/ui', '@acme/ui/*'],
}

let repo: string

async function git(...args: string[]): Promise<void> {
  await exec('git', ['-c', 'user.email=e2e@test', '-c', 'user.name=e2e', '-c', 'commit.gpgsign=false', ...args], {
    cwd: repo,
  })
}

beforeAll(async () => {
  await exec('pnpm', ['build'], { cwd: projectRoot })

  repo = await mkdtemp(join(tmpdir(), 'ds-drift-e2e-'))
  await git('init', '-b', 'main')
  await cp(tokensFixture, join(repo, 'tokens.css'))
  await writeFile(join(repo, 'ds-drift.config.json'), JSON.stringify(CONFIG, null, 2))
  await mkdir(join(repo, 'src'))
  await writeFile(join(repo, 'src/existing.css'), BASE_CSS)
  await git('add', '-A')
  await git('commit', '-m', 'base')
  await git('checkout', '-b', 'feature')
  await writeFile(join(repo, 'src/existing.css'), FEATURE_CSS)
  await writeFile(join(repo, 'src/New.tsx'), FEATURE_TSX)
  await git('add', '-A')
  await git('commit', '-m', 'add drifted code')
}, 120_000)

afterAll(async () => {
  await rm(repo, { recursive: true, force: true })
})

describe('ds-drift CLI end to end', () => {
  it('reports only drift added in the diff, as stable JSON', async () => {
    const { stdout } = await exec('node', [cliPath, '--format', 'json'], { cwd: repo })
    const report = JSON.parse(stdout)
    // Pre-existing drift in src/existing.css line 2 must be absent.
    expect(report.findings.every((f: { line: number; file: string }) => !(f.file === 'src/existing.css' && f.line === 2))).toBe(true)
    expect(report).toMatchSnapshot()
  }, 30_000)

  it('sees uncommitted and untracked drift before any commit', async () => {
    await writeFile(join(repo, 'src/existing.css'), `${FEATURE_CSS}.wip {\n  color: #3b82f6;\n}\n`)
    await writeFile(join(repo, 'src/Untracked.css'), '.u {\n  margin: 13px;\n}\n')
    try {
      const { stdout } = await exec('node', [cliPath, '--format', 'json'], { cwd: repo }).catch(
        (e: { stdout: string }) => e,
      )
      const report = JSON.parse(stdout)
      const files = report.findings.map((f: { file: string; line: number }) => `${f.file}:${f.line}`)
      expect(files).toContain('src/existing.css:10') // unstaged edit
      expect(files).toContain('src/Untracked.css:2') // untracked file
    } finally {
      await writeFile(join(repo, 'src/existing.css'), FEATURE_CSS)
      await rm(join(repo, 'src/Untracked.css'), { force: true })
    }
  }, 30_000)

  it('exits 1 when the score falls below the threshold', async () => {
    await writeFile(
      join(repo, 'ds-drift.config.json'),
      JSON.stringify({ ...CONFIG, failUnder: 95 }, null, 2),
    )
    const error = await exec('node', [cliPath], { cwd: repo }).then(
      () => undefined,
      (e: NodeJS.ErrnoException & { code: number; stdout: string }) => e,
    )
    await writeFile(join(repo, 'ds-drift.config.json'), JSON.stringify(CONFIG, null, 2))
    expect(error).toBeDefined()
    expect(error!.code).toBe(1)
    expect(error!.stdout).toContain('below threshold')
  }, 30_000)
})
