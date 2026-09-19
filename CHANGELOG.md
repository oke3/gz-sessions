# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned

- `forget` / entry deletion by id
- Date-range and tag-only filters
- Cross-project search
- Near-duplicate detection on `add`
- `stats` command

## [0.1.0] — 2026-08-24

Initial release.

### Added

- JSONL storage layer (`src/store.ts`): one append-only file per project under `$GZ_SESSIONS_HOME` (default `~/.gz-sessions/`).
  - `append(project, entry)` — stores an entry, returns the full record (generated UUIDv4 `id` + ISO-8601 `ts` when omitted).
  - `search(project, query, limit?)` — case-insensitive substring match on text + tags, newest first.
  - `list(project)` / `count(project)`.
  - Corrupt lines are skipped on read; tags are trimmed and deduplicated.
- Zero-dependency CLI (`sessions`, `src/cli.ts`):
  - `add <project> <text> [--type t] [--tag t]...`
  - `search <project> <query> [--limit n]`
  - `list <project>` / `count <project>`
  - Global `--json` output; `-h/--help`.
- Entry types: `learning` | `decision` | `fact` | `preference`.
- `GZ_SESSIONS_HOME` environment override for storage root.
- Test suite: 33 tests across store and CLI round-trips (temp-dir isolated).
- Strict TypeScript build with `noEmitOnError`; CI (typecheck + tests on Node 20/22).

[Unreleased]: https://github.com/oke3/gz-sessions/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/oke3/gz-sessions/releases/tag/v0.1.0
