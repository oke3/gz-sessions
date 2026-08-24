/**
 * Store tests. SESSIONS_HOME is pointed at a fresh temp dir BEFORE the
 * dynamic import (and re-pointed per test) so real data is never touched.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

process.env.SESSIONS_HOME = mkdtempSync(join(tmpdir(), "opencode-sessions-boot-"));

const { append, count, list, projectFile, sanitizeProject, search, storageRoot } =
  await import("../src/store.ts");

let home = "";
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "opencode-sessions-test-"));
  process.env.SESSIONS_HOME = home;
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

describe("append + search round-trip", () => {
  test("stores an entry and finds it by text", async () => {
    const stored = await append("alpha", {
      type: "learning",
      text: "Bun compile emits standalone binaries",
      tags: ["bun"],
    });

    expect(stored.id).toBeString();
    expect(stored.ts).toBeString();
    expect(Number.isNaN(Date.parse(stored.ts))).toBe(false);

    const hits = await search("alpha", "standalone");
    expect(hits).toHaveLength(1);
    expect(hits[0].id).toBe(stored.id);
    expect(hits[0].text).toContain("standalone");
    expect(hits[0].tags).toEqual(["bun"]);
  });

  test("match is case-insensitive in both directions", async () => {
    await append("casey", { type: "fact", text: "Payload CMS runs on Bun" });
    expect(await search("casey", "payload")).toHaveLength(1);
    expect(await search("casey", "PAYLOAD")).toHaveLength(1);
    expect(await search("casey", "pAyLoAd cMs")).toHaveLength(1);
  });

  test("misses return an empty array", async () => {
    await append("solo", { type: "fact", text: "something memorable" });
    expect(await search("solo", "no-such-thing")).toEqual([]);
  });

  test("empty query returns nothing instead of everything", async () => {
    await append("solo", { type: "fact", text: "x" });
    expect(await search("solo", "   ")).toEqual([]);
  });

  test("file lands under SESSIONS_HOME as <project>.jsonl", async () => {
    await append("diskcheck", { type: "fact", text: "hello" });
    const file = join(home, "diskcheck.jsonl");
    expect(existsSync(file)).toBe(true);
    const lines = readFileSync(file, "utf8").trim().split("\n");
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toMatchObject({ text: "hello" });
  });
});

describe("tag filtering via search", () => {
  test("matches a tag even when absent from the text", async () => {
    await append("web", {
      type: "decision",
      text: "Use payload instance for staging content",
      tags: ["cms"],
    });
    await append("web", { type: "fact", text: "Totally unrelated body copy" });

    const hits = await search("web", "CMS"); // case-insensitive tag match
    expect(hits).toHaveLength(1);
    expect(hits[0].tags).toEqual(["cms"]);
  });

  test("matches across multiple tags on one entry", async () => {
    await append("multi", {
      type: "learning",
      text: "Deploy order matters",
      tags: ["infra", "ansible"],
    });
    expect((await search("multi", "ansible"))).toHaveLength(1);
    expect((await search("multi", "infra"))).toHaveLength(1);
  });
});

describe("recency ordering", () => {
  test("list() returns newest first by ts", async () => {
    await append("ord", { type: "fact", text: "old", ts: "2026-01-01T00:00:00.000Z" });
    await append("ord", { type: "fact", text: "mid", ts: "2026-06-01T00:00:00.000Z" });
    await append("ord", { type: "fact", text: "new", ts: "2026-08-01T00:00:00.000Z" });

    expect((await list("ord")).map((e) => e.text)).toEqual(["new", "mid", "old"]);
  });

  test("search() results are newest first too", async () => {
    for (const [i, word] of ["one", "two", "three"].entries()) {
      await append("ords", {
        type: "decision",
        text: `shared ${word}`,
        ts: new Date(Date.UTC(2026, 0, 1 + i)).toISOString(),
      });
    }
    const texts = (await search("ords", "shared")).map((e) => e.text);
    expect(texts).toEqual(["shared three", "shared two", "shared one"]);
  });

  test("identical timestamps break ties by insertion order (later wins)", async () => {
    for (const word of ["first", "second", "third"]) {
      await append("tie", { type: "fact", text: word, ts: "2026-08-24T00:00:00.000Z" });
    }
    expect((await list("tie")).map((e) => e.text)).toEqual([
      "third",
      "second",
      "first",
    ]);
  });

  test("search limit caps results and keeps the newest ones", async () => {
    for (let day = 1; day <= 4; day++) {
      await append("lim", {
        type: "fact",
        text: "recurring note",
        ts: new Date(Date.UTC(2026, 7, day)).toISOString(),
      });
    }
    const hits = await search("lim", "recurring", 2);
    expect(hits).toHaveLength(2);
    expect(hits[0].ts).toBe("2026-08-04T00:00:00.000Z");
    expect(hits[1].ts).toBe("2026-08-03T00:00:00.000Z");
  });
});

describe("project isolation + sanitization", () => {
  test("entries never leak between projects", async () => {
    await append("app-one", { type: "fact", text: "secret of app one" });
    await append("app-two", { type: "fact", text: "different secret" });

    expect(await search("app-one", "different")).toEqual([]);
    expect(await count("app-one")).toBe(1);
    expect(await count("app-two")).toBe(1);
  });

  test("sanitizeProject strips path traversal and unsafe chars", () => {
    expect(sanitizeProject("../../etc/passwd")).toBe("etc-passwd");
    expect(sanitizeProject("My Cool App!")).toBe("My-Cool-App");
    expect(sanitizeProject("a/b\\c d")).toBe("a-b-c-d");
    expect(sanitizeProject("...")).toBe("default");
    expect(sanitizeProject("   ")).toBe("default");
  });

  test("sanitized projects write to sanitized files", async () => {
    await append("../weird name/", { type: "fact", text: "safe now" });
    expect(existsSync(join(home, "weird-name.jsonl"))).toBe(true);
  });
});

describe("validation + missing data", () => {
  test("rejects invalid type", async () => {
    expect(() =>
      // @ts-expect-error deliberately wrong type at runtime boundary
      append("v", { type: "rant", text: "nope" }),
    ).toThrow(/entry.type/);
  });

  test("rejects empty text", async () => {
    expect(() => append("v", { type: "fact", text: "   " })).toThrow(
      /entry\.text/,
    );
  });

  test("count/list/search on unknown project return empty results", async () => {
    expect(await count("ghost")).toBe(0);
    expect(await list("ghost")).toEqual([]);
    expect(await search("ghost", "anything")).toEqual([]);
  });
});

describe("storage root resolution", () => {
  test("storageRoot honors SESSIONS_HOME lazily", () => {
    process.env.SESSIONS_HOME = "/tmp/some-other-root";
    expect(storageRoot()).toBe("/tmp/some-other-root");
    expect(projectFile("proj")).toBe(join("/tmp/some-other-root", "proj.jsonl"));
    process.env.SESSIONS_HOME = home; // restore for afterEach cleanup
  });

  test("falls back to ~/.opencode-sessions when unset", () => {
    delete process.env.SESSIONS_HOME;
    expect(storageRoot()).toBe(join(homedir(), ".opencode-sessions"));
    process.env.SESSIONS_HOME = home;
  });
});
