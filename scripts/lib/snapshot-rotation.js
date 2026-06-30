// scripts/lib/snapshot-rotation.js: RP-71 snapshot writer policy + rotation helpers.
//
// Policy (docs/agents/local-state-retention.md, "Snapshot writer policy (RP-71)"):
// a snapshot FAMILY under .scratch keeps fixed-name latest file(s) (`<base>.json` and/or
// `<base>-latest.json`) plus the newest KEEP (default 3) rotation copies; every write prunes
// older rotations IN THE SAME CALL via writeSnapshotWithRotation(). Unique-filename-per-pass
// writers (the `roadmap-items-<ts>-<rand>.json` 46-orphaned-snapshots class) are forbidden.
// gc-local-state.sh consumes planFamilyRotation()/familyLedger() as the backstop for families
// that accumulated rotations before this policy landed.
//
// Determinism contract (RP-71 acceptance, Codex grill GRILL-010): every entry point takes an
// injectable clock (nowMs) and orders by literal filename stamps (epoch ms) with an mtime
// fallback for date-suffixed legacy copies; same inputs always produce the same plan, so the
// suites need no timed waits.
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_KEEP = 3;

// The GC-governed snapshot families RP-71 names (dirs relative to the workspace root).
// `roadmap-items` covers the orphaned `roadmap-items-<ms>-<rand>.json` wave-pass copies in
// workflow-cache (the fixed `roadmap-items.json` is RP-38's shared TTL snapshot, protected);
// `curaos-roadmap-items` covers the dated `.scratch/project/` board copies; `project-items`
// covers the `.scratch/`-root `project-items-*-20260609.json` style copies.
const GC_SNAPSHOT_FAMILIES = [
  { dir: ".scratch/workflow-cache", base: "roadmap-items" },
  { dir: ".scratch/project", base: "curaos-roadmap-items" },
  { dir: ".scratch", base: "project-items" },
];

// Fixed (never-rotated, never-pruned) filenames of a family: the RP-38 shared TTL snapshot
// (`<base>.json`) and the RP-71 fixed latest pointer (`<base>-latest.json`).
function fixedNames(base) {
  return [`${base}.json`, `${base}-latest.json`];
}

// A rotation member is `<base>-<suffix>.json` where suffix is anything except the fixed
// `latest` marker. This intentionally matches BOTH the policy-shaped `<base>-<epochms>.json`
// rotations and the legacy orphan shapes (`<base>-<epochms>-<rand>.json`,
// `<base>-after-promotion.json`, `<base>-post-repair-20260609.json`, ...) so the GC can drain
// pre-policy accumulation with the same plan.
function isFamilyRotation(name, base) {
  if (!name.startsWith(`${base}-`) || !name.endsWith(".json")) return false;
  return !fixedNames(base).includes(name);
}

// Literal stamp parse: a leading run of >= 10 digits right after `<base>-` is an epoch-ms
// (same scale as mtimeMs, so mixed families still order coherently). Date-style suffixes
// (8-digit `20260609`) deliberately fail this and fall back to mtime.
function stampOf(name, base) {
  const rest = name.slice(base.length + 1, -".json".length);
  const m = rest.match(/^(\d{10,})/);
  return m ? Number(m[1]) : null;
}

function sortKeyOf(file) {
  return file.stamp !== null ? file.stamp : file.mtimeMs;
}

// All rotation members of a family, newest first. Ordering is (stamp|mtime) desc with a
// filename-desc tie-break so the plan is total and deterministic.
function familyFiles(dir, base) {
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out = [];
  for (const e of entries) {
    if (!e.isFile()) continue;
    if (!isFamilyRotation(e.name, base)) continue;
    const p = path.join(dir, e.name);
    let st;
    try {
      st = fs.statSync(p);
    } catch {
      continue;
    }
    out.push({ path: p, name: e.name, stamp: stampOf(e.name, base), mtimeMs: st.mtimeMs, size: st.size });
  }
  out.sort((a, b) => {
    const d = sortKeyOf(b) - sortKeyOf(a);
    if (d !== 0) return d;
    return a.name < b.name ? 1 : a.name > b.name ? -1 : 0;
  });
  return out;
}

function ledgerOf(files) {
  return { files: files.length, bytes: files.reduce((sum, f) => sum + f.size, 0) };
}

// Measured size/count ledger over the whole family (rotations + any present fixed files);
// this is the before/after evidence line RP-71's acceptance requires.
function familyLedger(dir, base) {
  const all = familyFiles(dir, base);
  for (const n of fixedNames(base)) {
    const p = path.join(dir, n);
    try {
      const st = fs.statSync(p);
      all.push({ path: p, name: n, stamp: null, mtimeMs: st.mtimeMs, size: st.size });
    } catch {
      // fixed file absent: fine, families may predate the latest pointer
    }
  }
  return { ...ledgerOf(all), rotations: all.filter((f) => isFamilyRotation(f.name, base)).length };
}

// Pure rotation plan: keep the newest `keep` rotations (plus every member named in
// `referencedNames`, the open-issue reference escape hatch), remove the rest. Fixed names are
// never candidates (familyFiles excludes them). Returns rotations-only before/after ledgers.
function planFamilyRotation({ dir, base, keep = DEFAULT_KEEP, referencedNames = null } = {}) {
  if (!dir || !base) throw new Error("planFamilyRotation: dir and base are required");
  const files = familyFiles(dir, base);
  const keepList = [];
  const removeList = [];
  let kept = 0;
  for (const f of files) {
    if (referencedNames && referencedNames.has(f.name)) {
      keepList.push({ ...f, reason: "referenced-by-open-issue" });
      continue;
    }
    if (kept < keep) {
      keepList.push(f);
      kept += 1;
    } else {
      removeList.push(f);
    }
  }
  return { files, keep: keepList, remove: removeList, before: ledgerOf(files), after: ledgerOf(keepList) };
}

// RP-71 shared writer: write the fixed latest pointer + a timestamped rotation, then delete
// rotations beyond `keep` IN THE SAME CALL. Returns the immediate measured ledger
// (before/after bytes + file counts) so callers can archive it as evidence.
// `writeLatest:false` is for callers that maintain their own fixed file (RP-38's
// boardSnapshot writes `<base>.json` itself) and only want the rotation + prune.
function writeSnapshotWithRotation({
  dir,
  base,
  data,
  keep = DEFAULT_KEEP,
  nowMs = Date.now(),
  writeLatest = true,
  serialize = (d) => JSON.stringify(d, null, 2),
} = {}) {
  if (!dir || !base) throw new Error("writeSnapshotWithRotation: dir and base are required");
  if (!Number.isFinite(nowMs)) throw new Error("writeSnapshotWithRotation: nowMs must be a finite number");
  fs.mkdirSync(dir, { recursive: true });
  const before = familyLedger(dir, base);
  const payload = serialize(data);
  const latestPath = path.join(dir, `${base}-latest.json`);
  let rotationPath = path.join(dir, `${base}-${nowMs}.json`);
  let bump = 0;
  while (fs.existsSync(rotationPath)) {
    bump += 1;
    rotationPath = path.join(dir, `${base}-${nowMs}-${bump}.json`);
  }
  if (writeLatest) fs.writeFileSync(latestPath, payload);
  fs.writeFileSync(rotationPath, payload);
  const plan = planFamilyRotation({ dir, base, keep });
  const deleted = [];
  for (const f of plan.remove) {
    fs.rmSync(f.path, { force: true });
    deleted.push(f.path);
  }
  const after = familyLedger(dir, base);
  return { latestPath: writeLatest ? latestPath : null, rotationPath, deleted, before, after };
}

module.exports = {
  DEFAULT_KEEP,
  GC_SNAPSHOT_FAMILIES,
  fixedNames,
  isFamilyRotation,
  stampOf,
  familyFiles,
  familyLedger,
  planFamilyRotation,
  writeSnapshotWithRotation,
};
