// scripts/lib/roadmap-journal.test.js
// RP-57 acceptance: a field mutation appends one ndjson line {item, field, old, new, actor, ts};
// the journal is greppable for a known mutation (proven with REAL grep). Runner: bun test.
const { test, expect, beforeEach, afterEach } = require("bun:test");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const journal = require("./roadmap-journal.js");

let tmpDir;
let journalPath;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "curaos-journal-"));
  journalPath = path.join(tmpDir, "roadmap-changes.ndjson");
});
afterEach(() => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {}
});

test("appendJournal writes one ndjson line per entry with the exact {item, field, old, new, actor, ts} tuple", () => {
  const written = journal.appendJournal(
    [
      { item: "PVTI_item1", field: "Status", old: "Ready", new: "Done" },
      { item: "PVTI_item1", field: "Priority", old: null, new: "High" },
    ],
    { journalPath, nowMs: Date.UTC(2026, 5, 10, 12, 0, 0), actor: "test-actor" },
  );
  expect(written.length).toBe(2);
  const lines = fs.readFileSync(journalPath, "utf8").trim().split("\n");
  expect(lines.length).toBe(2);
  const first = JSON.parse(lines[0]);
  expect(first).toEqual({ item: "PVTI_item1", field: "Status", old: "Ready", new: "Done", actor: "test-actor", ts: "2026-06-10T12:00:00.000Z" });
  expect(Object.keys(first)).toEqual(["item", "field", "old", "new", "actor", "ts"]);
});

test("appends ACCUMULATE (append-only audit trail) and clears journal as cleared->null", () => {
  journal.appendJournal({ item: "A", field: "Status", old: "Ready", new: "Done" }, { journalPath, nowMs: 1, actor: "x" });
  journal.appendJournal({ item: "B", field: "Notes", old: "stale", new: null }, { journalPath, nowMs: 2, actor: "x" });
  const all = journal.readJournal({ journalPath });
  expect(all.length).toBe(2);
  expect(all[1].new).toBe(null);
});

test("entries missing item/field are rejected loudly (audit lines must be attributable)", () => {
  expect(() => journal.appendJournal({ field: "Status", new: "Done" }, { journalPath })).toThrow(/needs \{item, field\}/);
  expect(() => journal.appendJournal({ item: "A", new: "Done" }, { journalPath })).toThrow(/needs \{item, field\}/);
  expect(fs.existsSync(journalPath)).toBe(false); // nothing written on a rejected batch
});

// RP-57 acceptance: journal greppable for a known mutation. Real grep, not just the JS filter.
test("journal is greppable (real grep) for a known mutation; grepJournal mirrors it", () => {
  journal.appendJournal(
    [
      { item: "PVTI_known42", field: "Status", old: "In Progress", new: "Done" },
      { item: "PVTI_other", field: "Status", old: "Backlog", new: "Ready" },
    ],
    { journalPath, nowMs: 5, actor: "wave" },
  );
  const grepOut = execFileSync("grep", ["PVTI_known42", journalPath], { encoding: "utf8" }).trim().split("\n");
  expect(grepOut.length).toBe(1);
  expect(JSON.parse(grepOut[0]).new).toBe("Done");
  const viaHelper = journal.grepJournal(/PVTI_known42/, { journalPath });
  expect(viaHelper.length).toBe(1);
  expect(viaHelper[0].field).toBe("Status");
});

test("readJournal surfaces corrupt lines loudly instead of dropping them; missing journal reads empty", () => {
  expect(journal.readJournal({ journalPath })).toEqual([]);
  journal.appendJournal({ item: "A", field: "Status", new: "Done" }, { journalPath, nowMs: 1, actor: "x" });
  fs.appendFileSync(journalPath, "{not json\n");
  const all = journal.readJournal({ journalPath });
  expect(all.length).toBe(2);
  expect(all[1].parseError).toBe(true);
  expect(all[1].raw).toBe("{not json");
});
