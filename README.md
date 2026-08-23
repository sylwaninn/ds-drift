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
pnpm add -D ds-drift        # or: yarn add -D ds-drift / npm i -D ds-drift
pnpm ds-drift init          # interactive setup: detects your tokens, Tailwind,
                            # design system packages, and asks for the threshold
```

`init` inspects the project (token files, `@theme` blocks, `tailwindcss` and Storybook in package.json, design-system-looking dependencies, the origin default branch) and pre-fills every answer; you confirm or adjust, and it writes a commented `ds-drift.config.ts`. Use `--yes` for the non-interactive version with detected defaults, `--force` to overwrite.

The config points at your tokens, either CSS/SCSS custom properties, Sass `$variables`, or [W3C design tokens](https://tr.designtokens.org/format/) JSON:

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
pnpm ds-drift               # analyzes lines added since origin/main,
                            # including uncommitted and untracked work
pnpm ds-drift --all         # scans whole files instead of the diff
```

(`yarn ds-drift` and `npx ds-drift` work the same.)

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

1. Tokens are read from your `.css`/`.scss` custom properties, Sass `$variables`, and W3C `.json` files, then classified as `color`, `spacing`, or `other`.
2. Analysis covers the lines added since the merge-base with `base`: committed, staged, unstaged, and untracked files all count, so drift shows up while you work, not after you push. `--all` scans whole files instead. Token source files are never analyzed.
3. Parsers extract candidate values with exact positions: stylesheet declarations (PostCSS), inline `style={{ ... }}` objects and `styled`/`css`/`keyframes`/`createGlobalStyle` tagged templates (ts-morph), component imports, and (opt-in) Tailwind arbitrary values.
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

## Tailwind

Set `tailwind: true` in the config (`ds-drift init` offers it when `tailwindcss` is in your dependencies). ds-drift then scans `className`/`class` attributes (string literals and template chunks) and `@apply` directives for arbitrary values, the escape hatch that bypasses your theme:

```tsx
<div className="bg-[#3b82f6] p-[13px]" />
{/*              ✖ color rules  ✖ spacing rule                    */}
<div className="bg-primary p-4" />
{/*              ✔ theme utilities are already on your scale      */}
```

Spacing utilities (`p-`, `m-`, `gap-`, `inset-`, negatives, variants like `hover:` or `md:`) map to their CSS property before the spacing rule runs; underscores in bracket values are decoded (`bg-[rgb(59_130_246)]`); opacity modifiers are handled (`bg-[#3b82f6]/50` still duplicates the token, since `bg-primary/50` exists). Lengths on non-spacing utilities (`w-[13px]`, `text-[14px]`) are left alone.

Tailwind v4 defines the theme as CSS custom properties in an `@theme` block: list that CSS file in `tokens` and both color and spacing rules compare against your actual theme. For a flagged class, the fix is the matching theme utility (`bg-primary`) or a token-based arbitrary value (`bg-(--color-primary)`).

## Sass

`.scss` files are parsed natively (postcss-scss), both as token sources and as analyzed code. Token files can define tokens as `$variables` in addition to custom properties; `!default` flags are stripped, and computed values (`$a * 2`) classify as `other`. Disable with `sass: { variables: false }`. The indented `.sass` syntax is not supported.

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
| `tailwind` | `false` | Scan arbitrary values in class attributes and `@apply` |
| `sass` | `{ variables: true }` | Read `$variables` from token files |

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
- Class names built through `clsx`/`cva` calls are not scanned yet; only literal `className` strings and template chunks are.
- No Vue/Svelte support yet. The `Rule` and parser interfaces are designed for extension; see [CONTRIBUTING.md](./CONTRIBUTING.md).

## Roadmap

Ordered by day-to-day impact, not by novelty:

- `--fix` for exact token duplicates (a mechanical rewrite; near-token and spacing fixes need human judgment).
- An ESLint plugin exposing the same rules, so findings appear in the editor at typing time instead of at CI time.
- A baseline file (`--update-baseline`) so legacy codebases can adopt `--all` mode without a day-one score of 0.
- `clsx`/`cva` call scanning for Tailwind class names.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). Requirements: Node >= 20, pnpm, git.

## License

[MIT](./LICENSE)
