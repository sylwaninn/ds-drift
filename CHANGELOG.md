# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[SemVer](https://semver.org/).

## [Unreleased]

### Added

- Tailwind support (`tailwind: true`): arbitrary values (`bg-[#3b82f6]`,
  `p-[13px]`) in `className`/`class` attributes and `@apply` directives feed
  the color and spacing rules; variants, negatives, underscores, and opacity
  modifiers are handled.
- Sass variable tokens: `$name: value` declarations in `.scss` token files are
  read as tokens (`sass: { variables: false }` to disable); `!default` flags
  are stripped.
- Interactive `ds-drift init`: detects token files (including Tailwind v4
  `@theme`), Tailwind, Storybook, design-system dependencies, and the origin
  default branch, then asks for the fail threshold and writes the config.
  `--yes` accepts detected defaults; `--force` overwrites.
- ESLint plugin (`ds-drift/eslint`): the same rules and config surfaced in the
  editor at typing time, with a quick-fix for exact token duplicates.
  `dsDrift.configs.recommended` for flat configs.
- `--fix`: rewrites `color/hardcoded-exact-token` findings to the token
  reference (`var(--token)`, `$variable` in SCSS), then re-checks.
- Baseline workflow for legacy codebases: `--update-baseline` records current
  findings in `.ds-drift.baseline.json`; later runs subtract them and report
  the absorbed count.
- Tailwind class scanning now covers `clsx`/`classnames`/`cn`/`cx`/`cva`/`tw`
  calls, clsx object keys, and ternary branches in `className`.
- `component/off-ds-import` also checks PascalCase namespace imports
  (`import * as Icons from 'lucide-react'`).

### Changed

- Diff mode now analyzes the working tree from the merge-base with `base`:
  staged, unstaged, and untracked files are included, so drift is visible
  before committing (previously only `<base>...HEAD`).

## [0.1.0] - 2026-08-23

Initial release.

### Added

- Token ingestion from CSS/SCSS custom properties and W3C Design Tokens JSON
  (group `$type` inheritance, `{alias}` resolution, string or object dimensions).
- Diff-scoped analysis (`git diff -U0 <base>...HEAD`) with `--all` full-file mode.
- Rules: `color/hardcoded-exact-token`, `color/hardcoded-near-token` (CIEDE2000),
  `spacing/off-scale`, `component/off-ds-import`.
- Line-level `ds-drift-ignore` comments (optional rule id) and config-level
  ignore globs / per-rule disabling.
- Drift score 0-100 with configurable weights and failure threshold.
- Reporters: colorized terminal, versioned JSON (`schemaVersion: 1`),
  GitHub Actions annotations. CI-friendly exit codes (0 / 1 / 2).
- `ds-drift init`: generates a commented `ds-drift.config.ts`.
