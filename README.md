# ds-drift

> Design system drift detector for AI-generated frontend code.

[![CI](https://img.shields.io/github/actions/workflow/status/sylwaninn/ds-drift/ci.yml?label=CI)](https://github.com/sylwaninn/ds-drift/actions)
[![npm](https://img.shields.io/npm/v/ds-drift)](https://www.npmjs.com/package/ds-drift)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)
![node >= 20](https://img.shields.io/badge/node-%E2%89%A5%2020-brightgreen)

A coding agent (or a hurried teammate) writes `color: #3b82f6` when `--color-primary` holds that exact value, `margin: 13px` when your scale says 12 or 16, or imports a dialog from a random package instead of your design system. Nothing fails, nobody notices in review, and the design system erodes one PR at a time.

`ds-drift` compares the lines a PR adds against the design tokens you already have, and turns every drift into a finding and a score:

```
src/Button.tsx
  12:21   #3b82f5 → var(--color-primary)  color/hardcoded-near-token
  14:9    13px → var(--spacing-4)         spacing/off-scale

✖ 2 finding(s) (1 color/hardcoded-near-token, 1 spacing/off-scale)
Drift score: 95/100 (threshold 80)
```

It runs offline, has no server component and no telemetry, and works in three places: your terminal, your editor (ESLint plugin), and your CI (PR annotations).

![demo](docs/demo.gif)
<!-- TODO: record demo GIF -->

## Quick start

```sh
pnpm add -D ds-drift     # or: yarn add -D ds-drift / npm i -D ds-drift
pnpm ds-drift init
```

`init` inspects the project and pre-fills every answer; you confirm or override each one. It detects:

- token files by content: CSS/SCSS custom properties, Sass `$variables`, Tailwind v4 `@theme` blocks, W3C token JSON, and JS/TS theme modules containing literal colors;
- Tailwind and Storybook in your dependencies, design-system-looking packages, and the default branch of `origin`.

It then asks for your fail threshold and writes a commented `ds-drift.config.ts`. Non-interactive version: `ds-drift init --yes` (CI, scripts); `--force` overwrites.

Run it:

```sh
pnpm ds-drift            # everything added since origin/main, uncommitted work included
pnpm ds-drift --all      # whole files instead of the diff
```

Exit codes: `0` score at or above threshold, `1` below, `2` error.

## What it checks

| Rule | Weight | Flags |
| --- | --- | --- |
| `color/hardcoded-exact-token` | 5 | A color that duplicates a token exactly |
| `color/hardcoded-near-token` | 3 | A color perceptually close to a token |
| `spacing/off-scale` | 2 | A length that misses the spacing scale |
| `component/off-ds-import` | 4 | A component imported outside the design system |

### Colors

Hex, `rgb()`, and `hsl()` literals are compared against your color tokens. An exact duplicate (alpha included, notation ignored) triggers `hardcoded-exact-token`; a color within CIEDE2000 ΔE < 5 (`colorDeltaE`), typically eyedropped from a screenshot, triggers `hardcoded-near-token` with the nearest token as the suggestion:

```css
/* tokens: --color-primary: #3B82F6 */
color: rgb(59, 130, 246);    /* ✖ exact duplicate, different notation */
color: #3a81f5;              /* ✖ ΔE 0.4 from --color-primary */
color: var(--color-primary); /* ✔ */
```

Translucent values whose alpha matches no token are left alone. Named colors (`red`) are not flagged.

### Spacing

`px`/`rem` lengths on spacing properties (`margin*`, `padding*`, `gap`, `inset*`, `top`/`right`/`bottom`/`left`) must sit on the scale derived from your spacing tokens (`spacingTolerancePx`, default 0.5). `1rem` equals `16px`; negative margins compare by magnitude; `0` always passes; React numeric styles count as px (`marginTop: 13`):

```css
/* tokens: --spacing-2: 0.5rem; --spacing-4: 1rem */
margin: 13px;   /* ✖ off scale; nearest token is --spacing-4 (16px) */
margin: 0.5rem; /* ✔ */
```

`border: 1px` is never flagged: only spacing properties are checked.

### Component imports

With `dsPackages` configured, importing a PascalCase component (named, default, or `* as` namespace) from any other package is flagged. Relative imports and `react`/`react-dom`/`next` never are. Without `dsPackages`, the rule is off.

```tsx
import { Dialog } from '@radix-ui/themes' // ✖ expected @acme/ui
import { Dialog } from '@acme/ui'         // ✔
```

## Your tokens, wherever they live

List any mix of these in `tokens`; they are classified into `color`, `spacing`, and `other`, and are never themselves analyzed for drift:

| Source | Example |
| --- | --- |
| CSS/SCSS custom properties | `--color-primary: #3B82F6;` |
| Bare channel triplets (Tailwind `rgb(var())`, shadcn/ui) | `--color-primary: 10 10 10;` or `222.2 84% 4.9%` |
| Sass variables | `$color-primary: #3B82F6;` (`!default` handled) |
| Tailwind v4 `@theme` | plain custom properties, works as is |
| W3C design tokens JSON | `$value`/`$type`, group inheritance, `{aliases}` |
| JS/TS theme modules | `export default { colors: { primary: '#3B82F6' } }` |

JS/TS modules are loaded like your config file and walked: token names are dot paths (`colors.primary`), string leaves classify like any other value, and numbers count as px under spacing-ish keys only (`spacing: { 1: 4 }` yes, `fontWeight: 700` no).

## Where it runs

### Terminal

The default mode analyzes everything added since the merge-base with `base`: committed, staged, unstaged, and untracked files. Drift shows up while you work, not after you push.

### Editor (ESLint plugin)

Same rules, same config file, surfaced at typing time:

```js
// eslint.config.js
import dsDrift from 'ds-drift/eslint'

export default [
  // ...your existing config
  dsDrift.configs.recommended,
]
```

Covers `.tsx`/`.jsx`/`.ts`/`.js` (stylesheets stay with the CLI). Exact token duplicates get an editor quick-fix. Each file resolves its nearest ds-drift config (monorepo-friendly) and the rule stays silent in projects that have none. One constraint: a `.mjs` config can't be loaded synchronously, so prefer `.ts`, `.js`, or `.json`.

### CI (GitHub Action)

Findings become PR annotations through workflow commands; nothing extra to install:

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

The job fails when the score drops below `failUnder`.

## Day-to-day

### Fix what's mechanical

```sh
pnpm ds-drift --fix
```

Rewrites every exact token duplicate to its token reference (`var(--color-primary)`, `$variable` in SCSS), then re-checks. That is the only always-safe rewrite; near-token and off-scale findings need your judgment and are never touched.

### Ignore what's intentional

On the line or the line above, optionally scoped to a rule:

```css
color: #3b82f6; /* ds-drift-ignore */
/* ds-drift-ignore spacing/off-scale */
margin: 13px;
```

```tsx
{/* ds-drift-ignore color/hardcoded-near-token */}
<span style={{ color: '#3a81f5' }} />
```

Or in the config: `ignore` globs and `rules: { 'spacing/off-scale': false }`.

### Adopt on a legacy codebase

A first `--all` run on an old codebase would score 0 and get the tool disabled within a week. Record the existing drift once; from then on only new drift counts:

```sh
pnpm ds-drift --all --update-baseline   # writes .ds-drift.baseline.json
git add .ds-drift.baseline.json
```

Baselined findings are subtracted from every run (shown as `N baselined finding(s) hidden`). Fingerprints skip line numbers, so moving code never resurfaces an accepted finding.

## Configuration

`ds-drift.config.ts` / `.js` / `.json` (or a `ds-drift` key in `package.json`), discovered with cosmiconfig. Paths are relative to the config file.

| Option | Default | Description |
| --- | --- | --- |
| `tokens` | required | Token source files (see table above) |
| `failUnder` | `80` | Exit 1 below this score |
| `base` | `origin/main` | Diff base ref |
| `tailwind` | `false` | Scan Tailwind arbitrary values |
| `dsPackages` | unset (rule off) | Design system package patterns |
| `ignore` | `[]` | Glob patterns to skip |
| `rules` | all enabled | Per-rule enable/disable |
| `weights` | 5 / 3 / 2 / 4 | Score penalty per rule |
| `colorDeltaE` | `5` | Near-token ΔE threshold |
| `spacingTolerancePx` | `0.5` | Spacing scale snap tolerance |
| `baseline` | `.ds-drift.baseline.json` | Baseline file location |
| `sass` | `{ variables: true }` | Read `$variables` from token files |

### Tailwind

With `tailwind: true`, arbitrary values (the escape hatch that bypasses your theme) are checked in `className`/`class` attributes, in builder calls (`clsx`, `classnames`, `cn`, `cx`, `cva`, `tw`, `twMerge`, `twJoin`, including clsx object keys and cva variant maps), and in `@apply` directives:

```tsx
<div className="bg-[#3b82f6] p-[13px]" />  {/* ✖ both flagged   */}
<div className="bg-primary p-4" />         {/* ✔ theme utilities */}
```

Variants (`hover:`, `md:`), negatives (`-m-[13px]`), underscores (`rgb(59_130_246)`), and opacity modifiers (`bg-[#3b82f6]/50`) are all handled. Lengths on non-spacing utilities (`w-[13px]`, `text-[14px]`) are left alone. For a flagged class, the fix is the matching theme utility (`bg-primary`) or a token-based arbitrary value (`bg-(--color-primary)`).

## Scoring

Each run starts at 100 and subtracts the rule's weight per finding, floored at 0. Below `failUnder`, the exit code is 1. The score is absolute per run: a large PR accumulates more penalty than a small one, so treat it as a budget per change, not a quality percentage.

Machine-readable outputs: `--format json` (stable schema, `schemaVersion: 1`, findings with weights) and `--format github` (workflow commands).

## How it works

1. Tokens are read from your sources and classified.
2. The diff (or `--all`) selects files and line ranges; token sources, `.d.ts` files, and `ignore` globs are excluded.
3. Parsers extract candidate values with exact positions: stylesheet declarations (PostCSS), inline `style` objects, `styled`/`css`/`keyframes`/`createGlobalStyle` templates and imports (ts-morph), Tailwind class strings.
4. Rules check the candidates; ignores and the baseline apply; the result is scored and reported.

## Limits

- Analyzed code: `.css`, `.scss`, `.tsx`, `.jsx`, `.ts`, `.js`. Values built from template interpolations (`${...}`) are skipped.
- No Vue/Svelte support yet. The `Rule` and parser interfaces are designed for extension; see [CONTRIBUTING.md](./CONTRIBUTING.md).

Roadmap, by day-to-day impact: Vue and Svelte parsers, score normalization for very large changes, a Stylelint companion for pure-CSS editor feedback.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). Node >= 20, pnpm, git.

## License

[MIT](./LICENSE)
