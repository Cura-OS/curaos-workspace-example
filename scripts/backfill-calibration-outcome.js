#!/usr/bin/env node
// scripts/backfill-calibration-outcome.js
// Outcome-backfill mechanism for the wave-prioritize calibration loop (issue #208 slice).
//
// WHY: the calibration dispatch record (written by the wave-prioritize hook) captures the PREDICTED
// ranking at dispatch. The CALIBRATION needs the REALIZED outcome - how many blocked dependents each
// dispatched issue actually freed within the wave window. dep-graph-calibration.js only computes
// correlation for records that carry a backfilled `outcome` block; this script writes that block.
//
// WHEN: run at wave CLOSE (the milestone-wave close phase, or manually once a wave's PRs have merged).
// This is the documented mechanism the issue's Acceptance #2 requires: a separate small script (chosen
// over folding it into milestone-wave so it stays independently runnable + testable).
//
// WHAT IT DOES (per candidate in the target wave record):
//   freedCount = number of issues that issue `blocks` (its native blocking edges) that are now CLOSED.
//   "Freed within the wave window" = a blocked dependent whose blocker (a dispatched candidate) closed,
//   so the dependent became dispatchable. We count the closed downstream `blocking` targets at close time.
// Then it writes { outcome: { windowClosedAt, freed: [{issue, freedCount}] } } onto the matching record.
// The write updates ONLY that record's `outcome` field - every other record + field is preserved verbatim
// (this is an outcome-FILL, not a log rewrite; the append-only invariant on `records[]` is unchanged).
//
// USAGE:
//   node scripts/backfill-calibration-outcome.js --wave <waveId> [--at <iso8601>] [--log <path>] [--dry-run]
//   node scripts/backfill-calibration-outcome.js --latest   # backfill the most recent record lacking an outcome
//
// Exit 0 = backfilled (or dry-run preview). Exit 1 = no matching record / error.

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const cal = require("./lib/dep-graph-calibration.js");

// Paginated array fetch. `gh api --paginate` emits one JSON document PER PAGE (NOT a single
// concatenated array), so a bare JSON.parse() over a multi-page response only parses page 1 (or
// throws on the concatenated docs) - silently undercounting any endpoint with >1 page (e.g. an
// issue with >30 blocking dependents). `--slurp` wraps each page-array into ONE top-level array of
// arrays, which we then flatten one level into the full result set.
function ghPaginatedArray(apiPath) {
  const env = { ...process.env };
  delete env.GITHUB_TOKEN;
  const out = execFileSync("gh", ["api", "--paginate", "--slurp", apiPath], {
    encoding: "utf8",
    env,
    maxBuffer: 64 * 1024 * 1024,
  });
  const pages = JSON.parse(out);
  return Array.isArray(pages) ? pages.flat() : [];
}

function splitRef(key) {
  const m = String(key).match(/^([^/]+)\/([^#]+)#(\d+)$/);
  return m ? { owner: m[1], repo: m[2], number: Number(m[3]) } : null;
}

// freedCount for a dispatched candidate = its blocking-targets that are now CLOSED at wave close.
// Network failure on any fetch degrades that candidate to 0 (never throws - fail-soft, like the lib).
function freedCountFor(issueKey) {
  const p = splitRef(issueKey);
  if (!p) return 0;
  let rows;
  try {
    rows = ghPaginatedArray(`repos/${p.owner}/${p.repo}/issues/${p.number}/dependencies/blocking`);
  } catch {
    return 0;
  }
  if (!Array.isArray(rows)) return 0;
  let freed = 0;
  for (const r of rows) {
    if (r && (r.state === "closed" || r.state_reason === "completed")) freed++;
  }
  return freed;
}

function parseFlags(argv) {
  const f = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--latest") f.latest = true;
    else if (a === "--dry-run") f.dryRun = true;
    else if (a === "--wave") f.wave = argv[++i];
    else if (a === "--at") f.at = argv[++i];
    else if (a === "--log") f.log = argv[++i];
  }
  return f;
}

function pickRecord(log, flags) {
  const records = log.records || [];
  if (flags.wave) {
    const idx = records.findIndex((r) => r.waveId === flags.wave);
    return idx === -1 ? { idx: -1 } : { idx, rec: records[idx] };
  }
  if (flags.latest) {
    // most recent record (by dispatchedAt) that has no outcome yet
    let best = -1;
    let bestAt = "";
    records.forEach((r, i) => {
      if (cal.hasOutcome(r)) return;
      if (!bestAt || String(r.dispatchedAt) > bestAt) { bestAt = String(r.dispatchedAt); best = i; }
    });
    return best === -1 ? { idx: -1 } : { idx: best, rec: records[best] };
  }
  return { idx: -1 };
}

function main() {
  const flags = parseFlags(process.argv.slice(2));
  if (!flags.wave && !flags.latest) {
    console.error("usage: backfill-calibration-outcome.js --wave <waveId> | --latest [--at <iso8601>] [--log <path>] [--dry-run]");
    process.exit(1);
  }
  const logPath = flags.log ? path.resolve(flags.log) : cal.DEFAULT_LOG_PATH;
  const log = cal.loadLog(logPath);
  const { idx, rec } = pickRecord(log, flags);
  if (idx === -1 || !rec) {
    console.error(`backfill: no matching record (wave=${flags.wave || "(latest-without-outcome)"}) in ${logPath}`);
    process.exit(1);
  }

  const windowClosedAt = flags.at || new Date().toISOString();
  const freed = rec.candidates.map((c) => ({ issue: c.issue, freedCount: freedCountFor(c.issue) }));
  const outcome = { windowClosedAt, freed };

  if (flags.dryRun) {
    console.log(JSON.stringify({ waveId: rec.waveId, dryRun: true, outcome }, null, 2));
    process.exit(0);
  }

  // update ONLY this record's outcome; preserve every other record + field verbatim (append-only records[]).
  log.records[idx] = { ...rec, outcome };
  fs.writeFileSync(logPath, JSON.stringify(log, null, 2) + "\n");
  console.log(`backfill: wrote outcome for waveId=${rec.waveId} (${freed.length} candidates) to ${logPath}`);
  process.exit(0);
}

main();
