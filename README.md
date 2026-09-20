# gz-sessions

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Ground Zero LLC](https://img.shields.io/badge/Built%20by-Ground%20Zero%20LLC-purple)](https://github.com/oke3)
[![npm](https://img.shields.io/npm/v/@ground-zero-llc/gz-sessions)](https://www.npmjs.com/package/@ground-zero-llc/gz-sessions)
[![CI](https://github.com/oke3/gz-sessions/actions/workflows/ci.yml/badge.svg)](https://github.com/oke3/gz-sessions/actions)

> Persistent, searchable cross-session memory for AI coding agents.

Your agent learned something painful at 2 AM. Today it walks into the same wall. `gz-sessions` fixes that — with a JSONL file and zero ceremony.

> **Local-first:** plain JSONL files on your machine. No server, no database, no account, no telemetry, **zero runtime dependencies**.

---

## Table of contents

- [Why](#why)
- [Quick Start](#quick-start)
- [Install](#install)
- [How Memory Works](#how-memory-works)
- [Architecture](#architecture)
- [CLI Reference](#cli-reference)
- [JSONL Schema](#jsonl-schema)
- [Storage Format](#storage-format)
- [Storage Location](#storage-location)
- [Wiring into OpenCode](#wiring-into-opencode)
- [Programmatic API](#programmatic-api)
- [Why Not a Database?](#why-not-a-database)
- [Comparison](#comparison)
- [Feature Highlights](#feature-highlights)
- [Development](#development)
- [Related Projects](#related-projects)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License](#license)

## Why

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

## Quick Start

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

## How Memory Works

The memory loop is intentionally simple:

1. **Write** — After a non-obvious discovery, persist it:
   ```sh
   sessions add my-app "vitest needs --pool=forks here or workers hang" \
       --type learning --tag vitest --tag ci
   ```

2. **Recall** — At the start of the next session, search for relevant context:
   ```sh
   sessions search my-app "vitest hang"
   ```

3. **List** — Browse everything for a project:
   ```sh
   sessions list my-app
   ```

**Suggested rhythm:** read at session start, write at session end — plus immediately after any non-obvious discovery. The CLI is fast enough (~ms) to call mid-session without friction.

Entries are typed (`learning`, `decision`, `fact`, `preference`) and tagged for organization. Types are cheap now and gold later — they let you filter by "what did I learn" vs "what did I decide."

## Architecture

```
┌─────────────────────────────────────────────────┐
│                  Agent Session                  │
│                                                 │
│  ┌───────────┐    ┌───────────┐    ┌─────────┐ │
│  │  recall   │    │  capture  │    │ browse  │ │
│  │  search   │    │  add      │    │  list   │ │
│  └─────┬─────┘    └─────┬─────┘    └────┬────┘ │
│        │                │               │       │
│        └────────┬───────┴───────┬───────┘       │
│                 │               │               │
└─────────────────┼───────────────┼───────────────┘
                  │               │
           ┌──────▼───────────────▼──────┐
           │       gz-sessions CLI       │
           │  (zero-dep arg parsing)     │
           └──────────────┬──────────────┘
                          │
                 ┌────────▼────────┐
                 │   store.ts      │
                 │  append/search  │
                 │  list/count     │
                 │  sanitize       │
                 └────────┬────────┘
                          │
           ┌──────────────▼──────────────┐
           │   ~/.gz-sessions/           │
           │   ├── my-app.jsonl          │
           │   ├── another-project.jsonl │
           │   └── ...                   │
           └─────────────────────────────┘
```

**Storage layer** (`store.ts`): append-only JSONL I/O, UUIDv4 generation, case-insensitive substring search, newest-first ordering. All functions are async and resolve `GZ_SESSIONS_HOME` at call time.

**CLI layer** (`cli.ts`): zero-dependency argument parsing, human-readable output by default, `--json` for machine-readable output. No third-party arg parser — just a hand-rolled loop.

## CLI Reference

```txt
sessions add <project> <text> [--type <t>] [--tag <t>]...
sessions search <project> <query> [--limit <n>]
sessions list <project>
sessions count <project>
```

| Command | Arguments | Flags | Behavior |
|---------|-----------|-------|----------|
| `add` | `<project> <text>` | `--type`, `--tag` (repeatable), `--json` | Stores one entry; prints the stored record |
| `search` | `<project> <query>` | `--limit n` (default 20), `--json` | Case-insensitive substring match on text + tags; newest first |
| `list` | `<project>` | `--json` | All entries, newest first |
| `count` | `<project>` | `--json` | Entry count (`0` if project unknown) |

Global flags: `--json` (machine-readable output on any command), `-h` / `--help`.

### Entry types

Use them consistently — they're cheap now and gold later:

| Type | Use for |
|------|---------|
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

## JSONL Schema

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
|-------|------|-------|
| `id` | `string` | UUIDv4 |
| `ts` | `string` | ISO-8601 timestamp; ordering key (newest first) |
| `type` | enum | `learning` \| `decision` \| `fact` \| `preference` |
| `text` | `string` | The memory itself (trimmed, non-empty) |
| `tags?` | `string[]` | Optional, deduplicated |

## Storage Format

Each project gets its own append-only JSONL file. This design choice is deliberate:

**Why JSONL (not SQLite, not a single JSON blob)?**

| Concern | JSONL | SQLite | Single JSON |
|---------|-------|--------|-------------|
| Append without locking | Yes | Yes (needs WAL) | Must rewrite whole file |
| Human readable | `cat` or `grep` | Needs `.sqlite3` CLI | `jq` or `python` |
| Git-friendly diffs | Line-level | Binary blob | Whole-file diff |
| Corrupt line recovery | Skip bad line, rest intact | Needs `PRAGMA integrity_check` | Entire file broken |
| Zero dependencies | Node `fs` built-ins | `better-sqlite3` or WASM | Node `fs` built-ins |

The files are safe to `cat`, `grep`, `diff`, back up, version, and sync. Future features (edit/delete, date filters) won't require a migration.

## Storage Location

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
  type SessionEntry,
  type EntryType,
  type NewEntry,
} from "@ground-zero-llc/gz-sessions";

// Store a memory
const entry = await append("my-app", {
  type: "decision",
  text: "Use JSONL over SQLite",
  tags: ["storage"],
});
// => SessionEntry (with generated id + ts)

// Search (case-insensitive substring on text + tags)
const hits = await search("my-app", "sqlite", 10); // limit optional

// List all entries (newest first)
const all = await list("my-app");

// Count entries (0 when project unknown)
const n = await count("my-app");

// Utilities
ENTRY_TYPES;          // ["learning","decision","fact","preference"]
isEntryType("fact");  // true — type guard
sanitizeProject("My App!"); // "My-App"
storageRoot();        // current GZ_SESSIONS_HOME (resolved)
```

All functions are `async` and resolve against `GZ_SESSIONS_HOME` at call time, so tests can redirect storage freely.

### Types

```ts
type EntryType = "learning" | "decision" | "fact" | "preference";

interface SessionEntry {
  id: string;       // UUIDv4
  ts: string;       // ISO-8601
  type: EntryType;
  text: string;
  tags?: string[];
}

type NewEntry = Omit<SessionEntry, "id" | "ts"> &
  Partial<Pick<SessionEntry, "id" | "ts">>;
```

## Why Not a Database?

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

## Feature Highlights

- **Zero runtime dependencies** — Node built-ins only. `fs/promises`, `os`, `path`, `crypto`. Nothing else.
- **Append-only storage** — No locking, no migrations, no corruption risk from partial writes.
- **Corrupt-line tolerant** — Bad JSONL lines are silently skipped on read. One stray line never takes down the file.
- **Type-safe TypeScript** — Strict `tsconfig`, full type exports, CI-enforced typecheck.
- **Cross-platform** — Works on Linux, macOS, and Windows (Node or Bun).
- **Any agent harness** — OpenCode, Claude Code, Aider, custom scripts — if it has a shell, it has memory.

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

## Related Projects

| Project | What It Does |
|---------|-------------|
| [gz-sessions](https://github.com/oke3/gz-sessions) | Persistent cross-session memory for AI agents |
| [gz-sessionrecall](https://github.com/oke3/gz-sessionrecall) | AI code archaeology — search your session history |
| [gz-codemap](https://github.com/oke3/gz-codemap) | Scan codebases → auto-generate project config |
| [gz-modelrouter](https://github.com/oke3/gz-modelrouter) | Intelligent LLM cost router — save 40-70% on bills |
| [gz-gateway](https://github.com/oke3/gz-gateway) | OpenAI-compatible AI gateway — rate limiting, caching, failover, cost tracking |
| [gz-bench](https://github.com/oke3/gz-bench) | Standardized benchmark harness for AI coding agents |
| [gz-authmesh](https://github.com/oke3/gz-authmesh) | Unified credential mesh for AI providers |
| [gz-remote](https://github.com/oke3/gz-remote) | Drive AI coding agents on remote machines over SSH |
| [gz-context-engine](https://github.com/oke3/gz-context-engine) | Production-grade RAG context engine |

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

---

## Enterprise Support

Need this customized for your infrastructure? We offer:

- **Integration consulting** — Wire gz-sessions into your agent runtime
- **Custom configuration** — Task-specific rules, models, and workflows for your team
- **Managed deployment** — We host and maintain your instance
- **Training workshops** — Hands-on sessions for your engineering team

[Book a 30-min call](https://www.grndxero.com/brief) · [See pricing](https://www.grndxero.com/pricing)

---

## License

MIT — Ground Zero LLC

---

Built by [Ground Zero LLC](https://github.com/oke3) — AI infrastructure for the agentic age.
