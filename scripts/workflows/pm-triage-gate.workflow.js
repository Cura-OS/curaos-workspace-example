// pm-triage-gate - §3.4 Tracker-First Triage Gate as a composite: per candidate run triage + project-sync +
// subissue-wire, then refresh the roadmap mirror once. Composes the 4 PM atomics via workflow({scriptPath}).
// Contract: docs/agents/workflows/pm-triage-gate.md
//
// Dual-runtime shape (workflow-defect #508): `export const meta` MUST be the FIRST statement so Claude's
// native Workflow() tool loads it. node:child_process/fs/path are reached only inside projectItemsCache()
// (call-time, never module top level); the kit runs this file via process-bearing import() because it exports
// a default function.
export const meta = {
  name: "pm-triage-gate",
  description: "Curate candidate issues (triage + project-sync + wire) + refresh mirror before dispatch",
  phases: [
    { title: "Curate", detail: "per candidate: triage + project-sync + subissue-wire" },
    { title: "Mirror", detail: "regenerate roadmap mirror once after the sweep" },
  ],
};

const CONTRACT = {
  name: "pm-triage-gate",
  kind: "composite",
  version: "0.1.0",
  inputs: {
    candidates: { type: "string", required: true, description: "JSON array of owner/repo#N issues to run through the triage gate before dispatch" },
    dry_run: { type: "boolean", required: false, description: "report planned triage/sync/wire without mutating" },
  },
  outputs: {
    ready: { type: "array", description: "candidates that PASSED the gate (curated body + frontmatter + edges + project item + label) and may be dispatched" },
    not_ready: { type: "array", description: "candidates that failed the gate, each with the missing predicate" },
    mirror_refreshed: { type: "boolean", description: "true if the roadmap mirror was regenerated after the sweep" },
  },
  guarantees: { idempotent: true, determinism: "control-flow-only", side_effects: "github" },
  verification: "T2",
  models: { gate: "opus" },
  composes: ["gh-issue-triage", "gh-project-sync", "gh-subissue-wire", "gh-roadmap-mirror"],
};

const ROOT = ".";
const WF = "scripts/workflows";
function parseArgs(a) {
  if (a && typeof a === "object") return a;
  if (typeof a === "string" && a.trim()) { try { return JSON.parse(a); } catch { return {}; } }
  return {};
}
function errorText(error) {
  const parts = [];
  if (error && error.message) parts.push(error.message);
  if (error && error.stderr) parts.push(String(error.stderr));
  if (error && Array.isArray(error.output)) parts.push(error.output.filter(Boolean).join("\n"));
  return parts.join("\n").trim() || String(error);
}
function externalFailureKind(message) {
  if (/unknown owner type/i.test(message)) return "github-graphql-quota";
  if (/(?:graphql|api).*(?:rate limit|quota)|(?:rate limit|quota).*(?:graphql|api)/i.test(message)) return "github-graphql-quota";
  if (/github-project-api-transient|\bhttp\s*5\d\d\b|\bstatus\s*5\d\d\b|\bnon-200\s+status\s+5\d\d\b|gateway timeout|bad gateway|service unavailable|github\s+service|github.*unicorn|unicorn.*github/i.test(message)) return "github-project-api-transient";
  return "";
}
function isTerminalTriageExternal(kind) {
  return /github-graphql-quota|agent-runtime-quota/i.test(String(kind || ""));
}
function projectItemsCache() {
  const { execFileSync } = process.getBuiltinModule("node:child_process");
  const { mkdirSync, writeFileSync } = process.getBuiltinModule("node:fs");
  const { join } = process.getBuiltinModule("node:path");
  const env = { ...process.env };
  delete env.GITHUB_TOKEN;
  const out = execFileSync("gh", ["project", "item-list", "2", "--owner", "your-org", "--format", "json", "--limit", "1000"], {
    encoding: "utf8",
    env,
    maxBuffer: 64 * 1024 * 1024,
  });
  const parsed = JSON.parse(out);
  const items = Array.isArray(parsed.items) ? parsed.items : [];
  if (items.length >= 1000) throw new Error("pm-triage-gate: project item-list reached limit 1000; refusing truncated sync");
  const dir = ".scratch/workflow-cache";
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `roadmap-items-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
  writeFileSync(path, JSON.stringify({ items }, null, 2));
  return path;
}

// RP-20: canonical copies live in scripts/lib/triage-status.js (milestone-wave imports them
// directly). This Claude-style body cannot require() (new Function harness, no import.meta), so the
// inline copies stay and MUST remain byte-identical to the lib - pinned by
// scripts/workflow-truth-contract.test.js ("triage gates thread Project Status ...").
function statusFromTriage(triage) {
  if (!triage) return "";
  if (triage.has_blocked_marker === true || triage.blocker_kind === "real") return "Blocked";
  if (triage.state_label === "ready-for-agent" || triage.state_label === "ready-for-human") return "Ready";
  if (triage.has_foresight_marker === true) return "Backlog";
  if (triage.state_label === "needs-triage" || triage.state_label === "needs-info" || triage.state_label === "wontfix") return "Backlog";
  return "";
}

function projectFieldsForSync(triage) {
  const fields = { ...((triage && triage.project_fields) || {}) };
  const status = statusFromTriage(triage);
  if (status) fields.Status = status;
  return fields;
}

export default async function runPmTriageGate({ args, workflow, pipeline, phase, log }) {
phase("Curate");
const cfg = parseArgs(typeof args !== "undefined" ? args : undefined);
let candidates;
try { candidates = JSON.parse(cfg.candidates || "[]"); } catch { candidates = []; }
if (!Array.isArray(candidates) || !candidates.length) {
  throw new Error("pm-triage-gate: args.candidates (JSON array of owner/repo#N) is required + non-empty");
}
const dryRun = !!cfg.dry_run;
let projectCachePath = "";
try {
  projectCachePath = projectItemsCache();
} catch (error) {
  const message = errorText(error);
  const kind = externalFailureKind(message);
  if (kind) {
    return {
      ready: [],
      not_ready: candidates.map((issue) => ({ issue, missing: kind })),
      mirror_refreshed: false,
      blocked_by_external: true,
      error_kind: kind,
      error: message,
    };
  }
  throw error;
}

// Per candidate: triage -> project-sync (with triage-derived fields) -> subissue-wire (under triage-derived parent).
const curated = await pipeline(
  candidates,
  (issue) => workflow({ scriptPath: `${WF}/gh-issue-triage.workflow.js` }, { issue, dry_run: dryRun })
    .then((t) => ({ issue, triage: t }))
    .catch((error) => {
      const message = errorText(error);
      const kind = externalFailureKind(message) || "triage-workflow-failed";
      return {
        issue,
        triage: {
          state_label: "needs-triage",
          blocker_kind: "real",
          label_changes: [],
          rationale: `gh-issue-triage child failed: ${message}`,
          project_fields: {},
          parent_ref: "",
          is_root: false,
          blocked_by_external: true,
          error_kind: kind,
          error: message,
        },
      };
    }),
  (prev) => {
    if (prev.triage && prev.triage.blocked_by_external) {
      return { ...prev, sync: { item_id: "", skipped: "triage-blocked", milestone: "NONE" } };
    }
    return workflow({ scriptPath: `${WF}/gh-project-sync.workflow.js` }, {
      issue: prev.issue,
      fields: JSON.stringify(projectFieldsForSync(prev.triage)),
      project_items_cache: projectCachePath,
      dry_run: dryRun,
    })
      .then((s) => ({ ...prev, sync: s }))
      .catch((error) => {
        const message = errorText(error);
        const kind = externalFailureKind(message) || "workflow-defect";
        return { ...prev, sync: { item_id: "", blocked_by_external: !!externalFailureKind(message), error_kind: kind, error: message } };
      });
  },
  (prev) => {
    const parentRef = prev.triage && prev.triage.parent_ref ? String(prev.triage.parent_ref).trim() : "";
    if (!parentRef) return { ...prev, wire: { skipped: "no parent_ref to wire under" } };
    // Candidate is the CHILD; its triage-derived parent_ref is the PARENT.
    return workflow({ scriptPath: `${WF}/gh-subissue-wire.workflow.js` }, { parent: parentRef, children: JSON.stringify([prev.issue]), dry_run: dryRun })
      .then((w) => ({ ...prev, wire: w }))
      .catch((e) => ({ ...prev, wire: { skipped: `wire failed: ${e && e.message ? e.message : e}` } }));
  },
);

const done = curated.filter(Boolean);
const triageExternal = done
  .filter((c) => c.triage && c.triage.blocked_by_external)
  .map((c) => ({ issue: c.issue, missing: c.triage.error_kind || "triage-blocked" }));
if (triageExternal.length) {
  const terminalTriageExternal = triageExternal.filter((row) => isTerminalTriageExternal(row.missing));
  if (terminalTriageExternal.length) {
    const externalKinds = [...new Set(terminalTriageExternal.map((row) => row.missing).filter(Boolean))];
    const externalKind = externalKinds.length === 1 ? externalKinds[0] : "github-issue-triage-external";
    return {
      ready: [],
      not_ready: terminalTriageExternal,
      mirror_refreshed: false,
      blocked_by_external: true,
      error_kind: externalKind,
    };
  }
}
// RP-12 SYNC-DEGRADATION SECTION (KEEP IN SYNC with milestone-wave.workflow.js):
// - `github-graphql-quota` = genuine quota exhaustion; it will hit every remaining Project mutation,
//   so the gate stays FAIL-CLOSED and stops the whole pass (retry after reset).
// - Any OTHER external sync failure (a transient 5xx that survived gh()'s bounded 3-attempt retry in
//   scripts/lib/gh-project.js) degrades ONLY the affected candidate: it lands in not_ready with the
//   recorded kind via readiness() below, while the surviving ready set stays dispatchable and the
//   pass completes. One flaky mutation no longer discards an entire wave pass.
const syncQuota = done
  .filter((c) => c.sync && c.sync.blocked_by_external && c.sync.error_kind === "github-graphql-quota");
if (syncQuota.length) {
  const syncExternal = done
    .filter((c) => c.sync && c.sync.blocked_by_external)
    .map((c) => ({ issue: c.issue, missing: c.sync.error_kind || "project-sync-blocked" }));
  return {
    ready: [],
    not_ready: syncExternal,
    mirror_refreshed: false,
    blocked_by_external: true,
    error_kind: "github-project-sync-external",
  };
}
const syncDegraded = done.filter((c) => c.sync && c.sync.blocked_by_external);
if (syncDegraded.length) {
  log(`SYNC-DEGRADED: ${syncDegraded.length} candidate(s) held in not_ready after a transient Project-sync failure; the rest of the ready set stays dispatchable`);
}
// READY predicate: triage put it in a dispatchable state, no paper blocker remains, and it is wired
// into the native issue tree. CuraOS Milestone is grouping metadata, not a dispatch gate.
// treeLinked: the candidate must be WIRED into the project task tree (native sub-issue under its parent)
// before it can be ready, unless GitHub's native sub-issue max-depth validation rejected the edge and
// gh-subissue-wire recorded that explicit exception. The wire result is no longer discarded. A genuine
// root (no parent) escapes only via explicit triage.is_root; a silent "no parent_ref"/failed wire = NOT
// ready. KEEP IN SYNC with milestone-wave.workflow.js treeLinked.
function treeLinked(c) {
  if (c.triage && c.triage.is_root === true) return true;
  const w = c.wire;
  if (!w || w.skipped) return false;
  const added = Array.isArray(w.subissues_added) ? w.subissues_added : [];
  const depthLimited = Array.isArray(w.subissues_depth_limited) ? w.subissues_depth_limited : [];
  const already = Array.isArray(w.already_wired) ? w.already_wired : (w.already_linked ? [w.already_linked] : []);
  return (added.length > 0) || (depthLimited.length > 0) || (already.length > 0) || w.linked === true || w.already_linked === true;
}
function readiness(c) {
  if (!c.triage) return { ready: false, missing: "triage failed" };
  if (c.triage.blocked_by_external) return { ready: false, missing: c.triage.error_kind || "triage-blocked" };
  if (c.triage.state_label !== "ready-for-agent") return { ready: false, missing: `state=${c.triage.state_label}, blocker=${c.triage.blocker_kind}` };
  if (c.triage.blocker_kind === "real") return { ready: false, missing: `state=${c.triage.state_label}, blocker=${c.triage.blocker_kind}` };
  // RP-12 per-candidate degradation: a candidate whose Project sync failed externally is NOT
  // dispatchable (its board stamp is unproven), but it degrades alone instead of aborting the pass.
  if (c.sync && c.sync.blocked_by_external) return { ready: false, missing: c.sync.error_kind || "project-sync-blocked" };
  if (!treeLinked(c)) return { ready: false, missing: "subissue-unwired" };
  return { ready: true, missing: null };
}
const evaluated = done.map((c) => ({ c, r: readiness(c) }));
const ready = evaluated.filter((e) => e.r.ready).map((e) => e.c.issue);
const not_ready = evaluated.filter((e) => !e.r.ready).map((e) => ({ issue: e.c.issue, missing: e.r.missing }));

log(`Curated ${done.length} candidates: ${ready.length} ready, ${not_ready.length} not-ready`);

// Mirror once after the sweep (skip in dry_run).
phase("Mirror");
let mirrorRefreshed = false;
if (!dryRun) {
  const m = await workflow({ scriptPath: `${WF}/gh-roadmap-mirror.workflow.js` }, { dry_run: false, offline: true });
  mirrorRefreshed = !!(m && (m.issue_roadmap_updated || m.handover_updated));
}

return { ready, not_ready, mirror_refreshed: mirrorRefreshed };
}
