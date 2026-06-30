#!/usr/bin/env node
// render-issue-roadmap.js (RP-53): deterministic ISSUE-ROADMAP.md renderer.
//
// Renders ai/curaos/docs/ISSUE-ROADMAP.md from the SHARED board snapshot
// (scripts/lib/gh-project.js boardSnapshot, RP-38) instead of per-run gh
// enumeration. The snapshot is consumed READ-ONLY: this script never mutates
// the lib, never invalidates the snapshot, and in --offline mode issues ZERO
// network calls (it only parses the snapshot file). In live mode the lib's own
// TTL decides whether a refetch happens.
//
// Output contract (session-closeout step 6 + step 12 both grep for it):
//   - a line matching /^Generated at <ISO>/ stamps every render
//   - issue titles are sanitized: em/en dashes (U+2014/U+2013, escaped here
//     per the no-dash rule itself) become "-", pipes/brackets are escaped so
//     GitHub-sourced titles cannot break the table or the no-dash gate
//
// Usage:
//   render-issue-roadmap.js [--snapshot <path>] [--offline] [--refresh] [--out <path>]
//                           [--project-number <n>]
//   --snapshot <path>   snapshot file to read (default: the shared
//                       .scratch/workflow-cache/roadmap-items.json)
//   --offline           never fetch; fail closed (exit 3) when the snapshot
//                       file is missing/unparseable
//   --refresh           force a fresh Project board snapshot before rendering
//   --out <path>        output file (default: <ROOT>/ai/curaos/docs/ISSUE-ROADMAP.md)
//   --project-number n  project number for the header link when the snapshot
//                       file does not carry one
//
// Exit: 0 = rendered; 2 = usage error; 3 = snapshot unavailable/empty (fail
// closed: an empty board snapshot would blank the roadmap, the truncation
// class).
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const lib = require(path.join(__dirname, "lib", "gh-project.js"));

function usage(msg) {
  process.stderr.write(`render-issue-roadmap: ${msg}\n`);
  process.exit(2);
}

function parseCli(argv) {
  const cfg = { snapshot: lib.BOARD_SNAPSHOT, offline: false, refresh: false, out: path.join(lib.ROOT, "ai", "curaos", "docs", "ISSUE-ROADMAP.md"), projectNumber: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--offline") cfg.offline = true;
    else if (a === "--refresh") cfg.refresh = true;
    else if (a === "--snapshot") { cfg.snapshot = argv[++i]; if (!cfg.snapshot) usage("--snapshot needs a path"); }
    else if (a === "--out") { cfg.out = argv[++i]; if (!cfg.out) usage("--out needs a path"); }
    else if (a === "--project-number") { cfg.projectNumber = Number(argv[++i]); if (!Number.isFinite(cfg.projectNumber)) usage("--project-number needs a number"); }
    else usage(`unknown argument: ${a}`);
  }
  return cfg;
}

// Table-cell sanitizer: no em/en dash survives a render (escaped regex per the
// no-dash rule), pipes/brackets escaped so titles cannot break the table.
function cellText(s) {
  return String(s)
    .replace(/[\u2014\u2013]/g, "-")
    .replace(/\\/g, "\\\\")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]")
    .replace(/\|/g, "\\|")
    .replace(/\s+/g, " ")
    .trim();
}

// Same ranking contract as scripts/seed-github-roadmap.js milestoneRank, but
// fed from the Project field (fallback: [M*] title prefix), so M16/M17/v1.1
// rows render instead of vanishing (the session-28 stale-roadmap class).
function milestoneOf(item) {
  const fromField = item["curaOS Milestone"] || item.milestone;
  if (fromField) return String(fromField);
  const m = String((item.content && item.content.title) || item.title || "").match(/^\[(M[0-9.]+)\]/);
  return m ? m[1] : "";
}
function milestoneRank(name) {
  if (!name) return 999;
  const m = String(name).match(/^M([0-9]+(?:\.[0-9]+)?)$/);
  return m ? Number(m[1]) : 998;
}

function loadSnapshot(cfg) {
  if (cfg.offline) {
    let raw;
    try {
      raw = JSON.parse(fs.readFileSync(cfg.snapshot, "utf8"));
    } catch (e) {
      process.stderr.write(`render-issue-roadmap: snapshot unusable (${cfg.snapshot}): ${e.message}\n`);
      process.exit(3);
    }
    const items = Array.isArray(raw) ? raw : Array.isArray(raw.items) ? raw.items : null;
    if (!items) {
      process.stderr.write(`render-issue-roadmap: snapshot carries no items[] (${cfg.snapshot})\n`);
      process.exit(3);
    }
    let fetchedAtMs = Number(raw && raw.fetchedAtMs);
    if (!Number.isFinite(fetchedAtMs)) {
      try { fetchedAtMs = fs.statSync(cfg.snapshot).mtimeMs; } catch { fetchedAtMs = NaN; }
    }
    const projectNumber = (raw && Number.isFinite(Number(raw.projectNumber))) ? Number(raw.projectNumber) : null;
    return { items, fetchedAtMs, projectNumber, fromCache: true };
  }
  // Live mode: the lib's TTL decides whether this read costs a fetch.
  const snap = lib.boardSnapshot({ snapshotPath: cfg.snapshot, refresh: cfg.refresh });
  let projectNumber = null;
  try {
    const raw = JSON.parse(fs.readFileSync(snap.path, "utf8"));
    if (Number.isFinite(Number(raw.projectNumber))) projectNumber = Number(raw.projectNumber);
  } catch { /* projectNumber stays null; header degrades to the org projects link */ }
  return { items: snap.items, fetchedAtMs: snap.fetchedAtMs, projectNumber, fromCache: snap.fromCache };
}

function main() {
  const cfg = parseCli(process.argv.slice(2));
  const snap = loadSnapshot(cfg);
  const rows = [];
  let skipped = 0;
  for (const item of snap.items) {
    const c = item && item.content;
    if (!c || c.type !== "Issue" || !c.url || !Number.isFinite(Number(c.number))) { skipped++; continue; }
    rows.push({
      milestone: milestoneOf(item),
      repo: String(c.repository || ""),
      number: Number(c.number),
      title: cellText(c.title || ""),
      url: String(c.url),
      status: cellText(item.status || ""),
      targetVersion: cellText(item["target Version"] || ""),
      labels: Array.isArray(item.labels) ? cellText(item.labels.join(", ")) : "",
    });
  }
  if (rows.length === 0) {
    process.stderr.write("render-issue-roadmap: snapshot yields ZERO issue rows; refusing to blank the roadmap (truncation/empty-board class)\n");
    process.exit(3);
  }
  rows.sort((a, b) =>
    milestoneRank(a.milestone) - milestoneRank(b.milestone)
    || a.milestone.localeCompare(b.milestone)
    || a.repo.localeCompare(b.repo)
    || a.number - b.number);

  const generatedAt = new Date().toISOString();
  const fetchedAtIso = Number.isFinite(snap.fetchedAtMs) ? new Date(snap.fetchedAtMs).toISOString() : "unknown";
  const projectNumber = snap.projectNumber !== null ? snap.projectNumber : cfg.projectNumber;
  const projectLine = projectNumber !== null
    ? `Project: https://github.com/orgs/${lib.ORG}/projects/${projectNumber}`
    : `Project: https://github.com/orgs/${lib.ORG}/projects (CuraOS Roadmap)`;
  const lines = [
    "# CuraOS Issue Roadmap",
    "",
    "Rendered by `scripts/render-issue-roadmap.js` from the shared board snapshot",
    "(`scripts/lib/gh-project.js` boardSnapshot, RP-38/RP-53). Do not edit issue",
    "tables by hand; rerun the renderer (`scripts/session-closeout` step 12 does",
    "this every closeout, so rows trail the tracker only until the next closeout).",
    "",
    `Generated at ${generatedAt} (board snapshot fetched at ${fetchedAtIso}, ${snap.items.length} project items)`,
    "",
    projectLine,
    "",
    "## Issues",
    "",
    "| Milestone | Repo | Issue | Status | Target version | Labels |",
    "|---|---|---|---|---|---|",
  ];
  for (const r of rows) {
    lines.push(`| ${cellText(r.milestone) || "(none)"} | ${cellText(r.repo)} | [#${r.number} ${r.title}](${r.url}) | ${r.status} | ${r.targetVersion} | ${r.labels} |`);
  }
  fs.mkdirSync(path.dirname(cfg.out), { recursive: true });
  fs.writeFileSync(cfg.out, `${lines.join("\n")}\n`);
  const cacheNote = snap.fromCache ? "from snapshot file, zero network calls" : "snapshot refreshed by lib TTL";
  console.log(`render-issue-roadmap: wrote ${cfg.out} (${rows.length} issue rows, ${skipped} non-issue items skipped; snapshot fetched at ${fetchedAtIso}; ${cacheNote})`);
}

main();
