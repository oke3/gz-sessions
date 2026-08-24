# Contributing to opencode-sessions

Thanks for considering a contribution! This project is intentionally small and boring — that's a feature. Please keep PRs aligned with the constraints below so it stays that way.

## Development setup

```sh
git clone https://github.com/oke3/opencode-sessions.git
cd opencode-sessions
bun install

bun test          # unit + CLI tests (run against temp storage — never real data)
npx tsc --noEmit  # strict typecheck
bun run build     # compile dist/
```

- [Bun](https://bun.sh) ≥ 1.0 for tests/runtime dev; Node ≥ 18 is the support target.
- No linter is enforced yet — match the existing code style (ES modules, `async/await`, strict TypeScript).

## Non-negotiable constraints

1. **Zero runtime dependencies.** Node built-ins only. Dev dependencies (`typescript`, `@types/node`) are fine.
2. **Local-first.** No network calls, no telemetry, no accounts, no phoning home.
3. **Strict TypeScript must pass** and all tests must pass before any PR is merged.
4. **Append-only JSONL format.** Changes must not require existing memory files to be migrated.
5. **No secrets in test fixtures or docs.**

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/) — this keeps the changelog traceable:

```txt
feat: add date-range filter to search
fix: sanitize project names with unicode
docs: expand CLI reference examples
chore: bump typescript to 5.7
test: cover corrupt-line recovery
```

Scope prefixes used by this repo: `feat`, `fix`, `docs`, `test`, `chore`, `refactor`, `perf`.

## Pull requests

1. Open an issue first for anything that changes behavior or adds scope (see [Roadmap](./README.md#roadmap) for what's wanted).
2. Keep diffs focused — one logical change per PR.
3. Add or update tests for any behavior change.
4. Update `CHANGELOG.md` under an "Unreleased" heading when user-visible.

## Reporting bugs

Include: command run, OS, Node/Bun version, expected vs actual output, and (redacted) JSONL content if relevant.

## Feature requests

Very welcome — but check them against the project's philosophy first: local-first, zero-dep, boring tech, grep-scale data. If your idea needs a server or an index-building pipeline, it's probably a different project.
