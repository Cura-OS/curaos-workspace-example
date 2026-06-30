// pr-verify-merge - T2 verify + merge gate: 3-lens review (parallel) -> adversarial grill -> programmatic merge gate.
// Composes lens-review x3 + opposite-harness-grill via workflow({scriptPath}). Contract: docs/agents/workflows/pr-verify-merge.md
export const meta = {
  name: "pr-verify-merge",
  description: "T2 PR gate: 3-lens review + adversarial grill + programmatic merge decision",
  phases: [
    { title: "Review", detail: "Security + Architecture + QA lens-review (parallel)" },
    { title: "Grill", detail: "adversarial opposite-harness-grill" },
    { title: "Gate", detail: "programmatic merge decision + optional merge" },
  ],
};

const CONTRACT = {
  name: "pr-verify-merge",
  kind: "composite",
  version: "0.1.0",
  inputs: {
    pr: { type: "string", required: true, description: "owner/repo#N PR to verify + (if clean) merge" },
    subject: { type: "string", required: false, description: "grill subject label (default derived from PR)" },
    grill: { type: "boolean", required: false, description: "run the adversarial grill (default true)" },
    max_regrill_cycles: { type: "number", required: false, description: "P2a/P2b BINDING cap (default 3) on the in-workflow delta re-grill fix-cycle loop: on grill issues-found, dispatch a fix worker then re-grill the delta in-workflow up to this many cycles before returning to the orchestrator." },
    auto_merge: { type: "boolean", required: false, description: "merge if all gates pass (default false - report verdict, let orchestrator merge)" },
    opposite_harness: { type: "string", required: false, description: "which harness runs the adversarial grill; forwarded to opposite-harness-grill" },
    opposite_harness_agent: { type: "string", required: false, description: "rescue agent override forwarded to opposite-harness-grill" },
    probe_timeout_ms: { type: "number", required: false, description: "harness probe timeout forwarded to opposite-harness-grill" },
    grill_timeout_ms: { type: "number", required: false, description: "adversarial grill timeout forwarded to opposite-harness-grill" },
    allow_same_harness_fallback: { type: "boolean", required: false, description: "same-harness fallback override forwarded to opposite-harness-grill" },
  },
  outputs: {
    verdict: { type: "string", description: "merge-ok | changes-requested | block" },
    lens_verdicts: { type: "array", description: "the 3 lens verdicts" },
    grill_verdict: { type: "string", description: "the adversarial grill verdict" },
    merged: { type: "boolean", description: "true if auto_merge and merged" },
    notification_cleared: { type: "boolean", description: "true if the merged PR's inbox notification was cleared (gated on threads-resolved + no needs-human)" },
    workspace_ready: { type: "string", description: "clean | stashed | blocked | n/a after restoring the checkout to the default branch post-merge" },
    blocking_findings: { type: "array", description: "any block-level findings" },
  },
  guarantees: { idempotent: false, determinism: "control-flow-only", side_effects: "github" },
  verification: "T2",
  models: { gate: "sonnet" },
  composes: ["lens-review", "opposite-harness-grill", "gh-pr-gate-snapshot"],
};

const ROOT = ".";
const WF = "scripts/workflows";
function parseArgs(a) {
  if (a && typeof a === "object") return a;
  if (typeof a === "string" && a.trim()) { try { return JSON.parse(a); } catch { return {}; } }
  return {};
}
let _ghRef;
function workflowRequire(name) {
  const { createRequire } = process.getBuiltinModule("node:module");
  const { pathToFileURL } = process.getBuiltinModule("node:url");
  let base = "";
  try { base = eval("import.meta.url"); } catch {}
  if (!base && typeof __filename === "string" && /scripts\/workflows\/pr-verify-merge\.workflow\.js$/.test(__filename)) base = __filename;
  if (!base) base = pathToFileURL(`${process.cwd()}/scripts/workflows/pr-verify-merge.workflow.js`).href;
  return createRequire(base)(name);
}
function ghRef() {
  if (!_ghRef) _ghRef = workflowRequire("../lib/gh-ref.js");
  return _ghRef;
}
// RP-20: ghPrCommand / isBlockedHarnessUnavailable / grillShaMismatch are single-owned in
// scripts/lib/merge-hygiene.js. This Claude-style top-level body also runs under `new Function`
// harnesses (no require(), no import.meta), so it keeps INLINE copies that MUST stay byte-identical
// to the lib; scripts/workflow-truth-contract.test.js pins the equality (extractFunction) and
// executes the behavior from the lib. milestone-wave imports the lib directly (no inline copy).
let _execFileSync;
function execFileSync(...callArgs) {
  if (!_execFileSync) _execFileSync = workflowRequire("node:child_process").execFileSync;
  return _execFileSync(...callArgs);
}
function ghPrViewJson(pr, fields) {
  const env = { ...process.env };
  delete env.GITHUB_TOKEN;
  const out = execFileSync("gh", ["pr", "view", String(pr), "--json", fields], {
    encoding: "utf8",
    env,
    maxBuffer: 20 * 1024 * 1024,
  }).trim();
  return JSON.parse(out || "{}");
}
function normalizePrRef(pr, viewJson = ghPrViewJson) {
  const ref = String(pr || "").trim();
  const match = ref.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)#(\d+)$/);
  if (match) return `${match[1]}/${match[2]}#${Number(match[3])}`;
  if (/^\d+$/.test(ref)) {
    const data = viewJson(ref, "number,baseRepository");
    const repo = String((data && data.baseRepository && data.baseRepository.nameWithOwner) || "").trim();
    const number = Number((data && data.number) || ref);
    if (!repo || !Number.isFinite(number) || number <= 0) {
      throw new Error(`invalid PR ref ${JSON.stringify(ref)}; gh pr view did not return baseRepository.nameWithOwner`);
    }
    return `${repo}#${number}`;
  }
  throw new Error(`invalid PR ref ${JSON.stringify(ref)}; expected owner/repo#N or N`);
}
function ghPrCommand(verb, pr) {
  const ref = String(pr || "").trim();
  const match = ref.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)#(\d+)$/);
  if (match) return `gh pr ${verb} ${match[3]} --repo ${match[1]}/${match[2]}`;
  if (/^\d+$/.test(ref)) return `gh pr ${verb} ${ref}`;
  throw new Error(`invalid PR ref ${JSON.stringify(ref)}; expected owner/repo#N or N`);
}
function prRefParts(pr) {
  try {
    const parsed = ghRef().parsePrRef(pr, { source: "pr-verify-merge" });
    return { repo: parsed.slug, number: parsed.number };
  } catch {
    return null;
  }
}
function isBlockedHarnessUnavailable(grill) {
  return !!grill && (grill.grill === "blocked-harness-unavailable" || grill.verdict === "skipped-harness-unavailable");
}
// RP-03 / #202 incident class: a grill verdict is bound to the exact commit it reviewed. The merge
// gate FAILS CLOSED when the grill's verified_sha is missing, malformed, or differs from the PR's
// current REST head sha (a later push invalidates the verdict; a missing sha is an unproven review).
function grillShaMismatch(grill, headSha) {
  const verified = String((grill && grill.verified_sha) || "").trim().toLowerCase();
  const head = String(headSha || "").trim().toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(verified) || !/^[0-9a-f]{40}$/.test(head)) return true;
  return verified !== head;
}
// Advisory review polling timeout is kept for diagnostic snapshots only.
// Merge eligibility never depends on external review presence.

const cfg = parseArgs(typeof args !== "undefined" ? args : undefined);
if (!cfg.pr) throw new Error("pr-verify-merge: args.pr (owner/repo#N) is required");
cfg.pr = normalizePrRef(cfg.pr);
const runGrill = cfg.grill !== false;
const autoMerge = !!cfg.auto_merge;
const subject = cfg.subject || `pr-${cfg.pr.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
const prCheckoutCmd = ghPrCommand("checkout", cfg.pr);
const prChecksCmd = ghPrCommand("checks", cfg.pr);
const prMergeCmd = ghPrCommand("merge", cfg.pr);
const prViewCmd = ghPrCommand("view", cfg.pr);
  const prRef = prRefParts(cfg.pr);

  const readLocalGate = () => agent(
    `Report the merge-gate CI status of PR ${cfg.pr}. GH auto-CI is OFF (workflow_dispatch-only per ai/rules/curaos_local_ci_first_rule.md) so the gate is the checked-out repo's LOCAL blocking gate, NOT GitHub checks. From ${ROOT} (Bash):
1. \`env -u GITHUB_TOKEN ${prCheckoutCmd}\`.
2. Do not run generated-file writers before the gate. If doc graph drift exists, the local gate must see and fail on it rather than repairing it.
3. Re-run the local gate from the checked-out PR root: \`cd ${ROOT} && if [ -x scripts/ci-local.sh ]; then bash scripts/ci-local.sh; elif [ -f justfile ]; then just ci; else bash scripts/check-docs.sh; fi\` AND, when present, \`cd ${ROOT} && node scripts/check-ci-gates-sync.js\`. These run the repo-local blocking gate plus any drift self-gate; do NOT validate a different checkout subtree. Capture each exit code. local_gate_exit = the worst (nonzero if any blocking gate or the sync-check failed).
4. ALSO report any manually-dispatched GH checks: \`env -u GITHUB_TOKEN ${prChecksCmd} --json state,bucket,name\` - return the parsed rows verbatim in 'checks' (each {name, state, bucket}). If the PR has no checks (the OFF default), return checks=[] (an empty list is EXPECTED and does NOT fail the gate; the local run is the gate).
Return local_gate_exit (number) + checks (array).`,
    { label: "ci-check", phase: "Gate", model: "sonnet", schema: { type: "object", required: ["local_gate_exit", "checks"], properties: {
      local_gate_exit: { type: "number" },
      checks: { type: "array" },
    } } }
  );

  const ciCheck = await readLocalGate();
  const checkRows = ciCheck.checks || [];
  const dispatchedFailing = checkRows.some((c) => c.bucket === "fail" || String(c.state || "").toUpperCase() !== "SUCCESS");
  const checksGreen = ciCheck.local_gate_exit === 0 && !dispatchedFailing;
  if (!checksGreen) {
    return {
      verdict: "block",
      lens_verdicts: [],
      grill_verdict: "skipped",
      merged: false,
      notification_cleared: false,
      workspace_ready: "n/a",
      state_labels_stripped: false,
      board_status_advanced: false,
      blocking_findings: [{ source: "local-gate", severity: "critical", what: "local blocking gate failed before expensive review", evidence: JSON.stringify(ciCheck) }],
    };
  }

  const localReview = await agent(
    `Run the local deterministic review signal for PR ${cfg.pr}. From ${ROOT}, prefer Semgrep CE if available: collect changed-line findings only, and block only high or critical findings on changed lines. If Semgrep is unavailable, return verdict="unavailable", blocking=false, findings=[]. Never call any paid external review service here.`,
    {
      label: "local-review-signal",
      phase: "Gate",
      model: "haiku",
      schema: { type: "object", required: ["verdict", "blocking", "findings"], properties: { verdict: { type: "string" }, blocking: { type: "boolean" }, findings: { type: "array" } } },
    },
  ).catch((error) => ({ verdict: "block", blocking: true, findings: [{ source: "local-review-signal", severity: "critical", message: String(error) }] }));
  if (localReview.blocking === true || localReview.verdict === "block") {
    return {
      verdict: "block",
      lens_verdicts: [],
      grill_verdict: "skipped",
      merged: false,
      notification_cleared: false,
      workspace_ready: "n/a",
      state_labels_stripped: false,
      board_status_advanced: false,
      blocking_findings: (localReview.findings || []).map((finding) => ({ ...finding, source: "local-review-signal" })),
    };
  }

// Phase 1: 3-lens review (parallel composed atomics)
phase("Review");
const lenses = await parallel(["Security", "Architecture", "QA"].map((lens) => () =>
  workflow({ scriptPath: `${WF}/lens-review.workflow.js` }, { lens, pr: cfg.pr })
)).then((r) => r.filter(Boolean));
const lensVerdicts = lenses.map((l) => ({ lens: l.lens, verdict: l.verdict }));
// M2 fix: fail-CLOSED if any lens crashed/dropped - a missing lens must block, not silently pass.
const lensMissing = lenses.length !== 3;
const lensBlock = lensMissing || lenses.some((l) => l.verdict === "block");
const lensChanges = lenses.some((l) => l.verdict === "changes-requested");
const blockingFindings = lenses.flatMap((l) => (l.findings || []).filter((f) => f.severity === "critical" || l.verdict === "block").map((f) => ({ lens: l.lens, ...f })));

// Phase 2: adversarial grill (composed atomic) + bounded in-workflow delta re-grill fix-cycle loop.
// P2a/P2b (issue #706): on a grill verdict of issues-found, dispatch a fix worker then RE-GRILL
// IN-WORKFLOW (no orchestrator round-trip for a fresh full pass), scoped to the DELTA
// `git diff <prev-grill-sha>..HEAD`, capped at maxRegrillCycles (default 3, BINDING per
// [[curaos-verification-stack-rule]]). Each re-grill threads a distinct cache_bust so the grill
// cache recomputes across independent cycles (P4b). The cap collapses the 5-cycle / 2+hr PR-337
// case toward 1 review + 1 batch fix + 1 delta re-grill.
phase("Grill");
let grillVerdict = "skipped";
let grillBlockedHarnessUnavailable = false;
let grillResult = null;
let regrillCycles = 0;
if (runGrill) {
  const maxRegrillCycles = Number.isFinite(cfg.max_regrill_cycles) ? Math.max(0, cfg.max_regrill_cycles) : 3;
  const baseGrillArgs = { pr: cfg.pr, subject };
  for (const key of ["opposite_harness", "opposite_harness_agent", "probe_timeout_ms", "grill_timeout_ms", "allow_same_harness_fallback"]) {
    if (cfg[key] !== undefined) baseGrillArgs[key] = cfg[key];
  }
  // P1-3 (issue #706 delta-regrill soundness): pin ONE stable report path for the whole fix-cycle
  // loop so every cycle APPENDS to the same canonical PR grill verdict (re-grills add a
  // `## Re-grill verification` section) instead of forking a fresh per-cycle file. A forked report
  // let a clean delta-only pass silently REPLACE the full-review verdict. The path is workspace-root
  // relative; the grill executor anchors it there (RP-27).
  const stableReportPath = `ai/curaos/docs/grills/${subject.replace(/[^a-z0-9]+/gi, "-").toLowerCase().replace(/^-+|-+$/g, "") || "grill"}-pr${prRef ? prRef.number : "x"}.md`;
  baseGrillArgs.report_path = stableReportPath;
  grillResult = await workflow({ scriptPath: `${WF}/opposite-harness-grill.workflow.js` }, baseGrillArgs);
  // P1-3: accumulate the UNION of unresolved findings across every cycle. A finding is only dropped
  // when the delta re-grill explicitly returns pass/block (resolved or escalated), never silently by
  // a clean delta that only covered other hunks - the carried set is fed back to each re-grill.
  let carriedFindings = Array.isArray(grillResult && grillResult.issues) ? grillResult.issues.slice() : [];
  while (grillResult && grillResult.verdict === "issues-found" && regrillCycles < maxRegrillCycles) {
    regrillCycles += 1;
    const prevSha = String((grillResult && grillResult.verified_sha) || "").trim();
    // P1-3: union the latest cycle's findings into the carried set (deduped on severity::what so a
    // re-surfaced finding is not double-counted) before dispatching the fix worker.
    const seen = new Set(carriedFindings.map((f) => `${String(f.severity).toLowerCase()}::${String(f.what).trim().toLowerCase()}`));
    for (const f of (grillResult.issues || [])) {
      const k = `${String(f.severity).toLowerCase()}::${String(f.what).trim().toLowerCase()}`;
      if (!seen.has(k)) { seen.add(k); carriedFindings.push(f); }
    }
    // Dispatch ONE fix worker to address the FULL carried unresolved list (not just this delta), then
    // re-grill the delta WITH the prior unresolved findings carried in so they survive a clean delta.
    await agent(
      `Fix the issues-found findings the adversarial grill surfaced on PR ${cfg.pr} (re-grill cycle ${regrillCycles}/${maxRegrillCycles}). From ${ROOT} (Bash): \`env -u GITHUB_TOKEN ${prCheckoutCmd}\`, address EVERY finding in this list, commit + push to the PR branch, and report done. Findings (ALL unresolved across cycles): ${JSON.stringify(carriedFindings.slice(0, 50))}. Do not introduce out-of-scope changes; keep the fix minimal and tested.`,
      { label: `regrill-fix:cycle${regrillCycles}:${cfg.pr}`, phase: "Grill", model: "sonnet", schema: { type: "object", required: ["status"], properties: { status: { type: "string" }, blocker: { type: "string" } } } },
    ).catch((e) => ({ status: "errored", blocker: String(e) }));
    // P2b: re-grill scoped to the DELTA since the previous grill's reviewed sha, NOT the whole PR
    // diff. A valid prev sha gives `<prev-sha>..HEAD`; a missing one degrades to the working tree
    // (the grill executor re-pins HEAD). The grill appends a `## Re-grill verification` section.
    // P1-3: keep the SAME report_path (append, never fork) + carry prior_findings into the re-grill so
    // an unresolved full-review finding survives a delta that only touches other hunks.
    const regrillArgs = { ...baseGrillArgs, cache_bust: `regrill-cycle-${regrillCycles}`, subject: `${subject} re-grill cycle ${regrillCycles}`, report_path: stableReportPath, prior_findings: carriedFindings.slice(0, 50) };
    if (/^[0-9a-fA-F]{40}$/.test(prevSha)) regrillArgs.diff_ref = `${prevSha}..HEAD`;
    grillResult = await workflow({ scriptPath: `${WF}/opposite-harness-grill.workflow.js` }, regrillArgs);
    // P1-3: a clean delta does NOT silently clear the carried findings. The carried set persists; only
    // the grill returning a non-issues-found verdict (pass = resolved, block = escalated) ends the loop.
    if (grillResult && grillResult.verdict === "issues-found") {
      carriedFindings = Array.isArray(grillResult.unresolved_findings) && grillResult.unresolved_findings.length
        ? grillResult.unresolved_findings.slice()
        : carriedFindings;
    }
  }
  grillVerdict = grillResult.verdict;
  if (grillResult.verdict === "block") blockingFindings.push(...(grillResult.issues || []).map((i) => ({ source: "grill", ...i })));
  grillBlockedHarnessUnavailable = isBlockedHarnessUnavailable(grillResult);
  if (grillBlockedHarnessUnavailable) {
    blockingFindings.push(...(grillResult.issues || []).map((i) => ({ source: "grill-probe-blocked", ...i })));
  }
}

// Phase 3: merge gate (programmatic AND of lens + grill + the LOCAL ci-gates.yaml blocking gates)
phase("Gate");
// GH auto-CI is OFF (workflow_dispatch-only per ai/rules/curaos_local_ci_first_rule.md), so `gh pr checks`
// returns no required check and a GH-check-based gate would fail-closed on EVERY PR. The gate set is now
// sourced from the checked-out PR root and re-run LOCALLY: green iff the repo-local blocking gate exits 0.
// When a repo has ci-gates.yaml, the ci-gates-sync self-gate proves the local definition still equals the
// dispatch-only GH tier-*.yml, so a green local run is a faithful CI simulation. We still capture any
// MANUALLY-dispatched GH run (gh pr checks) for visibility - it only populates when someone ran
// `gh workflow run`, and when present every reported check must also be fully passing.
// Programmatic gate: green iff the LOCAL ci-gates.yaml blocking gates + sync-check passed (exit 0). A
// manually-dispatched GH check, if present, must be SUCCESS (empty = expected OFF state = fine).
// PR head snapshot: runs before thread and SHA gates so merge decisions bind to the current PR head.
  const prGateSnapshot = await workflow(
    { scriptPath: `${WF}/gh-pr-gate-snapshot.workflow.js` },
    { pr: cfg.pr },
  ).catch((error) => ({
    head_sha: "",
    minutes_since_last_push: -1,
    blocked_by_external: true,
    error: error && error.message ? error.message : String(error),
  }));
const reviewSnapshotBlocked = prGateSnapshot.blocked_by_external === true;
if (reviewSnapshotBlocked) {
  blockingFindings.push({ source: "pr-gate-snapshot", severity: "critical", what: "unable to read PR head/review snapshot", evidence: prGateSnapshot.error || JSON.stringify(prGateSnapshot) });
}

// Review-thread gate: "merged" / CI-green alone is INSUFFICIENT - a PR is only merge-clean when
// every reviewer review THREAD is resolved AND no thread is left escalated for the human
// (`needs-human`). Resolving a thread is separate from clearing its inbox notification; this gate
// governs the MERGE decision only. Fetch the unresolved-thread counts (fail-closed).
const threadCheck = await agent(
  `Report unresolved PR review threads for ${cfg.pr}. From ${ROOT}, parse owner/repo/number from "${cfg.pr}" (shape owner/repo#N) and run a GraphQL query for reviewThreads(first:100){nodes{isResolved comments(first:1){nodes{author{login} body}}}}. Return: 'unresolved' = count of nodes where isResolved==false; 'needs_human' = count of unresolved nodes whose first comment body or a reply marks it escalated/blocked for a human (e.g. contains "needs-human" / "needs human" / left intentionally open for the user). Use Bash with env -u GITHUB_TOKEN gh api graphql.`,
  { label: "thread-check", phase: "Gate", model: "haiku", schema: { type: "object", required: ["unresolved", "needs_human"], properties: { unresolved: { type: "number" }, needs_human: { type: "number" } } } }
);
const threadsResolved = (threadCheck.unresolved || 0) === 0;
const needsHumanOpen = (threadCheck.needs_human || 0) > 0;

// Grill-SHA binding gate (RP-03, fail-closed): the grill verdict is only valid for the exact commit
// it reviewed. Fetch the PR's CURRENT head sha via REST /pulls/N and block when the grill's
// verified_sha is missing or differs (the #202 class: merged on cycle-2 code while the cycle-3 fix
// was never pushed). Applies only when the grill leg ran; a skipped grill is governed by cfg.grill.
let grillShaBlocked = false;
const headProbe = { head_sha: prGateSnapshot.head_sha || "" };
if (runGrill) {
  grillShaBlocked = grillShaMismatch(grillResult, headProbe.head_sha);
  if (grillShaBlocked) {
    blockingFindings.push({ source: "grill-sha-gate", severity: "critical", what: "grill verified_sha missing or != PR head sha", evidence: `verified_sha=${grillResult && grillResult.verified_sha ? grillResult.verified_sha : "<missing>"} head=${headProbe.head_sha || "<unresolved>"}` });
  }
}

let verdict;
if (lensBlock || grillVerdict === "block" || grillBlockedHarnessUnavailable || grillShaBlocked || reviewSnapshotBlocked || !checksGreen) verdict = "block";
else if (lensChanges || grillVerdict === "issues-found" || !threadsResolved || needsHumanOpen) verdict = "changes-requested";
else verdict = "merge-ok";
// P1-2 (issue #706 + RP-03/#202): a re-grill cycle pushed a fix commit, so the PR head moved PAST the
// snapshot this gate decided on - `checksGreen` was read BEFORE the fix worker committed, and the
// grill-SHA + head snapshot bind to the OLD head. A fix that REDS the local gate (or any post-push
// drift) would otherwise reach merge-ok on the stale green snapshot. Mirror milestone-wave
// (~l.1156): never auto-merge on a re-grilled stale snapshot; defer to changes-requested so the next
// pass re-runs the local gate + re-binds the grill verdict against the fresh head.
if (regrillCycles > 0 && verdict === "merge-ok") verdict = "changes-requested";

let merged = false;
if (verdict === "merge-ok" && autoMerge) {
  const mergeRes = await agent(
    `Merge PR ${cfg.pr} from ${ROOT}: \`repo='${prRef ? prRef.repo : ""}'; num='${prRef ? prRef.number : ""}'; sha='${headProbe.head_sha}'; if [ -z "$repo" ] || [ -z "$num" ]; then echo "owner/repo#N required for REST merge"; exit 2; fi; if ! printf %s "$sha" | grep -Eq '^[0-9a-fA-F]{40}$'; then echo "40-hex head sha required for REST merge"; exit 2; fi; env -u GITHUB_TOKEN gh api -X PUT "repos/$repo/pulls/$num/merge" -f merge_method=squash -f sha="$sha"\` (or the repo's configured strategy). Confirm merged. THEN verify the remote PR branch is actually gone (RP-18: --delete-branch is not proof of deletion): get the head branch via \`env -u GITHUB_TOKEN ${prViewCmd} --json headRefName --jq .headRefName\` and run \`git ls-remote --exit-code --heads origin <branch>\` against the PR repo - it must exit 2 (no match). If the branch still exists, delete it with \`env -u GITHUB_TOKEN gh api -X DELETE repos/OWNER/REPO/git/refs/heads/<branch>\` and re-verify. Use Bash.`,
    { label: "merge", phase: "Gate", model: "haiku", schema: { type: "object", required: ["merged"], properties: { merged: { type: "boolean" } } } }
  );
  merged = !!(mergeRes && mergeRes.merged); // Flag A: reflect the actual merge result, not a hard true.
}

// Close-path label hygiene: a PR with "Closes #N" auto-closes its linked issue on merge, but GitHub
// leaves EVERY label intact - so the workflow-state labels (ready-for-agent / needs-triage /
// needs-info / agent-PR-open / agent-claimed:*) strand on the now-CLOSED issue and the tracker view
// becomes unreadable. A CLOSED issue must carry ZERO state labels (only category bug/enhancement +
// markers foresight/blocked may persist). Strip them here, immediately after a confirmed merge, so
// the per-PR path self-heals. (The org-wide `scripts/sweep-closed-issue-labels` converger is the
// backstop for merges that bypass this workflow - direct `gh pr merge` / UI-merge.)
let stateLabelsStripped = [];
if (merged) {
  const stripRes = await agent(
    `Strip stranded workflow-state labels from the issue(s) PR ${cfg.pr} just auto-closed. From ${ROOT} (Bash, \`env -u GITHUB_TOKEN gh\`): (1) resolve the linked closing issues: \`env -u GITHUB_TOKEN ${prViewCmd} --json closingIssuesReferences --jq '.closingIssuesReferences[] | "\\(.repository.owner.login)/\\(.repository.name)#\\(.number)"'\` (parse owner/repo + number from "${cfg.pr}" for the repo context). (2) For EACH linked issue that is now CLOSED (verify state via \`gh issue view\`), remove ALL workflow-state labels in ONE idempotent call: \`env -u GITHUB_TOKEN gh issue edit N -R OWNER/REPO --remove-label ready-for-agent --remove-label needs-triage --remove-label needs-info --remove-label ready-for-human --remove-label agent-PR-open\` PLUS a \`--remove-label\` for every \`agent-claimed:*\` label present (enumerate via \`gh issue view N -R OWNER/REPO --json labels --jq '.labels[].name | select(startswith("agent-claimed:"))'\`). Removing a label the issue does not have is a no-op (gh exits 0). PRESERVE category labels (bug/enhancement) and marker labels (foresight/blocked) - do NOT remove those. Report the list of issues you stripped. Use Bash.`,
    { label: "strip-state-labels", phase: "Gate", model: "haiku", schema: { type: "object", required: ["stripped"], properties: { stripped: { type: "array", items: { type: "string" } } } } }
  ).catch(() => ({ stripped: [] }));
  stateLabelsStripped = (stripRes && stripRes.stripped) || [];
}

// Close-path BOARD-STATUS hygiene: auto-closing the linked issue does NOT touch its `CuraOS Roadmap`
// Project Status field - a CLOSED/COMPLETED issue can sit at In Review / In Progress / Ready on the
// board indefinitely (this is exactly how M7-S5.3 #114 read "In Review" for 5 days while done). Flip
// the linked issue's board Status to Done here, immediately after a confirmed merge, so the per-PR
// path self-heals. (The org-wide `scripts/sweep-project-status` converger is the backstop for merges
// that bypass this workflow - direct `gh pr merge` / UI-merge.)
let boardStatusAdvanced = [];
if (merged) {
  const advRes = await agent(
    `Advance the board Status of the issue(s) PR ${cfg.pr} just auto-closed to Done on the "CuraOS Roadmap" GitHub Project. From ${ROOT} (Bash, \`env -u GITHUB_TOKEN gh\`): the simplest correct path is \`bash scripts/sweep-project-status --apply\` (curaos-workspace/scripts/sweep-project-status) - it is idempotent and advances EVERY CLOSED/COMPLETED Project item stuck at an active board status (Ready/In Progress/In Review) to Done, leaving Backlog/Blocked/Done untouched. Run it and report which items it advanced (parse the "ADVANCE  repo#N" lines from its stdout). If that script path is not found, fall back to the manual flip for just the issue(s) this PR closed: (1) resolve linked closing issues via \`env -u GITHUB_TOKEN gh pr view ${cfg.pr} --json closingIssuesReferences\`; (2) for each CLOSED/COMPLETED one, find its project item id + the Status field id + Done option id via \`gh project item-list 2 --owner your-org\` and \`gh project field-list 2 --owner your-org\`, then \`gh project item-edit --id ITEM --project-id PVT_kwDODhOBDc4BYvCn --field-id FIELD --single-select-option-id 95441b7d\`. Report the list of items advanced. Use Bash.`,
    { label: "advance-board-status", phase: "Gate", model: "haiku", schema: { type: "object", required: ["advanced"], properties: { advanced: { type: "array", items: { type: "string" } } } } }
  ).catch(() => ({ advanced: [] }));
  boardStatusAdvanced = (advRes && advRes.advanced) || [];
}

// Clear-inbox leg: a merged PR leaves a github.com/notifications entry that NOTHING else removes
// (direct `gh pr merge` / UI-merge bypass this workflow entirely; even here the merge leg did not
// touch the inbox). Clearing is gated on the SAME safe-to-clear condition as the merge: threads
// resolved AND no `needs-human` thread open. We already hold that (verdict===merge-ok implies both),
// but re-assert it so a future verdict-relax can't silently leak an un-cleared notification through.
// The post-merge `state_change` notification GitHub generates AFTER merge is a separate event - the
// orchestrator's §3.11 sweep (and the SKILL Step 9.5) catch that one; this leg clears the author/
// review notification the PR itself produced.
let notificationCleared = false;
if (merged && threadsResolved && !needsHumanOpen) {
  const clearRes = await agent(
    `Clear the github.com inbox notification for the now-merged PR ${cfg.pr}, but ONLY if it is truly safe to clear. From ${ROOT}, parse owner/repo#N from "${cfg.pr}" and run the safe wrapper: \`bash scripts/pr-notification-gate --apply OWNER/REPO N\` (curaos-workspace/scripts/pr-notification-gate). It scopes by EXACT repo+PR via /repos/OWNER/REPO/pulls/N (never substring), AND independently re-checks terminal state + threads-resolved + needs-human before clearing, so it refuses to clear a notification whose finding is still live. Interpret its exit code: exit 0 = the notification was cleared (or none existed) - report cleared=true; exit 2 = the PR is still open - report cleared=false; exit 3 = a live unresolved finding or a needs-human thread remains - DO NOT force-clear; the finding must first be captured into a follow-up issue and its thread resolved, then leave the notification in place and report cleared=false. If the \`scripts/pr-notification-gate\` path is not found, fall back to: list notifications with \`env -u GITHUB_TOKEN gh api notifications\`, find the thread whose subject.url ENDS WITH "/repos/OWNER/REPO/pulls/N" (endswith, NOT contains - a bare PR number matches multiple repos), and \`env -u GITHUB_TOKEN gh api -X DELETE notifications/threads/THREAD_ID\`. Report cleared=true iff a matching notification was deleted or none existed. Use Bash.`,
    { label: "clear-notif", phase: "Gate", model: "haiku", schema: { type: "object", required: ["cleared"], properties: { cleared: { type: "boolean" } } } }
  );
  notificationCleared = !!(clearRes && clearRes.cleared);
}

let workspaceReady = merged ? "blocked" : "n/a";
if (merged) {
  const readyRes = await agent(
    `Restore the local checkout used for PR ${cfg.pr} to default-branch readiness. From ${ROOT} (Bash): (1) run \`git status --short --branch\`; if dirty, classify residue. If it is already-landed duplicate/stale local residue, preserve it with \`git stash push -u -m "post-merge default-branch readiness ${cfg.pr}"\`; if it is real new work, report blocked instead of discarding. (2) \`git fetch --prune origin\`. (3) Determine the default branch with \`env -u GITHUB_TOKEN gh repo view OWNER/REPO --json defaultBranchRef --jq .defaultBranchRef.name\` for the PR repo, falling back to main. (4) \`git switch <default>\` and \`git pull --ff-only\`. (5) If this checkout has submodules, run \`git submodule update --init --recursive\`. (6) report \`git status --short --branch\` and return readiness = clean when on default branch and clean, stashed when a named stash was required but final status is clean, or blocked with reason. Never leave the checkout on a merged/deleted branch with upstream [gone].`,
    { label: "default-branch-readiness", phase: "Gate", model: "haiku", schema: { type: "object", required: ["readiness"], properties: { readiness: { type: "string" }, reason: { type: "string" } } } }
  ).catch((e) => ({ readiness: "blocked", reason: String(e) }));
  workspaceReady = readyRes.readiness || "blocked";
}

return { verdict, lens_verdicts: lensVerdicts, grill_verdict: grillVerdict, merged, notification_cleared: notificationCleared, workspace_ready: workspaceReady, state_labels_stripped: stateLabelsStripped, board_status_advanced: boardStatusAdvanced, blocking_findings: blockingFindings };
