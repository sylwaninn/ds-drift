# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[SemVer](https://semver.org/).

## [Unreleased]

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
