// Copyright (c) 2026 Ground Zero LLC. All rights reserved.

/**
 * gz-sessions — JSONL-backed cross-session memory store.
 *
 * One append-only `.jsonl` file per project under the storage root
 * (env GZ_SESSIONS_HOME, default ~/.gz-sessions). Zero runtime
 * dependencies: Node built-ins only.
 */
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";

export type EntryType = "learning" | "decision" | "fact" | "preference";

export interface SessionEntry {
  id: string;
  /** ISO-8601 timestamp. */
  ts: string;
  type: EntryType;
  text: string;
  tags?: string[];
}

/** What callers pass to append(); id/ts are generated unless overridden. */
export type NewEntry = Omit<SessionEntry, "id" | "ts"> &
  Partial<Pick<SessionEntry, "id" | "ts">>;

export const ENTRY_TYPES: readonly EntryType[] = [
  "learning",
  "decision",
  "fact",
  "preference",
] as const;

export function isEntryType(value: unknown): value is EntryType {
  return (
    typeof value === "string" &&
    (ENTRY_TYPES as readonly unknown[]).includes(value)
  );
}

/**
 * Storage root. Read lazily (on every call) so tests can point
 * GZ_SESSIONS_HOME at a temp dir at any time.
 */
export function storageRoot(): string {
  const fromEnv = process.env.GZ_SESSIONS_HOME;
  if (typeof fromEnv === "string" && fromEnv.trim() !== "") {
    return resolve(fromEnv);
  }
  return join(homedir(), ".gz-sessions");
}

/** Make an arbitrary project name safe to use as a filename segment. */
export function sanitizeProject(name: string): string {
  const cleaned = name
    .trim()
    // anything outside [A-Za-z0-9._-] becomes a dash (covers / \ spaces ..)
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-.]+/, "")
    .replace(/-+$/, "");
  return cleaned === "" ? "default" : cleaned;
}

/** Absolute path of a project's JSONL file (root dir is NOT created). */
export function projectFile(project: string): string {
  return join(storageRoot(), `${sanitizeProject(project)}.jsonl`);
}

function parseLine(line: string): SessionEntry | null {
  try {
    const raw: unknown = JSON.parse(line);
    if (typeof raw !== "object" || raw === null) return null;
    const rec = raw as Record<string, unknown>;
    if (
      typeof rec.id !== "string" ||
      typeof rec.ts !== "string" ||
      typeof rec.text !== "string" ||
      !isEntryType(rec.type)
    ) {
      return null;
    }
    const entry: SessionEntry = {
      id: rec.id,
      ts: rec.ts,
      type: rec.type,
      text: rec.text,
    };
    if (Array.isArray(rec.tags)) {
      const tags = rec.tags.filter((t): t is string => typeof t === "string");
      if (tags.length > 0) entry.tags = tags;
    }
    return entry;
  } catch {
    return null; // tolerate corrupt lines instead of failing the whole file
  }
}

async function readEntries(project: string): Promise<SessionEntry[]> {
  let data: string;
  try {
    data = await readFile(projectFile(project), "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  const entries: SessionEntry[] = [];
  for (const line of data.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    const entry = parseLine(trimmed);
    if (entry !== null) entries.push(entry);
  }
  return entries;
}

/**
 * Newest-first ordering. The array is reversed before the (stable) sort so
 * entries sharing an identical ts keep insertion order inverted — i.e. the
 * most recently appended entry wins ties.
 */
function newestFirst(entries: SessionEntry[]): SessionEntry[] {
  const timeOf = (e: SessionEntry): number => {
    const t = Date.parse(e.ts);
    return Number.isNaN(t) ? Number.NEGATIVE_INFINITY : t;
  };
  return [...entries].reverse().sort((a, b) => timeOf(b) - timeOf(a));
}

/** Store one entry; returns the full stored record. Appends a single line. */
export async function append(
  project: string,
  entry: NewEntry,
): Promise<SessionEntry> {
  const text =
    typeof entry?.text === "string" ? entry.text.trim() : "";
  if (text === "") throw new Error("entry.text is required and must be non-empty");
  if (!isEntryType(entry.type)) {
    throw new Error(`entry.type must be one of: ${ENTRY_TYPES.join(", ")}`);
  }

  const stored: SessionEntry = {
    id: typeof entry.id === "string" && entry.id !== "" ? entry.id : randomUUID(),
    ts:
      typeof entry.ts === "string" && !Number.isNaN(Date.parse(entry.ts))
        ? entry.ts
        : new Date().toISOString(),
    type: entry.type,
    text,
  };

  if (Array.isArray(entry.tags)) {
    const tags = [
      ...new Set(entry.tags.map((t) => String(t).trim()).filter((t) => t !== "")),
    ];
    if (tags.length > 0) stored.tags = tags;
  }

  const file = projectFile(project);
  await mkdir(dirname(file), { recursive: true });
  await appendFile(file, `${JSON.stringify(stored)}\n`, "utf8");
  return stored;
}

/**
 * Case-insensitive substring match on text + tags, newest first.
 * `limit` (when provided) caps the number of returned entries.
 */
export async function search(
  project: string,
  query: string,
  limit?: number,
): Promise<SessionEntry[]> {
  const needle = query.trim().toLowerCase();
  if (needle === "") return [];
  const hits = (await readEntries(project)).filter((entry) => {
    if (entry.text.toLowerCase().includes(needle)) return true;
    return (entry.tags ?? []).some((t) => t.toLowerCase().includes(needle));
  });
  const ordered = newestFirst(hits);
  if (typeof limit === "number" && Number.isFinite(limit) && limit >= 0) {
    return ordered.slice(0, Math.floor(limit));
  }
  return ordered;
}

/** All entries for a project, newest first. */
export async function list(project: string): Promise<SessionEntry[]> {
  return newestFirst(await readEntries(project));
}

/** Number of stored entries for a project (0 when it doesn't exist yet). */
export async function count(project: string): Promise<number> {
  return (await readEntries(project)).length;
}
