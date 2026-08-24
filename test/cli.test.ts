/**
 * CLI tests: spawn src/cli.ts as a subprocess (bun) with SESSIONS_HOME
 * pointed at a temp dir, then assert human + JSON output shapes.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CLI = join(import.meta.dir, "..", "src", "cli.ts");

process.env.SESSIONS_HOME = mkdtempSync(join(tmpdir(), "opencode-sessions-cli-boot-"));
const { append } = await import("../src/store.ts");

let home = "";
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "opencode-sessions-cli-"));
  process.env.SESSIONS_HOME = home;
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

async function runCli(args: string[]): Promise<{ out: string; err: string; code: number }> {
  const proc = Bun.spawn([process.execPath, CLI, ...args], {
    cwd: import.meta.dir,
    env: { ...process.env, SESSIONS_HOME: home },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, err] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const code = await proc.exited;
  return { out, err, code };
}

describe("add", () => {
  test("--json emits the stored entry object", async () => {
    const { out, err, code } = await runCli([
      "add",
      "demo",
      "prefers bun test runner",
      "--type",
      "preference",
      "--tag",
      "tooling",
      "--tag",
      "bun",
      "--json",
    ]);
    expect(code).toBe(0);
    expect(err).toBe("");

    const entry = JSON.parse(out);
    expect(entry.type).toBe("preference");
    expect(entry.text).toBe("prefers bun test runner");
    expect(entry.tags).toEqual(["tooling", "bun"]);
    expect(typeof entry.id).toBe("string");
    expect(Number.isNaN(Date.parse(entry.ts))).toBe(false);
  });

  test("defaults to type=fact and prints a human confirmation", async () => {
    const { out, code } = await runCli(["add", "demo", "plain note"]);
    expect(code).toBe(0);
    expect(out).toContain("added ");
    expect(out).toContain("[fact] plain note");
  });

  test("rejects missing text with exit code 1", async () => {
    const { out, err, code } = await runCli(["add", "demo", "--json"]);
    expect(code).toBe(1);
    expect(out).toBe("");
    expect(err).toContain("error:");
  });

  test("rejects invalid --type with exit code 1", async () => {
    const { err, code } = await runCli([
      "add",
      "demo",
      "some text",
      "--type",
      "rant",
    ]);
    expect(code).toBe(1);
    expect(err).toContain("--type must be one of");
  });
});

describe("search --json shape", () => {
  test("returns an array of full entry objects; honors --limit", async () => {
    for (let day = 1; day <= 3; day++) {
      await append("demo", {
        type: "learning",
        text: `lesson number ${day}`,
        tags: ["seed"],
        ts: new Date(Date.UTC(2026, 7, day)).toISOString(),
      });
    }

    const all = await runCli(["search", "demo", "lesson", "--json"]);
    expect(all.code).toBe(0);
    const results = JSON.parse(all.out) as Array<Record<string, unknown>>;
    expect(results).toHaveLength(3);

    for (const entry of results) {
      expect(typeof entry.id).toBe("string");
      expect(typeof entry.ts).toBe("string");
      expect(typeof entry.text).toBe("string");
      expect(["learning", "decision", "fact", "preference"]).toContain(entry.type);
      expect(Array.isArray(entry.tags)).toBe(true);
    }
    // newest first
    expect((results[0].text as string)).toBe("lesson number 3");

    const limited = await runCli(["search", "demo", "lesson", "--json", "--limit", "1"]);
    const limitedResults = JSON.parse(limited.out) as unknown[];
    expect(limitedResults).toHaveLength(1);
  });

  test("human output is readable and shows tags", async () => {
    await append("demo", {
      type: "decision",
      text: "keep storage local-first",
      tags: ["privacy"],
    });
    const { out, code } = await runCli(["search", "demo", "local-first"]);
    expect(code).toBe(0);
    expect(out).toContain("1 match(es)");
    expect(out).toContain("[decision]");
    expect(out).toContain("#privacy");
  });

  test("multi-word queries work without quoting inside the CLI", async () => {
    await append("demo", { type: "fact", text: "bun compile flag order matters" });
    const { out } = await runCli(["search", "demo", "compile flag"]);
    expect(out).toContain("1 match(es)");
  });

  test("zero matches is exit 0 with a friendly line", async () => {
    const { out, code } = await runCli(["search", "demo", "nothing-here"]);
    expect(code).toBe(0);
    expect(out).toContain('no matches for "nothing-here"');
  });
});

describe("list + count", () => {
  test("list --json returns every entry newest first", async () => {
    await append("demo", { type: "fact", text: "old one", ts: "2026-01-01T00:00:00.000Z" });
    await append("demo", { type: "fact", text: "new one", ts: "2026-02-01T00:00:00.000Z" });

    const { out, code } = await runCli(["list", "demo", "--json"]);
    expect(code).toBe(0);
    const entries = JSON.parse(out) as Array<{ text: string }>;
    expect(entries.map((e) => e.text)).toEqual(["new one", "old one"]);
  });

  test("count --json emits {project, count}", async () => {
    await append("demo", { type: "fact", text: "a" });
    await append("demo", { type: "fact", text: "b" });

    const { out, code } = await runCli(["count", "demo", "--json"]);
    expect(code).toBe(0);
    expect(JSON.parse(out)).toEqual({ project: "demo", count: 2 });

    const human = await runCli(["count", "demo"]);
    expect(human.out.trim()).toBe("demo: 2 entries");
  });
});

describe("help + errors", () => {
  test("--help exits 0 with usage", async () => {
    const { out, code } = await runCli(["--help"]);
    expect(code).toBe(0);
    expect(out).toContain("Usage:");
    expect(out).toContain("SESSIONS_HOME");
  });

  test("no args prints usage and exits 0", async () => {
    const { out, code } = await runCli([]);
    expect(code).toBe(0);
    expect(out).toContain("Usage:");
  });

  test("unknown command exits 1 with stderr message", async () => {
    const { out, err, code } = await runCli(["frobnicate", "x"]);
    expect(code).toBe(1);
    expect(out).toBe("");
    expect(err).toContain('unknown command "frobnicate"');
  });

  test("invalid --limit exits 1", async () => {
    const { err, code } = await runCli(["search", "demo", "q", "--limit", "0"]);
    expect(code).toBe(1);
    expect(err).toContain("--limit must be a positive integer");
  });
});
