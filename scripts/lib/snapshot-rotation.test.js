// scripts/lib/snapshot-rotation.test.js
// RP-71 acceptance suite (Codex grill GRILL-010: deterministic, NO timed waits). Clocks are
// injected (nowMs literals), ordering comes from filename stamps or explicit utimesSync, and
// every fixture lives under mktemp. Runner: bun test.
const { test, expect } = require("bun:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  DEFAULT_KEEP,
  GC_SNAPSHOT_FAMILIES,
  fixedNames,
  isFamilyRotation,
  stampOf,
  familyFiles,
  familyLedger,
  planFamilyRotation,
  writeSnapshotWithRotation,
} = require("./snapshot-rotation.js");

function tmpdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "rp71-rotation-"));
}

function seed(dir, name, content = `{"seed":"${name}"}`) {
  fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, name);
  fs.writeFileSync(p, content);
  return p;
}

function names(dir) {
  return fs.readdirSync(dir).sort();
}

// Base epoch-ms used for fixture stamps (any fixed literal works; determinism is the point).
const T0 = 1780600000000;

test("write creates the fixed latest pointer plus one stamped rotation", () => {
  const dir = tmpdir();
  const res = writeSnapshotWithRotation({ dir, base: "roadmap-items", data: { items: [1] }, nowMs: T0 });
  expect(names(dir)).toEqual([`roadmap-items-${T0}.json`, "roadmap-items-latest.json"]);
  expect(res.latestPath).toBe(path.join(dir, "roadmap-items-latest.json"));
  expect(res.rotationPath).toBe(path.join(dir, `roadmap-items-${T0}.json`));
  expect(res.deleted).toEqual([]);
  expect(JSON.parse(fs.readFileSync(res.latestPath, "utf8"))).toEqual({ items: [1] });
  expect(JSON.parse(fs.readFileSync(res.rotationPath, "utf8"))).toEqual({ items: [1] });
});

// THE GRILLED ACCEPTANCE FIXTURE: latest + 5 rotations on disk; ONE write leaves exactly
// latest + 3 rotations (the new one + the 2 newest pre-existing) and deletes the 3 oldest
// in the same call.
test("latest+5 fixture: exactly latest+3 survive a single write", () => {
  const dir = tmpdir();
  seed(dir, "roadmap-items-latest.json");
  for (let i = 1; i <= 5; i += 1) seed(dir, `roadmap-items-${T0 + i}.json`);
  const nowMs = T0 + 99;
  const res = writeSnapshotWithRotation({ dir, base: "roadmap-items", data: { items: [] }, nowMs });
  expect(names(dir)).toEqual([
    `roadmap-items-${T0 + 4}.json`,
    `roadmap-items-${T0 + 5}.json`,
    `roadmap-items-${nowMs}.json`,
    "roadmap-items-latest.json",
  ]);
  expect(res.deleted.sort()).toEqual([
    path.join(dir, `roadmap-items-${T0 + 1}.json`),
    path.join(dir, `roadmap-items-${T0 + 2}.json`),
    path.join(dir, `roadmap-items-${T0 + 3}.json`),
  ]);
  // Immediate measured ledger: before = latest + 5 rotations, after = latest + 3 rotations.
  expect(res.before.files).toBe(6);
  expect(res.after.files).toBe(4);
  expect(res.after.rotations).toBe(DEFAULT_KEEP);
});

test("ledger bytes and counts match filesystem reality", () => {
  const dir = tmpdir();
  seed(dir, "roadmap-items-latest.json", "x".repeat(10));
  seed(dir, `roadmap-items-${T0 + 1}.json`, "x".repeat(20));
  seed(dir, `roadmap-items-${T0 + 2}.json`, "x".repeat(40));
  const led = familyLedger(dir, "roadmap-items");
  expect(led.files).toBe(3);
  expect(led.bytes).toBe(70);
  expect(led.rotations).toBe(2);
  const res = writeSnapshotWithRotation({ dir, base: "roadmap-items", data: { a: 1 }, nowMs: T0 + 3 });
  const measured = fs
    .readdirSync(dir)
    .reduce((sum, n) => sum + fs.statSync(path.join(dir, n)).size, 0);
  expect(res.after.bytes).toBe(measured);
  expect(res.after.files).toBe(fs.readdirSync(dir).length);
});

test("fixed names are never rotation candidates", () => {
  const dir = tmpdir();
  seed(dir, "roadmap-items.json"); // RP-38 shared TTL snapshot
  seed(dir, "roadmap-items-latest.json"); // RP-71 fixed latest pointer
  for (let i = 1; i <= 5; i += 1) seed(dir, `roadmap-items-${T0 + i}.json`);
  const plan = planFamilyRotation({ dir, base: "roadmap-items" });
  const planned = plan.files.map((f) => f.name);
  expect(planned).not.toContain("roadmap-items.json");
  expect(planned).not.toContain("roadmap-items-latest.json");
  expect(plan.remove.map((f) => f.name).sort()).toEqual([
    `roadmap-items-${T0 + 1}.json`,
    `roadmap-items-${T0 + 2}.json`,
  ]);
  expect(fixedNames("roadmap-items")).toEqual(["roadmap-items.json", "roadmap-items-latest.json"]);
});

test("legacy orphan shape <base>-<ms>-<rand>.json participates in rotation", () => {
  const dir = tmpdir();
  seed(dir, `roadmap-items-${T0 + 1}-555806a3fe513.json`);
  seed(dir, `roadmap-items-${T0 + 2}-c7bee6fdd66cc.json`);
  seed(dir, `roadmap-items-${T0 + 3}-b19e25eb3905a.json`);
  seed(dir, `roadmap-items-${T0 + 4}-3e31b25c84d99.json`);
  const plan = planFamilyRotation({ dir, base: "roadmap-items", keep: 3 });
  expect(plan.remove.map((f) => f.name)).toEqual([`roadmap-items-${T0 + 1}-555806a3fe513.json`]);
  expect(stampOf(`roadmap-items-${T0 + 1}-555806a3fe513.json`, "roadmap-items")).toBe(T0 + 1);
  expect(isFamilyRotation("roadmap-items-latest.json", "roadmap-items")).toBe(false);
  expect(isFamilyRotation("roadmap-items.json", "roadmap-items")).toBe(false);
  expect(isFamilyRotation("unrelated.json", "roadmap-items")).toBe(false);
});

test("non-stamped (date-suffixed) members order by mtime, set deterministically", () => {
  const dir = tmpdir();
  const fileAges = [
    ["project-items-post-transfer-20260609.json", 4],
    ["project-items-post-repair-20260609.json", 3],
    ["project-items-final-repair-20260609.json", 2],
    ["project-items-hierarchy-audit-20260609.json", 1],
    ["project-items-cache-current.json", 0],
  ];
  for (const [name, ageUnits] of fileAges) {
    const p = seed(dir, name);
    const t = new Date(T0 - ageUnits * 1000);
    fs.utimesSync(p, t, t); // explicit mtimes: deterministic, no waits
  }
  const plan = planFamilyRotation({ dir, base: "project-items", keep: 3 });
  expect(plan.keep.map((f) => f.name)).toEqual([
    "project-items-cache-current.json",
    "project-items-hierarchy-audit-20260609.json",
    "project-items-final-repair-20260609.json",
  ]);
  expect(plan.remove.map((f) => f.name)).toEqual([
    "project-items-post-repair-20260609.json",
    "project-items-post-transfer-20260609.json",
  ]);
});

test("plan is deterministic: same inputs, same plan", () => {
  const dir = tmpdir();
  for (let i = 1; i <= 6; i += 1) seed(dir, `roadmap-items-${T0 + i}.json`);
  const a = planFamilyRotation({ dir, base: "roadmap-items" });
  const b = planFamilyRotation({ dir, base: "roadmap-items" });
  expect(JSON.parse(JSON.stringify(a))).toEqual(JSON.parse(JSON.stringify(b)));
});

test("open-issue referenced rotation members are kept with a reason", () => {
  const dir = tmpdir();
  for (let i = 1; i <= 5; i += 1) seed(dir, `roadmap-items-${T0 + i}.json`);
  const referenced = new Set([`roadmap-items-${T0 + 1}.json`]);
  const plan = planFamilyRotation({ dir, base: "roadmap-items", referencedNames: referenced });
  const keptReasons = plan.keep.filter((f) => f.reason === "referenced-by-open-issue");
  expect(keptReasons.map((f) => f.name)).toEqual([`roadmap-items-${T0 + 1}.json`]);
  // keep = 3 newest non-referenced + 1 referenced; only the 4th-newest is removable.
  expect(plan.remove.map((f) => f.name)).toEqual([`roadmap-items-${T0 + 2}.json`]);
});

test("same-nowMs collision bumps the rotation filename instead of overwriting", () => {
  const dir = tmpdir();
  writeSnapshotWithRotation({ dir, base: "roadmap-items", data: { run: 1 }, nowMs: T0 });
  const res = writeSnapshotWithRotation({ dir, base: "roadmap-items", data: { run: 2 }, nowMs: T0 });
  expect(res.rotationPath).toBe(path.join(dir, `roadmap-items-${T0}-1.json`));
  expect(JSON.parse(fs.readFileSync(path.join(dir, `roadmap-items-${T0}.json`), "utf8"))).toEqual({ run: 1 });
  expect(JSON.parse(fs.readFileSync(res.rotationPath, "utf8"))).toEqual({ run: 2 });
});

test("keep override and writeLatest:false (RP-38 caller maintains its own fixed file)", () => {
  const dir = tmpdir();
  seed(dir, "roadmap-items.json");
  for (let i = 1; i <= 3; i += 1) seed(dir, `roadmap-items-${T0 + i}.json`);
  const res = writeSnapshotWithRotation({
    dir,
    base: "roadmap-items",
    data: { items: [] },
    nowMs: T0 + 9,
    keep: 1,
    writeLatest: false,
  });
  expect(res.latestPath).toBeNull();
  expect(names(dir)).toEqual([`roadmap-items-${T0 + 9}.json`, "roadmap-items.json"]);
  expect(res.deleted.length).toBe(3);
});

test("missing dir and invalid args fail loud or empty, never throw on reads", () => {
  const dir = path.join(tmpdir(), "does-not-exist");
  expect(familyFiles(dir, "roadmap-items")).toEqual([]);
  expect(familyLedger(dir, "roadmap-items")).toEqual({ files: 0, bytes: 0, rotations: 0 });
  expect(() => planFamilyRotation({})).toThrow(/dir and base are required/);
  expect(() => writeSnapshotWithRotation({ dir, base: "x", data: {}, nowMs: NaN })).toThrow(/nowMs/);
});

test("GC family registry names the three RP-71 stores", () => {
  expect(GC_SNAPSHOT_FAMILIES).toEqual([
    { dir: ".scratch/workflow-cache", base: "roadmap-items" },
    { dir: ".scratch/project", base: "curaos-roadmap-items" },
    { dir: ".scratch", base: "project-items" },
  ]);
});
