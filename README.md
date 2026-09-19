# gz-sessions

> Built by [Ground Zero LLC](https://github.com/oke3) — AI infrastructure for the agentic age.

[![CI](https://github.com/oke3/gz-sessions/actions/workflows/ci.yml/badge.svg)](https://github.com/oke3/gz-sessions/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@ground-zero-llc/gz-sessions)](https://www.npmjs.com/package/@ground-zero-llc/gz-sessions)
[![license](https://img.shields.io/npm/l/@ground-zero-llc/gz-sessions)](./LICENSE)
[![tests](https://img.shields.io/badge/tests-33%20pass-brightgreen)](./test)
[![zero deps](https://img.shields.io/badge/runtime%20deps-0-blueviolet)](#why-not-a-database)

**Persistent, searchable cross-session memory for [OpenCode](https://opencode.ai) agents.**
Your agent learned something painful at 2 AM yesterday. Today it walks straight back into the same wall. `gz-sessions` fixes that — with a JSONL file and zero ceremony.

> **Local-first:** plain JSONL files on your machine. No server, no database, no account, no telemetry, **zero runtime dependencies**.

---

## Table of contents

- [The problem it solves](#the-problem-it-solves)
- [Quickstart](#quickstart)
- [Install](#install)
- [CLI reference](#cli-reference)
- [JSONL schema](#jsonl-schema)
- [Storage location](#storage-location)
- [Wiring into OpenCode](#wiring-into-opencode)
- [Programmatic API](#programmatic-api)
- [Why not a database?](#why-not-a-database)
- [Comparison](#comparison)
- [Development](#development)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License](#license)

## The problem it solves

AI coding sessions are amnesiac. Every session:

- re-learns the same project quirks ("oh, the build needs `--compile` before `--outfile`"),
- re-litigates the same decisions ("should we use JSONL or SQLite?" — decided last week),
- re-hits the same walls (the flaky test, the proxy that eats PUT requests, the peak-hour pricing window).

Context files like `AGENTS.md` hold *static* knowledge you wrote by hand. They can't capture what the agent discovered *while working* — and that's exactly the knowledge you lose when the session dies.

`gz-sessions` gives agents a tiny, boring, durable place to write things down — and a fast way to recall them at the start of the next session.

**Before:**

```txt
Session 47: "TIL: vitest needs --pool=forks on this repo or workers hang."
Session 48: *hangs* … 20 minutes lost rediscovering why.
```

**After:**

```sh
$ sessions add my-app "vitest needs --pool=forks here or workers hang" \
    --type learning --tag vitest --tag ci
$ # next day
$ sessions search my-app "vitest hang"
2026-08-24T09:12:44.102Z [learning] vitest needs --pool=forks here or workers hang  #vitest #ci
```

## Quickstart

```sh
npx @ground-zero-llc/gz-sessions add my-app "deploy script requires NODE_ENV=production" --type fact
npx @ground-zero-llc/gz-sessions search my-app "deploy"
```

That's the whole loop. Everything else is detail.

## Install

Run directly (no install step):

```sh
npx @ground-zero-llc/gz-sessions --help
bunx @ground-zero-llc/gz-sessions --help
```

Install globally:

```sh
bun add -g @ground-zero-llc/gz-sessions   # or: npm i -g @ground-zero-llc/gz-sessions
sessions --help
```

Use as a library:

```sh
bun add @ground-zero-llc/gz-sessions      # or: npm i @ground-zero-llc/gz-sessions
```

Requires Node ≥ 18 (or Bun ≥ 1.0). No other prerequisites.

## CLI reference

```txt
sessions add <project> <text> [--type <t>] [--tag <t>]...
sessions search <project> <query> [--limit <n>]
sessions list <project>
sessions count <project>
```

| Command | Arguments | Flags | Behavior |
|---|---|---|---|
| `add` | `<project> <text>` | `--type`, `--tag` (repeatable), `--json` | Stores one entry; prints the stored record |
| `search` | `<project> <query>` | `--limit n` (default 20), `--json` | Case-insensitive substring match on text + tags; newest first |
| `list` | `<project>` | `--json` | All entries, newest first |
| `count` | `<project>` | `--json` | Entry count (`0` if project unknown) |

Global flags: `--json` (machine-readable output on any command), `-h` / `--help`.

### Entry types

Use them consistently — they're cheap now and gold later:

| Type | Use for |
|---|---|
| `learning` | Lessons, wrong turns, "never do X again" |
| `decision` | Chosen approaches **and why** |
| `fact` | Environment/project facts (ports, flags, quirks) |
| `preference` | User conventions (style, tooling, workflow) |

### Details that matter

- Project names are sanitized into safe filenames: `My Cool App!` → `My-Cool-App.jsonl`.
- Multi-word queries need no extra quoting: `sessions search my-app compile flag`.
- `add` rejects empty text; tags are trimmed and deduplicated.
- Corrupt JSONL lines are skipped on read — one bad line never takes down the file.
- Exit codes: `0` success, `1` usage/runtime error.

## JSONL schema

One JSON object per line in `$GZ_SESSIONS_HOME/<project>.jsonl`:

```json
{
  "id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  "ts": "2026-08-24T09:12:44.102Z",
  "type": "learning",
  "text": "Bun needs --compile before --outfile",
  "tags": ["bun", "build"]
}
```

| Field | Type | Notes |
|---|---|---|
| `id` | `string` | UUIDv4 |
| `ts` | `string` | ISO-8601 timestamp; ordering key (newest first) |
| `type` | enum | `learning` \| `decision` \| `fact` \| `preference` |
| `text` | `string` | The memory itself (trimmed, non-empty) |
| `tags?` | `string[]` | Optional, deduplicated |

Because it's append-only JSONL, the files are safe to `cat`, `grep`, `diff`, back up, version, and sync. Future features (edit/delete, date filters) won't require a migration.

## Storage location

```txt
$GZ_SESSIONS_HOME/<project>.jsonl        # default: ~/.gz-sessions/
```

Override the root for tests, dotfiles repos, synced folders, or per-machine setups:

```sh
GZ_SESSIONS_HOME=~/Dropbox/sessions sessions add my-app "remembered everywhere"
```

## Wiring into OpenCode

Add this block to your project's `AGENTS.md` (or your global agent rules):

```md
## Cross-session memory
You have persistent memory via the `sessions` CLI.
- At session start, recall relevant context:
  `sessions search <project> "<current task topic>" --limit 10`
  and `sessions list <project>` if the project is new to you.
- Before ending a session, persist durable knowledge:
  `sessions add <project> "<insight>" --type learning --tag <area>`
- Use types consistently: `learning` = lessons/wrong turns,
  `decision` = chosen approaches + why, `fact` = environment/project facts,
  `preference` = user conventions.
- Never store secrets, tokens, or credentials.
```

**Suggested rhythm: read at session start, write at session end** — plus immediately after any non-obvious discovery. The CLI is fast enough (~ms) to call mid-session without friction.

Works with any agent harness that can run shell commands — OpenCode, Claude Code, Aider, your own scripts. If it has a terminal, it has memory.

## Programmatic API

```ts
import {
  append,
  search,
  list,
  count,
  ENTRY_TYPES,
  isEntryType,
  storageRoot,
  sanitizeProject,
} from "@ground-zero-llc/gz-sessions";

await append("my-app", { type: "decision", text: "Use JSONL over SQLite", tags: ["storage"] });
// => SessionEntry (with generated id + ts)

const hits = await search("my-app", "sqlite", 10); // limit optional
const all  = await list("my-app");                 // newest first
const n    = await count("my-app");                // 0 when project unknown

ENTRY_TYPES;          // ["learning","decision","fact","preference"]
isEntryType("fact");  // true — type guard
sanitizeProject("My App!"); // "My-App"
storageRoot();        // current GZ_SESSIONS_HOME (resolved)
```

All functions are `async` and resolve against `GZ_SESSIONS_HOME` at call time, so tests can redirect storage freely.

## Why not a database?

Deliberate boring-tech choice:

- **Inspectable** — `cat ~/.gz-sessions/my-app.jsonl` is the whole UI.
- **Diffable & backupable** — it's just files; git/dropdir/rsync all work for free.
- **Zero supply chain** — Node built-ins only. Nothing to audit, nothing to break, installs in milliseconds.
- **Fast enough** — substring scan over thousands of short lines is sub-millisecond. If your memory outgrows grep, you have bigger problems than this tool's query planner.

Embeddings/vector DBs are the right tool for fuzzy recall over huge corpora. Agent session memory is small, high-signal, and keyword-shaped. Boring wins.

## Comparison

| | `gz-sessions` | Static context files (`AGENTS.md`) | Vector-DB memory services |
|---|---|---|---|
| Captures dynamic agent learnings | ✅ | ❌ hand-written only | ✅ |
| Local-first, no account/server | ✅ | ✅ | often ❌ |
| Zero runtime dependencies | ✅ | ✅ | ❌ |
| Human-readable storage | ✅ JSONL | ✅ Markdown | ❌ embeddings |
| Works offline | ✅ | ✅ | varies |
| Recall method | keyword substring | none (always in context) | semantic similarity |

These complement each other: static conventions in `AGENTS.md`, lived experience in `gz-sessions`.

## Development

Requires [Bun](https://bun.sh) for tests; TypeScript compiles the published CLI.

```sh
bun install
bun test          # runs test/ against temp GZ_SESSIONS_HOME dirs — never touches real data
bun run build     # tsc -> dist/
npx tsc --noEmit  # strict typecheck (also enforced by CI)
```

Project layout:

```txt
src/store.ts    # storage layer: append/search/list/count, schema, sanitization
src/cli.ts      # zero-dep arg parsing + output formatting
test/*.test.ts  # store + CLI round-trips via bun test
```

CI runs typecheck + tests on every push and PR (Node 20 + Bun).

## Roadmap

Shipped in v0.1: append/search/list/count, tags, types, JSON output, GZ_SESSIONS_HOME override.

Candidates (in rough priority order — no promises, no migrations needed thanks to append-only format):

- [ ] `forget` / entry deletion by id (tombstone or rewrite)
- [ ] Date-range and tag-only filters
- [ ] Cross-project search
- [ ] Near-duplicate detection on `add`
- [ ] `stats` command (entries per type/tag, activity over time)

Have an opinion? [Open an issue](https://github.com/oke3/gz-sessions/issues).

## Contributing

PRs welcome! Keep the constraints in mind: **zero runtime dependencies**, Node built-ins only, strict TypeScript must pass, tests must pass. See [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

[MIT](./LICENSE) © oke3
