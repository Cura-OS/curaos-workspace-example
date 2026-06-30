// wave-prioritize - rank ready candidates by unblock-leverage + emit a parallel-safe dispatch plan.
// Calls scripts/lib/dep-graph.js (deterministic transitive-unblock + critical-path + weighted blend).
// Contract: docs/agents/workflows/wave-prioritize.md
//
// Dual-runtime shape (workflow-defect #508): `export const meta` MUST be the FIRST statement so Claude's
// native Workflow() tool loads it. node:child_process/fs + the dep-graph libs are reached only through the
// lazy accessors below (call-time, never module top level); the kit runs this file via process-bearing
// import() because it exports a default function.
export const meta = {
  name: "wave-prioritize",
  description: "Rank ready candidates by transitive unblock-leverage + partition into parallel-safe lanes",
  phases: [{ title: "Prioritize", detail: "dep-graph rank (unblock+critical-path+priority+effort blend) -> lane partition" }],
};

// Lazy accessors: resolve `process`/`require` only at call time so module load stays meta-first and the
// Claude Workflow() tool (no process/require) can parse the file.
let _execFileSync;
function execFileSync(...callArgs) {
  if (!_execFileSync) _execFileSync = process.getBuiltinModule("node:child_process").execFileSync;
  return _execFileSync(...callArgs);
}
let _existsSync;
function existsSync(...callArgs) {
  if (!_existsSync) _existsSync = process.getBuiltinModule("node:fs").existsSync;
  return _existsSync(...callArgs);
}
function localRequireLib(name) {
  const { createRequire } = process.getBuiltinModule("node:module");
  // Resolve module-relative via import.meta.url (NOT process.cwd()) so ../lib resolves from any cwd.
  const localRequire = createRequire(import.meta.url);
  return localRequire(name);
}
// Proxies keep every `depGraph.method(...)` / `calibration.method(...)` call site unchanged while deferring
// the require() until first property access (runtime).
let _depGraph;
const depGraph = new Proxy({}, { get(_t, prop) { if (!_depGraph) _depGraph = localRequireLib("../lib/dep-graph.js"); return _depGraph[prop]; } });
let _calibration;
const calibration = new Proxy({}, { get(_t, prop) { if (!_calibration) _calibration = localRequireLib("../lib/dep-graph-calibration.js"); return _calibration[prop]; } });
let _laneSchedule;
const laneSchedule = new Proxy({}, { get(_t, prop) { if (!_laneSchedule) _laneSchedule = localRequireLib("../lib/lane-schedule.js"); return _laneSchedule[prop]; } });
let _laneBundle;
const laneBundle = new Proxy({}, { get(_t, prop) { if (!_laneBundle) _laneBundle = localRequireLib("../lib/lane-context-bundle.js"); return _laneBundle[prop]; } });
// RP-21: the frontmatter parser has ONE code owner (scripts/lib/workflow-common.js). The old
// inline scalar-only copy silently dropped block lists; the canonical parser is a strict
// superset for this executor's scalar reads (priority/effort/module/owned_path).
let _workflowCommon;
const workflowCommon = new Proxy({}, { get(_t, prop) { if (!_workflowCommon) _workflowCommon = localRequireLib("../lib/workflow-common.js"); return _workflowCommon[prop]; } });

// 0.2.0 (minor): added the calibration data-collection hook - a fail-soft append-only write to
// scripts/lib/dep-graph-calibration-log.json after the lib returns ranked/weights. This makes the
// workflow side-effecting (fs), so side_effects flips none -> fs (a CONTRACT change => minor bump).
// The ranked/lanes/weights/rationale outputs are byte-for-byte unchanged; the only new effect is the
// append. See docs/agents/workflows/wave-prioritize.md ## Calibration + scripts/lib/dep-graph-calibration.js.
const CONTRACT = {
  name: "wave-prioritize",
  kind: "atomic",
  version: "0.4.1",
  inputs: {
    candidates: { type: "string", required: true, description: "JSON array of {ref, priority, effort, module, owned_path} that survived §3 triage" },
    weights: { type: "string", required: false, description: "JSON object overriding the blend weights {unblock,cp,prio,effort} (default 0.5/0.3/0.15/0.05)" },
    max_lanes: { type: "number", required: false, description: "OPTIONAL hard cap on concurrent lanes. Default UNCAPPED (collision-bounded only): emit every parallel-safe lane (no shared git working tree). The runtime's own min(16, cores-2) concurrency backstop throttles execution; excess lanes queue + run as slots free. Pass a number only to deliberately throttle below the collision-safe maximum." },
    milestone: { type: "string", required: false, description: "OPTIONAL milestone tag (e.g. M9) stamped into the calibration dispatch record's waveId/milestone fields. Defaults to 'unknown' when omitted." },
    near_completion: { type: "string", required: false, description: "RP-51: OPTIONAL JSON array of issue refs with deterministic near-completion evidence (open PR awaiting verify, board Status In Progress / In Review). These lanes are scheduled FIRST within the collision-safe set (finishing a lane frees capacity and unblocks dependents faster than a fresh parallel start); ordering only, never membership or gates." },
    dry_run: { type: "boolean", required: false, description: "skip calibration append; ranking and partition still run" },
  },
  outputs: {
    ranked: { type: "array", description: "candidates sorted by leverage score desc, each {issue, score, unblockReach, criticalPathDepth, priority, effort, breakdown}" },
    lanes: { type: "array", description: "the dispatch plan: every parallel-safe lane (no shared git working tree). Same-owned-root candidates are bundled into one lane with issues[]; UNCAPPED by default, truncated only if a finite max_lanes was passed. Scheduled in RP-51 order: near-completion lanes first, then critical path, FIFO within a priority class" },
    weights: { type: "object", description: "the blend weights actually applied (for explainability + calibration)" },
    rationale: { type: "string", description: "one-line why-this-order: the top issue + its unblock reach + what it frees" },
    degraded: { type: "boolean", description: "RP-46: true when the dep-graph build hit edge-fetch failures after retries; ranking is usable but unblockReach may be undercounted, and the calibration append is skipped" },
    edge_fetch_failures: { type: "number", description: "RP-46: count of edge-fetch failures during the rank() graph build (0 on a clean run)" },
    calibrationLogged: { type: "boolean", description: "whether the fail-soft calibration dispatch record was appended to scripts/lib/dep-graph-calibration-log.json (false on a fail-soft skip never aborts the wave)" },
    wavePlanPath: { type: "string", description: "RP-49: path of the wave-plan.json artifact written this run (.scratch/workflow-cache/wave-plan.json: lane assignments + critical path + velocity-sized scope; advisory planning surface - the version working-set predicate stays the closure gate); empty string on a fail-soft write skip" },
    context_bundles: { type: "array", description: "RP-50: per-lane context bundles written at plan time ({issue, path} rows; path = .scratch/<lane-slug>/context-bundle.md with mirror-doc context + pre-coding anchors), so every dispatched lane's bundle exists BEFORE its worker starts; fail-soft (a skipped bundle never aborts planning)" },
  },
  guarantees: { idempotent: true, determinism: "code-derived-ranking", side_effects: "fs" },
  verification: "T1",
  models: { prioritize: "sonnet" },
  composes: [],
};

const ROOT = ".";
function parseArgs(a) {
  if (a && typeof a === "object") return a;
  if (typeof a === "string" && a.trim()) { try { return JSON.parse(a); } catch { return {}; } }
  return {};
}

function parseJson(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function gh(args, { json = false } = {}) {
  const env = { ...process.env };
  delete env.GITHUB_TOKEN;
  const out = execFileSync("gh", args, { encoding: "utf8", env, maxBuffer: 64 * 1024 * 1024 });
  return json ? JSON.parse(out) : out;
}

function splitIssueRef(ref) {
  const key = depGraph.parseRef(ref);
  const parts = key && depGraph.splitRef(key);
  return parts ? { ...parts, key, repoFull: `${parts.owner}/${parts.repo}` } : null;
}

function issueFrontmatter(ref) {
  const issue = splitIssueRef(ref);
  if (!issue) return {};
  try {
    const body = gh(["issue", "view", String(issue.number), "--repo", issue.repoFull, "--json", "body", "--jq", ".body"]);
    return workflowCommon.parseFrontmatter(body);
  } catch {
    return {};
  }
}

function rootFromPath(value) {
  const p = String(value || "").trim().replace(/^['"]|['"]$/g, "").replaceAll("\\", "/");
  if (!p) return "";
  if (p.includes("curaos/tools/codegen/")) return "curaos";
  const service = p.match(/^(curaos\/backend\/services\/[^/]+)/);
  if (service) return service[1];
  const backendPkg = p.match(/^(curaos\/backend\/packages\/[^/]+)/);
  if (backendPkg) return backendPkg[1];
  const frontend = p.match(/^(curaos\/frontend\/(?:apps|packages)\/[^/]+)/);
  if (frontend) return frontend[1];
  if (p.startsWith("curaos/ops/") || p === "curaos" || p.startsWith("curaos/")) return "curaos";
  if (p.startsWith("ai/") || p.startsWith("docs/") || p.endsWith("DOC-GRAPH.md")) return "workspace";
  return "";
}

function rootFromModule(moduleName) {
  const m = String(moduleName || "").trim();
  if (!m) return "";
  const pathRoot = rootFromPath(m);
  if (pathRoot) return pathRoot;
  if (/codegen|contracts|sdk/i.test(m)) return "curaos";
  for (const base of ["curaos/backend/services", "curaos/backend/packages", "curaos/frontend/apps", "curaos/frontend/packages"]) {
    const candidate = `${base}/${m}`;
    if (existsSync(`${ROOT}/${candidate}`)) return candidate;
  }
  if (m === "ops") return "curaos";
  if (/^(?:docs?|rules?|adrs?|research)(?:[/_-]|$)/i.test(m)) return "workspace";
  return "unknown";
}

function rootFromIssueRef(ref) {
  const issue = splitIssueRef(ref);
  if (!issue) return "";
  if (issue.repo === "curaos-ai-workspace") return "workspace";
  if (issue.repo === "curaos") return "curaos";
  return issue.repoFull;
}

function ownedRoot(row, candidateByIssue) {
  const candidate = candidateByIssue.get(row.issue) || {};
  const candidatePathRoot = rootFromPath(candidate.owned_path || candidate.ownedPath);
  if (candidatePathRoot) return candidatePathRoot;
  const candidateModuleRoot = rootFromModule(candidate.module);
  if (candidateModuleRoot && candidateModuleRoot !== "unknown") return candidateModuleRoot;
  const issueRoot = rootFromIssueRef(row.issue);
  if (issueRoot && issueRoot !== "workspace" && issueRoot !== "curaos") return issueRoot;
  const fm = issueFrontmatter(row.issue);
  return rootFromPath(fm.owned_path || fm.ownedPath)
    || rootFromModule(fm.module)
    || issueRoot
    || candidateModuleRoot
    || "unknown";
}

function partitionLanes(ranked, candidateByIssue, maxLanes) {
  const laneByRoot = new Map();
  const lanes = [];
  for (const row of ranked) {
    const owned_root = ownedRoot(row, candidateByIssue);
    const existing = laneByRoot.get(owned_root);
    if (existing) {
      existing.issues.push(row.issue);
      existing.bundled_count = existing.issues.length;
      continue;
    }
    if (Number.isFinite(maxLanes) && lanes.length >= maxLanes) continue;
    const lane = { issue: row.issue, issues: [row.issue], score: row.score, owned_root, bundled_count: 1 };
    laneByRoot.set(owned_root, lane);
    lanes.push(lane);
  }
  return lanes;
}

function issuesForLane(lane) {
  if (!lane || typeof lane !== "object") return [];
  const issues = Array.isArray(lane.issues) && lane.issues.length ? lane.issues : [lane.issue];
  return [...new Set(issues.filter(Boolean).map(String))];
}

// RP-49 wave-plan artifact: one machine-readable plan per prioritize run with the three planning
// surfaces downstream tooling consumes (RP-50 context bundles, RP-51 scheduling): lane assignments,
// the critical path (deepest critical-path-depth first; depth 0 rows carry no chain and are
// omitted), and the velocity-sized scope (first suggestedWaveSize issues across ordered lane
// bundles when the RP-47 calibration sizing signal exists; all issues otherwise). ADVISORY ONLY:
// the version working-set predicate stays the closure gate per curaos_version_planning_rule.md -
// this artifact never gates closure or dispatch. Pure builder (truth-contract executes it);
// the write is fail-soft like the
// calibration append.
function buildWavePlan(ranked, lanes, milestone, sizing, generatedAt) {
  const suggested = sizing && Number.isFinite(sizing.suggestedWaveSize) && sizing.suggestedWaveSize > 0
    ? sizing.suggestedWaveSize
    : null;
  const laneRows = (lanes || []).map((lane) => {
    const issues = issuesForLane(lane);
    return {
      issue: lane.issue,
      ...(issues.length ? { issues, bundled_count: issues.length } : {}),
      score: lane.score,
      owned_root: lane.owned_root,
    };
  });
  const issueScope = laneRows.flatMap((lane) => issuesForLane(lane));
  return {
    schemaVersion: 1,
    generatedAt,
    milestone,
    lanes: laneRows,
    critical_path: (ranked || [])
      .filter((row) => Number.isFinite(row.criticalPathDepth) && row.criticalPathDepth > 0)
      .slice()
      .sort((a, b) => b.criticalPathDepth - a.criticalPathDepth)
      .map((row) => ({ issue: row.issue, criticalPathDepth: row.criticalPathDepth, score: row.score })),
    velocity_sized_scope: {
      suggestedWaveSize: suggested,
      source: suggested ? "calibration" : "fallback-all-lanes",
      scope: issueScope.slice(0, suggested || issueScope.length),
    },
  };
}

const WAVE_PLAN_PATH = ".scratch/workflow-cache/wave-plan.json";
function writeWavePlan(plan) {
  try {
    const fs = process.getBuiltinModule("node:fs");
    fs.mkdirSync(".scratch/workflow-cache", { recursive: true });
    fs.writeFileSync(WAVE_PLAN_PATH, `${JSON.stringify(plan, null, 2)}\n`);
    return WAVE_PLAN_PATH;
  } catch (error) {
    // Fail-soft (same contract as the calibration append): a plan-write failure never aborts the
    // ranking result; the empty path tells the caller no artifact landed.
    console.warn(`wave-prioritize: wave-plan write skipped: ${error && error.message ? error.message : error}`);
    return "";
  }
}

export default async function runWavePrioritize({ args, phase }) {
  phase("Prioritize");
  const cfg = parseArgs(typeof args !== "undefined" ? args : undefined);
  const candidates = parseJson(cfg.candidates, []);
  if (!Array.isArray(candidates) || !candidates.length) {
    throw new Error("wave-prioritize: args.candidates (JSON array of {ref,priority,effort,module,owned_path}) is required + non-empty");
  }
  const weightsOverride = parseJson(cfg.weights, undefined);
  const maxLanes = Number.isFinite(cfg.max_lanes) ? cfg.max_lanes : Infinity;
  const milestoneLabel = (typeof cfg.milestone === "string" && cfg.milestone.trim()) ? cfg.milestone.trim() : "unknown";
  const candidateByIssue = new Map();
  for (const c of candidates) {
    const issue = depGraph.parseRef(c && c.ref);
    if (issue) candidateByIssue.set(issue, c);
  }
  // RP-47 null-capture fix: the calibration log recorded priority:null/effort:null for every
  // dispatched candidate because upstream callers passed candidates without frontmatter fields.
  // Backfill MISSING priority/effort deterministically from the issue's own frontmatter
  // (issueFrontmatter is the same read-only parser the lane partition already uses). Explicit
  // caller values always win; only null/absent fields are filled.
  const rankInput = candidates.map((c) => {
    if (!c || typeof c !== "object") return c;
    if (c.priority != null && c.effort != null) return c;
    const fm = issueFrontmatter(c.ref);
    return {
      ...c,
      ...(c.priority == null && fm.priority ? { priority: fm.priority } : {}),
      ...(c.effort == null && fm.effort ? { effort: fm.effort } : {}),
    };
  });
  const { weights, ranked } = depGraph.rank(rankInput, { weights: weightsOverride });
  if (!Array.isArray(ranked) || !ranked.length) {
    throw new Error("wave-prioritize: deterministic dep-graph rank returned no rows for non-empty candidates");
  }
  // RP-46 degrade visibility: rank() marks the returned rows with non-enumerable degrade props
  // (ranked.degraded / ranked.edgeFetchFailures). Surface them explicitly in the workflow output
  // and thread `degraded` into the calibration record builder, whose appendRecord REFUSES degraded
  // records (the log only learns from complete graphs).
  const degraded = ranked.degraded === true;
  const edgeFetchFailures = Number.isFinite(ranked.edgeFetchFailures) ? ranked.edgeFetchFailures : 0;
  let lanes = partitionLanes(ranked, candidateByIssue, maxLanes);
  // RP-51 scheduling policy (ordering only, membership untouched): near-completion lanes first
  // (caller-supplied refs with deterministic open-PR / In Progress / In Review evidence), then
  // critical path deepest-first, FIFO within a priority class. Completing a lane frees capacity
  // and unblocks dependents faster than starting another fresh lane in parallel.
  const nearCompletion = parseJson(cfg.near_completion, []);
  lanes = laneSchedule.orderLanes(lanes, { ranked, nearCompletion: Array.isArray(nearCompletion) ? nearCompletion : [] });
  const top = ranked[0];
  const rationale = top ? `${top.issue} ranks first with unblockReach=${top.unblockReach}` : "";
  let calibrationLogged = false;
  if (!cfg.dry_run) {
    const rec = calibration.buildRecord({ ranked, weights, degraded, milestone: milestoneLabel, dispatchedAt: new Date().toISOString() });
    calibrationLogged = calibration.appendRecord(rec);
  }
  // RP-49: emit the wave-plan artifact (dry_run included - the plan IS the dry-run deliverable).
  // Sizing comes from the RP-47 calibration signal when >=3 complete waves exist; advisory only.
  let sizing = null;
  try {
    sizing = (calibration.analyze() || {}).sizing || null;
  } catch { sizing = null; }
  const wavePlanPath = writeWavePlan(buildWavePlan(ranked, lanes, milestoneLabel, sizing, new Date().toISOString()));
  // RP-50: per-lane context bundle, written at PLAN time so a dispatched lane's bundle exists
  // BEFORE its worker starts (.scratch/<lane-slug>/context-bundle.md: mirror-doc context +
  // pre-coding anchors). Fail-soft like the wave-plan write; never aborts the ranking result.
  let contextBundles = [];
  try {
    contextBundles = laneBundle.writeLaneBundles({
      lanes,
      ranked,
      candidates: rankInput,
      milestone: milestoneLabel,
      wavePlanPath,
    });
  } catch (error) {
    console.warn(`wave-prioritize: context-bundle write skipped: ${error && error.message ? error.message : error}`);
    contextBundles = [];
  }
  return { ranked, lanes, weights, rationale, degraded, edge_fetch_failures: edgeFetchFailures, context_bundles: contextBundles, calibrationLogged, wavePlanPath };
}
