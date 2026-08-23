# ds-drift

> Design system drift detector for AI-generated frontend code.

[![CI](https://img.shields.io/github/actions/workflow/status/sylwaninn/ds-drift/ci.yml?label=CI)](https://github.com/sylwaninn/ds-drift/actions)
[![npm](https://img.shields.io/npm/v/ds-drift)](https://www.npmjs.com/package/ds-drift)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)
![node >= 20](https://img.shields.io/badge/node-%E2%89%A5%2020-brightgreen)

`ds-drift` reads the lines a PR adds, compares them against the design tokens you already have, and reports every hardcoded color, off-scale spacing value, and out-of-system component import. Each run produces a drift score from 0 to 100 that fails CI below a threshold you set.

The failure mode it targets is specific: a coding agent (or a hurried teammate) writes `color: #3b82f6` when `--color-primary` holds that exact value, `margin: 13px` when the scale says 12 or 16, or imports a dialog from a random package when the design system ships one. None of that fails a build today, and reviewers rarely catch it.

The CLI runs offline; it has no server component and no telemetry.

![demo](docs/demo.gif)
<!-- TODO: record demo GIF -->

## Quickstart (30 seconds)

```sh
pnpm add -D ds-drift
pnpm ds-drift init          # creates a commented ds-drift.config.ts
```

Point the config at your tokens, either CSS custom properties or [W3C design tokens](https://tr.designtokens.org/format/) JSON:

```ts
// ds-drift.config.ts
import { defineConfig } from 'ds-drift'

export default defineConfig({
  tokens: ['src/styles/tokens.css'],
  dsPackages: ['@acme/ui', '@acme/ui/*'],
})
```

Run it on your branch:

```sh
pnpm ds-drift               # analyzes lines added vs origin/main
pnpm ds-drift --all         # scans whole files instead of the diff
```

```
src/Button.tsx
  12:21   #3b82f5 → var(--color-primary)  color/hardcoded-near-token
  14:9    13px → var(--spacing-4)         spacing/off-scale

✖ 2 finding(s) (1 color/hardcoded-near-token, 1 spacing/off-scale)
Drift score: 95/100 (threshold 80)
```

## GitHub Action

Findings surface as PR annotations through workflow commands. No marketplace action to install:

```yaml
name: ds-drift
on: pull_request

jobs:
  drift:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0 # ds-drift diffs against the base branch
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm ds-drift --base origin/${{ github.base_ref }} --format github
```

The job fails (exit `1`) when the drift score drops below `failUnder` (default 80).

## How it works

1. Tokens are read from your `.css`/`.scss` custom properties and W3C `.json` files, then classified as `color`, `spacing`, or `other`.
2. `git diff -U0 <base>...HEAD` limits analysis to added lines; `--all` scans whole files instead. Token source files are never analyzed.
3. Parsers extract candidate values with exact positions: stylesheet declarations (PostCSS), inline `style={{ ... }}` objects and `styled`/`css`/`keyframes`/`createGlobalStyle` tagged templates (ts-morph), and component imports.
4. Rules check the candidates, ignore comments are applied, and the findings are scored and reported.

## Rules

| Rule | Default weight | Flags |
| --- | --- | --- |
| [`color/hardcoded-exact-token`](#colorhardcoded-exact-token) | 5 | Color that duplicates a token exactly |
| [`color/hardcoded-near-token`](#colorhardcoded-near-token) | 3 | Color perceptually close to a token |
| [`spacing/off-scale`](#spacingoff-scale) | 2 | Length not on the spacing scale |
| [`component/off-ds-import`](#componentoff-ds-import) | 4 | Component imported outside the design system |

### `color/hardcoded-exact-token`

A hardcoded color (hex, `rgb()`, `hsl()`) that duplicates an existing color token exactly. Alpha counts; notation does not.

```css
/* tokens: --color-primary: #3B82F6 */
color: #3b82f6;              /* ✖ use var(--color-primary) */
color: rgb(59, 130, 246);    /* ✖ same color, different notation */
color: var(--color-primary); /* ✔ */
```

### `color/hardcoded-near-token`

A hardcoded color within CIEDE2000 ΔE < 5 (configurable via `colorDeltaE`) of a token, typically eyedropped from a screenshot. The nearest token is suggested. Values whose alpha matches no token, like `rgb(59 130 246 / 0.5)` against opaque tokens, are skipped.

```css
color: #3a81f5; /* ✖ ΔE 0.4 from --color-primary; use var(--color-primary) */
```

### `spacing/off-scale`

A `px`/`rem` length on a spacing property (`margin*`, `padding*`, `gap`, `inset*`, `top`, `right`, `bottom`, `left`) that misses every value on the scale derived from your spacing tokens (tolerance `spacingTolerancePx`, default 0.5). `1rem` equals `16px`; negative margins are compared by magnitude; `0` always passes. Numeric React style values count as px (`marginTop: 13`).

```css
/* tokens: --spacing-1: 0.25rem; --spacing-2: 0.5rem; --spacing-4: 1rem */
margin: 13px;   /* ✖ off scale; nearest token is --spacing-4 (16px) */
margin: 0.5rem; /* ✔ 8px is on the scale */
```

### `component/off-ds-import`

A PascalCase component imported from a package outside your `dsPackages` patterns. The rule only runs when `dsPackages` is configured. Relative imports and `react`, `react-dom`, `next` are never flagged.

```tsx
import { Dialog } from '@radix-ui/themes' // ✖ expected @acme/ui
import { Dialog } from '@acme/ui'         // ✔
```

## Ignoring findings

Line-level, on the offending line or the line above, with an optional rule id:

```css
color: #3b82f6; /* ds-drift-ignore */
/* ds-drift-ignore spacing/off-scale */
margin: 13px;
```

```tsx
{/* ds-drift-ignore color/hardcoded-near-token */}
<span style={{ color: '#3a81f5' }} />
```

Config-level, with glob patterns and per-rule disabling:

```ts
ignore: ['**/*.stories.tsx', 'legacy/**'],
rules: { 'spacing/off-scale': false },
```

## Scoring

Each run starts at 100 and subtracts the rule's weight per finding, floored at 0. Tune the weights and the failure threshold to your team's tolerance:

```ts
failUnder: 80,
weights: { 'color/hardcoded-exact-token': 10 },
```

## Configuration

`ds-drift.config.ts` / `.js` / `.json` (or a `ds-drift` key in `package.json`), discovered with cosmiconfig. All paths are relative to the config file.

| Option | Default | Description |
| --- | --- | --- |
| `tokens` | required | Token files: `.css` / `.scss` custom props, W3C `.json` |
| `base` | `origin/main` | Base ref for `git diff -U0 <base>...HEAD` |
| `failUnder` | `80` | Exit 1 below this score |
| `colorDeltaE` | `5` | Max ΔE for `color/hardcoded-near-token` |
| `spacingTolerancePx` | `0.5` | Snap tolerance for the spacing scale |
| `weights` | see rules table | Score penalty per rule |
| `rules` | all enabled | Per-rule enable/disable |
| `ignore` | `[]` | Glob patterns to skip |
| `dsPackages` | unset (rule off) | Design system package patterns |

## Output formats

| Flag | Output |
| --- | --- |
| *(default)* | Colorized terminal report grouped by file |
| `--format json` | Stable, versioned schema (`schemaVersion: 1`): score, summary, findings with weights |
| `--format github` | GitHub Actions workflow commands, rendered as PR annotations |

Exit codes: `0` score at or above threshold, `1` below threshold, `2` error (bad config, git failure).

## Scope and limits

- Analyzes `.css`, `.scss`, `.tsx`, `.jsx`. Values built from template interpolations (`${...}`) are skipped.
- Named colors (`red`, `rebeccapurple`) are not flagged; the color rules target hex, `rgb()`, and `hsl()` notation.
- No autofix, no Tailwind class analysis, no Vue/Svelte support yet. The `Rule` and parser interfaces are designed for extension; see [CONTRIBUTING.md](./CONTRIBUTING.md).

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). Requirements: Node >= 20, pnpm, git.

## License

[MIT](./LICENSE)
