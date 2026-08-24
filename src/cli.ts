#!/usr/bin/env node
/**
 * sessions — CLI for opencode-sessions.
 *
 * Zero-dependency argument parsing; human-readable output by default,
 * JSON with --json. Run directly (bin) or import { main } programmatically.
 */
import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import {
  append,
  count,
  ENTRY_TYPES,
  list,
  sanitizeProject,
  search,
  type EntryType,
  type SessionEntry,
} from "./store.js";

const DEFAULT_SEARCH_LIMIT = 20;

const USAGE = `sessions — persistent, searchable cross-session memory for OpenCode agents

Usage:
  sessions add <project> <text> [--type <t>] [--tag <t>]...
  sessions search <project> <query> [--limit <n>]
  sessions list <project>
  sessions count <project>

Commands:
  add      Store one memory for a project. Repeat --tag for multiple tags.
           --type defaults to "fact" (learning | decision | fact | preference).
  search   Case-insensitive substring match on text + tags, newest first.
           --limit caps results (default ${DEFAULT_SEARCH_LIMIT}).
  list     All entries for a project, newest first.
  count    Number of stored entries.

Options:
  --json        Machine-readable JSON output
  -h, --help    Show this help

Environment:
  SESSIONS_HOME    Storage root (default ~/.opencode-sessions)

Examples:
  sessions add my-app "Bun needs --compile before --outfile" --type learning --tag bun
  sessions search my-app "compile" --limit 5
  sessions list my-app --json
  sessions count my-app
`;

class UsageError extends Error {}

interface ParsedArgs {
  command: string;
  positionals: string[];
  type?: string;
  tags: string[];
  limit?: number;
  json: boolean;
}

function parseArgv(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    command: "",
    positionals: [],
    tags: [],
    json: false,
  };
  const eqValue = (arg: string): string => arg.slice(arg.indexOf("=") + 1);

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === undefined) continue;
    const valueOf = (): string => {
      const v = argv[i + 1];
      if (v === undefined) throw new UsageError(`option ${arg} requires a value`);
      i++;
      return v;
    };

    if (arg === "--json") {
      parsed.json = true;
    } else if (arg === "--type") {
      parsed.type = valueOf();
    } else if (arg.startsWith("--type=")) {
      parsed.type = eqValue(arg);
    } else if (arg === "--tag") {
      parsed.tags.push(valueOf());
    } else if (arg.startsWith("--tag=")) {
      parsed.tags.push(eqValue(arg));
    } else if (arg === "--limit" || arg.startsWith("--limit=")) {
      const raw = arg === "--limit" ? valueOf() : eqValue(arg);
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 1) {
        throw new UsageError(`--limit must be a positive integer, got "${raw}"`);
      }
      parsed.limit = n;
    } else if (arg === "-h" || arg === "--help") {
      // handled by main() before parsing; treated as unknown here
      throw new UsageError("help flag must be the only argument");
    } else if (arg.startsWith("-") && arg !== "-") {
      throw new UsageError(`unknown option: ${arg}`);
    } else if (parsed.command === "") {
      parsed.command = arg;
    } else {
      parsed.positionals.push(arg);
    }
  }

  if (parsed.command === "") throw new UsageError("missing command");
  return parsed;
}

function formatEntry(entry: SessionEntry): string {
  const tags =
    entry.tags && entry.tags.length > 0
      ? `  ${entry.tags.map((t) => `#${t}`).join(" ")}`
      : "";
  return `${entry.ts} [${entry.type}] ${entry.text}${tags}`;
}

function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

async function cmdAdd(args: ParsedArgs): Promise<SessionEntry> {
  const [project, ...textParts] = args.positionals;
  if (project === undefined) {
    throw new UsageError(
      'usage: sessions add <project> <text> [--type t] [--tag t]...',
    );
  }
  const text = textParts.join(" ").trim();
  if (text === "") throw new UsageError("add requires non-empty text");

  const type = (args.type ?? "fact") as EntryType;
  if (!(ENTRY_TYPES as readonly string[]).includes(type)) {
    throw new UsageError(`--type must be one of: ${ENTRY_TYPES.join(", ")}`);
  }
  return append(project, { type, text, tags: args.tags });
}

async function cmdSearch(
  args: ParsedArgs,
): Promise<{ project: string; query: string; results: SessionEntry[] }> {
  const [project, ...queryParts] = args.positionals;
  if (project === undefined) {
    throw new UsageError("usage: sessions search <project> <query> [--limit n]");
  }
  const query = queryParts.join(" ").trim();
  if (query === "") throw new UsageError("search requires a query");
  const results = await search(project, query);
  return { project, query, results };
}

export async function main(argv: string[]): Promise<number> {
  if (
    argv.length === 0 ||
    argv.includes("-h") ||
    argv.includes("--help") ||
    argv.includes("help")
  ) {
    process.stdout.write(USAGE);
    return 0;
  }

  const args = parseArgv(argv);

  switch (args.command) {
    case "add": {
      const entry = await cmdAdd(args);
      if (args.json) {
        printJson(entry);
      } else {
        process.stdout.write(
          `added ${entry.id} to ${sanitizeProject(args.positionals[0] ?? "")}\n`,
        );
        process.stdout.write(`${formatEntry(entry)}\n`);
      }
      return 0;
    }

    case "search": {
      const { project, query, results } = await cmdSearch(args);
      if (results.length === 0) {
        if (args.json) printJson([]);
        else {
          process.stdout.write(`no matches for "${query}" in ${sanitizeProject(project)}\n`);
        }
        return 0;
      }
      // --limit (default ${DEFAULT_SEARCH_LIMIT}) applies to both output modes
      const shown = results.slice(0, args.limit ?? DEFAULT_SEARCH_LIMIT);
      if (args.json) {
        printJson(shown);
        return 0;
      }
      const truncated =
        shown.length < results.length
          ? ` (showing ${shown.length}, use --limit to adjust)`
          : "";
      process.stdout.write(
        `${results.length} match(es) for "${query}" in ${sanitizeProject(project)}, newest first${truncated}\n\n`,
      );
      for (const entry of shown) process.stdout.write(`${formatEntry(entry)}\n`);
      return 0;
    }

    case "list": {
      const project = args.positionals[0];
      if (project === undefined) {
        throw new UsageError("usage: sessions list <project>");
      }
      const entries = await list(project);
      if (args.json) {
        printJson(entries);
        return 0;
      }
      const name = sanitizeProject(project);
      if (entries.length === 0) {
        process.stdout.write(
          `${name}: no entries yet — add one with: sessions add <project> <text>\n`,
        );
        return 0;
      }
      process.stdout.write(`${name}: ${entries.length} entr${entries.length === 1 ? "y" : "ies"}, newest first\n\n`);
      for (const entry of entries) process.stdout.write(`${formatEntry(entry)}\n`);
      return 0;
    }

    case "count": {
      const project = args.positionals[0];
      if (project === undefined) {
        throw new UsageError("usage: sessions count <project>");
      }
      const name = sanitizeProject(project);
      const total = await count(project);
      if (args.json) {
        printJson({ project: name, count: total });
      } else {
        process.stdout.write(`${name}: ${total} entr${total === 1 ? "y" : "ies"}\n`);
      }
      return 0;
    }

    default:
      throw new UsageError(
        `unknown command "${args.command}" — run \`sessions --help\` for usage`,
      );
  }
}

function isDirectRun(): boolean {
  try {
    const entry = process.argv[1];
    if (entry === undefined || entry === "") return false;
    return import.meta.url === pathToFileURL(realpathSync(entry)).href;
  } catch {
    return false;
  }
}

if (isDirectRun()) {
  main(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`error: ${message}`);
      if (err instanceof UsageError) {
        console.error("run `sessions --help` for usage");
      }
      process.exitCode = 1;
    });
}
