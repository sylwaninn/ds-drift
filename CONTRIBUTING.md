# Contributing to ds-drift

Bug reports and PRs are welcome.

## Setup

```sh
pnpm install
pnpm test        # vitest (includes an end-to-end test that builds the CLI)
pnpm lint        # eslint
pnpm typecheck   # tsc --noEmit
pnpm build       # emits dist/
```

Requirements: Node >= 20, pnpm, git (the E2E test creates throwaway git repos).

> Note: TypeScript is pinned to the 6.x line until typescript-eslint supports TS >= 7.1.

## Adding a rule

Rules are self-contained; the engine does not change when you add one:

1. Create `src/rules/<area>-<name>.ts` implementing the `Rule` interface
   (`{ id, meta, check(context) }`, defined in `src/types.ts`). Rules read
   extracted `Candidate`s (colors, lengths, imports) from the context; they
   never parse files themselves.
2. Register it in `src/rules/index.ts` and add its id to `RULE_IDS` and
   `DEFAULT_WEIGHTS` in `src/config.ts`.
3. Add fixture-based tests covering: a positive case, a negative case, an
   ignore comment, and at least one edge case.
4. Document it in the README rule list.

## Adding a parser

Parsers turn one file type into `Candidate[]` with accurate 1-based line/column
positions. Follow `src/parsers/css.ts` (PostCSS) or `src/parsers/tsx.ts`
(ts-morph), then wire the extension in `extractCandidates` in `src/engine.ts`.

## Commits and branches

- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/):
  `feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`, `ci:`, with an
  optional scope (`feat(rules): ...`). Breaking changes use `!` and a
  `BREAKING CHANGE:` footer.
- Branch names use the same types: `type/short-description`
  (`feat/tailwind-rule`, `fix/scss-nested-positions`).

## Releasing

Releases are tag-driven; git tags are the single source of truth and the npm
version always mirrors them:

1. Bump `version` in `package.json` and move the `[Unreleased]` entries under a
   new section in `CHANGELOG.md`.
2. Commit, then tag with the same version, prefixed by `v`:
   `git tag -a v0.2.0 -m "v0.2.0"`.
3. `git push && git push --tags`.

The `release.yml` workflow verifies that the tag matches `package.json`, runs
lint/typecheck/build/test, publishes to npm with provenance (requires the
`NPM_TOKEN` repo secret), and creates a GitHub release with generated notes.
A tag that does not match `package.json` fails the workflow before anything
is published.

## Guidelines

- No runtime network access and no telemetry.
- Keep dependencies minimal; justify any addition in the PR description.
- `--format json` is a public contract: bump `JSON_SCHEMA_VERSION` on breaking
  shape changes.
- Every PR must pass `pnpm lint && pnpm typecheck && pnpm test`.
