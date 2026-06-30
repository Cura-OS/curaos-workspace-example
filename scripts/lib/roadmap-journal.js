// scripts/lib/roadmap-journal.js
// RP-57 pilot: per-item field-change journal at `.cache/tracker/roadmap-changes.ndjson`.
// One current snapshot (RP-38 board snapshot / RP-55 tracker snapshot) + this append-only
// journal replaces keeping full board snapshots around for audit: the Jun 9 hierarchy-repair
// 7MB dead-JSON audit chain, rebuilt as a permanent, greppable tool.
//
// Line shape (exactly the RP-57 acceptance tuple, one JSON object per line):
//   {"item":"<project item/issue id>","field":"Status","old":"Ready","new":"Done","actor":"mkh","ts":"2026-06-10T..."}
//
// Writers: every mutating workflow that changes a board field appends here; the canonical
// node touchpoint is gh-project.js reconcileFields (wired in this change). The journal is an
// AUDIT TRAIL, not a gate: appends are cheap and synchronous, but a journal failure must
// never fail the mutation that already landed (callers wrap in best-effort).

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "..");
const ROADMAP_JOURNAL = path.join(ROOT, ".cache", "tracker", "roadmap-changes.ndjson");

function defaultActor() {
  return process.env.GH_JOURNAL_ACTOR || process.env.USER || process.env.USERNAME || "unknown";
}

// entries: [{item, field, old, new}] (old/new null for clears/unknown-priors). Appends one
// ndjson line per entry, stamped with actor + ISO ts. Returns the normalized lines written.
function appendJournal(entries, { journalPath = ROADMAP_JOURNAL, nowMs = Date.now(), actor = defaultActor() } = {}) {
  const list = Array.isArray(entries) ? entries : [entries];
  const ts = new Date(nowMs).toISOString();
  const lines = [];
  for (const entry of list) {
    if (!entry || !entry.item || !entry.field) {
      throw new Error("appendJournal: every entry needs {item, field}");
    }
    lines.push({
      item: String(entry.item),
      field: String(entry.field),
      old: entry.old === undefined ? null : entry.old,
      new: entry.new === undefined ? null : entry.new,
      actor,
      ts,
    });
  }
  if (!lines.length) return [];
  fs.mkdirSync(path.dirname(journalPath), { recursive: true });
  fs.appendFileSync(journalPath, lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
  return lines;
}

// Parses the journal back into objects. Corrupt lines come back loud as
// {raw, parseError: true} instead of being silently dropped (audit tool, never lossy).
function readJournal({ journalPath = ROADMAP_JOURNAL } = {}) {
  let raw;
  try {
    raw = fs.readFileSync(journalPath, "utf8");
  } catch {
    return [];
  }
  const out = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line));
    } catch {
      out.push({ raw: line, parseError: true });
    }
  }
  return out;
}

// Convenience filter mirroring `grep <pattern> roadmap-changes.ndjson`: matches the RAW line
// text so anything grep would find, this finds (and vice versa).
function grepJournal(pattern, { journalPath = ROADMAP_JOURNAL } = {}) {
  const re = pattern instanceof RegExp ? pattern : new RegExp(String(pattern));
  let raw;
  try {
    raw = fs.readFileSync(journalPath, "utf8");
  } catch {
    return [];
  }
  return raw
    .split("\n")
    .filter((line) => line.trim() && re.test(line))
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return { raw: line, parseError: true };
      }
    });
}

module.exports = {
  ROOT,
  ROADMAP_JOURNAL,
  defaultActor,
  appendJournal,
  readJournal,
  grepJournal,
};
