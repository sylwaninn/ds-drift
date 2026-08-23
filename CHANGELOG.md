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
