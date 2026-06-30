#!/usr/bin/env node
// sweep-resolution-map.js (RP-53): RESOLUTION-MAP milestone-trigger sweep.
//
// DEFERRED-MILESTONE rows in ai/curaos/docs/adr/RESOLUTION-MAP.md are
// deferrals with a milestone trigger ("surface at M-trigger"). Once the
// trigger milestone is in the completed set the deferral is PAST DUE: the
// deferred work must happen, or the row must be re-keyed to a future
// milestone / DEFERRED-V2 with a dated resolution-pin. Nothing fired these
// triggers (the session-36 ADR digest-row class: shipped in curaos#616 /
// curaos PR#308 yet still marked deferred), so this sweep emits the past-due
// checklist deterministically. Advisory by design: exit 0 with findings; the
// checklist is the artifact. Fails closed (exit 3) only when the map is
// missing/unreadable or rows cannot be parsed at all.
//
// Row classification:
//   - a row is an ENTRY when it is a table row whose status cell contains
//     DEFERRED-MILESTONE and the status cell is not the row's first cell
//     (excludes the category-definition table and the stats table)
//   - PAST DUE when any M<N> key in the row satisfies N <= completed-through,
//     OR the row carries no M<N> key at all (pre-prod / quarter / date keyed:
//     undated triggers need review once the working set is complete)
//   - NOT past due when every M<N> key in the row is above completed-through
//
// Usage:
//   sweep-resolution-map.js [--map <path>] [--completed-through <n>] [--out <path>]
//   --map <path>             map file (default: <ROOT>/ai/curaos/docs/adr/RESOLUTION-MAP.md)
//   --completed-through <n>  highest completed milestone number (default: 15,
//                            the v1 M1-M15 working set per the RP-53 spec)
//   --out <path>             also write the checklist to this file
//
// Exit: 0 = sweep ran (any number of findings); 2 = usage; 3 = fail closed.
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");

function usage(msg) {
  process.stderr.write(`sweep-resolution-map: ${msg}\n`);
  process.exit(2);
}

function parseCli(argv) {
  const cfg = { map: path.join(ROOT, "ai", "curaos", "docs", "adr", "RESOLUTION-MAP.md"), completedThrough: 15, out: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--map") { cfg.map = argv[++i]; if (!cfg.map) usage("--map needs a path"); }
    else if (a === "--out") { cfg.out = argv[++i]; if (!cfg.out) usage("--out needs a path"); }
    else if (a === "--completed-through") { cfg.completedThrough = Number(argv[++i]); if (!Number.isFinite(cfg.completedThrough)) usage("--completed-through needs a number"); }
    else usage(`unknown argument: ${a}`);
  }
  return cfg;
}

// Checklist text sanitizer: emitted artifact must satisfy the no-dash gate
// even when the map's own historical text carries em/en dashes (escaped
// regex per the rule itself); pipes collapse so rows stay one-line.
function clean(s) {
  return String(s).replace(/[\u2014\u2013]/g, "-").replace(/\s+/g, " ").trim();
}

function splitCells(line) {
  // "| a | b |" -> ["a", "b"]; inner pipes in map rows are rare and escaped.
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((c) => c.trim());
}

function sweep(mapText, completedThrough) {
  const lines = mapText.split("\n");
  let section = "(top)";
  const entries = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const h = line.match(/^##\s+(.+?)\s*$/);
    if (h) { section = h[1]; continue; }
    if (!/^\|/.test(line) || !line.includes("DEFERRED-MILESTONE")) continue;
    if (/^\|[\s:-]+\|/.test(line) && !/[A-Za-z]/.test(line)) continue; // separator rows
    const cells = splitCells(line);
    const statusIdx = cells.findIndex((c) => c.includes("DEFERRED-MILESTONE"));
    if (statusIdx <= 0) continue; // category-definition + stats tables: status in cell 0
    const topic = cells[statusIdx - 1] || "";
    if (!topic || /^Status$/i.test(topic)) continue; // header rows
    const detailCells = [
      ...cells.slice(statusIdx).map((c) => c.replace(/\*\*/g, "")),
    ].filter(Boolean);
    const keys = [];
    for (const m of line.matchAll(/\bM(\d+(?:\.\d+)?)\b/g)) keys.push(Number(m[1]));
    const uniqueKeys = [...new Set(keys)].sort((a, b) => a - b);
    let pastDue;
    let reason;
    if (uniqueKeys.length === 0) {
      pastDue = true;
      reason = "no explicit M-key (pre-prod/date keyed); review now that the working set is complete";
    } else if (uniqueKeys.some((k) => k <= completedThrough)) {
      pastDue = true;
      reason = `keyed ${uniqueKeys.filter((k) => k <= completedThrough).map((k) => `M${k}`).join("/")} <= completed M${completedThrough}`;
    } else {
      pastDue = false;
      reason = `keyed ${uniqueKeys.map((k) => `M${k}`).join("/")} > completed M${completedThrough}`;
    }
    entries.push({ line: i + 1, section, topic, detail: detailCells.join(" :: "), keys: uniqueKeys, pastDue, reason });
  }
  return entries;
}

function main() {
  const cfg = parseCli(process.argv.slice(2));
  let mapText;
  try {
    mapText = fs.readFileSync(cfg.map, "utf8");
  } catch (e) {
    process.stderr.write(`sweep-resolution-map: map unreadable (${cfg.map}): ${e.message}\n`);
    process.exit(3);
  }
  const entries = sweep(mapText, cfg.completedThrough);
  if (mapText.includes("DEFERRED-MILESTONE") && entries.length === 0) {
    process.stderr.write("sweep-resolution-map: map mentions DEFERRED-MILESTONE but zero entry rows parsed; refusing a silent empty sweep (parse failure class)\n");
    process.exit(3);
  }
  const pastDue = entries.filter((e) => e.pastDue);
  const generatedAt = new Date().toISOString();
  const out = [
    "# RESOLUTION-MAP past-due DEFERRED-MILESTONE checklist",
    "",
    `Generated at ${generatedAt} by \`scripts/sweep-resolution-map.js\` (completed through M${cfg.completedThrough}).`,
    `Source: ${cfg.map}`,
    "",
    "Each unchecked row is a deferral whose trigger milestone is already in the",
    "completed set (or carries no explicit milestone key and needs review).",
    "Resolve by doing the deferred work, or re-key the row to a future",
    "milestone / DEFERRED-V2 with a dated resolution-pin; never delete the row.",
    "",
  ];
  for (const e of pastDue) {
    out.push(`- [ ] ${clean(e.section)} (map line ${e.line}): ${clean(e.topic)} :: ${clean(e.detail)} [${clean(e.reason)}]`);
  }
  if (pastDue.length === 0) out.push("(no past-due DEFERRED-MILESTONE rows)");
  out.push("");
  out.push(`Total: ${pastDue.length} past due of ${entries.length} DEFERRED-MILESTONE entry rows scanned.`);
  const text = `${out.join("\n")}\n`;
  process.stdout.write(text);
  if (cfg.out) {
    fs.mkdirSync(path.dirname(cfg.out), { recursive: true });
    fs.writeFileSync(cfg.out, text);
  }
  console.log(`sweep-resolution-map: ${pastDue.length} past-due DEFERRED-MILESTONE row(s) of ${entries.length} scanned (completed through M${cfg.completedThrough})${cfg.out ? `; checklist written to ${cfg.out}` : ""}`);
}

main();
