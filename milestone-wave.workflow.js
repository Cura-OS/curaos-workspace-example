// milestone-wave - ONE non-interactive pass of the milestone-orchestration Goal Setter:
// scan+select -> pm-triage-gate -> breakdown -> partition -> task-execute per lane -> pr-verify-merge -> report.
// Stops + reports in needs_user ONLY decisions where no clear recommendation exists (genuine trade-off), or action is irreversible/destructive/T3, or scope is unapproved. Real-user-decision blockers that have a clear recommended option (reversible + in-scope) are auto-applied by the scan agent per curaos_recommendation_auto_apply_rule.md and recorded in ai/curaos/docs/adr/AUTO-DECISION-LOG.md.
// Composes pm-triage-gate + breakdown + task-execute + pr-verify-merge. Contract: docs/agents/workflows/milestone-wave.md
//
// Dual-runtime shape (workflow-defect #508): `export const meta` MUST be the FIRST statement so Claude's
// native Workflow() tool loads it (the tool requires a pure meta literal first and provides no process/require).
// Any node:child_process/fs/path/module access is therefore deferred behind lazy loaders called only from the
// default function body (the kit's process-bearing import() path); never executed at module top level. The kit
// routes this file through unrestricted import() (process available) because it exports a default function.
export const meta = {
  name: "milestone-wave",
  description: "One non-interactive pass of a milestone wave: triage -> breakdown -> partition -> dispatch -> verify",
  phases: [
    { title: "Scan", detail: "resolve milestone selector + ready candidates + paper-vs-real triage" },
    { title: "Triage", detail: "pm-triage-gate over candidates" },
    { title: "Breakdown", detail: "split non-grab-able ready issues" },
    { title: "Prioritize", detail: "wave-prioritize: rank by unblock-leverage + partition parallel-safe lanes" },
    { title: "Dispatch", detail: "task-execute per lane in leverage order" },
    { title: "Verify", detail: "pr-verify-merge per PR" },
    { title: "Foresight", detail: "foresight-sweep (wave mode): seed staged future/dependency work + report" },
  ],
};

const CONTRACT = {
  name: "milestone-wave",
  kind: "composite",
  version: "0.4.1",
  inputs: {
    milestone: { type: "string", required: false, description: "legacy selector kept for compatibility. active/default scans every open org issue; milestone fields are tracker metadata, not dispatch gates. Target Version remains the planning and closure gate." },
    max_lanes: { type: "number", required: false, description: "OPTIONAL throttle on planned task-execute lanes this pass. Default UNCAPPED (collision-bounded only): include every parallel-safe lane wave-prioritize emits." },
    dispatch_mode: { type: "string", required: false, description: "worktree (default) runs lanes in isolated git worktrees; serial preserves the legacy single-checkout fallback" },
    dispatch_batch_size: { type: "number", required: false, description: "maximum concurrent worktree task-execute lane controllers. Default 20." },
    dispatch_agent_type: { type: "string", required: false, description: "agent type for worktree child controllers. Defaults to inherited AGENT_WORKFLOW_KIT_DEFAULT_AGENT_TYPE or codex." },
    dispatch_agent_timeout_ms: { type: "number", required: false, description: "per-agent timeout for worktree child controllers. Default 1800000." },
    submodule_jobs: { type: "number", required: false, description: "parallel jobs for wave and lane `git submodule update --init --recursive --jobs N`. Default 8." },
    dry_run: { type: "boolean", required: false, description: "plan the wave (triage + partition + what would dispatch) without mutating the tracker or dispatching workers" },
    auto_merge: { type: "boolean", required: false, description: "let pr-verify-merge merge green PRs (default false - report verdict for the orchestrator)" },
    max_regrill_cycles: { type: "number", required: false, description: "P2a/P2b BINDING cap (default 3) on the in-workflow delta re-grill fix-cycle loop in the serial verify stage: on grill issues-found, dispatch a fix worker then re-grill the delta in-workflow up to this many cycles before deferring to the next pass." },
    init_submodules: { type: "boolean", required: false, description: "P5c: at wave setup run `git submodule update --init --recursive` + a two-level pointer-drift recheck so pre-push typecheck hooks pass on uninitialized gitlinks (stops --no-verify masking). Default false (the contract-test harnesses never trigger live recursive init); real dispatched waves pass true." },
    triage_batch_size: { type: "number", required: false, description: "maximum number of concurrent real-agent gh-issue-triage candidates. Default 3. This is an internal queueing throttle; do not use the kit --max-concurrent-agents hard cap as a throttle." },
  },
  outputs: {
    milestones: { type: "array", description: "the milestones this pass covered" },
    triaged: { type: "object", description: "{ ready, not_ready } from pm-triage-gate" },
    dispatched: { type: "array", description: "task-execute lanes started this pass + their status" },
    dispatch_order: { type: "array", description: "the leverage-ranked dispatch plan from wave-prioritize (issue + score + unblockReach) - the order lanes were chosen in" },
    pending_tracker_work: { type: "array", description: "non-dispatched open tracker rows that still require a next action: not_ready triage rows plus runtime-held agent-claimed/agent-PR-open rows" },
    next_action: { type: "string", description: "complete, rerun-or-closeout, or drain-pending-tracker-work" },
    foresight: { type: "object", description: "foresight-sweep (wave mode) result: future-work findings discovered + staged issues seeded this pass" },
    pre_breakdown: { type: "object", description: "RP-48 pre-breakdown trigger result { drafted, skipped }: story sets drafted for just-unblocked (dependency_cleared) Epics/Stories that still need decomposition, filed via foresight-capture as staged foresight work; later §3.4 triage can promote relevant ready children" },
    pr_verdicts: { type: "array", description: "pr-verify-merge results for PRs in scope" },
    workspace_ready: { type: "array", description: "per-merged-PR default-branch readiness results: clean | stashed | blocked | n/a" },
    needs_user: { type: "array", description: "decisions the wave hit that genuinely require the orchestrator/user after the auto-apply filter: (a) genuine trade-offs where analysis finds NO clear recommendation, (b) irreversible/destructive/T3-class actions, or (c) unapproved-scope expansions. Real-user-decision blockers that carry a clear recommended option MUST be auto-applied by the scan phase (per [[curaos-recommendation-auto-apply-rule]]) and logged to ai/curaos/docs/adr/AUTO-DECISION-LOG.md - they do NOT reach needs_user." },
    grill_stub_ratio: { type: "number", description: "RP-33: blocked-harness stub ratio over the live grills archive at wave close (reports carrying GRILL: blocked-harness-unavailable with no verdict evidence / total reports); 0 when the archive is unreadable" },
    grill_blocked_stubs: { type: "number", description: "RP-33: count of blocked-harness stub reports in the live grills archive at wave close" },
    grill_stub_alarm: { type: "boolean", description: "RP-33: true when grill_stub_ratio exceeds the 0.15 alarm threshold (baseline 0.083 measured 2026-06-10 post-quarantine; the pre-quarantine bad state was ~0.216 with merges proceeding) - investigate grill-harness availability before trusting merge gates" },
    done: { type: "boolean", description: "true if this pass left the milestone(s) at a terminal state; false if another pass is needed" },
  },
  guarantees: { idempotent: false, determinism: "control-flow-only", side_effects: "github" },
  verification: "T2",
  composition: "inline", // child composites are INLINED (not workflow()-nested) - workflow() nesting caps at 1 level and this is the TOP. composes[] kept for lineage; gh-* atomics are still reached 1-level deep.
  models: { plan: "sonnet" },
  composes: ["pm-triage-gate", "wave-prioritize", "breakdown", "task-execute", "pr-verify-merge", "gh-pr-gate-snapshot", "foresight-sweep"],
};

const ROOT = ".";
const WF = "scripts/workflows";

let _ghRef;
let _agentRuntimeStatus;
function workflowRequire(name) {
  const { createRequire } = process.getBuiltinModule("node:module");
  const { pathToFileURL } = process.getBuiltinModule("node:url");
  let base = "";
  try { base = eval("import.meta.url"); } catch {}
  if (!base && typeof __filename === "string" && /scripts\/workflows\/milestone-wave\.workflow\.js$/.test(__filename)) base = __filename;
  if (!base) base = pathToFileURL(`${process.cwd()}/scripts/workflows/milestone-wave.workflow.js`).href;
  return createRequire(base)(name);
}
function ghRef() {
  if (!_ghRef) _ghRef = workflowRequire("../lib/gh-ref.js");
  return _ghRef;
}
function agentRuntimeStatus() {
  if (!_agentRuntimeStatus) _agentRuntimeStatus = workflowRequire("../lib/agent-runtime-status.js");
  return _agentRuntimeStatus;
}
function prRefParts(pr) {
  try {
    const parsed = ghRef().parsePrRef(pr, { source: "milestone-wave" });
    return { repo: parsed.slug, number: parsed.number };
  } catch {
    return null;
  }
}

function validIssueRef(ref) {
  const text = String(ref || "").trim();
  const match = text.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)#(\d+)$/);
  if (!match) return false;
  return ![".", ".."].includes(match[1]) && ![".", ".."].includes(match[2]);
}
function parseIssueForWorkflow(ref) {
  return ghRef().parseIssueRefOrUrl(ref, { source: "milestone-wave", fieldName: "issue" });
}
function issueRefFromParts(repo, number) {
  return `${repo}#${Number(number)}`;
}
function repoFromRestIssue(issue, fallbackRepo) {
  const repositoryUrl = String(issue && issue.repository_url ? issue.repository_url : "");
  const repoMatch = repositoryUrl.match(/\/repos\/([^/]+\/[^/]+)$/);
  if (repoMatch) return repoMatch[1];
  const htmlUrl = String(issue && issue.html_url ? issue.html_url : "");
  const htmlMatch = htmlUrl.match(/github\.com\/([^/]+\/[^/]+)\/issues\/\d+/i);
  return htmlMatch ? htmlMatch[1] : fallbackRepo;
}
function restIssueRef(issue, fallbackRepo) {
  const number = Number(issue && issue.number);
  if (!Number.isFinite(number)) return "";
  return issueRefFromParts(repoFromRestIssue(issue, fallbackRepo), number);
}
function prefetchedSubIssueRefs(record) {
  if (!record || !Array.isArray(record.subIssues)) return null;
  return record.subIssues
    .map((child) => child && child.repo && child.number ? issueRefFromParts(child.repo, child.number) : "")
    .filter(Boolean);
}
function isOpenIssueState(state) {
  return String(state || "").toUpperCase() !== "CLOSED" && String(state || "").toLowerCase() !== "closed";
}
function existingOpenSubIssueRefs(issue, prefetchedRecord) {
  const ghProject = workflowRequire("../lib/gh-project.js");
  const prefetchedRefs = prefetchedSubIssueRefs(prefetchedRecord);
  if (prefetchedRefs) {
    if (!prefetchedRefs.length) return [];
    const childIssues = prefetchedRefs.map((ref) => {
      const parsed = parseIssueForWorkflow(ref);
      return { repo: parsed.repo, number: parsed.number };
    });
    const childRecords = ghProject.batchIssueRead(childIssues, { includeHierarchy: false });
    return prefetchedRefs.filter((ref) => {
      const record = childRecords.get(ref);
      return !record || isOpenIssueState(record.state);
    });
  }
  const parent = parseIssueForWorkflow(issue);
  const rows = ghProject.gh(["api", "--paginate", `repos/${parent.repo}/issues/${parent.number}/sub_issues`], { json: true });
  const refs = [];
  const seen = new Set();
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!isOpenIssueState(row && row.state)) continue;
    const ref = restIssueRef(row, parent.repo);
    if (!ref || seen.has(ref)) continue;
    refs.push(ref);
    seen.add(ref);
  }
  return refs;
}
// RP-21: parseArgs + externalFailureKind live once in scripts/lib/workflow-common.js and reach
// this default-export executor through loadSharedPhaseHelpers() (direct import, no inline copies).
// RP-20: ghPrCommand / isBlockedHarnessUnavailable / grillShaMismatch (the RP-03 fail-closed
// grill-SHA binding) and statusFromTriage / projectFieldsForSync are single-owned in
// scripts/lib/merge-hygiene.js + scripts/lib/triage-status.js. This default-export executor
// imports them DIRECTLY via the lazy createRequire pattern (loadSharedPhaseHelpers below);
// the Claude-style executors (pr-verify-merge, pm-triage-gate) keep byte-identical inline copies
// pinned to the lib by extractFunction-equality tests in scripts/workflow-truth-contract.test.js.
// In-flight generator/SDK barrier (RP-04; curaos_generator_evolution_rule + user directive 2026-05-27).
// KEEP IN SYNC with milestone-active-scan.workflow.js isGeneratorScope - identical regex + semantics.
function isGeneratorScope(ref, title) {
  return /codegen|[-/]sdk\b|\bsdk[-/]|contracts/i.test(`${ref} ${title || ""}`);
}
// Deterministic dispatch-path barrier: with an in-flight codegen/SDK/contracts lane, generated-scope
// candidates are held out of dispatch (downstream output would inherit the defect the in-flight fix
// is removing). Returns { dispatchable, held }; held entries carry the binding hold reason.
function applyGeneratorBarrier(candidates, inflightRef, textForIssue) {
  if (!inflightRef) return { dispatchable: [...(candidates || [])], held: [] };
  const dispatchable = [];
  const held = [];
  for (const issue of candidates || []) {
    if (isGeneratorScope(issue, textForIssue ? textForIssue(issue) : "")) {
      held.push({ issue, reason: `gen-evo barrier: ${inflightRef} in-flight` });
    } else {
      dispatchable.push(issue);
    }
  }
  return { dispatchable, held };
}
function errorText(error) {
  const parts = [];
  if (error && error.message) parts.push(error.message);
  if (error && error.stderr) parts.push(String(error.stderr));
  if (error && Array.isArray(error.output)) parts.push(error.output.filter(Boolean).join("\n"));
  return parts.join("\n").trim() || String(error);
}
function isSubissueDepthLimit(message) {
  return /\bmore than\s+7\s+layers\s+of\s+sub-issues\b/i.test(String(message || ""));
}
// RP-52 deploy-lane credential preflight: lanes that build/publish/sign container images (the #588
// GHCR class) fail hours into the work when the operator token lacks write:packages - and a
// "docker login Succeeded" is a FALSE positive (login != write). Detect deploy-credential scope
// from the same deterministic inputs the gen-evo barrier uses (ref + module/owned-path text).
function isDeployCredentialScope(ref, text) {
  return /image[- ]?(?:build|publish|sign)|build[- ]images?|publish[- ]images?|sign[- ]images?|ghcr|container[- ]registry|registry[- ](?:push|write)|docker[- ]push|cosign|zarf[- ]package/i.test(`${ref} ${text || ""}`);
}
// Deterministic preflight (fail closed): scripts/preflight-credentials --registry-probe asserts the
// token scopes (X-OAuth-Scopes) + registry write (scratch-tag push) BEFORE dispatch. Exit 65 =
// missing scope, 66 = registry write rejected, 70 = cannot prove; any nonzero (or spawn failure)
// holds the lane for the operator queue instead of dispatching it.
function preflightCredentialsGate() {
  const { spawnSync } = process.getBuiltinModule("node:child_process");
  const res = spawnSync("bash", ["scripts/preflight-credentials", "--registry-probe"], { encoding: "utf8" });
  const exit = typeof res.status === "number" ? res.status : 70;
  return { exit, output: `${res.stdout || ""}\n${res.stderr || ""}`.trim() };
}
// RP-48 pre-breakdown trigger inputs (pure, truth-contract tested): the cleared-unpromoted set is
// every dependency_cleared issue triage did NOT promote into the active ready set this pass, and
// the per-pass draft cap comes from the
// calibration throughput sizing signal (RP-47) with a fixed fallback when <3 complete waves exist.
function clearedUnpromotedRefs(dependencyCleared, readyRefs) {
  const ready = new Set(readyRefs || []);
  return (dependencyCleared || []).filter((ref) => !!ref && !ready.has(ref));
}
function draftCapFromSizing(sizing, fallback) {
  const n = sizing && Number.isFinite(sizing.suggestedWaveSize) ? sizing.suggestedWaveSize : 0;
  return n > 0 ? n : fallback;
}
// Lazy calibration load (same meta-first-safe pattern as loadGitHelpers): advisory throughput input
// for the RP-48 draft cap; any failure degrades to the fixed fallback, never fails the wave.
function loadCalibration() {
  const { createRequire } = process.getBuiltinModule("node:module");
  const localRequire = createRequire(import.meta.url);
  return localRequire("../lib/dep-graph-calibration.js");
}
function projectItemRef(item) {
  const content = item && item.content;
  if (!content || content.type !== "Issue" || !content.number) return item && item.id ? item.id : "";
  const repo = String(content.repository || item.repository || "").replace(/^https:\/\/github\.com\//, "");
  return repo ? `${repo}#${content.number}` : "";
}
function routePendingTrackerWork(missing) {
  const text = String(missing || "");
  if (/state=ready-for-human/i.test(text)) return "user-escalation";
  if (/runtime-held/i.test(text)) return "runtime-lane-check";
  if (/subissue-unwired/i.test(text)) return "tracker-repair";
  if (/breakdown|foresight/i.test(text)) return "planning-breakdown";
  if (/github-project-api-transient|project-sync-blocked|github-project-sync-external/i.test(text)) return "sync-degradation";
  if (/triage failed|triage-blocked|agent-runtime-unavailable/i.test(text)) return "triage-retry";
  if (/state=wontfix/i.test(text)) return "closed-out";
  if (/blocker=real|markers=.*\bblocked\b/i.test(text)) return "blocker-follow-up";
  if (/state=needs-triage|state=needs-info|blocker=paper/i.test(text)) return "tracker-triage";
  return "investigate";
}

function triageRuntimeUnavailableLimit(total) {
  const count = Number(total);
  if (!Number.isFinite(count) || count <= 0) return 1;
  return Math.max(1, Math.min(3, Math.ceil(count * 0.02)));
}

function isTerminalTriageExternal(kind) {
  return /github-graphql-quota|agent-runtime-quota/i.test(String(kind || ""));
}

function isRuntimeUnavailableKind(kind) {
  return /agent-runtime-unavailable/i.test(String(kind || ""));
}

function isGraphqlQuotaKind(kind) {
  return /github-graphql-quota/i.test(String(kind || ""));
}

function isGraphqlQuotaText(text) {
  return /github-graphql-quota|unknown owner type|(?:graphql|api).*(?:rate limit|quota)|(?:rate limit|quota).*(?:graphql|api)/i.test(String(text || ""));
}

function quotaDeferredRows(issues, missing = "github-graphql-quota") {
  return (Array.isArray(issues) ? issues : []).map((issue) => ({ issue, missing }));
}

function pendingTrackerWorkFrom(scan, triaged) {
  return [
    ...((scan.runtime_held_candidates || []).map((issue) => ({
      issue,
      missing: "runtime-held: agent-claimed or agent-PR-open",
      route: "runtime-lane-check",
    }))),
    ...((scan.malformed_tracker_refs || []).map((issue) => ({
      issue,
      missing: "malformed tracker ref",
      route: "tracker-repair",
    }))),
    ...((triaged.not_ready || []).map((row) => ({
      issue: row.issue,
      missing: row.missing,
      route: routePendingTrackerWork(row.missing),
    }))),
  ].sort((a, b) => String(a.issue).localeCompare(String(b.issue), undefined, { numeric: true }));
}

function pendingTrackerBlocksDispatch(row) {
  return false;
}

function terminalExternal(scan, kind, what, extra = {}) {
  return {
    milestones: scan.milestones || [],
    triaged: extra.triaged || { ready: [], not_ready: [] },
    dispatched: [],
    dispatch_order: [],
    foresight: { findings: [], captured: { seeded: [], skipped: [] }, dropped: 0 },
    pre_breakdown: { drafted: [], skipped: [] },
    pr_verdicts: [],
    workspace_ready: [],
    needs_user: [...(scan.needs_user || []), { issue: "CuraOS Roadmap", kind, what }],
    done: false,
    terminal: "blocked-by-external",
    blocked_by_external: true,
  };
}
function droppedPipelineRows(inputs, results, missing) {
  const rows = [];
  const expected = Array.isArray(inputs) ? inputs : [];
  const actual = Array.isArray(results) ? results : [];
  for (let index = 0; index < expected.length; index += 1) {
    if (!actual[index]) rows.push({ issue: expected[index], missing });
  }
  return rows;
}
function runPipelineBatches(items, batchSize, pipelineFn, ...stages) {
  const list = Array.isArray(items) ? items : [];
  const parsed = Math.floor(Number(batchSize));
  const size = Number.isFinite(parsed) && parsed > 0 ? parsed : Math.max(1, list.length || 1);
  const out = [];
  let chain = Promise.resolve();
  for (let index = 0; index < list.length; index += size) {
    const batch = list.slice(index, index + size);
    chain = chain.then(() => pipelineFn(batch, ...stages)).then((result) => {
      out.push(...(Array.isArray(result) ? result : []));
    });
  }
  return chain.then(() => out);
}
function projectItemsCache() {
  // RP-38: shared TTL board snapshot (ONE file, .scratch/workflow-cache/roadmap-items.json)
  // instead of a unique timestamped file per pass (the 46-orphaned-snapshots source). Within the
  // 5-min TTL this costs zero network calls; truncation fail-closed lives in boardSnapshot.
  const { createRequire } = process.getBuiltinModule("node:module");
  const ghProject = createRequire(import.meta.url)("../lib/gh-project.js");
  const snap = ghProject.boardSnapshot();
  return { path: snap.path, items: snap.items };
}

function graphqlQuotaStatus(ledger) {
  const graphql = ledger && ledger.budgets && ledger.budgets.graphql;
  const remaining = Number(graphql && graphql.remaining);
  return {
    depleted: Number.isFinite(remaining) && remaining <= 0,
    remaining: Number.isFinite(remaining) ? remaining : null,
    resetAt: graphql && graphql.resetAt ? String(graphql.resetAt) : "",
    probe: ledger && ledger.graphqlProbe ? String(ledger.graphqlProbe) : "",
  };
}

function readGraphqlQuotaStatus() {
  const { createRequire } = process.getBuiltinModule("node:module");
  const ghBudget = createRequire(import.meta.url)("../lib/gh-budget.js");
  return graphqlQuotaStatus(ghBudget.readBudgets());
}

function agentRuntimeFailureKind(message) {
  const text = String(message || "");
  if (!/(?:codex|claude|agent).*(?:exited|runtime|session)|session id:|(?:session|usage)\s+limit|rate\s+limit|quota|too many requests|\b429\b/i.test(text)) return "";
  try {
    return agentRuntimeStatus().agentFailureKind(text);
  } catch {
    return "agent-runtime-unavailable";
  }
}

function readAgentRuntimeStatus(agentType) {
  const normalized = String(agentType || "codex").trim().toLowerCase();
  if (normalized && normalized !== "codex") {
    return { blocked: false, kind: "", reason: `agent runtime preflight skipped for explicit non-codex harness ${normalized}`, source: "non-codex" };
  }
  try {
    return agentRuntimeStatus().readCodexRuntimeStatus();
  } catch (error) {
    return { blocked: false, kind: "", reason: `codex runtime preflight unavailable: ${error && error.message ? error.message : error}`, source: "preflight-error" };
  }
}

function realAgentsEnabled() {
  return process.env.AGENT_WORKFLOW_KIT_REAL_AGENTS === "1";
}

function isNoOpWorkflowDefect(result) {
  return result
    && result.workflow_defect === true
    && result.workflow_defect_kind === "tdd-implement-no-op-done";
}

function blockedByNoOpBarrier(issue, failedIssue) {
  return {
    issue,
    status: "blocked",
    pr: "",
    workflow_defect: true,
    workflow_defect_kind: "tdd-implement-no-op-done",
    blocker: `workflow-defect:tdd-implement-no-op-done: halted serial dispatch after ${failedIssue} returned no-op done; fix or run native fallback before retrying this lane`,
  };
}

// Lazy git-helper load: only reached on the kit import() path / Claude harness, both of which provide
// `process`. Never executes at module top level, so Claude's Workflow() tool can load this file meta-first.
// Resolve module-relative via import.meta.url (NOT process.cwd()): the lazy require must find ../lib
// regardless of the caller's working directory.
function loadGitHelpers() {
  const { createRequire } = process.getBuiltinModule("node:module");
  const localRequire = createRequire(import.meta.url);
  return localRequire("../lib/workflow-git.js");
}

// RP-20 shared-phase helper load (same lazy pattern as loadGitHelpers, same meta-first constraint):
// statusFromTriage/projectFieldsForSync from scripts/lib/triage-status.js + the merge+hygiene leg's
// deterministic core (ghPrCommand, isBlockedHarnessUnavailable, grillShaMismatch) from
// scripts/lib/merge-hygiene.js - DIRECT imports, no inline copies in this executor.
function loadSharedPhaseHelpers() {
  const { createRequire } = process.getBuiltinModule("node:module");
  const localRequire = createRequire(import.meta.url);
  return { ...localRequire("../lib/triage-status.js"), ...localRequire("../lib/merge-hygiene.js"), ...localRequire("../lib/workflow-common.js") };
}

function positiveInteger(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function dispatchRunSuffix() {
  const stamp = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14);
  return `${stamp}-${process.pid}`;
}

function laneBranchName(issue, suffix) {
  const slug = String(issue || "lane")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 78) || "lane";
  return `feat/${slug}-${suffix}`;
}

function workflowKitCommand() {
  return process.env.AGENT_WORKFLOW_KIT_BIN || "agent-workflow-kit";
}

function initLaneSubmodules(worktreePath, jobs) {
  const { execFileSync } = process.getBuiltinModule("node:child_process");
  const jobCount = positiveInteger(jobs, 8);
  execFileSync("git", ["-C", worktreePath, "submodule", "update", "--init", "--recursive", "--jobs", String(jobCount)], {
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 64 * 1024 * 1024,
  });
}

function parseWorkflowJson(stdout) {
  const text = String(stdout || "").trim();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    const start = text.lastIndexOf("\n{");
    if (start >= 0) return JSON.parse(text.slice(start + 1));
    throw new Error("workflow child returned non-json output");
  }
}

function childTaskOutput(parsed) {
  if (!parsed || typeof parsed !== "object") return {};
  if (parsed.output && typeof parsed.output === "object") return parsed.output;
  if (parsed.result && typeof parsed.result === "object") return parsed.result;
  const wrapperStatuses = new Set(["completed", "failed", "running", "stopped"]);
  if (typeof parsed.status === "string" && wrapperStatuses.has(parsed.status)) return {};
  return parsed;
}

function runTaskExecuteChild({ issue, branch, worktreePath, agentType, timeoutMs }) {
  const { spawn } = process.getBuiltinModule("node:child_process");
  const argsJson = JSON.stringify({ issue, branch, branch_precreated: true, dry_run: false });
  const argv = [
    "workflow-run",
    "task-execute",
    "--args-json",
    argsJson,
    "--real-agents",
    "--default-agent-type",
    agentType,
    "--agent-timeout-ms",
    String(timeoutMs),
    "--json",
  ];
  const env = {
    ...process.env,
    AGENT_WORKFLOW_KIT_DEFAULT_AGENT_TYPE: agentType,
    AGENT_WORKFLOW_KIT_AGENT_TIMEOUT_MS: String(timeoutMs),
  };
  return new Promise((resolve) => {
    const child = spawn(workflowKitCommand(), argv, {
      cwd: worktreePath,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk) => { stdout += chunk; });
    child.stderr?.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => {
      resolve({ issue, status: "errored", pr: "", branch, worktree: worktreePath, blocker: `task-execute child spawn failed: ${error.message}` });
    });
    child.on("close", (code) => {
      if (code !== 0) {
        const evidence = (stderr || stdout).slice(-1600).trim();
        let childRunId = "";
        try {
          const parsed = parseWorkflowJson(stdout);
          childRunId = parsed && parsed.runId ? parsed.runId : "";
        } catch {}
        resolve({ issue, status: "errored", pr: "", branch, worktree: worktreePath, blocker: `task-execute child exit ${code}${evidence ? `: ${evidence}` : ""}`, child_run_id: childRunId });
        return;
      }
      try {
        const parsed = parseWorkflowJson(stdout);
        const output = childTaskOutput(parsed);
        resolve({
          issue,
          status: output.status || "errored",
          pr: output.pr || "",
          branch: output.branch || branch,
          worktree: worktreePath,
          generator_evolution: output.generator_evolution || "n/a",
          blocker: output.blocker || "",
          workflow_defect: output.workflow_defect === true,
          workflow_defect_kind: output.workflow_defect_kind || "",
          child_run_id: parsed.runId || "",
        });
      } catch (error) {
        resolve({ issue, status: "errored", pr: "", branch, worktree: worktreePath, blocker: `task-execute child json parse failed: ${error.message}` });
      }
    });
  });
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await fn(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

// `parallel` MUST be destructured here (RP-11c): default-export workflows receive the runtime
// context as this single parameter on the kit's import() path (saved-workflows.ts calls
// `script(context)`; only Claude-STYLE bodies get the kit's own
// `const { ... parallel ... } = context` preamble). Before this fix the Verify fan-out's bare
// `parallel(...)` was a guaranteed ReferenceError the first time a pass reached it with PRs in scope.
export default async function runMilestoneWave({ args, agent, workflow, pipeline, parallel, phase, log }) {
const {
  createAndCheckoutBranch,
  createIsolatedLaneWorktree,
  initSubmodulesRecursive,
  observedPrRef,
  resolveDefaultBranch,
  restoreDefaultBranch,
  restoreSuffix,
} = loadGitHelpers();
const {
  projectFieldsForSync,
  ghPrCommand,
  isBlockedHarnessUnavailable,
  grillShaMismatch,
  externalFailureKind,
  parseArgs,
} = loadSharedPhaseHelpers();
phase("Scan");
const cfg = parseArgs(typeof args !== "undefined" ? args : undefined);
const selector = cfg.milestone || "active";
// UNCAPPED by default (collision-bounded only): pass through to wave-prioritize, which emits every
// parallel-safe lane (no shared git working tree). The runtime's min(16, cores-2) concurrency backstop
// throttles actual execution + queues the rest. A finite max_lanes is honored ONLY when the caller
// explicitly passes one (deliberate throttle below the collision-safe maximum). No artificial hard cap.
const maxLanes = Number.isFinite(cfg.max_lanes) ? cfg.max_lanes : Infinity;
const dryRun = !!cfg.dry_run;
const autoMerge = !!cfg.auto_merge;
const submoduleJobs = positiveInteger(cfg.submodule_jobs ?? process.env.CURAOS_SUBMODULE_JOBS, 8);
const triageBatchSize = Number.isFinite(Number(cfg.triage_batch_size)) && Number(cfg.triage_batch_size) > 0
  ? Math.floor(Number(cfg.triage_batch_size))
  : 3;
const realAgents = realAgentsEnabled();
const realAgentType = String(process.env.AGENT_WORKFLOW_KIT_DEFAULT_AGENT_TYPE || "codex").trim() || "codex";

if (selector === "active") {
  try {
    const quota = readGraphqlQuotaStatus();
    if (quota.depleted) {
      const reset = quota.resetAt || "the rate-limit reset";
      log(`ACTIVE-SCAN-PREFLIGHT: github-graphql-quota remaining=${quota.remaining} reset=${reset}; skipping active scan`);
      return terminalExternal(
        { milestones: [], needs_user: [] },
        "github-graphql-quota",
        `GitHub GraphQL quota is ${quota.remaining} before active Project scan; retry after ${reset}.`,
      );
    }
  } catch (error) {
    log(`ACTIVE-SCAN-PREFLIGHT: skipped (${error && error.message ? error.message : error})`);
  }
}

// P5c (issue #706): hoist `git submodule update --init --recursive` to wave setup (deterministic
// git via the shared helper, not an agent prompt) so pre-push typecheck hooks pass on uninitialized
// gitlinks instead of being masked with `--no-verify`, then re-check two-level pointer drift via
// `git submodule status --recursive`. Opt-in (cfg.init_submodules === true) so the contract-test
// harnesses (which import + run this executor) never trigger live recursive submodule init; real
// dispatched waves pass it (see the playbook). Never throws: a submodule-less checkout is clean.
if (cfg.init_submodules === true && !dryRun) {
  try {
    const submoduleSetup = initSubmodulesRecursive({ submoduleJobs });
    if (!submoduleSetup.initialized) log(`WAVE-SETUP: submodule init reported an error: ${submoduleSetup.init_error}`);
    if (submoduleSetup.uninitialized.length) log(`WAVE-SETUP: still-uninitialized submodules after --init --recursive: ${submoduleSetup.uninitialized.join(", ")}`);
    if (submoduleSetup.drifted.length) log(`WAVE-SETUP: two-level pointer drift in submodules (checked-out != pinned): ${submoduleSetup.drifted.join(", ")}`);
    if (submoduleSetup.clean) log("WAVE-SETUP: submodules initialized; no two-level pointer drift");
  } catch (e) {
    log(`WAVE-SETUP: submodule init/pointer-drift recheck skipped: ${e && e.message ? e.message : String(e)}`);
  }
}

let deterministicActiveScan = null;
if (selector === "active") {
  deterministicActiveScan = await workflow(
    { scriptPath: `${WF}/milestone-active-scan.workflow.js` },
    { dry_run: dryRun },
  ).catch((error) => {
    const message = error && error.message ? error.message : String(error);
    log(`active-scan fallback unavailable: ${message}`);
    const githubQuotaBlocked = /unknown owner type|(?:graphql|api).*(?:rate limit|quota)|(?:rate limit|quota).*(?:graphql|api)/i.test(message);
    if (githubQuotaBlocked) {
      return {
        milestones: [],
        candidates: [],
        open_prs: [],
        needs_user: [{
          issue: "CuraOS Roadmap",
          kind: "github-graphql-quota",
          what: "Project issue metadata discovery needs GitHub GraphQL quota; retry after rate-limit reset.",
        }],
        project_scan_completed: false,
        blocked_by_external: true,
      };
    }
    const githubTransientBlocked = /github-project-api-transient|\b50[0-9]\b|gateway timeout|service unavailable|upstream|unicorn/i.test(message);
    if (githubTransientBlocked) {
      return {
        milestones: [],
        candidates: [],
        open_prs: [],
        needs_user: [{
          issue: "CuraOS Roadmap",
          kind: "github-project-api-transient",
          what: "Project issue metadata discovery hit a transient GitHub Project/API failure after bounded retries; retry the wave when GitHub responds.",
        }],
        project_scan_completed: false,
        blocked_by_external: true,
      };
    }
    return {
      milestones: [],
      candidates: [],
      open_prs: [],
      needs_user: [{
        issue: "CuraOS Roadmap",
        kind: "workflow-defect",
        what: `milestone-active-scan failed before resolving Project issue metadata: ${message}`,
      }],
      project_scan_completed: false,
      workflow_defect: true,
    };
  });
}

if (selector === "active" && deterministicActiveScan && deterministicActiveScan.project_scan_completed === false) {
  const blockedExternal = deterministicActiveScan.blocked_by_external === true;
  log(`${blockedExternal ? "BLOCKED-BY-EXTERNAL" : "WORKFLOW-DEFECT"}: active scan did not complete; refusing LLM fallback for tracker truth`);
  return {
    milestones: [],
    triaged: { ready: [], not_ready: [] },
    dispatched: [],
    dispatch_order: [],
    foresight: { findings: [], captured: { seeded: [], skipped: [] }, dropped: 0 },
    pre_breakdown: { drafted: [], skipped: [] },
    pr_verdicts: [],
    workspace_ready: [],
    needs_user: deterministicActiveScan.needs_user || [],
    done: false,
    ...(blockedExternal ? { terminal: "blocked-by-external", blocked_by_external: true } : {}),
  };
}

// Phase 1: scan + select. For the active selector, milestone-active-scan is the authoritative
// Project/issue enumerator and the next phase performs per-issue paper-vs-real triage in bounded
// real-agent batches. Do not send the whole active issue universe through one scan agent call.
let scan;
if (selector === "active" && deterministicActiveScan && deterministicActiveScan.project_scan_completed === true) {
  scan = {
    milestones: deterministicActiveScan.milestones || [],
    candidates: deterministicActiveScan.candidates || [],
    needs_user: deterministicActiveScan.needs_user || [],
    open_prs: deterministicActiveScan.open_prs || [],
  };
  log(`SCAN-DETERMINISTIC: active Project scan supplied ${(scan.candidates || []).length} candidates; bounded gh-issue-triage owns paper-vs-real classification`);
} else {
  scan = await agent(
  `Scan one CuraOS version wave for dispatchable work. Work from ${ROOT} (Bash, \`env -u GITHUB_TOKEN gh\`). Read-only - do NOT mutate the tracker or dispatch anything.
LEGACY SELECTOR: "${selector}". "active" means run the Target Version guided all-open org scan from milestone-active-scan. Literal M values are compatibility hints for reports only; never use them as candidate or dispatch gates.
Steps (per the milestone-orchestration-prompt §1-§3):
1. Resolve all open org issues plus their Project Target Version and CuraOS Milestone metadata. List candidate refs.
2. Query issue candidates: open issues in scope, excluding agent-claimed:*/agent-PR-open.
3. Run §3 paper-vs-real blocker triage on each: classify blockers Real-external | Real-user-decision | Real-dependency | Paper-stale | Paper-scope.
4. For each Real-user-decision blocker, check whether a clear recommended option exists (research/analysis prefers one path, or one option is the obvious low-blast-radius default). If YES and the action is reversible and in-scope: auto-apply the recommendation, record it in ai/curaos/docs/adr/AUTO-DECISION-LOG.md (date | context | options | chosen | why | reversible-how) and in the relevant issue as \`(auto-applied per recommendation, 2026-05-29 directive)\`, then treat the issue as unblocked. Do NOT add it to needs_user. If NO recommendation exists (genuine trade-off), or the action is irreversible/destructive/T3-class, or the scope is unapproved: add it to needs_user with kind=Real-user-decision and a brief what. For research-gated unknowns (Acceptance names a library/schema/design the project has not decided and it is not locked in ai/rules): add to needs_user with kind=research-gated - these cannot be auto-applied. See curaos_recommendation_auto_apply_rule.md.
Return: milestones (resolved list), candidates (owner/repo#N that survived triage + are dispatch-eligible), needs_user (each {issue, kind, what}), open_prs (owner/repo#N PRs in scope awaiting verify/merge).`,
  { label: "scan", phase: "Scan", model: CONTRACT.models.plan, schema: {
    type: "object",
    required: ["milestones", "candidates", "needs_user", "open_prs"],
    properties: {
      milestones: { type: "array", items: { type: "string" } },
      candidates: { type: "array", items: { type: "string" } },
      needs_user: { type: "array", items: { type: "object", required: ["issue", "kind", "what"], properties: { issue: { type: "string" }, kind: { type: "string" }, what: { type: "string" } } } },
      open_prs: { type: "array", items: { type: "string" } },
    },
  } }
  );
}

scan.milestones = Array.isArray(scan.milestones) ? scan.milestones.filter(Boolean) : [];
scan.candidates = Array.isArray(scan.candidates) ? scan.candidates.filter(Boolean) : [];
scan.needs_user = Array.isArray(scan.needs_user) ? scan.needs_user.filter(Boolean) : [];
scan.open_prs = Array.isArray(scan.open_prs) ? scan.open_prs.filter(Boolean) : [];

if (deterministicActiveScan && Array.isArray(deterministicActiveScan.milestones) && deterministicActiveScan.milestones.length > 0) {
  if (scan.milestones.length === 0) scan.milestones = deterministicActiveScan.milestones.filter(Boolean);
  if (Array.isArray(deterministicActiveScan.candidates)) {
    scan.candidates = [...new Set([...deterministicActiveScan.candidates.filter(Boolean), ...scan.candidates.filter(Boolean)])].sort();
  }
  if (Array.isArray(deterministicActiveScan.open_prs)) {
    scan.open_prs = [...new Set([...deterministicActiveScan.open_prs.filter(Boolean), ...scan.open_prs.filter(Boolean)])].sort();
  }
}

// THROUGHPUT-MAXIMIZER (user directive 2026-06-08): the deterministic scan emits every open
// issue as a candidate so §3 paper-vs-real triage can classify the whole tracker box and §4
// partition can fill EVERY free working tree:
//   - paper_blocked_candidates: carry the `blocked` label, but label != disposition; triage reads
//     frontmatter blocked-by + body to promote any mislabel (blocked-by:[] + "ready"/"(A)") = #407 class
//   - promotable_foresight: legacy output from older selector-scoped scans; dependency-cleared now
//     surfaces foresight whose named blockers are actually closed
const pickArr = (k) => (deterministicActiveScan && Array.isArray(deterministicActiveScan[k]) ? deterministicActiveScan[k].filter(Boolean) : []);
scan.paper_blocked_candidates = pickArr("paper_blocked_candidates");
scan.promotable_foresight = pickArr("promotable_foresight");
// dependency_cleared: foresight/blocked non-active issues whose every named blocked-by ref is now CLOSED
// (a merged PR opened the gate, e.g. M16 #538 -> M17-S2 #545). The label-only scan misses these because the
// downstream story may still carry foresight/Backlog until triage promotes it; the scan reads the body
// to detect the cleared dependency. Without this, a just-unblocked story sits invisible (user directive
// 2026-06-08: ALWAYS auto-pick all unblockable work; do not hand-notice a cleared gate).
scan.dependency_cleared = pickArr("dependency_cleared");
// generator_inflight (RP-04): the deterministic scan's in-flight generator/SDK barrier flag -
// owner/repo#N of the claimed or PR-open codegen/SDK/contracts lane, "" when clear. Consumed by the
// Prioritize-phase applyGeneratorBarrier filter so generated-scope candidates never reach dispatch
// lanes while the mold fix is in-flight.
scan.generator_inflight = deterministicActiveScan && deterministicActiveScan.generator_inflight
  ? String(deterministicActiveScan.generator_inflight)
  : "";
scan.open_issue_count = deterministicActiveScan && Number.isFinite(Number(deterministicActiveScan.open_issue_count))
  ? Number(deterministicActiveScan.open_issue_count)
  : undefined;
scan.runtime_held_candidates = pickArr("runtime_held_candidates");
// triage_pool = everything §3 must examine for dispatchability (deduped, claimed/PR-open already excluded
// by the scan). The active ready set keeps leverage priority; the rest fill free lanes after paper-vs-real
// triage + working-tree partition. The pool is what the triage/prioritize phases iterate, NOT scan.candidates
// alone (using scan.candidates alone is the under-scan that left older-milestone + mislabelled work un-picked).
const rawTriagePool = [...new Set([
  ...scan.candidates,
  ...scan.paper_blocked_candidates,
  ...scan.promotable_foresight,
  ...scan.dependency_cleared,
])].sort();
scan.malformed_tracker_refs = rawTriagePool.filter((issue) => !validIssueRef(issue));
scan.triage_pool = rawTriagePool.filter(validIssueRef);

if (scan.milestones.length === 0) {
  if (selector === "active" && deterministicActiveScan && deterministicActiveScan.blocked_by_external === true) {
    return {
      milestones: [],
      triaged: { ready: [], not_ready: [] },
      dispatched: [],
      dispatch_order: [],
      foresight: { findings: [], captured: { seeded: [], skipped: [] }, dropped: 0 },
      pre_breakdown: { drafted: [], skipped: [] },
      pr_verdicts: [],
      workspace_ready: [],
      needs_user: deterministicActiveScan.needs_user || [],
      done: false,
      terminal: "blocked-by-external",
      blocked_by_external: true,
    };
  }
  if ((scan.triage_pool || []).length || scan.open_prs.length || scan.needs_user.length) {
    log("NO-MILESTONE-METADATA: continuing because issue candidates or PRs exist; milestone is metadata, not a dispatch gate.");
  } else if (selector === "active" && deterministicActiveScan && deterministicActiveScan.project_scan_completed === true) {
    log("NO-OPEN-ISSUE-WORK: Project scan completed and found no open issue candidates or PRs.");
    return {
      milestones: [],
      triaged: { ready: [], not_ready: [] },
      dispatched: [],
      dispatch_order: [],
      foresight: { findings: [], captured: { seeded: [], skipped: [] }, dropped: 0 },
      pre_breakdown: { drafted: [], skipped: [] },
      pr_verdicts: [],
      workspace_ready: [],
      needs_user: [],
      done: true,
    };
  } else {
    const what = `milestone-wave scan resolved zero issue candidates for selector "${selector}". This is a workflow-defect, not a terminal milestone state; fix Project issue discovery or continue the playbook natively from the scan gate.`;
    scan.needs_user = [
      { issue: "CuraOS Roadmap", kind: "workflow-defect", what },
      ...scan.needs_user,
    ];
    scan.candidates = [];
    scan.open_prs = [];
    log(`WORKFLOW-DEFECT: ${what}`);
    return {
      milestones: scan.milestones,
      triaged: { ready: [], not_ready: [] },
      dispatched: [],
      dispatch_order: [],
      foresight: { findings: [], captured: { seeded: [], skipped: [] }, dropped: 0 },
      pre_breakdown: { drafted: [], skipped: [] },
      pr_verdicts: [],
      workspace_ready: [],
      needs_user: scan.needs_user,
      done: false,
    };
  }
}

log(`Wave all-issues${scan.milestones.length ? ` (${scan.milestones.join(",")})` : ""}: ${scan.candidates.length} issue candidates + ${(scan.paper_blocked_candidates||[]).length} paper-blocked + ${(scan.dependency_cleared||[]).length} dependency-cleared = ${(scan.triage_pool||scan.candidates).length} triage_pool, ${scan.needs_user.length} need-user, ${scan.open_prs.length} open PRs`);

let projectCache = { path: "", items: [], unavailable_kind: "" };
if ((scan.triage_pool || scan.candidates || []).length) {
  try {
    projectCache = projectItemsCache();
  } catch (error) {
    const message = errorText(error);
    const kind = externalFailureKind(message);
    if (kind) {
      log(`PROJECT-CACHE-DEGRADED: unable to read CuraOS Roadmap Project items before triage: ${kind}; continuing triage without Project metadata sync`);
      projectCache = { path: "", items: [], unavailable_kind: kind };
    } else {
      throw error;
    }
  }
}

// MILESTONE-FIELD HYGIENE (curaos-ai-workspace#321): the custom `CuraOS Milestone` field remains
// roadmap grouping metadata and should be backfilled, but it is not a dispatch gate. A field-less
// item is reported here so the orchestrator can run the converger later without starving ready work.
const unsetMilestoneField = (projectCache.items || [])
  .filter((item) => !item || item["curaOS Milestone"] === undefined || item["curaOS Milestone"] === null || item["curaOS Milestone"] === "")
  .map(projectItemRef)
  .filter(Boolean);
if (unsetMilestoneField.length) {
  const sample = unsetMilestoneField.slice(0, 25);
  const suffix = unsetMilestoneField.length > sample.length ? `, ... ${unsetMilestoneField.length - sample.length} more` : "";
  log(`§321-FIELD-NOTE: ${unsetMilestoneField.length} board item(s) have an unset CuraOS Milestone field; milestone metadata should be backfilled, but it is not a dispatch gate. Sample: ${sample.join(", ")}${suffix}`);
}

// Phase 2: triage gate over candidates (INLINED pm-triage-gate body - its composes are gh-* ATOMICS,
// reached here 1-level deep, which is legal; nesting it as a workflow() would make the wave 2 levels).
// KEEP IN SYNC with pm-triage-gate.workflow.js - the two must thread fields and evaluate readiness identically.
phase("Triage");
// Triage the FULL parallelizable pool (all open issues plus dependency-cleared work), not just
// historical ready labels. Using scan.candidates alone left the new buckets as dead data
// (workflow-defect #562): they never reached triage/dispatch, and a wave with only those buckets falsely
// reported done:true. triage_pool is the deduped union built upstream.
const triageInput = Array.isArray(scan.triage_pool) && scan.triage_pool.length ? scan.triage_pool : scan.candidates;
// RP-36: queued aliased batch reads for the triage pool (<=2 GraphQL calls per 100 issues)
// replace 3 reads per issue (deterministic view + parent probe + mandated agent re-read). The
// records also feed the RP-39 prompt prefetch threading downstream (breakdown assess body +
// tdd-implement issue_body), so the agent legs issue no enumeration calls of their own. Read one
// queued triage batch at a time so quota exhaustion stops the next batch before spawning doomed
// child agents for every remaining issue.
let prefetched = new Map();
function prefetchTriageBatch(batch) {
  const { createRequire } = process.getBuiltinModule("node:module");
  const ghProjectLib = createRequire(import.meta.url)("../lib/gh-project.js");
  return ghProjectLib.batchIssueRead(
    batch.map((ref) => { const [repo, n] = String(ref).split("#"); return { repo, number: Number(n) }; }),
  );
}
let triaged = { ready: [], not_ready: [] };
let readyCandidateContext = new Map();
let pendingTrackerBarrier = false;
const isDispatchableTriage = (triage) =>
  triage && triage.state_label === "ready-for-agent" && triage.blocker_kind !== "real";
if (triageInput.length) {
  if (triageInput.length > triageBatchSize) log(`TRIAGE-BATCH: processing ${triageInput.length} candidates in batches of ${triageBatchSize}`);
  const triageStage = (issue) => workflow({ scriptPath: `${WF}/gh-issue-triage.workflow.js` }, { issue, dry_run: dryRun, ...(prefetched.has(issue) ? { prefetch: prefetched.get(issue) } : {}) })
    .then((t) => ({ issue, triage: t }))
    .catch((error) => {
      const message = errorText(error);
      const kind = externalFailureKind(message) || agentRuntimeFailureKind(message) || "triage-workflow-failed";
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
    });
  // Thread the triage-derived project_fields into Project sync only for rows that can dispatch.
  // Non-dispatchable rows keep their REST-applied issue label state and are reported in not_ready;
  // spending GraphQL on Project mutations for them can starve the actual ready lanes.
  const syncStage = (prev) => {
    if (prev.triage && prev.triage.blocked_by_external) {
      return { ...prev, sync: { item_id: "", skipped: "triage-blocked", milestone: "NONE" } };
    }
    if (!isDispatchableTriage(prev.triage)) {
      return { ...prev, sync: { item_id: "", skipped: "non-dispatchable-triage", milestone: "NONE" } };
    }
    if (projectCache.unavailable_kind) {
      return { ...prev, sync: { item_id: "", skipped: "project-cache-unavailable", error_kind: projectCache.unavailable_kind, milestone: "NONE" } };
    }
    return workflow({ scriptPath: `${WF}/gh-project-sync.workflow.js` }, {
      issue: prev.issue,
      fields: JSON.stringify(projectFieldsForSync(prev.triage)),
      project_items_cache: projectCache.path,
      dry_run: dryRun,
    })
      .then((s) => ({ ...prev, sync: s }))
      .catch((error) => {
        const message = errorText(error);
        const kind = externalFailureKind(message) || "workflow-defect";
        return { ...prev, sync: { item_id: "", blocked_by_external: !!externalFailureKind(message), error_kind: kind, error: message } };
      });
  };
  // Wire only dispatchable candidates UNDER their triage-derived parent
  // (candidate=child, frontmatter parent=parent).
  const wireStage = (prev) => {
    if (!isDispatchableTriage(prev.triage)) return { ...prev, wire: { skipped: "non-dispatchable-triage" } };
    const parentRef = prev.triage && prev.triage.parent_ref ? String(prev.triage.parent_ref).trim() : "";
    if (!parentRef) return { ...prev, wire: { skipped: "no parent_ref to wire under" } };
    return workflow({ scriptPath: `${WF}/gh-subissue-wire.workflow.js` }, { parent: parentRef, children: JSON.stringify([prev.issue]), dry_run: dryRun })
      .then((w) => ({ ...prev, wire: w }))
      .catch((e) => ({ ...prev, wire: { skipped: `wire failed: ${e && e.message ? e.message : e}` } }));
  };
  const curated = [];
  const launchedTriageInput = [];
  const quotaDeferred = [];
  const runtimeDeferred = [];
  for (let batchStart = 0; batchStart < triageInput.length; batchStart += triageBatchSize) {
    const batch = triageInput.slice(batchStart, batchStart + triageBatchSize);
    if (realAgents) {
      const runtimeStatus = readAgentRuntimeStatus(realAgentType);
      if (runtimeStatus.blocked) {
        const remaining = triageInput.slice(batchStart);
        const reset = runtimeStatus.reset_at ? ` reset=${runtimeStatus.reset_at}` : "";
        log(`TRIAGE-RUNTIME-PREFLIGHT: ${runtimeStatus.kind || "agent-runtime-quota"} source=${runtimeStatus.source || "unknown"}${reset}; holding ${remaining.length} candidate(s) before launching real-agent triage`);
        return terminalExternal(
          scan,
          runtimeStatus.kind || "agent-runtime-quota",
          `${realAgentType} triage runtime is unavailable before launching the next triage batch (${runtimeStatus.reason || "quota or credits unavailable"}). Use an explicit same-tier alternate harness or retry after recovery.`,
          { triaged: { ready: [], not_ready: quotaDeferredRows(remaining, runtimeStatus.kind || "agent-runtime-quota") } },
        );
      }
    }
    try {
      const quota = readGraphqlQuotaStatus();
      if (quota.depleted) {
        const remaining = triageInput.slice(batchStart);
        log(`TRIAGE-QUOTA-DEFERRED: github-graphql-quota remaining=${quota.remaining} reset=${quota.resetAt || "unknown"}; holding ${remaining.length} candidate(s) before launching next triage batch`);
        quotaDeferred.push(...quotaDeferredRows(remaining));
        break;
      }
    } catch (error) {
      log(`TRIAGE-QUOTA-PREFLIGHT: skipped (${error && error.message ? error.message : error})`);
    }
    try {
      const batchPrefetch = prefetchTriageBatch(batch);
      for (const [issue, record] of batchPrefetch) prefetched.set(issue, record);
    } catch (error) {
      const message = errorText(error);
      if (isGraphqlQuotaText(message)) {
        const remaining = triageInput.slice(batchStart);
        log(`TRIAGE-QUOTA-DEFERRED: batch prefetch hit github-graphql-quota; holding ${remaining.length} candidate(s) before spawning per-issue readers`);
        quotaDeferred.push(...quotaDeferredRows(remaining));
        break;
      }
      // Degrade to per-issue reads inside gh-issue-triage (its deterministic prefetch remains).
      log(`RP-36 batch prefetch degraded to per-issue reads for ${batch.length} candidate(s): ${message}`);
    }
    launchedTriageInput.push(...batch);
    const batchCurated = await pipeline(batch, triageStage, syncStage, wireStage);
    curated.push(...(Array.isArray(batchCurated) ? batchCurated : []));
    const runtimeUnavailableRows = curated
      .filter((c) => c && c.triage && c.triage.blocked_by_external && isRuntimeUnavailableKind(c.triage.error_kind))
      .map((c) => ({ issue: c.issue, missing: c.triage.error_kind || "agent-runtime-unavailable" }));
    const unavailableLimit = triageRuntimeUnavailableLimit(triageInput.length);
    if (runtimeUnavailableRows.length > unavailableLimit) {
      const remaining = triageInput.slice(batchStart + batch.length);
      if (remaining.length) {
        log(`TRIAGE-RUNTIME-UNAVAILABLE: ${runtimeUnavailableRows.length} runtime-unavailable triage failure(s) exceeded limit ${unavailableLimit}; holding ${remaining.length} remaining candidate(s) before launching more doomed child agents`);
        runtimeDeferred.push(...quotaDeferredRows(remaining, "agent-runtime-unavailable"));
      }
      break;
    }
    const quotaHit = (Array.isArray(batchCurated) ? batchCurated : []).some((c) =>
      c && (
        (c.triage && c.triage.blocked_by_external && isGraphqlQuotaKind(c.triage.error_kind)) ||
        (c.sync && c.sync.blocked_by_external && isGraphqlQuotaKind(c.sync.error_kind)) ||
        (c.wire && c.wire.blocked_by_external && isGraphqlQuotaKind(c.wire.error_kind))
      ));
    if (quotaHit) {
      const remaining = triageInput.slice(batchStart + batch.length);
      if (remaining.length) {
        log(`TRIAGE-QUOTA-DEFERRED: github-graphql-quota hit inside batch; holding ${remaining.length} remaining candidate(s) instead of launching doomed triage readers`);
        quotaDeferred.push(...quotaDeferredRows(remaining));
      }
      break;
    }
  }
  const doneCurated = curated.filter(Boolean);
  const droppedTriage = droppedPipelineRows(launchedTriageInput, curated, "triage-pipeline-dropped");
  if (droppedTriage.length) {
    log(`BLOCKED-BY-EXTERNAL: ${droppedTriage.length} candidate(s) dropped during triage pipeline; refusing partial all-open issue accounting`);
    return terminalExternal(scan, "agent-triage-pipeline-dropped", "Issue triage dropped candidate rows during the real-agent pipeline, usually because the provider rate-limited or a child workflow failed; rerun after provider recovery and lower triage_batch_size only if needed.", {
      triaged: { ready: [], not_ready: droppedTriage },
    });
  }
  const triageExternal = doneCurated
    .filter((c) => c.triage && c.triage.blocked_by_external)
    .map((c) => ({ issue: c.issue, missing: c.triage.error_kind || "triage-blocked" }));
  if (triageExternal.length) {
    const terminalTriageExternal = triageExternal.filter((row) => isTerminalTriageExternal(row.missing));
    const runtimeUnavailableExternal = triageExternal.filter((row) => isRuntimeUnavailableKind(row.missing));
    const unavailableLimit = triageRuntimeUnavailableLimit(triageInput.length);
    if (runtimeUnavailableExternal.length > unavailableLimit) {
      log(`BLOCKED-BY-EXTERNAL: ${runtimeUnavailableExternal.length} candidate(s) could not be triaged due to agent-runtime-unavailable, exceeding fail-fast limit ${unavailableLimit}`);
      return terminalExternal(scan, "agent-runtime-unavailable", "Issue triage runtime is repeatedly unavailable; stop launching child agents and retry after runtime recovery or an explicit same-tier alternate harness selection.", {
        triaged: { ready: [], not_ready: [...runtimeUnavailableExternal, ...runtimeDeferred] },
      });
    }
    if (terminalTriageExternal.length) {
      const agentQuotaExternal = terminalTriageExternal.filter((row) => !isGraphqlQuotaKind(row.missing));
      const githubQuotaExternal = terminalTriageExternal.filter((row) => isGraphqlQuotaKind(row.missing));
      if (agentQuotaExternal.length) {
        const externalKinds = [...new Set(agentQuotaExternal.map((row) => row.missing).filter(Boolean))];
        const externalKind = externalKinds.length === 1 ? externalKinds[0] : "github-issue-triage-external";
        log(`BLOCKED-BY-EXTERNAL: ${agentQuotaExternal.length} candidate(s) could not be triaged due to ${externalKind}`);
        return terminalExternal(scan, externalKind, "Issue triage failed for candidate issues; retry after the external triage dependency recovers.", {
          triaged: { ready: [], not_ready: agentQuotaExternal },
        });
      }
      if (githubQuotaExternal.length) {
        log(`TRIAGE-QUOTA-DEGRADED: ${githubQuotaExternal.length} candidate(s) held in not_ready after GitHub GraphQL quota exhaustion; completed ready rows remain dispatchable`);
      }
    }
    log(`TRIAGE-DEGRADED: ${triageExternal.length} candidate(s) held in not_ready after per-candidate triage failure; the rest of the ready set stays dispatchable`);
  }
  // RP-12 SYNC-DEGRADATION SECTION (KEEP IN SYNC with pm-triage-gate.workflow.js): per-candidate
  // Project sync failures, including GraphQL quota exhaustion after some rows already completed,
  // degrade ONLY the affected candidate into not_ready (via isReady below); the surviving ready set
  // stays dispatchable and the pass runs on.
  const syncQuota = doneCurated
    .filter((c) => c.sync && c.sync.blocked_by_external && c.sync.error_kind === "github-graphql-quota");
  if (syncQuota.length) {
    const syncExternal = doneCurated
      .filter((c) => c.sync && c.sync.blocked_by_external)
      .map((c) => ({ issue: c.issue, missing: c.sync.error_kind || "project-sync-blocked" }));
    log(`SYNC-QUOTA-DEGRADED: GitHub GraphQL quota exhausted while syncing ${syncExternal.length} candidate(s) to the Project; completed ready rows remain dispatchable`);
  }
  const syncDegraded = doneCurated.filter((c) => c.sync && c.sync.blocked_by_external);
  if (syncDegraded.length) {
    log(`SYNC-DEGRADED: ${syncDegraded.length} candidate(s) held in not_ready after Project-sync failure; the rest of the ready set stays dispatchable`);
  }
  const wireQuota = doneCurated
    .filter((c) => c.wire && c.wire.blocked_by_external && c.wire.error_kind === "github-graphql-quota");
  if (wireQuota.length) {
    const wireExternal = doneCurated
      .filter((c) => c.wire && c.wire.blocked_by_external)
      .map((c) => ({ issue: c.issue, missing: c.wire.error_kind || "subissue-wire-blocked" }));
    log(`WIRE-QUOTA-DEGRADED: GitHub GraphQL quota exhausted while wiring ${wireExternal.length} candidate(s) into the native issue tree; completed ready rows remain dispatchable`);
  }
  const wireDegraded = doneCurated.filter((c) => c.wire && c.wire.blocked_by_external);
  if (wireDegraded.length) {
    log(`WIRE-DEGRADED: ${wireDegraded.length} candidate(s) held in not_ready after a transient native issue-tree wiring failure; the rest of the ready set stays dispatchable`);
  }
  // treeLinked: the candidate must be WIRED into the project task tree (a native sub-issue under its
  // parent Epic/Story) before it can dispatch, unless GitHub's native sub-issue max-depth validation
  // rejected the edge and gh-subissue-wire recorded that explicit exception. A genuine root issue (no
  // parent) escapes only via an explicit triage.is_root flag; a silent "no parent_ref"/failed wire =
  // NOT ready (surfaced as missing=subissue-unwired, not dispatched untreed). Mirror of
  // pm-triage-gate.treeLinked - KEEP IN SYNC.
  const treeLinked = (c) => {
    if (c.triage && c.triage.is_root === true) return true; // genuine root: no parent edge required
    const w = c.wire;
    if (!w) return false;
    if (w.skipped) return false;
    const added = Array.isArray(w.subissues_added) ? w.subissues_added : [];
    const depthLimited = Array.isArray(w.subissues_depth_limited) ? w.subissues_depth_limited : [];
    const already = Array.isArray(w.already_wired) ? w.already_wired : (w.already_linked ? [w.already_linked] : []);
    return (added.length > 0) || (depthLimited.length > 0) || (already.length > 0) || w.linked === true || w.already_linked === true;
  };
  // READY iff dispatchable state + no real blocker + sync not externally degraded (RP-12) + wired
  // into the tree. CuraOS Milestone is metadata, not a dispatch gate.
  const isReady = (c) => c.triage && c.triage.state_label === "ready-for-agent" && c.triage.blocker_kind !== "real" && !(c.sync && c.sync.blocked_by_external) && treeLinked(c);
  const prioritizeCandidate = (c) => {
    const fields = (c.triage && c.triage.project_fields) || {};
    return Object.fromEntries(Object.entries({
      ref: c.issue,
      priority: fields.Priority,
      effort: fields.Effort,
      module: fields.Module,
      owned_path: fields["Owned Path"] || fields.owned_path || fields.ownedPath,
    }).filter(([, value]) => value !== undefined && value !== null && value !== ""));
  };
  const ready = doneCurated.filter(isReady).map((c) => c.issue);
  readyCandidateContext = new Map(doneCurated.filter(isReady).map((c) => [c.issue, prioritizeCandidate(c)]));
  const markerSuffix = (triage) => {
    const markers = [
      triage && triage.has_foresight_marker ? "foresight" : "",
      triage && triage.has_blocked_marker ? "blocked" : "",
    ].filter(Boolean);
    return markers.length ? `, markers=${markers.join("+")}` : "";
  };
  const not_ready = [
    ...doneCurated
      .filter((c) => !isReady(c))
      .map((c) => ({
        issue: c.issue,
        missing: !c.triage
          ? "triage failed"
          : c.triage.blocked_by_external
            ? (c.triage.error_kind || "triage-blocked")
          : (c.triage.state_label !== "ready-for-agent" || c.triage.blocker_kind === "real")
            ? `state=${c.triage.state_label}, blocker=${c.triage.blocker_kind}${markerSuffix(c.triage)}`
            : (c.sync && c.sync.blocked_by_external)
              ? (c.sync.error_kind || "project-sync-blocked")
              : (c.wire && c.wire.blocked_by_external)
                ? (c.wire.error_kind || "subissue-wire-blocked")
              : "subissue-unwired",
      })),
    ...quotaDeferred,
    ...runtimeDeferred,
  ];
  const triageNeedsUser = doneCurated
    .filter((c) => c.triage && c.triage.state_label === "ready-for-human")
    .map((c) => ({
      issue: c.issue,
      kind: "Real-user-decision",
      what: c.triage.rationale || "Issue is labeled ready-for-human and requires an operator decision before dispatch.",
    }));
  if (triageNeedsUser.length) {
    const seenNeedsUser = new Set((scan.needs_user || []).map((row) => row && row.issue).filter(Boolean));
    for (const row of triageNeedsUser) {
      if (!seenNeedsUser.has(row.issue)) {
        scan.needs_user.push(row);
        seenNeedsUser.add(row.issue);
      }
    }
  }
  log(`Triaged ${doneCurated.length}: ${ready.length} ready, ${not_ready.length} not-ready`);
  if (!dryRun) {
    await workflow({ scriptPath: `${WF}/gh-roadmap-mirror.workflow.js` }, { dry_run: false, refresh: true });
  }
  triaged = { ready, not_ready };
  const preDispatchPendingTrackerWork = pendingTrackerWorkFrom(scan, triaged);
  const blockingPendingTrackerWork = preDispatchPendingTrackerWork.filter(pendingTrackerBlocksDispatch);
  pendingTrackerBarrier = blockingPendingTrackerWork.length > 0;
  if (pendingTrackerBarrier) {
    log(`PENDING-TRACKER-BARRIER: holding ${ready.length} ready lane(s) until ${blockingPendingTrackerWork.length}/${preDispatchPendingTrackerWork.length} drainable pending tracker row(s) are handled`);
  }
}

// Phase 3: breakdown any ready candidate that isn't grab-able (INLINED breakdown body - one split level;
// gh-subissue-wire is an ATOMIC reached 1-level deep). Orchestrator re-invokes on children next pass.
phase("Breakdown");
let readyLeaves = [];
for (const issue of (pendingTrackerBarrier ? [] : (triaged.ready || []))) {
  // RP-39 prefetch threading (KEEP IN SYNC with breakdown.workflow.js assess prompt): the RP-36
  // batch record's body is injected marked AUTHORITATIVE; one comments spot-check stays
  // permitted, not mandated. Absent record => the mandated read fallback.
  const prefetchedRecord = prefetched.has(issue) ? prefetched.get(issue) : null;
  let existingChildren;
  try {
    existingChildren = existingOpenSubIssueRefs(issue, prefetchedRecord);
  } catch (error) {
    const message = errorText(error);
    log(`BREAKDOWN-DEGRADED: existing child check failed for ${issue}: ${message}; holding original issue in not_ready with route breakdown-child-check-retry`);
    triaged.not_ready = [
      ...(triaged.not_ready || []),
      { issue, missing: `breakdown-child-check-retry: ${message}` },
    ];
    continue;
  }
  if (existingChildren.length) {
    const sample = existingChildren.slice(0, 12);
    const suffix = existingChildren.length > sample.length ? `, ... ${existingChildren.length - sample.length} more` : "";
    log(`BREAKDOWN-IDEMPOTENT: ${issue} already has ${existingChildren.length} open child issue(s): ${sample.join(", ")}${suffix}; holding parent out of split/dispatch`);
    triaged.not_ready = [
      ...(triaged.not_ready || []),
      { issue, missing: `breakdown-existing-children: ${existingChildren.join(",")}` },
    ];
    continue;
  }
  const assessBody = prefetchedRecord && prefetchedRecord.body ? String(prefetchedRecord.body) : "";
  let assess;
  try {
    assess = await agent(
      `Assess whether CuraOS issue ${issue} is a single GRAB-ABLE atomic unit a worker can implement in one go. ${assessBody ? `The issue BODY below was prefetched deterministically and is AUTHORITATIVE - do NOT re-fetch it (no \`gh issue view\` for the body). You MAY run ONE spot-check read of the comments (\`env -u GITHUB_TOKEN gh issue view ${issue} --comments\`) ONLY when the body references discussion you need (permitted, not mandated).\nPREFETCHED ISSUE BODY (authoritative):\n"""\n${assessBody}\n"""` : `Read it: \`gh issue view ${issue} --comments\` (Bash; use \`env -u GITHUB_TOKEN gh\`). Read its body + scope.`}\nGrab-able test (ALL must hold): one owned-path root (single submodule/module) · one acceptance-criterion cluster · effort <= L · no internal parallelism · scope does not span multiple "and"-joined deliverables.\nReturn: grabable (bool) + reasoning + (if not grab-able) a proposed decomposition into vertical tracer-bullet slices (each a child issue title + scope + the owned-path root + acceptance), per the to-issues skill discipline. Read-only - create nothing.`,
      { label: "assess", phase: "Breakdown", model: CONTRACT.models.plan, schema: {
        type: "object", required: ["grabable"], properties: {
          grabable: { type: "boolean" },
          reasoning: { type: "string" },
          proposed_children: { type: "array", items: { type: "object", required: ["title", "scope", "owned_path", "acceptance"], properties: {
            title: { type: "string" }, scope: { type: "string" }, owned_path: { type: "string" }, acceptance: { type: "string" } } } },
        } } }
    );
  } catch (error) {
    const message = errorText(error);
    if (!/timed out/i.test(message)) throw error;
    log(`Breakdown assessor timed out for ${issue}: ${message}; keeping original issue as a ready leaf`);
    readyLeaves.push(issue);
    continue;
  }
  if (assess.grabable) { readyLeaves.push(issue); continue; }
  const children = assess.proposed_children || [];
  if (!children.length) {
    // Invalid assessor output: a ready issue cannot vanish just because the model claimed "too large"
    // without a concrete decomposition. Keep it dispatchable and let context-load / tdd-implement gates
    // block with real evidence if the task is actually too broad.
    log(`Breakdown assessor was inconclusive for ${issue}: grabable=false but proposed_children=[]; keeping original issue as a ready leaf`);
    readyLeaves.push(issue);
    continue;
  }
  let split;
  try {
    split = await agent(
      `${dryRun ? "DRY RUN - propose the tree, create NOTHING." : "Create the child issues for the decomposition of " + issue + "."} Work from ${ROOT} with \`env -u GITHUB_TOKEN gh\`.\nParent: ${issue}. Proposed children (JSON):\n${JSON.stringify(children, null, 2)}\n${dryRun ? "" : `For each child: gh issue create in the correct repo (per docs/agents/issue-tracker.md repo-selection) with canonical CuraOS frontmatter including type, target-version, module, milestone, priority, effort, parent: "${issue}", requires, blocked-by, agent-notes. Also include a ## Parent section containing ${issue}, plus ## Scope/## Do not touch/## Acceptance/## Verification/## Docs/## Blockers. Determine child type from the roadmap hierarchy: Epic children are Stories; Story children are Tasks; Task splits stay Tasks unless the issue is a Bug or Spike. Idempotent: if a child with the same title already exists under the parent, reuse it rather than duplicating. Do NOT wire edges here.`}\nFor EACH child re-apply the grab-ability test. Return: created (refs created/reused; empty if dry_run), leaves (children that ARE grab-able), needs_recursion (children still too large).`,
      { label: "split", phase: "Breakdown", model: CONTRACT.models.plan, schema: {
        type: "object", required: ["created", "leaves", "needs_recursion"], properties: {
          created: { type: "array", items: { type: "string" } },
          leaves: { type: "array", items: { type: "string" } },
          needs_recursion: { type: "array", items: { type: "string" } },
        } } }
    );
  } catch (error) {
    const message = errorText(error);
    if (!/timed out|agent-runtime-unavailable/i.test(message)) throw error;
    log(`BREAKDOWN-DEGRADED: split failed for ${issue}: ${message}; holding original issue in not_ready with route breakdown-retry`);
    triaged.not_ready = [
      ...(triaged.not_ready || []),
      { issue, missing: `breakdown-retry: split failed (${message})` },
    ];
    continue;
  }
  const allChildren = [...(split.leaves || []), ...(split.needs_recursion || [])];
  if (!dryRun && allChildren.length) {
    let splitWire;
    try {
      splitWire = await workflow({ scriptPath: `${WF}/gh-subissue-wire.workflow.js` }, { parent: issue, children: JSON.stringify(allChildren), dry_run: false });
    } catch (error) {
      const message = errorText(error);
      if (!isSubissueDepthLimit(message)) throw error;
      log(`WIRE-DEPTH-LIMIT: native subissue wiring hit GitHub max depth for breakdown children of ${issue}; continuing with ${allChildren.length} child lane(s)`);
      splitWire = {
        subissues_added: [],
        subissues_depth_limited: allChildren,
        deps_added: [],
        already_wired: [],
        reparented: [],
        blocked_by_external: false,
        error_kind: "github-subissue-depth-limit",
        error: message,
      };
    }
    if (splitWire && splitWire.blocked_by_external) {
      const kind = splitWire.error_kind || "subissue-wire-blocked";
      const detail = splitWire.error ? `: ${splitWire.error}` : "";
      log(`BLOCKED-BY-EXTERNAL: native subissue wiring failed for breakdown children of ${issue}: ${kind}`);
      return terminalExternal(scan, "github-subissue-wire-external", `Native subissue wiring failed for breakdown children of ${issue}; retry after GitHub Issue/GraphQL API quota recovers${detail}`, {
        triaged,
        dispatch_order: [],
        dispatched: [],
      });
    }
  }
  readyLeaves.push(...(split.leaves || []));
}

// Phase 3.5: PRE-BREAKDOWN TRIGGER (RP-48). A dependency_cleared issue whose triage did NOT
// promote it into the ready set may still be an Epic/Story that needs decomposition before workers
// can grab it. Drafting its story set NOW means the next §3.4 pass can promote relevant, complete,
// unblocked children instead of commissioning a prep session (the session-28 M15/M12 cost, twice).
// The draft is filed through foresight-capture as staged foresight work with Project metadata.
// Sized from calibration throughput (RP-47 sizing signal).
// Fail-soft: a drafting failure never fails the wave.
let preBreakdown = { drafted: [], skipped: [] };
const clearedUnpromoted = clearedUnpromotedRefs(scan.dependency_cleared, [...readyLeaves, ...(triaged.ready || [])]);
if (clearedUnpromoted.length) {
  try {
    let sizing = null;
    try {
      sizing = loadCalibration().analyze().sizing || null;
    } catch { sizing = null; } // advisory throughput input only
    const draftCap = draftCapFromSizing(sizing, 8);
    for (const ref of clearedUnpromoted.slice(0, draftCap)) {
      const draft = await agent(
        `PRE-BREAKDOWN TRIGGER (RP-48): CuraOS issue ${ref} is a foresight/blocked issue whose LAST blocked-by just closed (dependency_cleared) and it is NOT in this wave's active ready set. READ-ONLY - create NOTHING, label NOTHING. Read it: \`env -u GITHUB_TOKEN gh issue view ${ref} --comments\` (Bash, from ${ROOT}).\nIf it is an Epic/Story-level item that needs decomposition before workers could grab it, DRAFT the story set now so a later §3.4 pass can promote relevant, complete, unblocked children: propose vertical tracer-bullet child stories per the to-issues discipline, each {title, scope, owned_path, acceptance}. If it is already a grab-able atomic unit (or not an Epic/Story), return proposed_children: [] with reasoning. Also return milestone (the issue's milestone metadata) when known. This draft is staged as foresight work; the marker must not be used as a parking reason once a child is relevant and ready.`,
        { label: `pre-breakdown:${ref}`, phase: "Breakdown", model: CONTRACT.models.plan, schema: {
          type: "object", required: ["proposed_children"], properties: {
            reasoning: { type: "string" },
            milestone: { type: "string" },
            proposed_children: { type: "array", items: { type: "object", required: ["title", "scope", "owned_path", "acceptance"], properties: {
              title: { type: "string" }, scope: { type: "string" }, owned_path: { type: "string" }, acceptance: { type: "string" } } } },
          } } }
      );
      const children = Array.isArray(draft.proposed_children) ? draft.proposed_children.filter(Boolean) : [];
      if (!children.length) {
        preBreakdown.skipped.push({ issue: ref, reason: draft.reasoning || "already grab-able or not an Epic/Story" });
        continue;
      }
      // foresight-capture is the sanctioned staging pipeline (curaos_foresight_rule): it seeds
      // foresight work with Project metadata; later §3.4 triage promotes relevant ready children.
      const captured = await workflow({ scriptPath: `${WF}/foresight-capture.workflow.js` }, {
        observations: JSON.stringify(children.map((c) => ({
          kind: "prereq",
          ...(draft.milestone ? { milestone: draft.milestone } : {}),
          scope: c.owned_path || "",
          what: `[pre-drafted story for ${ref}] ${c.title}`,
          why: `RP-48 pre-breakdown: ${ref} dependency_cleared (last blocked-by closed). Scope: ${c.scope}. Acceptance: ${c.acceptance}. Parent: ${ref}. Staged for user activation; not active-queue work.`,
        }))),
        dry_run: dryRun,
      }).catch((e) => ({ seeded: [], skipped: [], error: String(e && e.message ? e.message : e) }));
      preBreakdown.drafted.push({
        issue: ref,
        children: children.length,
        seeded: captured && Array.isArray(captured.seeded) ? captured.seeded : [],
      });
    }
    if (clearedUnpromoted.length > draftCap) {
      log(`PRE-BREAKDOWN: drafted ${Math.min(draftCap, clearedUnpromoted.length)} of ${clearedUnpromoted.length} cleared-unpromoted issue(s); cap=${draftCap} (calibration throughput)`);
    }
    if (preBreakdown.drafted.length || preBreakdown.skipped.length) {
      log(`PRE-BREAKDOWN (RP-48): ${preBreakdown.drafted.length} drafted story set(s) staged as foresight work, ${preBreakdown.skipped.length} skipped`);
    }
  } catch (e) {
    log(`PRE-BREAKDOWN (RP-48): skipped (${e && e.message ? e.message : e}) - advisory, non-blocking`);
  }
}

// Phase 4: PRIORITIZE - rank readyLeaves by unblock-leverage + partition parallel-safe lanes, via the
// wave-prioritize atomic (deterministic dep-graph math in scripts/lib/dep-graph.js; reached 1-level deep).
// Leverage decides ORDER ONLY for the gates bound upstream (§3.4 triage, §3.5 research, §3.7 grill). The
// gen-evo barrier is NOT bound upstream of this point: it is enforced HERE, deterministically, from the
// scan's generator_inflight flag (context-load's per-lane LLM check is only the backstop). The wave
// dispatches the keystones that open the most future parallel width first.
phase("Prioritize");
let dispatchOrder = [];
let partition = { lanes: [], held: [] };
// RP-04 gen-evo barrier: with an in-flight codegen/SDK/contracts lane, generated-scope candidates are
// held BEFORE prioritize so they never reach dispatch lanes. The scope test gets the same inputs the
// scan's isGeneratorScope uses (ref + issue text); module/owned-path frontmatter from triage supplies
// the text the wave has deterministically.
const generatorBarrier = applyGeneratorBarrier(readyLeaves, scan.generator_inflight, (issue) => {
  const ctx = readyCandidateContext.get(issue) || {};
  return [ctx.module, ctx.owned_path].filter(Boolean).join(" ");
});
if (generatorBarrier.held.length) {
  log(`GEN-EVO BARRIER: holding ${generatorBarrier.held.length} generated-scope lane(s) while ${scan.generator_inflight} is in-flight`);
  partition = { lanes: [], held: [...generatorBarrier.held] };
}
readyLeaves = generatorBarrier.dispatchable;
if (readyLeaves.length) {
  // RP-47: the haiku enrich-frontmatter agent is GONE (redundant + lossy: it returned candidates
  // without priority/effort, nulling the calibration capture). wave-prioritize backfills missing
  // priority/effort deterministically from issue frontmatter itself; candidates come straight
  // from the deterministic triage context.
  const enrichedCandidates = readyLeaves.map((ref) => readyCandidateContext.get(ref) || { ref });
  if (!enrichedCandidates.length) throw new Error("milestone-wave: non-empty readyLeaves expected before prioritize");
  // RP-51 scheduling input: a candidate already In Progress / In Review on the board is NEAR
  // COMPLETION (resumed work / open PR awaiting verify); wave-prioritize schedules those lanes
  // FIRST so completing them frees capacity + unblocks dependents before fresh parallel starts.
  // Derived deterministically from the shared board snapshot (RP-38); ordering only, never a gate.
  const nearCompletionRefs = (projectCache.items || [])
    .filter((item) => /^(in progress|in review)$/i.test(String((item && item.status) || "")))
    .map(projectItemRef)
    .filter(Boolean);
  const prio = await workflow({ scriptPath: `${WF}/wave-prioritize.workflow.js` }, {
    candidates: JSON.stringify(enrichedCandidates),
    milestone: (scan.milestones || []).join(",") || "active",
    dry_run: dryRun,
    ...(nearCompletionRefs.length ? { near_completion: JSON.stringify(nearCompletionRefs) } : {}),
    // Pass a finite throttle through; OMIT when uncapped (Infinity) so wave-prioritize sees no
    // max_lanes and emits every collision-safe lane (Infinity would JSON-serialize to null anyway).
    ...(Number.isFinite(maxLanes) ? { max_lanes: maxLanes } : {}),
  });
  // RP-46 visibility: a degraded dep-graph build (edge-fetch failures after retries) is usable
  // for ordering but undercounts unblockReach and skips the calibration append; surface it.
  if (prio.degraded === true) {
    log(`PRIORITIZE-DEGRADED: dep-graph build hit ${prio.edge_fetch_failures || 0} edge-fetch failure(s); ranking usable, calibration append skipped (RP-46)`);
  }
  dispatchOrder = (prio.ranked || []).map((r) => ({ issue: r.issue, score: r.score, unblockReach: r.unblockReach }));
  // wave-prioritize already partitioned parallel-safe lanes in leverage order; use that as the dispatch set.
  const laneIssues = (prio.lanes || []).map((l) => l.issue).filter(Boolean);
  log(`Prioritized ${readyLeaves.length}: ${prio.rationale || "(no rationale)"} | dispatching ${laneIssues.length} lane(s) in leverage order`);
  partition = { lanes: laneIssues, held: [...generatorBarrier.held, ...(prio.ranked || []).filter((r) => !laneIssues.includes(r.issue)).map((r) => ({ issue: r.issue, reason: "deferred: lane collision or over max_lanes (lower leverage)" }))] };
}

// Phase 5: dispatch the leverage-ranked lanes (highest unblock-leverage first). INLINED
// task-execute body - context-load + tdd-implement are ATOMICS reached 1-level deep; branch + PR are
// direct agent() calls. Skip in dry_run.
//
// IMPORTANT: this committed workflow runs inside one checkout (`ROOT`). Even if wave-prioritize emits
// multiple different owned roots, every branch-changing agent below still acts from that same checkout.
// Therefore actual dispatch is serialized here. External/native orchestrators may fan lanes out across
// separate git worktrees; this workflow must not call `git checkout` concurrently in one working tree.
phase("Dispatch");
let dispatched = [];
// RP-42: budget ledger + preflight. One quota-free `gh api rate_limit` read + one
// rateLimit{remaining,resetAt} GraphQL probe persisted to .cache/gh-budget-ledger.json;
// the wave estimates its fan-out cost and DEFERS fan-out (lanes -> held, reason reported)
// when any budget is below 2x the estimate after the ~500-point closeout-sweep reserve.
// downgrade-rest proceeds with lanes unchanged (enumeration downgrade is a read-path
// concern; the routing decision is logged for the scan/verify legs). Preflight READ
// failure is fail-open: genuine quota exhaustion still classifies downstream as
// github-graphql-quota, and a broken budget probe must not strand a dispatchable wave.
if (!dryRun && partition.lanes.length) {
  try {
    const { createRequire } = process.getBuiltinModule("node:module");
    const ghBudget = createRequire(import.meta.url)("../lib/gh-budget.js");
    const { budgets } = ghBudget.readBudgets();
    // Estimate: each task-execute lane costs ~25 GraphQL points (batched issue reads +
    // project sync) and ~15 REST calls; +50 points for this wave's own verify/closeout
    // reads. restFallbackCalls = REST cost of downgraded (non-GraphQL) enumeration.
    const estimate = {
      graphqlPoints: partition.lanes.length * 25 + 50,
      restCalls: partition.lanes.length * 15,
      restFallbackCalls: partition.lanes.length * 40,
    };
    const decision = ghBudget.preflight({ budgets, estimate });
    log(`BUDGET-PREFLIGHT: ${decision.action} (${decision.reason})`);
    if (decision.action === "defer") {
      partition.held.push(...partition.lanes.map((issue) => ({ issue, reason: `budget-preflight deferral: ${decision.reason}` })));
      partition.lanes = [];
    }
  } catch (error) {
    log(`BUDGET-PREFLIGHT: skipped (${error && error.message ? error.message : error})`);
  }
}
if (!dryRun && partition.lanes.length) {
  const dispatchMode = String(cfg.dispatch_mode || "worktree").trim().toLowerCase();
  if (dispatchMode !== "serial") {
    const agentType = String(cfg.dispatch_agent_type || process.env.AGENT_WORKFLOW_KIT_DEFAULT_AGENT_TYPE || "codex").trim() || "codex";
    const timeoutMs = positiveInteger(cfg.dispatch_agent_timeout_ms, 1_800_000);
    const batchSize = Math.min(partition.lanes.length, positiveInteger(cfg.dispatch_batch_size, 20));
    const suffix = dispatchRunSuffix();
    const lanePlans = [];
    log(`DISPATCH-WORKTREE: ${partition.lanes.length} lane(s), concurrency=${batchSize}, agent=${agentType}, timeout_ms=${timeoutMs}, submodule_jobs=${submoduleJobs}`);
    for (const issue of partition.lanes) {
      const laneCtx = readyCandidateContext.get(issue) || {};
      if (isDeployCredentialScope(issue, [laneCtx.module, laneCtx.owned_path].filter(Boolean).join(" "))) {
        const pf = preflightCredentialsGate();
        if (pf.exit !== 0) {
          log(`DEPLOY-PREFLIGHT: holding ${issue} (preflight-credentials exit ${pf.exit})`);
          dispatched.push({ issue, status: "blocked", pr: "", blocker: `deploy-credential-preflight failed (exit ${pf.exit}: 65=missing scope, 66=registry write rejected, 70=cannot prove): operator unblock = gh auth refresh -h github.com -s write:packages,read:packages && scripts/preflight-credentials${pf.output ? `; ${pf.output.slice(0, 400)}` : ""}` });
          continue;
        }
      }
      const branchName = laneBranchName(issue, suffix);
      const wt = createIsolatedLaneWorktree({ issue, branch: branchName, repoRoot: ROOT });
      if (!wt.branch || wt.blocker) {
        dispatched.push({ issue, status: "blocked", pr: "", branch: wt.branch || branchName, worktree: wt.path || "", blocker: `worktree-create-failed: ${wt.blocker || "unknown"}` });
        continue;
      }
      const { resolve } = process.getBuiltinModule("node:path");
      const worktreePath = resolve(wt.path);
      try {
        if (cfg.init_submodules === true) initLaneSubmodules(worktreePath, submoduleJobs);
      } catch (error) {
        dispatched.push({ issue, status: "blocked", pr: "", branch: branchName, worktree: worktreePath, blocker: `worktree-submodule-init-failed: ${error && error.message ? error.message : String(error)}` });
        continue;
      }
      log(`DISPATCH-WORKTREE-LANE: queued ${issue} branch=${branchName} worktree=${worktreePath}`);
      lanePlans.push({ issue, branch: branchName, worktreePath });
    }
    const laneResults = await mapLimit(lanePlans, batchSize, async (plan) => {
      log(`DISPATCH-WORKTREE-LANE: start ${plan.issue} branch=${plan.branch} worktree=${plan.worktreePath}`);
      const result = await runTaskExecuteChild({ ...plan, agentType, timeoutMs });
      log(`DISPATCH-WORKTREE-LANE: done ${plan.issue} status=${result.status}${result.pr ? ` pr=${result.pr}` : ""}${result.blocker ? ` blocker=${String(result.blocker).slice(0, 220)}` : ""}`);
      return result;
    });
    dispatched.push(...laneResults.filter(Boolean));
  } else {
  log(`DISPATCH-SERIAL: ${partition.lanes.length} lane(s) share workflow ROOT=${ROOT}; serializing branch-changing work. Native/worktree orchestrators may run these lanes concurrently in separate worktrees.`);
  const runLane = async (issue) => {
    try {
      // context-load now resolves the issue body into issue_spec (owned_paths, acceptance,
      // verification_cmds, adr_refs) - the scope fence threaded into tdd-implement so the
      // worker cannot self-select an off-task deliverable (the #114→patient-contracts drift).
      const ctx = await workflow({ scriptPath: `${WF}/context-load.workflow.js` }, { issue, scope_hint: "" });
      if (ctx.blockers && ctx.blockers.length) return { issue, status: "blocked", pr: "", blocker: ctx.blockers.join("; ") };
      const laneSlug = issue.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
      const branchName = `feat/${laneSlug}`;
      // RP-50 PRE-CODING ANCHOR BLOCK: prepended to context_summary so the worker prompt carries
      // it verbatim. The lane context bundle was written at PLAN time by wave-prioritize
      // (.scratch/<lane-slug>/context-bundle.md), so it exists before this worker starts; a
      // missing bundle degrades to context-load's canonical reads, never blocks the lane.
      const anchorBlock = [
        `PRE-CODING ANCHORS (RP-50) - confirm each BEFORE writing any file:`,
        `1. Read the lane context bundle at .scratch/${laneSlug}/context-bundle.md (mirror-doc context + plan row, resolved once at plan time; if absent, fall back to the canonical context-load reads).`,
        `2. Confirm naming invariants from the module's Requirements.md (kebab-case; \`-service\` suffix; \`<domain>-core-service\` layer grouping; no wrapper/staging dirs).`,
        `3. Confirm contract invariants: APIs/events/data are VERSIONED (AGENTS.md section 7); never break a published contract - forward migration + semver bump only (curaos_rolling_update_rule).`,
        `4. Zero em/en dashes in EVERY produced file, commit, issue, or PR (curaos_no_em_dash_rule).`,
        `5. Stay inside the issue's owned paths; anything outside is out of scope.`,
      ].join("\n");
      const branch = createAndCheckoutBranch(branchName);
      if (branch.branch !== branchName) {
        const restore = restoreDefaultBranch(`branch-create-failed ${branchName}`);
        return { issue, status: "blocked", pr: "", blocker: `branch-create-failed: expected ${branchName}, ${branch.blocker || "git branch creation failed"}${restoreSuffix(restore)}` };
      }
      // RP-39: thread the RP-36 batch record's body into tdd-implement (issue_body) so the worker
      // prompt injects it AUTHORITATIVE instead of mandating a re-fetch; breakdown-created leaves
      // missing from the batch map simply fall back to the mandated read inside tdd-implement.
      const impl = await workflow({ scriptPath: `${WF}/tdd-implement.workflow.js` }, {
        issue, branch: branchName, context_summary: `${anchorBlock}\n\n${ctx.context_summary || ""}`, generated_code: ctx.generated_code, issue_spec: ctx.issue_spec || {}, impl_model: ctx.recommended_model,
        ...(prefetched.has(issue) && prefetched.get(issue).body ? { issue_body: prefetched.get(issue).body } : {}),
        dry_run: false,
      });
      // tdd-implement's programmatic verification gate (independent diff + CI re-run + owned-path
      // + reachable-pointer checks) already forced status=blocked on any fabrication/out-of-scope.
      if (impl.status !== "done") {
        const restore = restoreDefaultBranch(`milestone-wave blocked ${branchName}`);
        const workflowDefect = impl.workflow_defect === true
          ? `workflow-defect:${impl.workflow_defect_kind || "tdd-implement"}: `
          : "";
        return { issue, status: impl.status === "needs-user" ? "needs-user" : "blocked", pr: "", workflow_defect: impl.workflow_defect === true, workflow_defect_kind: impl.workflow_defect_kind || "", blocker: `${workflowDefect}${impl.blocker || "tdd-implement did not reach done"}${restoreSuffix(restore)}` };
      }
      if (!impl.verification_evidence || impl.verification_evidence.trim().length < 40) {
        const restore = restoreDefaultBranch(`milestone-wave missing-evidence ${branchName}`);
        return { issue, status: "blocked", pr: "", workflow_defect: impl.workflow_defect === true, workflow_defect_kind: impl.workflow_defect_kind || "", blocker: `tdd-implement reached done without §8.1 verification_evidence${restoreSuffix(restore)}` };
      }
      const pr = await agent(
        `From ${ROOT} on branch ${branchName}: push the branch and open a PR for issue ${issue} with \`env -u GITHUB_TOKEN gh pr create\`. The PR body MUST be generated from the ACTUAL change - run \`git diff --stat ${resolveDefaultBranch()}...${branchName}\` and describe ONLY what the diff shows; do NOT claim work absent from the diff. Include: link the issue; the real changed-file summary; the verification_evidence block below (verbatim, the §8.1 claim of record; it may include an INDEPENDENT VERIFICATION fallback paste); "GENERATOR-EVOLUTION: ${impl.generator_evolution}". If VERIFICATION_EVIDENCE is missing or says "(none provided)", STOP and report no PR. Before pushing, if the diff moves any submodule pointer, verify the pointed commit is pushed/reachable (\`git -C <submodule> branch -r --contains HEAD\` non-empty) - if not, do NOT push; report status reflecting the broken pointer. Then set the issue label to agent-PR-open (remove agent-claimed:*). Conventional Commit title; NO AI attribution trailers. Report the PR ref (owner/repo#N).\n\nVERIFICATION_EVIDENCE (paste verbatim into the PR body):\n${impl.verification_evidence}`,
        { label: `pr:${issue}`, phase: "Dispatch", model: "sonnet", schema: { type: "object", required: ["pr"], properties: { pr: { type: "string" } } } }
      );
      const prRef = observedPrRef(pr);
      const restore = restoreDefaultBranch(`milestone-wave pr-open ${branchName}`);
      if (!prRef) {
        return { issue, status: "blocked", pr: "", blocker: `pr-create-failed: agent returned <empty-or-invalid>${restoreSuffix(restore)}` };
      }
      if (restore.restored !== true) {
        return { issue, status: "blocked", pr: prRef, workflow_defect: impl.workflow_defect === true, workflow_defect_kind: impl.workflow_defect_kind || "", blocker: `post-pr default-branch restore failed${restoreSuffix(restore)}` };
      }
      return { issue, status: "pr-open", pr: prRef, blocker: "" };
    } catch (e) {
      return { issue, status: "errored", pr: "", blocker: String(e) };
    }
  };
  for (let index = 0; index < partition.lanes.length; index += 1) {
    const issue = partition.lanes[index];
    // RP-52: deploy-class lanes (image build/publish/sign; the #588 GHCR class) must prove
    // credentials BEFORE dispatch. A failed/unprovable preflight blocks ONLY this lane and surfaces
    // the exact operator unblock one-liner (the operator-queue generator maps the same class).
    const laneCtx = readyCandidateContext.get(issue) || {};
    if (isDeployCredentialScope(issue, [laneCtx.module, laneCtx.owned_path].filter(Boolean).join(" "))) {
      const pf = preflightCredentialsGate();
      if (pf.exit !== 0) {
        log(`DEPLOY-PREFLIGHT: holding ${issue} (preflight-credentials exit ${pf.exit})`);
        dispatched.push({ issue, status: "blocked", pr: "", blocker: `deploy-credential-preflight failed (exit ${pf.exit}: 65=missing scope, 66=registry write rejected, 70=cannot prove): operator unblock = gh auth refresh -h github.com -s write:packages,read:packages && scripts/preflight-credentials${pf.output ? `; ${pf.output.slice(0, 400)}` : ""}` });
        continue;
      }
    }
    const result = await runLane(issue);
    if (result) dispatched.push(result);
    if (isNoOpWorkflowDefect(result)) {
      const remaining = partition.lanes.slice(index + 1);
      for (const heldIssue of remaining) {
        dispatched.push(blockedByNoOpBarrier(heldIssue, issue));
      }
      break;
    }
  }
  }
} else if (dryRun) {
  dispatched = partition.lanes.map((issue) => ({ issue, status: "dry-run (would dispatch)", pr: "", blocker: "" }));
}

// Phase 6: verify + merge PRs in scope (the ones open before + any opened this pass). Skip in dry_run.
//
// RP-11 VERIFY SHAPE - two stages:
//   Stage 1 (parallel-safe fan-out): per-PR READ-ONLY review legs - lens reviews (`gh pr diff`),
//   the cross-harness grill, the REST head-sha probe, and the review-thread gate. None of these
//   touch the shared working tree, so fanning them out across PRs is safe.
//   Stage 2 (VERIFY-SERIAL): the CHECKOUT-CHANGING legs - ci-check (`gh pr checkout` + local gate),
//   merge, close-path hygiene, and the default-branch restore - run in ONE serial for-loop, the
//   same pattern as the serialized Dispatch loop above. This committed workflow runs inside one
//   checkout (`ROOT`); N concurrent `gh pr checkout` + `just ci` runs would race the working tree
//   and could feed the unattended autoMerge a wrong-tree gate result.
phase("Verify");
const prsToVerify = [...new Set([...(scan.open_prs || []), ...dispatched.filter((d) => d.pr).map((d) => d.pr)])];
let prVerdicts = [];
if (!dryRun && prsToVerify.length) {
  const reviewLegs = await parallel(prsToVerify.map((pr) => async () => {
    try {
      const prCheckoutCmd = ghPrCommand("checkout", pr);
      const prChecksCmd = ghPrCommand("checks", pr);
      const lenses = await parallel(["Security", "Architecture", "QA"].map((lens) => () =>
        workflow({ scriptPath: `${WF}/lens-review.workflow.js` }, { lens, pr })
      )).then((r) => r.filter(Boolean));
      const lensBlock = lenses.length !== 3 || lenses.some((l) => l.verdict === "block");
      const lensChanges = lenses.some((l) => l.verdict === "changes-requested");
      const subject = `pr-${pr.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
      const grill = await workflow({ scriptPath: `${WF}/opposite-harness-grill.workflow.js` }, { pr, subject });
      const grillVerdict = grill.verdict;
        const grillBlockedHarnessUnavailable = isBlockedHarnessUnavailable(grill);
      const prGateSnapshot = await workflow(
        { scriptPath: `${WF}/gh-pr-gate-snapshot.workflow.js` },
        { pr },
      ).catch((error) => ({
          head_sha: "",
          minutes_since_last_push: -1,
          blocked_by_external: true,
          error: error && error.message ? error.message : String(error),
        }));
        const reviewSnapshotBlocked = prGateSnapshot.blocked_by_external === true;
        const prRef = prRefParts(pr);
        const headSha = String(prGateSnapshot.head_sha || "").trim();
        const headShapeBlocked = !prRef || !/^[0-9a-fA-F]{40}$/.test(headSha);
      // Grill-SHA binding gate (RP-03, fail-closed): mirror of the pr-verify-merge merge gate. The
      // grill verdict only gates the exact commit it reviewed; a push after the grill, or a grill
      // that never proved which commit it reviewed, blocks (the #202 class).
        const grillShaBlocked = grillShaMismatch(grill, headSha);
      // Review-thread resolution gate (BINDING): merge-ok / safe-to-merge-clean requires every reviewer
      // review THREAD resolved AND no thread escalated/tagged needs-human (left intentionally open for the user).
      // "merged" alone is insufficient. The wave runs UNATTENDED, so a needs-human thread is a HARD block here
      // (no human is watching this pass to action it) - harder than the per-PR /pr-verify-merge path where the
      // orchestrator can adjudicate inline. Any unresolved thread or open needs-human => block.
      const threadGate = await agent(
        `Report review-thread state for PR ${pr}. From ${ROOT} (Bash, \`env -u GITHUB_TOKEN gh\`): enumerate every reviewer review thread on the PR and whether each is resolved; also report whether any thread is escalated/tagged needs-human (a review thread left intentionally open for the user). Return all_threads_resolved (bool - true iff EVERY review thread is resolved) and open_needs_human (bool - true iff at least one needs-human thread is open).`,
        { label: `thread-gate:${pr}`, phase: "Verify", model: "haiku", schema: { type: "object", required: ["all_threads_resolved", "open_needs_human"], properties: { all_threads_resolved: { type: "boolean" }, open_needs_human: { type: "boolean" } } } }
      );
      const threadsResolved = threadGate.all_threads_resolved === true;
      const needsHumanOpen = threadGate.open_needs_human === true;
        return { pr, prCheckoutCmd, prChecksCmd, subject, grill, lensBlock, lensChanges, grillVerdict, grillBlockedHarnessUnavailable, grillShaBlocked, reviewSnapshotBlocked, headShapeBlocked, headSha, prRef, threadsResolved, needsHumanOpen };
    } catch (e) {
      return { pr, error: String(e) };
    }
  })).then((r) => r.filter(Boolean));

  log(`VERIFY-SERIAL: ${reviewLegs.length} PR(s) share workflow ROOT=${ROOT}; serializing ci-check + merge + workspace-restore legs (read-only review legs already fanned out above). Native/worktree orchestrators may verify PRs concurrently in separate worktrees.`);
  for (const leg of reviewLegs) {
    const pr = leg.pr;
    if (leg.error) {
      prVerdicts.push({ pr, verdict: "errored", error: leg.error });
      continue;
    }
    try {
        const { prCheckoutCmd, prChecksCmd, subject, grill, lensBlock, lensChanges, grillBlockedHarnessUnavailable, grillShaBlocked, reviewSnapshotBlocked, headShapeBlocked, headSha, prRef, threadsResolved, needsHumanOpen } = leg;
      let grillVerdict = leg.grillVerdict;
      // P4a (issue #706): scope the per-PR ci-check leg + the over-claim re-run (milestone
      // orchestration §7.1) to the DIFF-TOUCHED buckets using Turbo affected + remote cache, so
      // VERIFY-SERIAL runs only what the PR changed with cache reuse instead of N x full suite.
      // NOTE: the ci-local.sh affected-wiring (curaos/scripts/ci-local.sh) is owned by Track A
      // (lane claude-e6528ecca4); this leg invokes the affected-scoped gate at the prompt level and
      // leaves the script wiring to Track A. When `just ci-affected` / a Turbo affected recipe is
      // not yet present, this leg falls back to the full local gate (correctness over speed).
      const ciCheck = await agent(
        `Report the merge-gate CI status of PR ${pr}. GH auto-CI is OFF (workflow_dispatch-only per ai/rules/curaos_local_ci_first_rule.md), so empty GitHub checks are expected; the checked-out repo's LOCAL gate is the gate. From ${ROOT} run Bash:
1. \`env -u GITHUB_TOKEN ${prCheckoutCmd}\`.
2. Re-run the local gate from the checked-out PR root, AFFECTED-SCOPED with remote-cache reuse (P4a): prefer an affected-only recipe that runs ONLY the diff-touched buckets with Turbo cache reuse - \`cd ${ROOT} && if just --summary 2>/dev/null | grep -qx ci-affected; then just ci-affected; elif [ -x scripts/ci-local.sh ]; then bash scripts/ci-local.sh; elif [ -f justfile ]; then just ci; else bash scripts/check-docs.sh; fi\` AND, when present, \`cd ${ROOT} && node scripts/check-ci-gates-sync.js\`. The affected recipe (Track A owns its ci-local.sh wiring) keeps the gate equivalent while running only what changed; if no affected recipe exists yet, the full local gate runs (correctness over speed). Capture exits; local_gate_exit = worst nonzero exit, else 0.
3. Also report any manually-dispatched GH checks: \`env -u GITHUB_TOKEN ${prChecksCmd} --json state,bucket,name\`; empty checks=[] is expected and does NOT fail the gate.
Return local_gate_exit (number) + checks (array).`,
        { label: `ci-check:${pr}`, phase: "Verify", model: "sonnet", schema: { type: "object", required: ["local_gate_exit", "checks"], properties: {
          local_gate_exit: { type: "number" },
          checks: { type: "array", items: { type: "object", properties: { name: { type: "string" }, state: { type: "string" }, bucket: { type: "string" } } } },
        } } }
      );
      const checkRows = ciCheck.checks || [];
      const dispatchedFailing = checkRows.some((c) => c.bucket === "fail" || String(c.state || "").toUpperCase() !== "SUCCESS");
      const checksGreen = ciCheck.local_gate_exit === 0 && !dispatchedFailing;
      // P2a/P2b (issue #706): bounded in-workflow delta re-grill fix-cycle loop, in the SERIAL stage
      // (the fix worker pushes code, so it must run inside the one shared checkout, not the parallel
      // read-only review fan-out). On grill issues-found, dispatch a fix worker then RE-GRILL the
      // DELTA `git diff <prev-grill-sha>..HEAD` in-workflow, capped at maxRegrillCycles (default 3,
      // BINDING per [[curaos-verification-stack-rule]]); each cycle threads a distinct cache_bust so
      // the grill cache recomputes. Collapses the 5-cycle PR-337 case toward 1 review + 1 fix + 1 delta re-grill.
      let regrillResult = grill;
      let regrillCycles = 0;
      const maxRegrillCycles = Number.isFinite(cfg.max_regrill_cycles) ? Math.max(0, cfg.max_regrill_cycles) : 3;
      // P1-3 (issue #706 delta-regrill soundness, mirror of pr-verify-merge): pin ONE stable report
      // path for the whole loop so every cycle APPENDS to the canonical PR grill verdict instead of
      // forking a per-cycle file a clean delta could replace; accumulate the UNION of unresolved
      // findings so a clean delta never silently drops a prior full-review finding.
      const stableReportPath = `ai/curaos/docs/grills/${subject.replace(/[^a-z0-9]+/gi, "-").toLowerCase().replace(/^-+|-+$/g, "") || "grill"}-pr${prRef ? prRef.number : "x"}.md`;
      let carriedFindings = Array.isArray(regrillResult && regrillResult.issues) ? regrillResult.issues.slice() : [];
      while (regrillResult && regrillResult.verdict === "issues-found" && regrillCycles < maxRegrillCycles) {
        regrillCycles += 1;
        const prevSha = String((regrillResult && regrillResult.verified_sha) || "").trim();
        const seen = new Set(carriedFindings.map((f) => `${String(f.severity).toLowerCase()}::${String(f.what).trim().toLowerCase()}`));
        for (const f of (regrillResult.issues || [])) {
          const k = `${String(f.severity).toLowerCase()}::${String(f.what).trim().toLowerCase()}`;
          if (!seen.has(k)) { seen.add(k); carriedFindings.push(f); }
        }
        await agent(
          `Fix the issues-found findings the adversarial grill surfaced on PR ${pr} (re-grill cycle ${regrillCycles}/${maxRegrillCycles}). From ${ROOT} (Bash): \`env -u GITHUB_TOKEN ${prCheckoutCmd}\`, address EVERY finding, commit + push to the PR branch, report done. Findings (ALL unresolved across cycles): ${JSON.stringify(carriedFindings.slice(0, 50))}. Keep the fix minimal, tested, in-scope.`,
          { label: `regrill-fix:cycle${regrillCycles}:${pr}`, phase: "Verify", model: "sonnet", schema: { type: "object", required: ["status"], properties: { status: { type: "string" }, blocker: { type: "string" } } } },
        ).catch(() => ({ status: "errored" }));
        const regrillArgs = { pr, subject: `${subject} re-grill cycle ${regrillCycles}`, cache_bust: `regrill-cycle-${regrillCycles}`, report_path: stableReportPath, prior_findings: carriedFindings.slice(0, 50) };
        if (/^[0-9a-fA-F]{40}$/.test(prevSha)) regrillArgs.diff_ref = `${prevSha}..HEAD`;
        regrillResult = await workflow({ scriptPath: `${WF}/opposite-harness-grill.workflow.js` }, regrillArgs);
        if (regrillResult && regrillResult.verdict === "issues-found") {
          carriedFindings = Array.isArray(regrillResult.unresolved_findings) && regrillResult.unresolved_findings.length
            ? regrillResult.unresolved_findings.slice()
            : carriedFindings;
        }
      }
      if (regrillCycles > 0 && regrillResult) grillVerdict = regrillResult.verdict;
      // RP-21 NOTE: the canonical merge-clean predicate owner is scripts/lib/merge-hygiene.js
      // mergeCleanVerdict; swapping this inline chain for the lib call is QUEUED for the
      // integration commit (rp-21.md item 6c) because the live RP-03 truth-contract test pins
      // the literal `|| grillShaBlocked` chain here. Behavior is the unattended decision table.
      const threadsClean = threadsResolved && !needsHumanOpen;
      let verdict;
        if (lensBlock || grillVerdict === "block" || grillBlockedHarnessUnavailable || grillShaBlocked || reviewSnapshotBlocked || headShapeBlocked || !checksGreen || !threadsClean) verdict = "block";
      else if (lensChanges || grillVerdict === "issues-found") verdict = "changes-requested";
      else verdict = "merge-ok";
      // P2a guard (issue #706 + RP-03/#202): a re-grill cycle pushed a fix, so the PR head moved
      // PAST the pre-loop snapshot (headSha + grillShaBlocked were computed against the old head).
      // Never auto-merge on that stale snapshot - defer to changes-requested so the next wave pass
      // re-snapshots the fresh head and re-binds the grill verdict to it.
      if (regrillCycles > 0 && verdict === "merge-ok") verdict = "changes-requested";
      let merged = false;
      if (verdict === "merge-ok" && autoMerge) {
        const mergeRes = await agent(
          `Merge PR ${pr} from ${ROOT}: \`repo=${prRef.repo} num=${prRef.number} sha=${headSha}; if [ -z "$repo" ] || [ -z "$num" ]; then echo "owner/repo#N required"; exit 2; fi; if ! printf %s "$sha" | grep -Eq '^[0-9a-fA-F]{40}$'; then echo "40-hex head sha required"; exit 2; fi; env -u GITHUB_TOKEN gh api -X PUT repos/$repo/pulls/$num/merge -f merge_method=squash -f sha=$sha\`. Confirm merged. Use Bash.`,
          { label: `merge:${pr}`, phase: "Verify", model: "haiku", schema: { type: "object", required: ["merged"], properties: { merged: { type: "boolean" } } } }
        );
        merged = !!(mergeRes && mergeRes.merged); // reflect the actual merge result, not a hard true (RP-11; mirror of pr-verify-merge "Flag A")
      }
      // Close-path hygiene runs ONLY on a CONFIRMED merge: a failed/refused merge must not strip
      // labels, advance board Status, or clear notifications for a PR that is in fact still open.
      if (merged) {
        // Close-path label hygiene: the merged PR auto-closes its linked issue ("Closes #N") but GitHub
        // leaves every label - strip the stranded workflow-state labels (ready-for-agent / needs-triage /
        // needs-info / agent-PR-open / agent-claimed:*) off the now-CLOSED issue so a closed issue carries
        // ZERO state labels (only category bug/enhancement + markers foresight/blocked persist). Runs
        // BEFORE notify-clear so label hygiene happens even if the notify leg no-ops. The org-wide
        // `scripts/sweep-closed-issue-labels` converger backstops merges that bypass this wave.
        await agent(
          `Strip stranded workflow-state labels from the issue(s) PR ${pr} just auto-closed. From ${ROOT} (Bash, \`env -u GITHUB_TOKEN gh\`): resolve linked closing issues via \`env -u GITHUB_TOKEN gh pr view ${pr} --json closingIssuesReferences --jq '.closingIssuesReferences[] | "\\(.repository.owner.login)/\\(.repository.name)#\\(.number)"'\`; for EACH now-CLOSED linked issue remove ALL state labels in one idempotent call: \`env -u GITHUB_TOKEN gh issue edit N -R OWNER/REPO --remove-label ready-for-agent --remove-label needs-triage --remove-label needs-info --remove-label ready-for-human --remove-label agent-PR-open\` PLUS \`--remove-label\` for every \`agent-claimed:*\` present (enumerate via \`gh issue view N -R OWNER/REPO --json labels --jq '.labels[].name | select(startswith("agent-claimed:"))'\`). Removing an absent label is a no-op. PRESERVE bug/enhancement + foresight/blocked. Use Bash.`,
          { label: `strip-labels:${pr}`, phase: "Verify", model: "haiku", schema: { type: "object", required: ["stripped"], properties: { stripped: { type: "array", items: { type: "string" } } } } }
        ).catch(() => {});
        // Close-path BOARD-STATUS hygiene moved to ONCE per wave close (RP-38): the org-wide
        // `scripts/sweep-project-status --apply` scan advances EVERY closed item in one pass;
        // running it per merged PR repeated the same org-wide read N times per wave.
        // Notification-clear hygiene: clear THIS PR's inbox notification through the GUARDED
        // `pr-notification-gate` (NOT the raw `mark-pr-notification-done`): the gate re-checks the
        // safety predicate (PR terminal + review threads resolved + no `needs-human`) before clearing,
        // so a notification whose finding is still live is never cleared. It matches the subject URL
        // ending in /pulls/<N> EXACTLY (split owner/repo#N -> owner/repo + N), NOT a substring
        // contains(N) - PR #42 must not match #420. Exit 3 = a live unresolved/needs-human thread
        // remains (capture the finding into a follow-up issue + resolve the thread first, then re-run);
        // exit 2 = PR still open; never force-clear past either.
        // Strict owner/repo#N parse (same shape as ghPrCommand at the top of this file): a loose
        // `.*#N` would splice an agent-produced ref straight into a Bash command (shell-token injection)
        // and could substring-match the wrong PR. A non-matching ref is skipped, never run.
        const m = /^([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)#(\d+)$/.exec(pr);
        if (m) {
          const repo = m[1];
          const num = m[2];
          // Surface the gate outcome instead of swallowing it: the gate's exit 2 (PR still open) /
          // exit 3 (a live unresolved/needs-human thread remains) is a real signal the orchestrator
          // must see, not drop. The agent returns {cleared, gate_exit, blocker} which we log.
          const notify = await agent(
            `Clear the inbox notification for PR ${repo}#${num} from ${ROOT} through the guarded gate: \`bash scripts/pr-notification-gate --apply ${repo} ${num}\` (dry-run by default - run a dry-run first to confirm the would-clear set matches a subject URL ending in exactly \`/pulls/${num}\` and NOT a substring of a longer number, then --apply). On exit 3 (a live unresolved/needs-human thread remains) do NOT force-clear: leave the notification, capture the live finding into a follow-up issue, resolve the thread, then re-run. On exit 2 (PR still open) leave it. Report {cleared:boolean, gate_exit:number, blocker:string}. Skip (cleared:false, blocker:"no-matching-notification") if no matching notification. Use Bash.`,
            { label: `notify-clear:${repo}#${num}`, phase: "Verify", model: "haiku", schema: { type: "object", required: ["cleared"], properties: { cleared: { type: "boolean" }, gate_exit: { type: "number" }, blocker: { type: "string" } } } }
          ).catch((e) => ({ cleared: false, blocker: `notify-clear-agent-error: ${e && e.message}` }));
          if (notify && notify.cleared === false && notify.blocker) {
            log(`notify-clear ${repo}#${num}: HELD (${notify.blocker}${notify.gate_exit != null ? `, gate_exit=${notify.gate_exit}` : ""})`);
          }
        }
      }
      let workspace_ready = merged ? "blocked" : "n/a";
      if (merged) {
        const readyRes = await agent(
          `Restore the integration checkout after merging PR ${pr}. From ${ROOT} (Bash): run \`git status --short --branch\`; if dirty, preserve already-landed duplicate/stale residue with \`git stash push -u -m "post-wave default-branch readiness ${pr}"\`, but report blocked for real new work instead of discarding. Then \`git fetch --prune origin\`, switch to the repository default branch (use \`env -u GITHUB_TOKEN gh repo view\` for ${pr}'s repo defaultBranchRef, fallback main), \`git pull --ff-only\`, run \`git submodule update --init --recursive\` when submodules exist, and verify final \`git status --short --branch\` is clean. Return workspace_ready = clean | stashed | blocked. Never leave the completed wave on a merged/deleted branch with upstream [gone].`,
          { label: `default-branch:${pr}`, phase: "Verify", model: "haiku", schema: { type: "object", required: ["workspace_ready"], properties: { workspace_ready: { type: "string" }, reason: { type: "string" } } } }
        ).catch((e) => ({ workspace_ready: "blocked", reason: String(e) }));
        workspace_ready = readyRes.workspace_ready || "blocked";
      }
      prVerdicts.push({ pr, verdict, merged, workspace_ready });
    } catch (e) {
      prVerdicts.push({ pr, verdict: "errored", error: String(e) });
    }
  }
  // RP-38: single board-status convergence pass per wave close (replaces the deleted per-merged-PR
  // sweep above). sweep-project-status invalidates the shared board snapshot itself after a
  // mutating run; it also backstops merges that bypassed this wave (direct gh pr merge / UI-merge).
  if (prVerdicts.some((v) => v.merged)) {
    await agent(
      `Advance board Status to Done for every CLOSED/COMPLETED item stuck at an active status on the "CuraOS Roadmap" GitHub Project. From ${ROOT} (Bash): run \`bash scripts/sweep-project-status --apply\` ONCE (idempotent; advances Ready/In Progress/In Review items whose issue is CLOSED/COMPLETED to Done; leaves Backlog/Blocked/Done untouched). Report which items it advanced (parse "ADVANCE  repo#N" lines). Use Bash.`,
      { label: "advance-board:wave-close", phase: "Verify", model: "haiku", schema: { type: "object", required: ["advanced"], properties: { advanced: { type: "array", items: { type: "string" } } } } }
    ).catch(() => {});
  }
}

// Phase 6.5: FORESIGHT - proactively seed staged future/dependency work (foresight-sweep, wave mode).
// Runs whenever this pass merged something (debt-introduced discovery is meaningful post-merge) OR in
// dry_run reports findings without seeding. Capture starts no implementation work; later triage can promote
// relevant complete foresight work.
// Wrapped so a foresight failure (advisory) never fails the wave.
//
// NESTING CONSTRAINT (why discovery is inlined here, not delegated to the foresight-sweep workflow): the
// runtime caps workflow() nesting at ONE level. This wave is already a child workflow, so calling
// foresight-sweep here (level 1) and letting IT call foresight-capture (level 2) throws
// "workflow() cannot be called from within a child workflow". So the wave runs the discovery agent INLINE
// and calls foresight-capture DIRECTLY (one level) - the same discovery+capture pipeline foresight-sweep
// performs, just flattened to fit the nesting budget. foresight-sweep stays the canonical composite for
// STANDALONE / scheduled runs (orchestrator level 0 -> capture level 1, legal). Keep the discovery prompt
// here in sync with foresight-sweep's wave-mode discovery.
phase("Foresight");
let foresight = { findings: [], captured: { seeded: [], skipped: [] }, dropped: 0 };
const mergedThisPass = prVerdicts.some((v) => v.merged) || dispatched.some((d) => d.status === "pr-open");
if (!pendingTrackerBarrier && (mergedThisPass || dryRun)) {
  try {
    const msScope = (scan.milestones || []).join(",") || "all open issue work";
    const discovery = await agent(
      `Discover FUTURE WORK introduced or surfaced by THIS just-merged wave for milestone scope ${msScope}. Work from ${ROOT}, READ-ONLY (Bash, \`env -u GITHUB_TOKEN gh\`; codegraph for structural questions). Scan ONLY this milestone's just-merged work + its near-term horizon.
Discovery sources: (1) DEBT INTRODUCED - recent merged PRs/commits whose changes left a known-incomplete edge (search commit bodies + closeout comments for "follow-up", "TODO", "stale", "skipped", "--no-verify", "out of scope", "separate task"); (2) DEFERRED DECISIONS - \`ai/curaos/docs/adr/RESOLUTION-MAP.md\` rows marked STILL-OPEN/needs-user; (3) open issue prereqs that are not yet seeded. For each finding: kind (debt|idea|context|risk|prereq), milestone (its target metadata when known), scope (repo/module), what (one line), why (consequence). DO NOT propose anything already covered by an open issue (cheap title/label scan first). Ground every finding in a real artifact (commit, ADR row, Project gap). Return findings (array) ranked by consequence severity desc; empty if nothing.`,
      { label: "foresight-discover", phase: "Foresight", model: "opus", schema: {
        type: "object", required: ["findings"], properties: {
          findings: { type: "array", items: { type: "object", required: ["kind", "what", "why"], properties: {
            kind: { type: "string", enum: ["debt", "idea", "context", "risk", "prereq"] },
            milestone: { type: "string" }, scope: { type: "string" }, what: { type: "string" }, why: { type: "string" },
          } } },
        } },
      }
    ).catch(() => ({ findings: [] }));
    const allFindings = Array.isArray(discovery.findings) ? discovery.findings : [];
    const take = allFindings.slice(0, 12);
    const dropped = Math.max(0, allFindings.length - take.length);
    let captured = { seeded: [], skipped: [] };
    if (take.length) {
      captured = await workflow({ scriptPath: `${WF}/foresight-capture.workflow.js` }, {
        observations: JSON.stringify(take),
        dry_run: dryRun,
      });
    }
    foresight = { findings: allFindings, captured, dropped };
    const seededN = captured && captured.seeded ? captured.seeded.length : 0;
    log(`Foresight (wave): ${allFindings.length} findings, ${seededN} seeded${dropped ? `, ${dropped} deferred` : ""}`);
  } catch (e) {
    log(`Foresight (wave): skipped (${e && e.message ? e.message : e}) - advisory, non-blocking`);
  }
}

// Phase 7: report. done iff the milestone selector resolved, nothing dispatchable remained, no held lanes,
// no open PRs unresolved, no needs_user.
// needs_user already contains ONLY items that genuinely need the user (no recommendation, or irreversible/T3, or unapproved scope) - auto-applied decisions were consumed in the scan phase and logged to AUTO-DECISION-LOG.md.
  const pendingTrackerWork = pendingTrackerWorkFrom(scan, triaged);
const laneNeedsUser = dispatched
  .filter((d) => d && d.status === "needs-user")
  .map((d) => ({
    issue: d.issue,
    kind: "Worker-needs-user",
    what: d.blocker || "task-execute returned needs-user",
  }));
const needsUser = [...(scan.needs_user || []), ...laneNeedsUser];
const rawOpenIssueWorkRemains = Number.isFinite(scan.open_issue_count) && scan.open_issue_count > 0;
const moreToDo = (partition.held || []).length > 0
  || dispatched.some((d) => d.status && d.status !== "pr-open" && !d.status.startsWith("dry-run"))
  || prVerdicts.some((v) => v.verdict && v.verdict !== "merge-ok")
  // RP-11: an unattended autoMerge that returned merged:false is unfinished work, not a terminal
  // pass - the verdict was merge-ok but the PR is still open.
  || prVerdicts.some((v) => v.verdict === "merge-ok" && autoMerge && v.merged === false)
  || prVerdicts.some((v) => v.merged && v.workspace_ready && !["clean", "stashed"].includes(v.workspace_ready))
  || needsUser.length > 0;
// Terminal only when the FULL triage pool is empty (all open issues + dependency-cleared work), not
// just historical ready labels. Keying off scan.candidates alone would report
// done:true while the new buckets still hold dispatchable work (workflow-defect #562).
const done = !moreToDo && partition.lanes.length === 0 && (triageInput.length === 0) && !rawOpenIssueWorkRemains && (scan.open_prs || []).length === 0;
const nextAction = pendingTrackerWork.length
  ? "drain-pending-tracker-work"
  : (done ? "complete" : "rerun-or-closeout");

// RP-33: blocked-harness grill-stub ratio metric + alarm. A blocked stub = a grills-archive
// report carrying `GRILL: blocked-harness-unavailable` with no verified-SHA/verdict evidence;
// a rising ratio means merges are proceeding past an unavailable adversarial gate. Threshold
// 0.15: live baseline 0.083 (12/145 measured 2026-06-10 post-quarantine), the bad state the
// plan names was ~0.216 with merges proceeding. Advisory metric: never fails the wave.
let grillStats = { total: 0, blockedStubs: [], stubRatio: 0 };
try {
  const { createRequire } = process.getBuiltinModule("node:module");
  const { scanGrillArchive } = createRequire(import.meta.url)("../lib/grill-fixture-quarantine.js");
  grillStats = scanGrillArchive(`${ROOT}/ai/curaos/docs/grills`);
} catch (error) {
  log(`grill-stub metric skipped (${errorText(error)}) - advisory, non-blocking`);
}
const GRILL_STUB_ALARM_THRESHOLD = 0.15;
const grillStubAlarm = grillStats.stubRatio > GRILL_STUB_ALARM_THRESHOLD;
if (grillStubAlarm) {
  log(`WARN GRILL-STUB-ALARM: ${grillStats.blockedStubs.length}/${grillStats.total} grill reports are blocked-harness stubs (ratio ${grillStats.stubRatio.toFixed(3)} > ${GRILL_STUB_ALARM_THRESHOLD}); investigate grill-harness availability before trusting merge gates (RP-33)`);
}

return {
  milestones: scan.milestones,
  triaged: { ready: triaged.ready || [], not_ready: triaged.not_ready || [] },
  dispatched,
  dispatch_order: dispatchOrder,
  foresight,
  pre_breakdown: preBreakdown,
  pr_verdicts: prVerdicts,
  workspace_ready: prVerdicts.map((v) => ({ pr: v.pr, workspace_ready: v.workspace_ready || "n/a" })),
  needs_user: needsUser,
  pending_tracker_work: pendingTrackerWork,
  next_action: nextAction,
  grill_stub_ratio: grillStats.stubRatio,
  grill_blocked_stubs: grillStats.blockedStubs.length,
  grill_stub_alarm: grillStubAlarm,
  done,
};
}
