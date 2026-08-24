# opencode-sessions

Persistent, searchable cross-session memory for [OpenCode](https://opencode.ai). Agents remember what they learned yesterday.

Local-first: everything is stored as plain JSONL files on your machine. No server, no database, no account, **zero runtime dependencies**.

## Why

AI coding sessions are amnesiac. Every session re-learns the same project quirks, re-makes the same decisions, and re-hits the same walls. `opencode-sessions` gives agents a tiny, boring, durable place to write things down — and a fast way to recall them at the start of the next session.

- **Append-only JSONL** — one file per project, trivially inspectable with `cat`/`grep`, safe to back up and diff.
- **Zero runtime dependencies** — Node built-ins only; installs in milliseconds.
- **Searchable** — case-insensitive substring match across text + tags, newest first.
- **Portable** — point `SESSIONS_HOME` anywhere (dotfiles repo, synced folder, per-machine root).

## Install

Run it directly (no install step):

```sh
npx @oke3/opencode-sessions --help
# or
bunx @oke3/opencode-sessions --help
```

Or install globally:

```sh
bun add -g @oke3/opencode-sessions   # or: npm i -g @oke3/opencode-sessions
sessions --help
```

## CLI usage

```sh
# store a memory (--type defaults to "fact"; repeat --tag as needed)
sessions add my-app "Bun needs --compile before --outfile" --type learning --tag bun --tag build

# search text + tags, case-insensitive, newest first (default limit 20)
sessions search my-app "compile"
sessions search my-app "bun" --limit 5

# list everything for a project, newest first
sessions list my-app

# how many entries
sessions count my-app

# machine-readable output for any command
sessions list my-app --json
```

### Commands & flags

| Command | Args | Notes |
|---|---|---|
| `add` | `<project> <text>` | `--type learning\|decision\|fact\|preference`, `--tag <t>` repeatable |
| `search` | `<project> <query>` | substring match on text + tags; `--limit n` |
| `list` | `<project>` | all entries, newest first |
| `count` | `<project>` | entry count |

Global flag: `--json`. Help: `-h`, `--help`.

Project names are sanitized into safe filenames (`My Cool App!` → `My-Cool-App.jsonl`). Multi-word queries work without extra quoting: `sessions search my-app compile flag`.

## JSONL schema

One JSON object per line in `$SESSIONS_HOME/<project>.jsonl`:

```json
{"id":"7c9e6679-7425-40de-944b-e07fc1f90ae7","ts":"2026-08-24T09:12:44.102Z","type":"learning","text":"Bun needs --compile before --outfile","tags":["bun","build"]}
```

| Field | Type | Notes |
|---|---|---|
| `id` | string | UUIDv4 |
| `ts` | string | ISO-8601 timestamp; ordering key (newest first) |
| `type` | enum | `learning` \| `decision` \| `fact` \| `preference` |
| `text` | string | the memory itself |
| `tags?` | string[] | optional, deduplicated |

Corrupt lines are skipped on read rather than failing the whole file.

## Storage location

```sh
$SESSIONS_HOME/<project>.jsonl     # default: ~/.opencode-sessions/
```

Override the root for tests, sync folders, or multi-machine setups:

```sh
SESSIONS_HOME=~/Dropbox/sessions sessions add my-app "remembered everywhere"
```

## How OpenCode agents should use it

Add this to your project's `AGENTS.md` (or your agent definition):

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
  `preference` = user conventions (style, tooling, workflow).
- Never store secrets, tokens, or credentials.
```

Suggested rhythm: **read at session start, write at session end** (and immediately after any non-obvious discovery).

## Development

Requires [Bun](https://bun.sh) for tests; TypeScript compiles the published CLI.

```sh
bun install
bun test        # runs test/ against temp SESSIONS_HOME dirs — never touches real data
bun run build   # tsc -> dist/cli.js (+ dist/store.js)
```

The storage layer is importable too:

```ts
import { append, search } from "@oke3/opencode-sessions";

await append("my-app", { type: "decision", text: "Use JSONL over SQLite", tags: ["storage"] });
const hits = await search("my-app", "sqlite");
```

## v0.1 scope notes

Deliberately left out (candidates for later): edit/delete of entries, full-text ranking beyond substring match, date-range filters, cross-project search, dedup detection, and any kind of sync. The format is append-only JSONL so all of these can be added without migrations.
