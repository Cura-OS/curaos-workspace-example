// opposite-harness-grill - adversarial Tier-2 grill of a code change; persists verdict to ai/curaos/docs/grills/.
// Contract: docs/agents/workflows/opposite-harness-grill.md
//
// Dual-runtime shape (workflow-defect #508): `export const meta` MUST be the FIRST statement so Claude's
// native Workflow() tool loads it. node:child_process/crypto/fs/path are reached only through the lazy
// accessors below (call-time, never module top level); the kit runs this file via process-bearing import()
// because it exports a default function.
export const meta = {
  name: "opposite-harness-grill",
  description: "Fresh-adversary Tier-2 grill of a code change; persist verdict to ai/curaos/docs/grills/",
  phases: [{ title: "Grill", detail: "adversary tries to break the change + persist verdict" }],
};

// Lazy node builtins: resolve `process` only at call time so module load stays meta-first and the Claude
// Workflow() tool (no process/require) can parse the file. Hoisted function declarations keep call sites intact.
let _np;
function np() {
  if (!_np) {
    _np = {
      cp: process.getBuiltinModule("node:child_process"),
      crypto: process.getBuiltinModule("node:crypto"),
      fs: process.getBuiltinModule("node:fs"),
      path: process.getBuiltinModule("node:path"),
    };
  }
  return _np;
}
function execFileSync(...a) { return np().cp.execFileSync(...a); }
function createHash(...a) { return np().crypto.createHash(...a); }
function appendFileSync(...a) { return np().fs.appendFileSync(...a); }
function existsSync(...a) { return np().fs.existsSync(...a); }
function mkdirSync(...a) { return np().fs.mkdirSync(...a); }
function statSync(...a) { return np().fs.statSync(...a); }
function writeFileSync(...a) { return np().fs.writeFileSync(...a); }
function dirname(...a) { return np().path.dirname(...a); }
function isAbsolute(...a) { return np().path.isAbsolute(...a); }
function relative(...a) { return np().path.relative(...a); }
function resolve(...a) { return np().path.resolve(...a); }

const CONTRACT = {
  name: "opposite-harness-grill",
  kind: "atomic",
  version: "0.2.0",
  inputs: {
    pr: { type: "string", required: false, description: "owner/repo#N PR to grill" },
    diff_ref: { type: "string", required: false, description: "git ref/range (default working tree)" },
    subject: { type: "string", required: true, description: "what is being grilled, e.g. 'm9-s2 identity dual-write'" },
    report_path: { type: "string", required: false, description: "where to write the grill verdict; relative paths anchor at the resolved workspace root, never the caller cwd (default ai/curaos/docs/grills/<subject-slug>-pr<num>.md when pr is set, else ai/curaos/docs/grills/<bounded-subject-slug>-<sha12>.md; synthetic runs default under scripts/test-fixtures/grills/)" },
    synthetic: { type: "boolean", required: false, description: "mark this run as a synthetic/fixture exercise: the report is quarantined under scripts/test-fixtures/grills/, never beside real verdicts, and carries the GRILL-SYNTHETIC marker. Also inferred when the subject contains the word 'synthetic' (the issue-621 fixture class). Default false." },
    opposite_harness: { type: "string", required: false, description: "which harness runs the adversary: 'codex' when the orchestrator is Claude (default), 'claude' when the orchestrator is Codex. Routes the grill through that harness's RESCUE agent - NOT a raw codex exec / claude -p shell call (those hang on approval prompts + stale broker sockets)." },
    opposite_harness_agent: { type: "string", required: false, description: "override the rescue agent subagent_type for the Codex->Claude direction (install-specific name; codex->codex-rescue is the confirmed Claude->Codex default)." },
    same_harness_agent: { type: "string", required: false, description: "agentType to use only when allow_same_harness_fallback=true" },
    probe_timeout_ms: { type: "number", required: false, description: "bounded harness-probe timeout; default 30000 (codex cold-start ~14s + hooks needs headroom; the inner alarm derives from this with a 2s margin)" },
    grill_timeout_ms: { type: "number", required: false, description: "bounded adversarial grill timeout; default 600000" },
    poll_timeout_ms: { type: "number", required: false, description: "P1b bounded poll budget for the written report after the rescue dispatch returns (a job-id placeholder or a still-flushing report); default 30000, capped by the remaining grill budget. <=0 degrades to a single reportWrittenSince check." },
    poll_interval_ms: { type: "number", required: false, description: "P1b poll interval while waiting for the written report; default 5000" },
    dimensions: { type: "array", required: false, description: "P5a opt-in parallel grill dimensions (subset of security/correctness/contract-PHI/performance); when set, fan out one adversary per dimension and fan-in dedup. Default unset = single-pass grill (unchanged)." },
    cache_bust: { type: "string", required: false, description: "P4b cache-bust token threaded by an independent re-grill cycle so a fresh cycle recomputes instead of reusing a same-head verdict; the cache key binds (head_sha, prompt-template-hash, cache_bust)." },
    prior_findings: { type: "array", required: false, description: "P1-3 unresolved findings carried in from prior full-review/re-grill cycles. A DELTA re-grill (diff_ref=<prev-sha>..HEAD) only sees changed hunks, so the adversary MUST re-verify each prior finding against the current code and keep any still-unresolved finding in `issues` + `unresolved_findings`; a clean delta that did not touch a prior finding's code does NOT resolve it. Only a finding the adversary explicitly confirms fixed is dropped." },
    allow_same_harness_fallback: { type: "boolean", required: false, description: "opt-in same-harness fallback when opposite harness is unavailable; default false" },
  },
  outputs: {
    verdict: { type: "string", description: "pass | issues-found | block | skipped-harness-unavailable" },
    grill: { type: "string", description: "opposite-harness | blocked-harness-unavailable | same-harness-fallback" },
    issues: { type: "array", description: "confirmed issues the grill surfaced" },
    unresolved_findings: { type: "array", description: "P1-3 the still-unresolved subset (this cycle's findings PLUS any carried prior_findings the adversary could not confirm fixed); the caller carries this forward so a clean delta never silently drops a prior full-review finding." },
    report_path: { type: "string", description: "absolute path of the persisted grill verdict" },
    verified_sha: { type: "string", description: "the git head commit SHA the grill actually reviewed; empty when the adversarial leg did not complete" },
    workflow_defect: { type: "boolean", description: "true when the workflow infrastructure, not the grilled PR, failed to produce the required artifact" },
    workflow_defect_kind: { type: "string", description: "machine-readable workflow defect reason when workflow_defect=true" },
  },
  guarantees: { idempotent: false, determinism: "control-flow-only", side_effects: "fs" },
  verification: "T2",
  models: { grill: "sonnet" },
  composes: [],
};

const MAX_REPORT_SLUG_CHARS = 96;
// RP-27: artifact destinations resolve from an ABSOLUTE workspace root - never the caller cwd and
// never `..`-relative hops, which escape linked worktrees into git-invisible paths (the
// .worktrees/ai/ stray-doc class). Resolution order: WORKSPACE_ROOT env override (marker-validated)
// -> git toplevel + superproject climb out of nested submodule checkouts -> cwd fallback for runs
// outside any marker-bearing git checkout. A linked worktree of the workspace is a VALID root: its
// tracked ai/curaos/docs/grills/ is the git-visible destination on that lane's branch.
// MIRROR CONTRACT: these three functions are textually identical to scripts/lib/workspace-root.js
// (this file cannot require the lib: its source runs via `new Function` in the truth contract,
// where import.meta is unavailable). Keep them in lockstep.
function workspaceRootMarker(dir) {
  return Boolean(dir) && existsSync(`${dir}/AGENTS.md`) && existsSync(`${dir}/ai`);
}
function gitPathOutput(args, cwd) {
  try {
    // env snapshot at call time: under Bun, execFileSync without an explicit env uses the
    // process START env, silently dropping later process.env mutations (e.g. a test setting
    // GIT_CEILING_DIRECTORIES); Node inherits live. Spread keeps both runtimes consistent.
    return String(execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: { ...process.env } })).trim();
  } catch {
    return "";
  }
}
function resolveWorkspaceRoot(env, startDir) {
  const override = env && typeof env === "object" && env.WORKSPACE_ROOT ? String(env.WORKSPACE_ROOT).trim() : "";
  if (override && isAbsolute(override) && workspaceRootMarker(override)) return resolve(override);
  let dir = gitPathOutput(["rev-parse", "--show-toplevel"], startDir);
  for (let hops = 0; dir && hops < 10; hops += 1) {
    const superproject = gitPathOutput(["rev-parse", "--show-superproject-working-tree"], dir);
    if (!superproject || superproject === dir) break;
    dir = superproject;
  }
  if (dir && isAbsolute(dir) && workspaceRootMarker(dir)) return resolve(dir);
  return resolve(startDir || ".");
}
// Lazy caches: resolve()/git run at call time so module load stays meta-first (Claude Workflow() has no path builtin).
let _workspaceRoot;
function workspaceRoot() {
  if (!_workspaceRoot) _workspaceRoot = resolveWorkspaceRoot(process && process.env);
  return _workspaceRoot;
}
let _grillsDir;
function grillsDir() {
  if (!_grillsDir) _grillsDir = resolve(`${workspaceRoot()}/ai/curaos/docs/grills`);
  return _grillsDir;
}
// RP-33 fixture quarantine: synthetic/fixture exercises of this workflow must NEVER land beside
// real verdicts in ai/curaos/docs/grills/ (the issue-621 fixture class). A run is synthetic when
// the caller passes synthetic=true (primary, explicit) or the subject carries the word "synthetic"
// (backstop for manual defect-verification runs that predate the flag; intentionally NOT "fixture",
// which appears in real wave subjects describing fixture-based tests). Quarantined reports default
// under scripts/test-fixtures/grills/ and carry the GRILL-SYNTHETIC marker line.
// MIRROR CONTRACT: SYNTHETIC_GRILL_MARKER + isSyntheticGrillSubject are textually identical to
// scripts/lib/grill-fixture-quarantine.js (this file cannot require the lib: its source runs via
// `new Function` in the truth contract, where import.meta is unavailable). Keep them in lockstep.
const SYNTHETIC_GRILL_MARKER = "GRILL-SYNTHETIC: true";
function isSyntheticGrillSubject(subject) {
  return /\bsynthetic\b/i.test(String(subject || ""));
}
function isSyntheticGrillRun(cfg) {
  return Boolean(cfg) && (cfg.synthetic === true || isSyntheticGrillSubject(cfg.subject));
}
let _grillQuarantineDir;
function grillQuarantineDir() {
  if (!_grillQuarantineDir) _grillQuarantineDir = resolve(`${workspaceRoot()}/scripts/test-fixtures/grills`);
  return _grillQuarantineDir;
}
function parseArgs(a) {
  if (a && typeof a === "object") return a;
  if (typeof a === "string" && a.trim()) { try { return JSON.parse(a); } catch { return {}; } }
  return {};
}
function rawReportSlug(subject) {
  return String(subject || "grill")
    .replace(/\W+/g, "-")
    .toLowerCase()
    .replace(/^-+|-+$/g, "") || "grill";
}
function boundedReportSlug(subject) {
  const raw = rawReportSlug(subject);
  const hash = createHash("sha256").update(String(subject || "")).digest("hex").slice(0, 12);
  const prefixLimit = Math.max(8, MAX_REPORT_SLUG_CHARS - hash.length - 1);
  const prefix = raw.slice(0, prefixLimit).replace(/-+$/g, "") || "grill";
  return `${prefix}-${hash}`;
}
function prNumberFrom(pr) {
  const match = String(pr || "").trim().match(/^(?:[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+#)?(\d+)$/);
  return match ? match[1] : "";
}
// RP-33 naming: PR grills derive the canonical archive filename <milestone-story>-pr<num>.md from
// the subject + PR number (wave subjects are milestone-story scoped), matching the binding name in
// ai/curaos/docs/grills/README.md. The hashed machine slug remains only for PR-less local-diff
// grills, where the subject hash is the only stable identity. Still bounded: the prefix truncates
// so the filename cannot exceed filesystem limits, and a subject already ending in -pr<num> is not
// double-suffixed.
function defaultReportName(subject, pr) {
  const prNum = prNumberFrom(pr);
  if (!prNum) return `${boundedReportSlug(subject)}.md`;
  const suffix = `-pr${prNum}`;
  const prefixLimit = Math.max(8, MAX_REPORT_SLUG_CHARS - suffix.length);
  const prefix = rawReportSlug(subject).slice(0, prefixLimit).replace(/-+$/g, "") || "grill";
  return prefix.endsWith(suffix) ? `${prefix}.md` : `${prefix}${suffix}.md`;
}
function reportPathWithinDir(baseDir, reportPath) {
  const rel = relative(baseDir, resolve(reportPath || ""));
  return rel === "" || (!!rel && !rel.startsWith("..") && !isAbsolute(rel));
}
function timeoutNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
// RP-03: a grill verdict is only valid for the exact commit it reviewed. Anything that is not a
// full 40-hex sha normalizes to "" so downstream merge gates fail closed on it.
function normalizedVerifiedSha(value) {
  const sha = String(value || "").trim().toLowerCase();
  return /^[0-9a-f]{40}$/.test(sha) ? sha : "";
}
// P4b head-binding (issue #706, grill BLOCK regression): the cache key MUST bind the RESOLVED head
// sha of the commit the grill is about to review, not the PR ref. Resolve it in executor code BEFORE
// computing the cache key by running the same `verifiedShaCmd` the adversary pins from (PR headRefOid
// for a PR grill, `git rev-parse HEAD` for a local-diff grill). A second commit on the same PR moves
// the head, so the resolved sha changes and the cache key changes - a stale PASS can no longer be
// reused after a new push. Returns a normalized 40-hex sha or "" (the command failed / not a sha);
// "" is still a deterministic key component (and never silently reuses a real-sha entry). Pure +
// injectable (runFn) so the truth contract exercises it without a real gh/git call.
function resolveHeadSha(verifiedShaCmd, runFn) {
  const run = runFn || ((cmd) => {
    try { return String(execFileSync("sh", ["-lc", cmd], { encoding: "utf8", timeout: 30000, maxBuffer: 1024 * 1024 })); }
    catch { return ""; }
  });
  return normalizedVerifiedSha(run(verifiedShaCmd));
}
function ghPrCommand(verb, pr) {
  const ref = String(pr || "").trim();
  const match = ref.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)#(\d+)$/);
  if (match) return `gh pr ${verb} ${match[3]} --repo ${match[1]}/${match[2]}`;
  if (/^\d+$/.test(ref)) return `gh pr ${verb} ${ref}`;
  throw new Error(`opposite-harness-grill: invalid PR ref ${JSON.stringify(ref)}; expected owner/repo#N or N`);
}
function gitDiffCommand(diffRef) {
  const ref = String(diffRef || "").trim();
  if (!/^[A-Za-z0-9_./^~@{}-]+(?:\.{2,3}[A-Za-z0-9_./^~@{}-]+)?$/.test(ref)) {
    throw new Error(`opposite-harness-grill: invalid diff_ref ${JSON.stringify(ref)}`);
  }
  return `git diff ${ref}`;
}
function probeCommand(opposite, timeoutMs) {
  if (opposite === "claude") {
    return "command -v claude && claude --version";
  }
  // Codex cold-start (CLI boot + SessionStart hooks + a minimal gpt-5.4-mini turn) measures ~14s
  // on a warm machine, so a hardcoded `alarm 15` produced spurious "harness unavailable" blocks of
  // every PR. Derive the inner alarm from the probe budget with a 2s margin below the outer
  // execFileSync timeout (floor 18s) so a genuinely-available codex is not killed mid-boot while a
  // truly-hung probe still fails fast under the outer timeout.
  const innerAlarmSec = Math.max(18, Math.floor((Number(timeoutMs) || 20000) / 1000) - 2);
  return `command -v codex && codex --version && perl -e 'alarm ${innerAlarmSec}; exec @ARGV' codex exec -m gpt-5.4-mini -c model_reasoning_effort=low --sandbox read-only --output-last-message /tmp/curaos-codex-grill-probe.md 'Return exactly OK.'`;
}
function lastLines(text, limit = 15) {
  return String(text || "").split(/\r?\n/).filter(Boolean).slice(-limit).join("\n");
}
function errorOutput(error) {
  return [
    error && error.stdout,
    error && error.stderr,
    error && error.message,
  ].filter(Boolean).join("\n");
}
function runProbe(opposite, timeoutMs) {
  const command = probeCommand(opposite, timeoutMs);
  try {
    const output = execFileSync("sh", ["-lc", command], {
      encoding: "utf8",
      timeout: timeoutMs,
      maxBuffer: 1024 * 1024,
    });
    return {
      available: true,
      reason: "probe exited 0",
      evidence: lastLines(output) || `${opposite} probe exited 0`,
    };
  } catch (error) {
    const timedOut = error && (error.signal === "SIGTERM" || error.code === "ETIMEDOUT");
    return {
      available: false,
      reason: timedOut ? `probe timed out after ${timeoutMs}ms` : `probe exited ${error && error.status !== undefined ? error.status : "non-zero"}`,
      evidence: lastLines(errorOutput(error)) || `${opposite} probe failed with no output`,
    };
  }
}
function blockedReportPrompt(reportPath, cfg, opposite, rescueAgentType, probe, timeoutMs) {
  const probeJson = JSON.stringify(probe || {});
  return `Persist an unavailable opposite-harness grill report at ${reportPath}. Work from ${workspaceRoot()}. Use Bash to mkdir -p the parent dir and write markdown. If the file exists, append a "## Re-grill verification" section; otherwise create it. The report MUST include these exact lines:
GRILL: blocked-harness-unavailable
GRILL-PROBE: ${probeJson}
GRILL-HARNESS: ${opposite}
GRILL-AGENT: ${rescueAgentType}
GRILL-TIMEOUT-MS: ${timeoutMs}
Then explain that the opposite-harness adversarial leg failed fast and no single-reviewer fallback should be treated as a completed opposite-harness grill. Return report_path="${reportPath}".`;
}
function blockedReportMarkdown(cfg, opposite, rescueAgentType, probe, timeoutMs, reason) {
  // RP-33: synthetic runs stamp the quarantine marker so archive scans can prove no fixture ever
  // sits beside real verdicts, even if one is mis-routed.
  const syntheticLine = isSyntheticGrillRun(cfg) ? `\n${SYNTHETIC_GRILL_MARKER}` : "";
  return `GRILL: blocked-harness-unavailable
GRILL-PROBE: ${JSON.stringify(probe || {})}
GRILL-HARNESS: ${opposite}
GRILL-AGENT: ${rescueAgentType}
GRILL-TIMEOUT-MS: ${timeoutMs}
GRILL-REASON: ${reason}${syntheticLine}

The opposite-harness adversarial leg failed fast and no single-reviewer fallback should be treated as a completed opposite-harness grill.
Subject: ${cfg.subject || "(unknown)"}
`;
}
function writeBlockedReport(reportPath, cfg, opposite, rescueAgentType, probe, timeoutMs, reason) {
  mkdirSync(dirname(reportPath), { recursive: true });
  const markdown = blockedReportMarkdown(cfg, opposite, rescueAgentType, probe, timeoutMs, reason);
  if (existsSync(reportPath)) {
    const today = new Date().toISOString().slice(0, 10);
    appendFileSync(reportPath, `\n\n## Re-grill verification (${today})\n\n${markdown}`);
  } else {
    writeFileSync(reportPath, `# Opposite Harness Grill Blocked\n\n${markdown}`);
  }
  return reportPath;
}
function reportWrittenSince(reportPath, startedAtMs) {
  if (!existsSync(reportPath)) return false;
  return statSync(reportPath).mtimeMs >= startedAtMs - 1000;
}
// P1b (issue #706): bounded poll loop. The rescue dispatch can return a non-terminal job-id
// placeholder (codex companion returns the job before the written report lands) OR a terminal
// verdict whose report file is still flushing. Instead of a single reportWrittenSince() snapshot
// (which mis-fires both cases as opposite-harness-report-missing and forced externally hand-rolled
// bg file-watchers), poll the artifact path every pollIntervalMs until it is freshly written or the
// bounded deadline elapses. Pure + injectable (nowFn/existsFn/statFn/sleepFn) so the truth contract
// exercises it without real timers. Returns true the instant a fresh report exists, false when the
// deadline passes with no fresh write. A non-positive pollTimeoutMs degrades to a single check
// (the legacy reportWrittenSince behavior) so callers can opt out.
function pollForReport(reportPath, startedAtMs, pollTimeoutMs, pollIntervalMs, pollDeps) {
  const deps = pollDeps || {};
  const existsFn = deps.existsFn || existsSync;
  const statFn = deps.statFn || statSync;
  const nowFn = deps.nowFn || Date.now;
  // Default blocking sleep via Atomics.wait on a throwaway SharedArrayBuffer: a real synchronous
  // pause with no CPU spin and no child process, so the bounded poll does not peg a core while it
  // waits for the rescue report to flush. Tests inject a no-op sleepFn + a virtual clock instead.
  const sleepFn = deps.sleepFn || ((ms) => { try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Math.max(0, ms)); } catch { const end = Date.now() + ms; while (Date.now() < end) { /* fallback */ } } });
  const writtenSince = () => existsFn(reportPath) && statFn(reportPath).mtimeMs >= startedAtMs - 1000;
  if (writtenSince()) return true;
  const budget = Number(pollTimeoutMs);
  if (!Number.isFinite(budget) || budget <= 0) return false;
  const interval = Number.isFinite(Number(pollIntervalMs)) && Number(pollIntervalMs) > 0 ? Number(pollIntervalMs) : 5000;
  const deadline = nowFn() + budget;
  while (nowFn() < deadline) {
    const remaining = deadline - nowFn();
    sleepFn(Math.min(interval, Math.max(0, remaining)));
    if (writtenSince()) return true;
  }
  return writtenSince();
}
// P5a (issue #706): fan-in dedup aggregator for parallel grill dimensions. Each dimension
// (security / correctness / contract-PHI / performance) returns its own findings list; the
// aggregator merges them, dedups, keeps the first seen of a true duplicate, and returns a single
// severity-ranked list so the wall-clock is max(dimension) not sum while precision stays
// per-dimension. Pure: testable in isolation.
// P2 (issue #706 grill soundness): the dedup key includes a location/evidence hash, not just
// (severity, title). Two distinct findings that share a severity+title but point at different
// locations/evidence (e.g. the SAME missing-authz title on two different endpoints) are SEPARATE
// findings; a (severity, title)-only key silently collapsed them and dropped a real second issue.
// The location/evidence component is hashed (stable, bounded) from `location`/`path`/`line` when
// present, falling back to `evidence`, so only a genuine duplicate (same severity, title, and
// location/evidence) is merged.
function grillFindingEvidenceKey(raw) {
  const loc = [raw && raw.location, raw && raw.path, raw && raw.line, raw && raw.file]
    .filter((v) => v !== undefined && v !== null && String(v).trim() !== "")
    .map((v) => String(v).trim())
    .join("|");
  const basis = loc || String((raw && raw.evidence) || "").trim();
  return createHash("sha256").update(basis.toLowerCase().replace(/\s+/g, " ")).digest("hex").slice(0, 16);
}
function dedupeGrillFindings(findingLists) {
  const order = { critical: 0, high: 1, medium: 2, low: 3, blocker: 0 };
  const byKey = new Map();
  for (const list of findingLists || []) {
    for (const raw of Array.isArray(list) ? list : []) {
      if (!raw || typeof raw !== "object") continue;
      const severity = String(raw.severity || "low").toLowerCase();
      const what = String(raw.what || "").trim();
      const key = `${severity}::${what.toLowerCase().replace(/\s+/g, " ")}::${grillFindingEvidenceKey(raw)}`;
      const existing = byKey.get(key);
      if (!existing) byKey.set(key, { ...raw, severity });
    }
  }
  return [...byKey.values()].sort((a, b) => {
    const sa = order[String(a.severity).toLowerCase()] ?? 9;
    const sb = order[String(b.severity).toLowerCase()] ?? 9;
    return sa - sb;
  });
}
// P5a verdict fold: a fan-out's overall verdict is the worst across its dimensions (block beats
// issues-found beats pass). skipped-harness-unavailable is handled before fan-out, never here.
function worstGrillVerdict(verdicts) {
  const rank = { block: 0, "issues-found": 1, pass: 2 };
  let worst = "pass";
  for (const v of verdicts || []) {
    if ((rank[v] ?? 3) < (rank[worst] ?? 3)) worst = v;
  }
  return worst;
}
// P1-4 (issue #706 fan-in soundness): require ALL fan-out dimensions to report the SAME 40-hex head
// sha. The prior `.find(Boolean)` took the FIRST valid sha, so dimensions that reviewed DIFFERENT
// commits (a mid-fan push moved the head between dispatches) silently aggregated under one sha and a
// downstream merge gate bound the verdict to a commit some dimensions never saw. This fail-closes:
// returns { sha } only when every dimension's normalized sha is present AND identical; otherwise
// returns { block: <reason> } so the fan-out blocks (a missing sha on any dimension, or a divergence,
// is an unproven review, not a consensus). Pure: testable in isolation.
function fanInConsensusSha(dimResults) {
  const results = Array.isArray(dimResults) ? dimResults : [];
  if (!results.length) return { block: "no dimension results to form a consensus head sha" };
  const shas = results.map((r) => normalizedVerifiedSha(r && r.verified_sha));
  const missing = shas.filter((s) => !s).length;
  if (missing) return { block: `${missing} fan-out dimension(s) returned no valid 40-hex verified_sha; an unproven dimension blocks the fan-out` };
  const unique = [...new Set(shas)];
  if (unique.length > 1) return { block: `fan-out dimensions reviewed divergent head shas (${unique.join(", ")}); a mixed-head fan-out is not a single completed review` };
  return { sha: unique[0] };
}
// P1-3 (issue #706 delta-regrill soundness): the executor backstop for carried prior findings. A
// delta re-grill MAY return issues-found while silently OMITTING a prior finding it never touched
// (the adversary saw only the changed hunks). The carrier (pr-verify-merge / milestone-wave) must
// not lose that finding, so the executor folds every prior finding the adversary did NOT explicitly
// re-report into `unresolved_findings`: a prior finding is dropped ONLY when the adversary's
// unresolved_findings/issues list re-asserts it (still open) OR the overall verdict is pass/block
// (the whole prior set is resolved or escalated). Pure (keyed on severity::what); testable in isolation.
function findingKey(f) {
  return `${String((f && f.severity) || "").toLowerCase()}::${String((f && f.what) || "").trim().toLowerCase()}`;
}
function mergeUnresolvedFindings(result, priorFindings) {
  const prior = Array.isArray(priorFindings) ? priorFindings.filter((f) => f && typeof f === "object") : [];
  const verdict = result && result.verdict;
  // A clean pass means the adversary affirmatively cleared the change; a block escalates everything.
  // Neither carries prior findings forward. Only an issues-found verdict folds the un-re-asserted prior.
  const reAsserted = [
    ...(Array.isArray(result && result.unresolved_findings) ? result.unresolved_findings : []),
    ...(Array.isArray(result && result.issues) ? result.issues : []),
  ];
  const reAssertedKeys = new Set(reAsserted.map(findingKey));
  if (verdict !== "issues-found") return reAsserted;
  const survived = prior.filter((f) => !reAssertedKeys.has(findingKey(f)));
  // Dedup the union (re-asserted unresolved/issues + surviving prior) on severity::what.
  const out = [];
  const seen = new Set();
  for (const f of [...reAsserted, ...survived]) {
    const k = findingKey(f);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(f);
  }
  return out;
}
// P4b (issue #706): grill report cache key. A grill verdict is statistically valid only for the
// exact (reviewed commit, prompt template) pair. The cache key binds both so a re-run within ONE
// cycle reuses the verdict, while an independent re-grill cycle (new head sha after a fix, or an
// explicit cache_bust token) recomputes. promptTemplateHash is a stable hash of the prompt body so
// a prompt-template change invalidates stale cached verdicts.
function grillPromptTemplateHash(promptTemplate) {
  return createHash("sha256").update(String(promptTemplate || "")).digest("hex").slice(0, 16);
}
function grillCacheKey(headSha, promptTemplateHash, cacheBust) {
  const sha = String(headSha || "").trim().toLowerCase();
  const bust = String(cacheBust || "").trim();
  return createHash("sha256").update(`${sha}::${promptTemplateHash || ""}::${bust}`).digest("hex").slice(0, 24);
}
// P5b (issue #706): assert the resolved workspace root is marker-safe BEFORE writing a grill
// report, so a report never lands inside a code submodule (which lacks the AGENTS.md + ai/ marker)
// when the workflow runs from an uninitialized/nested checkout. Returns a non-empty problem string
// when a git toplevel was resolved but it is NOT a marker-bearing workspace root (the genuine
// "inside a submodule" danger). A pure cwd fallback outside any git checkout (the stub/fixture path)
// is allowed: gitTopFn returns "" there, so no false positive. Injectable for the truth contract.
function grillRootUnsafeReason(resolvedRoot, rootDeps) {
  const deps = rootDeps || {};
  const markerFn = deps.markerFn || workspaceRootMarker;
  const isAbsoluteFn = deps.isAbsoluteFn || isAbsolute;
  const gitTopFn = deps.gitTopFn || ((dir) => gitPathOutput(["rev-parse", "--show-toplevel"], dir));
  if (markerFn(resolvedRoot)) return "";
  const gitTop = gitTopFn(resolvedRoot);
  // A real `git rev-parse --show-toplevel` is always an ABSOLUTE path; requiring isAbsolute filters
  // out non-git fixture roots and stub execFileSync shims (which echo a non-path token), so the pure
  // cwd-fallback test/fixture path never false-positives. Only a real git toplevel that is not the
  // marker-bearing workspace root (a code submodule / uninitialized nested checkout) fails closed.
  if (gitTop && isAbsoluteFn(gitTop)) {
    return `grill report root ${resolvedRoot} is inside a git checkout (${gitTop}) that is not a marker-bearing workspace root (AGENTS.md + ai/); refusing to write a grill report into a code submodule`;
  }
  return "";
}
function pathsMatch(actualPath, expectedPath) {
  if (!actualPath || typeof actualPath !== "string") return false;
  return resolve(actualPath) === resolve(expectedPath);
}
function missingReportResult(reportPath, cfg, opposite, grillAgentType, grillTimeoutMs, result, detail) {
  const persistedReport = writeBlockedReport(reportPath, cfg, opposite, grillAgentType, {
    available: false,
    reason: "opposite-harness grill report missing",
    evidence: JSON.stringify(result || {}),
  }, grillTimeoutMs, detail || "grill-result-missing-report");
  return {
    verdict: "skipped-harness-unavailable",
    grill: "blocked-harness-unavailable",
    issues: [{ severity: "high", what: "opposite-harness grill report missing", evidence: `Expected fresh report at ${reportPath}; agent returned ${result && result.report_path ? result.report_path : "<empty>"}` }],
    report_path: persistedReport,
    verified_sha: "",
    workflow_defect: true,
    workflow_defect_kind: "opposite-harness-report-missing",
  };
}
function invalidReportPathResult(reportPath, invalidReportPath, cfg, opposite, grillAgentType, grillTimeoutMs, expectedDir) {
  const persistedReport = writeBlockedReport(reportPath, cfg, opposite, grillAgentType, {
    available: false,
    reason: "opposite-harness report path outside grills directory",
    evidence: `Rejected report_path ${invalidReportPath}; expected path under ${expectedDir}`,
  }, grillTimeoutMs, "opposite-harness report path outside grills directory");
  return {
    verdict: "skipped-harness-unavailable",
    grill: "blocked-harness-unavailable",
    issues: [{ severity: "high", what: "opposite-harness report_path outside grills directory", evidence: `Rejected report_path ${invalidReportPath}; expected path under ${expectedDir}` }],
    report_path: persistedReport,
    verified_sha: "",
    workflow_defect: true,
    workflow_defect_kind: "opposite-harness-report-path-outside-grills",
  };
}
function finalizeGrillResult(result, finalReportPath, grillStartedAt, onMissingReport, pollSpec) {
  if (!pathsMatch(result && result.report_path, finalReportPath)) {
    return onMissingReport("grill-result-report-path-missing-or-mismatched", result);
  }
  // P1b (issue #706): the rescue dispatch can return the terminal verdict before the written report
  // has fully flushed to disk (or after returning a job-id placeholder whose report lands shortly
  // after). Replace the single reportWrittenSince() snapshot with a bounded poll so the executor
  // waits for the WRITTEN report instead of immediately declaring opposite-harness-report-missing
  // (which forced externally hand-rolled bg file-watchers). pollSpec omitted => single check
  // (legacy behavior; the 4-arg call sites + the extracted-function truth contract are unchanged).
  const written = pollSpec && pollSpec.poll_timeout_ms
    ? pollForReport(finalReportPath, grillStartedAt, pollSpec.poll_timeout_ms, pollSpec.poll_interval_ms, pollSpec.deps)
    : reportWrittenSince(finalReportPath, grillStartedAt);
  if (!written) {
    return onMissingReport("grill-result-missing-report", result);
  }
  return { ...result, report_path: finalReportPath };
}

export default async function workflow({ args, agent, phase, log }) {
  phase("Grill");
  const cfg = parseArgs(args);
  if (!cfg.subject) throw new Error("opposite-harness-grill: args.subject is required");
  // RP-33: synthetic/fixture runs quarantine to scripts/test-fixtures/grills/; real runs land in the
  // live archive. PR grills get the canonical <subject-slug>-pr<num>.md name; PR-less grills keep
  // the bounded hashed slug.
  const synthetic = isSyntheticGrillRun(cfg);
  const reportDir = synthetic ? grillQuarantineDir() : grillsDir();
  const reportName = defaultReportName(cfg.subject, cfg.pr);
  const slug = reportName.replace(/\.md$/, "");
  // RP-27: relative caller-supplied report paths anchor at the workspace root, never the caller cwd.
  const requestedReportPath = cfg.report_path
    ? (isAbsolute(cfg.report_path) ? resolve(cfg.report_path) : resolve(`${workspaceRoot()}/${cfg.report_path}`))
    : resolve(`${reportDir}/${reportName}`);
  const reportPath = reportPathWithinDir(reportDir, requestedReportPath) ? requestedReportPath : resolve(`${reportDir}/${reportName}`);
  const diffCmd = cfg.pr ? ghPrCommand("diff", cfg.pr) : (cfg.diff_ref ? gitDiffCommand(cfg.diff_ref) : "git diff HEAD");
  // RP-03: the command the adversary runs to pin the exact commit this verdict applies to. PR grills
  // read the PR head at grill time; local-diff grills read the working checkout's HEAD.
  const verifiedShaCmd = cfg.pr
    ? `env -u GITHUB_TOKEN ${ghPrCommand("view", cfg.pr)} --json headRefOid --jq .headRefOid`
    : "git rev-parse HEAD";
  const probeTimeoutMs = timeoutNumber(cfg.probe_timeout_ms, 30000);
  const grillTimeoutMs = timeoutNumber(cfg.grill_timeout_ms, 600000);
  // P1b poll budget for the WRITTEN report after the rescue dispatch returns. Default 30s, never
  // larger than the remaining grill budget. <=0 degrades to a single reportWrittenSince() check.
  const pollTimeoutMs = Math.max(0, Math.min(timeoutNumber(cfg.poll_timeout_ms, 30000), grillTimeoutMs));
  const pollIntervalMs = timeoutNumber(cfg.poll_interval_ms, 5000);
  // P5b: refuse to write a grill report into a code submodule (no AGENTS.md + ai/ marker). A pure
  // cwd fallback outside any git checkout (stub/fixture path) is allowed; only a real git toplevel
  // that is not the marker-bearing workspace root fails closed.
  const rootUnsafe = grillRootUnsafeReason(workspaceRoot());
  if (rootUnsafe) {
    log(`WARN: ${rootUnsafe}`);
    return {
      verdict: "skipped-harness-unavailable",
      grill: "blocked-harness-unavailable",
      issues: [{ severity: "high", what: "grill report root unsafe", evidence: rootUnsafe }],
      report_path: "",
      verified_sha: "",
      workflow_defect: true,
      workflow_defect_kind: "grill-report-root-unsafe",
    };
  }

// Harness-aware adversary routing: a TRUE cross-harness grill runs the adversary in the OPPOSITE harness
// via its RESCUE agent - never a raw `codex exec` / `claude -p` shell call (those hang on approval prompts
// + contend with stale companion broker sockets). Default opposite = codex (orchestrator is Claude).
// codex:codex-rescue is CONFIRMED (Agent subagent_type resolves it; it owns the codex companion runtime -
// session/approvals/read-only sandbox/result parsing). When the orchestrator is Codex, the opposite is the
// Codex plugin's claude-rescue agent - set its exact subagent_type via opposite_harness_agent (the name is
// install-specific; confirm in the active Codex plugin before relying on it). Fall back to codex:codex-rescue.
  const opposite = (cfg.opposite_harness || "codex").toLowerCase();
  const rescueAgentType = opposite === "claude" ? (cfg.opposite_harness_agent || "claude-rescue") : "codex:codex-rescue";
  const sameHarnessFallback = cfg.allow_same_harness_fallback === true;
  const grillAgentType = sameHarnessFallback && cfg.same_harness_agent ? cfg.same_harness_agent : rescueAgentType;
  let grillStatus = "opposite-harness";
  let blockedProbe = null;

  if (!reportPathWithinDir(reportDir, requestedReportPath)) {
    return invalidReportPathResult(reportPath, requestedReportPath, cfg, opposite, grillAgentType, grillTimeoutMs, reportDir);
  }

  const probe = runProbe(opposite, probeTimeoutMs);

  if (!probe || probe.available !== true) {
    log(`WARN: opposite-harness grill unavailable for ${opposite}: ${probe && probe.reason ? probe.reason : "probe failed"}`);
    blockedProbe = probe || { available: false, reason: "harness-probe returned no result", evidence: "" };
    if (sameHarnessFallback) {
      grillStatus = "same-harness-fallback";
      log(`WARN: same-harness fallback explicitly enabled for ${opposite}; opposite harness remains unavailable`);
    } else {
      const persistedReport = writeBlockedReport(reportPath, cfg, opposite, rescueAgentType, probe, probeTimeoutMs, probe && probe.reason ? probe.reason : "harness-probe failed");
      return {
        verdict: "skipped-harness-unavailable",
        grill: "blocked-harness-unavailable",
        issues: [{ severity: "high", what: `opposite harness ${opposite} unavailable`, evidence: probe && probe.evidence ? probe.evidence : probe && probe.reason ? probe.reason : "harness-probe failed" }],
        report_path: persistedReport,
        verified_sha: "",
      };
    }
  }

  const grillStartedAt = Date.now();
  // P4b head-binding (issue #706, grill BLOCK regression): resolve the head sha of the commit this
  // grill is about to review BEFORE computing any cache key, then bind the key to (resolved head sha,
  // prompt-template-hash, cache_bust). Using the PR ref (cfg.pr) as the sha component would let a
  // second commit on the SAME PR hit the prior cache entry and reuse a stale PASS; the resolved head
  // moves on a new push, so the key recomputes. resolveHeadSha runs the same verifiedShaCmd the
  // adversary pins from (PR headRefOid / git rev-parse HEAD) and normalizes to 40-hex (or "").
  const resolvedHeadSha = resolveHeadSha(verifiedShaCmd);
  // P5a: when cfg.dimensions is set, fan out one adversary per dimension (security / correctness /
  // contract-PHI / performance) and fan-in dedup. Default unset = single-pass grill (unchanged).
  const ALLOWED_DIMENSIONS = ["security", "correctness", "contract-PHI", "performance"];
  const requestedDimensions = Array.isArray(cfg.dimensions)
    ? cfg.dimensions.map((d) => String(d)).filter((d) => ALLOWED_DIMENSIONS.includes(d))
    : [];
  // P1-3: prior unresolved findings the caller carries in from earlier full-review/re-grill cycles.
  // A DELTA re-grill only inspects changed hunks, so without this the adversary would never re-check
  // a prior finding whose code was not touched this cycle, and a clean delta would silently drop it.
  const priorFindings = Array.isArray(cfg.prior_findings) ? cfg.prior_findings.filter((f) => f && typeof f === "object") : [];
  // dispatchGrill builds + runs ONE adversary pass. dimensionLabel scopes the pass (P5a); when
  // empty it is the single exhaustive pass. perDimReportPath is the artifact the adversary writes
  // (the canonical reportPath for the single pass, a per-dimension sibling for fan-out).
  const dispatchGrill = (dimensionLabel, perDimReportPath) => {
    const promptTemplate = `You are a FRESH ADVERSARY grilling a CuraOS code change FROM THE ${grillStatus === "same-harness-fallback" ? "SAME HARNESS FALLBACK" : `OPPOSITE HARNESS (${opposite})`}. ${grillStatus === "same-harness-fallback" ? `The opposite harness probe failed, but allow_same_harness_fallback=true was explicitly set. The report MUST include GRILL: same-harness-fallback and GRILL-PROBE: ${JSON.stringify(blockedProbe)} so this is never mistaken for a completed opposite-harness review.` : "A different model family catches blind spots the authoring harness cannot."} Work from ${workspaceRoot()}. Subject: "${cfg.subject}". BEFORE reading the diff, pin the exact commit this verdict applies to: run \`${verifiedShaCmd}\` (Bash) and return its 40-hex output verbatim as verified_sha; downstream merge gates fail closed when verified_sha is missing or no longer equals the PR head. Inspect the change via \`${diffCmd}\` (Bash) + read the touched files. Use a READ-ONLY sandbox at high reasoning effort.
Complete the grill within ${grillTimeoutMs}ms. If the rescue runtime or any shell command stalls, fail fast by writing the blocked-harness report to ${perDimReportPath} with GRILL: blocked-harness-unavailable and return verdict="skipped-harness-unavailable"; do not leave a silent hanging process. Returning pass/issues-found/block without a non-empty report_path that resolves to ${perDimReportPath} and without writing a fresh report there is impossible output and will be recorded as workflow_defect=true.
Your job: BREAK it. Construct concrete failure scenarios, find unhandled edge cases, race conditions, boundary/PHI violations, refute the change's correctness claims. Assume it is wrong until you've tried hard to break it. Verify against the actual code + the relevant ai/rules + owning ADR.
EXHAUSTIVE-FIRST (issue #706, kills one-finding-per-cycle thrash): in THIS single pass return the COMPLETE, severity-ranked, deduplicated findings list - every issue you can find across security, correctness, contract/PHI, and performance - as the structured \`issues\` array, ordered critical -> high -> medium -> low with no duplicate (severity,what) pairs. Do NOT stop at the first finding and do NOT defer findings to a later cycle; a partial list that surfaces one issue at a time forces redundant re-grills. If the change is clean after a hard exhaustive attempt, return verdict="pass" with issues=[].${dimensionLabel ? ` THIS pass is scoped to the ${dimensionLabel} dimension: report only ${dimensionLabel} findings (the aggregator fans the dimensions in).` : ""}${priorFindings.length ? `
PRIOR UNRESOLVED FINDINGS (issue #706 P1-3, carried from earlier cycles): the merge gate is still holding these findings open. This is a DELTA re-grill, so the diff above may NOT cover the code each prior finding points at. For EACH prior finding, RE-VERIFY it against the CURRENT code (read the actual file/line, not just the delta): keep it in \`issues\` AND \`unresolved_findings\` UNLESS you can concretely confirm the current code no longer has the defect. A clean delta that simply did not touch a prior finding's code does NOT resolve it - silence is NOT resolution. Only drop a prior finding when you have positively confirmed the fix landed. Prior findings: ${JSON.stringify(priorFindings.slice(0, 50))}` : ""}
HTTP INTEGRATION TESTS - STATIC REVIEW ONLY (per [[curaos-verification-stack-rule]] §3.7, issue #155): do NOT run \`bun test\` on any HTTP / supertest integration test (files that call \`app.listen(0)\`, \`request(app.getHttpServer())\`, or any \`.listen(0)\` server handoff). The sandbox blocks ephemeral-port TCP bind, so those tests crash with a FALSE \`Failed to start server. Is port 0 in use?\` even when they pass 0-fail in the orchestrator shell. STATIC-review those files instead - read the test + the controller/route/handler under test and reason about correctness/coverage/edges/boundary/PHI. The orchestrator has already run them locally (no sandbox) and pasted the raw stdout into the PR body; treat that pasted stdout as the authoritative runtime evidence for the HTTP tests and do NOT re-run them. Non-HTTP / unit / pure tests may still be run normally.
Then WRITE a grill verdict to ${perDimReportPath} (Bash mkdir -p its dir if needed; use the Write tool). Use the grills template per ai/curaos/docs/grills/README.md. The report MUST contain the line "GRILL-VERIFIED-SHA: <verified_sha>" (the sha you pinned above).${synthetic ? ` This is a SYNTHETIC/FIXTURE exercise (RP-33 quarantine): the report MUST also contain the line "${SYNTHETIC_GRILL_MARKER}" and MUST stay at the quarantine path above under scripts/test-fixtures/grills/, never beside real verdicts in ai/curaos/docs/grills/.` : ""} If a verdict file already exists at that path, APPEND a "## Re-grill verification (2026-05-29)" section instead of overwriting. NEVER write to .scratch/.
Return: verdict ("block" for a confirmed exploitable/correctness/boundary failure; "issues-found" for fixable; "pass" if it survives), issues (each {severity, what, evidence}), unresolved_findings (P1-3: the still-open subset = this pass's issues PLUS any prior finding above you could NOT confirm fixed; the merge gate carries these forward), report_path (the absolute path written), verified_sha (the pinned 40-hex sha).`;
    // P4b: the cache key binds the RESOLVED head sha (not cfg.pr - that never changes across commits
    // on the same PR), scoped per dimension via cache_bust so each dimension is a distinct entry and
    // an independent re-grill cycle (distinct cache_bust) still recomputes.
    const cacheKey = grillCacheKey(resolvedHeadSha, grillPromptTemplateHash(promptTemplate), `${cfg.cache_bust || ""}|${dimensionLabel}`);
    log(`grill dispatch ${dimensionLabel || "single"} head=${resolvedHeadSha || "<unresolved>"} cache-key=${cacheKey}`);
    return agent(promptTemplate, { label: `grill:${slug}${dimensionLabel ? `:${dimensionLabel}` : ""}`, phase: "Grill", agentType: grillAgentType, model: CONTRACT.models.grill, schema: {
      type: "object",
      required: ["verdict", "issues", "report_path", "verified_sha"],
      properties: {
        verdict: { type: "string", enum: ["pass", "issues-found", "block"] },
        issues: { type: "array", items: { type: "object", required: ["severity", "what", "evidence"], properties: {
          severity: { type: "string", enum: ["critical", "high", "medium", "low"] }, what: { type: "string" }, evidence: { type: "string" } } } },
        unresolved_findings: { type: "array", items: { type: "object", properties: {
          severity: { type: "string" }, what: { type: "string" }, evidence: { type: "string" } } } },
        report_path: { type: "string" },
        verified_sha: { type: "string" },
      },
    } }).catch((err) => ({
      verdict: "skipped-harness-unavailable",
      grill: grillStatus === "same-harness-fallback" ? "same-harness-fallback" : "blocked-harness-unavailable",
      issues: [{ severity: "high", what: "opposite-harness grill agent error", evidence: err && err.message ? err.message : String(err) }],
      report_path: perDimReportPath,
      verified_sha: "",
    }));
  };

  let result;
  if (requestedDimensions.length) {
    // P5a fan-out: run every dimension CONCURRENTLY (Promise.all => wall-clock = max(dimension)),
    // each to its own per-dimension report sibling, then fan-in dedup into the canonical report.
    const dimReportPath = (dim) => resolve(`${reportDir}/${slug}.${dim}.md`);
    const dimResults = await Promise.all(requestedDimensions.map((dim) => dispatchGrill(dim, dimReportPath(dim))));
    // P1-4: an errored dimension's `.catch` returns skipped-harness-unavailable; a dimension that
    // returns no recognized pass/issues-found/block verdict is equally incomplete. EITHER blocks the
    // whole fan-out (fail-closed): a partial or errored fan-out is not a completed adversarial review,
    // never silently folded into a pass.
    const VALID_DIM_VERDICTS = new Set(["pass", "issues-found", "block"]);
    const blocked = dimResults.find((r) => !r || r.verdict === "skipped-harness-unavailable" || !VALID_DIM_VERDICTS.has(r.verdict));
    if (blocked) {
      result = {
        verdict: "skipped-harness-unavailable",
        grill: (blocked && blocked.grill) || "blocked-harness-unavailable",
        issues: (blocked && Array.isArray(blocked.issues) && blocked.issues.length) ? blocked.issues : [{ severity: "high", what: "fan-out dimension did not complete", evidence: `dimension verdict=${blocked && blocked.verdict ? blocked.verdict : "<none>"}` }],
        report_path: reportPath,
        verified_sha: "",
      };
    } else {
      // P1-4: require ALL dimensions to agree on the SAME 40-hex head sha; a divergent or missing sha
      // fails closed (mixed-head dimensions are not one review). Done BEFORE the aggregate report so a
      // mixed-head fan-out never persists a misleading consensus.
      const consensus = fanInConsensusSha(dimResults);
      if (consensus.block) {
        result = {
          verdict: "skipped-harness-unavailable",
          grill: "blocked-harness-unavailable",
          issues: [{ severity: "high", what: "fan-out head-sha consensus failed", evidence: consensus.block }],
          report_path: reportPath,
          verified_sha: "",
        };
      } else {
      const mergedFindings = dedupeGrillFindings(dimResults.map((r) => (r && r.issues) || []));
      const consensusSha = consensus.sha;
      const verdict = worstGrillVerdict(dimResults.map((r) => r && r.verdict));
      // Executor-written canonical aggregate report so reportPath is always freshly written this run.
      mkdirSync(dirname(reportPath), { recursive: true });
      const syntheticLine = synthetic ? `\n${SYNTHETIC_GRILL_MARKER}` : "";
      const aggregateMd = `# Opposite Harness Grill (parallel dimensions)\n\nGRILL: ${grillStatus}\nGRILL-VERIFIED-SHA: ${consensusSha}\nGRILL-DIMENSIONS: ${requestedDimensions.join(", ")}\nGRILL-VERDICT: ${verdict}${syntheticLine}\n\n## Fan-in deduped findings\n\n${mergedFindings.length ? mergedFindings.map((f) => `- [${f.severity}] ${f.what}${f.evidence ? `: ${f.evidence}` : ""}`).join("\n") : "(none)"}\n\nPer-dimension reports: ${requestedDimensions.map((dim) => relative(reportDir, dimReportPath(dim))).join(", ")}\n`;
      if (existsSync(reportPath)) {
        const today = new Date().toISOString().slice(0, 10);
        appendFileSync(reportPath, `\n\n## Re-grill verification (${today})\n\n${aggregateMd}`);
      } else {
        writeFileSync(reportPath, aggregateMd);
      }
      result = { verdict, issues: mergedFindings, report_path: reportPath, verified_sha: consensusSha };
      }
    }
  } else {
    result = await dispatchGrill("", reportPath);
  }

  if (result && result.verdict === "skipped-harness-unavailable") {
    log(`WARN: opposite-harness grill timed out for ${opposite} after ${grillTimeoutMs}ms`);
    const blockedIssue = Array.isArray(result.issues) && result.issues.length ? result.issues[0] : {};
    const persistedReport = writeBlockedReport(reportPath, cfg, opposite, grillAgentType, {
        available: false,
        reason: blockedIssue.what || "opposite-harness grill unavailable",
        evidence: blockedIssue.evidence || `timeout or unavailable after ${grillTimeoutMs}ms`,
      }, grillTimeoutMs, blockedIssue.what || "opposite-harness grill unavailable");
    return {
      ...result,
      report_path: persistedReport,
      verified_sha: "",
      grill: grillStatus === "same-harness-fallback" ? "same-harness-fallback" : "blocked-harness-unavailable",
    };
  }

  const finalReportPath = reportPath;
  const finalized = finalizeGrillResult(
    result,
    finalReportPath,
    grillStartedAt,
    (detail, failingResult) => missingReportResult(finalReportPath, cfg, opposite, grillAgentType, grillTimeoutMs, failingResult, detail),
    // P1b: bounded poll for the written report before declaring opposite-harness-report-missing.
    { poll_timeout_ms: pollTimeoutMs, poll_interval_ms: pollIntervalMs },
  );
  // P1-3: surface the backstopped unresolved set so the caller (pr-verify-merge / milestone-wave)
  // never silently loses a carried prior finding that a clean delta did not re-assert.
  return {
    ...finalized,
    grill: finalized.grill || grillStatus,
    verified_sha: normalizedVerifiedSha(finalized && finalized.verified_sha),
    unresolved_findings: mergeUnresolvedFindings(finalized, priorFindings),
  };
}
