// tdd-implement - implement one atomic issue test-first on its branch + T1 gate + Generator-Evolution closeout.
// Contract: docs/agents/workflows/tdd-implement.md
export const meta = {
  name: "tdd-implement",
  description: "Red-green-refactor one issue on its branch, run T1, emit Generator-Evolution closeout",
  phases: [{ title: "Implement", detail: "TDD red->green->refactor + T1 gate + §8.75" }],
};

const CONTRACT = {
  name: "tdd-implement",
  kind: "atomic",
  version: "0.2.0",
  inputs: {
    issue: { type: "string", required: true, description: "owner/repo#N being implemented" },
    branch: { type: "string", required: true, description: "the working branch already created for this issue" },
    context_summary: { type: "string", required: false, description: "output from context-load" },
    issue_body: { type: "string", required: false, description: "RP-39: deterministically prefetched issue body (gh-project batchIssueRead / context-load REST prefetch). When present it is AUTHORITATIVE for scope + acceptance and the implement prompt injects it instead of mandating a re-fetch; ONE comments spot-check stays permitted, not mandated. Absent => the prompt falls back to the mandated gh issue view read." },
    generated_code: { type: "boolean", required: false, description: "from context-load; gates the Generator-Evolution step" },
    issue_spec: { type: "object", required: false, description: "resolved issue contract from context-load: owned_paths, closeout_paths, forbidden_paths, acceptance, verification_cmds, adr_refs - the authoritative scope fence" },
    impl_model: { type: "string", required: false, description: "complexity-derived implement model from context-load (recommended_model); falls back to opus-default pickImplementModel() when unset" },
    dry_run: { type: "boolean", required: false, description: "if true, plan + report the TDD steps without committing" },
  },
  outputs: {
    status: { type: "string", description: "done | blocked | needs-user" },
    tests_added: { type: "array", description: "test files/cases added" },
    files_changed: { type: "array", description: "implementation files changed" },
    generator_evolution: { type: "string", description: "the GENERATOR-EVOLUTION closeout line (n/a if generated_code false)" },
    verification_evidence: { type: "string", description: "verbatim last-15-line stdout + exit codes of the verification commands (§8.1 - the claim of record)" },
    blocker: { type: "string", description: "if status!=done, the concrete blocker" },
    workflow_defect: { type: "boolean", description: "true when the workflow blocked impossible worker output rather than product code" },
    workflow_defect_kind: { type: "string", description: "stable workflow-defect classifier when workflow_defect=true" },
  },
  guarantees: { idempotent: false, determinism: "control-flow-only", side_effects: "git" },
  verification: "T1",
  // implement: complexity-DERIVED at runtime (opus-default, see pickImplementModel); the matrix value
  // here documents the DEFAULT tier. verify: sonnet (independent verification, reasoning-light).
  models: { implement: "opus", verify: "sonnet" },
  composes: [],
};

const ROOT = ".";
function parseArgs(a) {
  if (a && typeof a === "object") return a;
  if (typeof a === "string" && a.trim()) { try { return JSON.parse(a); } catch { return {}; } }
  return {};
}

phase("Implement");
const cfg = parseArgs(typeof args !== "undefined" ? args : undefined);
if (!cfg.issue || !cfg.branch) throw new Error("tdd-implement: args.issue and args.branch are required");

const spec = cfg.issue_spec || {};
const ownedPaths = Array.isArray(spec.owned_paths) ? spec.owned_paths.filter(Boolean) : [];
const closeoutPaths = closeoutPathsForSpec(spec);
const scopePaths = scopePathsForSpec(spec);
const acceptance = Array.isArray(spec.acceptance) ? spec.acceptance : [];
const verifyCmds = Array.isArray(spec.verification_cmds) && spec.verification_cmds.length
  ? spec.verification_cmds : ["bun run ci"];
const adrRefs = Array.isArray(spec.adr_refs) ? spec.adr_refs : [];

// IMPLEMENT MODEL - complexity-DERIVED, OPUS-DEFAULT (user policy 2026-05-29 + [[curaos-model-tiering-rule]]).
// The workflow sandbox forbids require(), so the picker is INLINED here (canonical copy:
// scripts/lib/model-tier.js - keep in sync). Opus reaches the answer in fewer iterations (cheaper net
// than a Sonnet loop); downgrade to Sonnet ONLY when proven-simple, Haiku ONLY for pure-mechanical;
// ANY uncertainty → Opus.
function pickImplementModel(s, scopeHint) {
  s = s || {};
  const owned = Array.isArray(s.owned_paths) ? s.owned_paths.filter(Boolean) : [];
  const adrs = Array.isArray(s.adr_refs) ? s.adr_refs.filter(Boolean) : [];
  const acc = Array.isArray(s.acceptance) ? s.acceptance : [];
  const effort = typeof s.effort === "string" ? s.effort.trim().toUpperCase() : "";
  const hint = `${scopeHint || ""} ${acc.join(" ")}`.trim();
  const mechanical = /\b(rename|reformat|format|lint|sort imports|bump version|typo|whitespace)\b/i.test(hint);
  if (mechanical && effort === "S" && owned.length <= 1 && adrs.length === 0) return "haiku";
  if (effort === "S" && owned.length <= 1 && adrs.length === 0 && acc.length > 0) return "sonnet";
  if (effort === "XL" && adrs.length > 0) return "opus"; // architecture-defining frontier tier
  return "opus"; // architecture / multi-file / ADR-involved / uncertain → opus bias
}
// context-load may thread a recommended_model via impl_model; else derive here. Opus-default either way.
const implementModel = (cfg.impl_model === "opus" || cfg.impl_model === "sonnet" || cfg.impl_model === "haiku")
  ? cfg.impl_model
  : pickImplementModel(spec, cfg.context_summary || "");

function shouldPassLogicalModel() {
  const env = typeof process !== "undefined" && process && process.env ? process.env : {};
  return env.AGENT_WORKFLOW_KIT_PASS_LOGICAL_MODELS === "1";
}

function agentOptions({ label, phase, model, schema }) {
  const options = { label, phase, schema };
  // The contract's opus/sonnet/haiku tiers are logical. Passing them through as
  // raw model ids from non-Claude harnesses can produce schema-default no-op
  // results. Omit by default so the active harness uses its configured native
  // model; an explicitly configured runner may opt in to raw logical models.
  if (shouldPassLogicalModel() && model) options.model = model;
  return options;
}

function normalizeCiExit(value) {
  return Number.isInteger(value) ? value : 1;
}

function workflowDefectKindForVerification({ emptyDiff, verifierContradiction } = {}) {
  if (emptyDiff) return "tdd-implement-no-op-done";
  if (verifierContradiction) return "tdd-implement-verifier-contradiction";
  return "";
}

function normalizeRepoPath(value) {
  return String(value || "").replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "");
}

function uniqueStrings(values) {
  const out = [];
  const seen = new Set();
  for (const value of values || []) {
    const v = String(value || "").trim();
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

function globToRegExp(pattern) {
  const normalized = normalizeRepoPath(pattern);
  let out = "^";
  for (let i = 0; i < normalized.length; i += 1) {
    const ch = normalized[i];
    if (ch === "*") {
      if (normalized[i + 1] === "*") {
        out += ".*";
        i += 1;
      } else {
        out += "[^/]*";
      }
    } else {
      out += ch.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
    }
  }
  return new RegExp(`${out}$`);
}

function ownedPathMatches(changedPath, ownedPath) {
  const changed = normalizeRepoPath(changedPath);
  const owned = normalizeRepoPath(ownedPath);
  if (!changed || !owned) return false;
  if (owned.includes("*")) return globToRegExp(owned).test(changed);
  if (changed === owned) return true;
  const last = owned.split("/").pop() || "";
  const looksLikeFile = /^[^.].*\.[A-Za-z0-9_-]+$/.test(last);
  return !looksLikeFile && changed.startsWith(`${owned}/`);
}

function scopePathMatches(changedPath, scopePath) {
  const scope = String(scopePath || "").trim();
  if (scope.startsWith("exact:")) {
    return normalizeRepoPath(changedPath) === normalizeRepoPath(scope.slice("exact:".length));
  }
  return ownedPathMatches(changedPath, scope);
}

function derivedCloseoutPathsForOwnedPaths(ownedPaths) {
  const out = [];
  for (const raw of ownedPaths || []) {
    const owned = normalizeRepoPath(raw);
    if (!owned) continue;
    if (owned === "curaos" || owned.startsWith("curaos/")) {
      out.push("exact:curaos");
      out.push("ai/curaos/docs/DOC-GRAPH.md");
    }
    if (owned.startsWith("curaos/")) out.push(`ai/${owned}`);
    if (/^curaos\/(?:backend|frontend)\//.test(owned)) out.push("curaos/bun.lock");
  }
  return uniqueStrings(out);
}

function closeoutPathsForSpec(spec) {
  const explicit = Array.isArray(spec && spec.closeout_paths) ? spec.closeout_paths.filter(Boolean) : [];
  const owned = Array.isArray(spec && spec.owned_paths) ? spec.owned_paths.filter(Boolean) : [];
  return uniqueStrings([...explicit, ...derivedCloseoutPathsForOwnedPaths(owned)]);
}

function scopePathsForSpec(spec) {
  const owned = Array.isArray(spec && spec.owned_paths) ? spec.owned_paths.filter(Boolean) : [];
  return uniqueStrings([...owned, ...closeoutPathsForSpec(spec)]);
}

function outOfScopePaths(changedPaths, ownedPaths) {
  const owned = Array.isArray(ownedPaths) ? ownedPaths.filter(Boolean) : [];
  if (!owned.length) return Array.isArray(changedPaths) ? changedPaths.filter(Boolean) : [];
  return (Array.isArray(changedPaths) ? changedPaths.filter(Boolean) : []).filter(
    (changed) => !owned.some((scope) => scopePathMatches(changed, scope)),
  );
}

function displayScopePaths(paths) {
  return (paths || []).map((path) => {
    const text = String(path || "").trim();
    return text.startsWith("exact:") ? `${normalizeRepoPath(text.slice("exact:".length))} (exact path only)` : text;
  }).filter(Boolean).join(", ");
}

// SCOPE FENCE (P0 fix #114-fabrication): a dispatched worker with no owned_paths self-selects
// its task in a scope vacuum (it drifted to patient-contracts on the M9-S2 audit lane). Resolve
// the spec here as a backstop if the caller didn't thread one, and HARD-FENCE the diff below.
const result = await agent(
  `Implement issue ${cfg.issue} on branch ${cfg.branch} (already checked out) using TEST-FIRST discipline (the tdd skill: red -> green -> refactor). Work from ${ROOT}.
${cfg.context_summary ? "CONTEXT (from context-load):\n" + cfg.context_summary + "\n" : ""}
${cfg.issue_body ? `AUTHORITATIVE SCOPE (deterministic prefetch, RP-39) - the issue BODY below was prefetched deterministically and is AUTHORITATIVE; do NOT re-fetch it (no \`gh issue view\` for the body). Implement EXACTLY what it + the worker brief + cited ADRs (${adrRefs.join(", ") || "see body"}) specify. Do NOT pick or invent any other task.
PREFETCHED ISSUE BODY (authoritative):
"""
${cfg.issue_body}
"""
You MAY run ONE spot-check read of the comments (\`env -u GITHUB_TOKEN gh issue view ${cfg.issue} --comments\`) ONLY when the body references discussion you need (permitted, not mandated).` : `AUTHORITATIVE SCOPE - you MUST first run \`env -u GITHUB_TOKEN gh issue view ${cfg.issue} --comments\` and implement EXACTLY what its body + worker brief + cited ADRs (${adrRefs.join(", ") || "see body"}) specify. Do NOT pick or invent any other task.`}
${ownedPaths.length ? `OWNED PATHS (implementation paths): ${displayScopePaths(ownedPaths)}. Keep implementation code here. Any implementation file outside these = OUT OF SCOPE -> set status=blocked, do not commit it.` : "OWNED PATHS: resolve from the issue body's ## Scope; if you cannot, status=blocked (do not guess)."}
${closeoutPaths.length ? `APPROVED CLOSEOUT PATHS (only for gate-required artifacts, not new implementation scope): ${displayScopePaths(closeoutPaths)}.` : ""}
${acceptance.length ? "ACCEPTANCE (each must be satisfied + tested):\n" + acceptance.map((a) => "- " + a).join("\n") + "\n" : ""}
${cfg.dry_run ? "DRY RUN: produce the TDD plan + the commits you WOULD make, but make NO commits and change NO files. Report intended tests + files.\n" : ""}
RUNTIME ACCESS CHECK: before claiming work, run \`pwd\`, \`git status --short --branch\`, and \`git branch --show-current\`. If you cannot run shell commands, cannot edit files, cannot inspect the issue, or are operating in a planning-only/model-only context, return status=blocked with a concrete blocker. Never return status=done from schema defaults or from an unchanged checkout.
Steps:
1. Red - write failing tests for the issue's acceptance criteria (above).
2. Green - minimal code to pass. ONLY within owned paths. Use approved closeout paths only for gate-required artifacts such as generated doc graph, mirror docs, lockfiles, SDK artifacts named by acceptance, or parent submodule pointers.
3. Refactor - clean; tests stay green.
4. T1 gate (MUST pass before status=done): the canonical gate set is **every BLOCKING gate in \`curaos/ci-gates.yaml\`** (the single source of truth - run via \`just ci\` from the \`curaos/\` root, or \`bash scripts/ci-local.sh\`; this covers typecheck, the \`bun run ci\` aggregate, depcruise, and the \`ci-gates-sync\` self-gate). At minimum run ${verifyCmds.map((c) => "`" + c + "`").join(" + ")} + \`node scripts/check-ci-gates-sync.js\` (proves the local gate definition == the dispatch-only GH workflow definition - GH auto-CI is OFF per ai/rules/curaos_local_ci_first_rule.md, so a green local run + green sync-check IS the merge gate) + \`gitleaks --staged\` + \`bun audit\`. Do NOT hand-pick a frozen list - run whatever ci-gates.yaml marks \`blocking: true\` for the touched scope. Capture REAL exit codes: run each to a file, \`echo $?\`, read the LAST 15 LINES of each (never pipe to tail). If any nonzero, fix + re-run; hard cap 3 green-fix cycles then status=needs-user.
4.5. Local deterministic self-review (cheap pre-PR triage):
   - Run Semgrep CE when available and limit blocking findings to high or critical findings on changed lines.
   - If Semgrep is unavailable, record verdict=unavailable and continue; do not call paid external review services.
   - Fix genuine findings (style, reuse, obvious bugs) WITHIN the owned paths + the same 3-cycle cap as the T1 gate; re-run \`bun run ci\` after fixes to keep it green. Ignore false positives. Cosmetic-only findings you disagree with: note + skip.
5. Generator-Evolution (ONLY if generated_code=${!!cfg.generated_code}): per §8.75 of docs/agents/one-task-execution-prompt.md, fold the fix back into curaos/tools/codegen/ (template/emitter/playbook/flag/AST + snapshot test, verify trio symmetry core/personal/business + healthstack) OR file a priority=critical follow-up issue. Emit the GENERATOR-EVOLUTION: line. If you touched generated code and did neither -> status=blocked.
${cfg.dry_run ? "" : "Commit on the branch with a Conventional Commit message (no AI attribution trailers per AGENTS.md section 8). Stage ONLY owned-path files and approved closeout-path files."}
EVIDENCE (§8.1 - the claim of record): verification_evidence MUST be the VERBATIM last 15 lines + the \`echo $?\` exit code of EACH verification command you ran. A summarized count without its backing paste is treated as NO evidence and will fail the gate. Do NOT claim a command passed without pasting its stdout + exit code.
Return: status (done|blocked|needs-user), tests_added, files_changed (real paths you changed), generator_evolution (closeout line or "n/a"), verification_evidence (the verbatim pastes), blocker (if not done).`,
  agentOptions({ label: `tdd-implement(${implementModel})`, phase: "Implement", model: implementModel, schema: {
    type: "object",
    required: ["status", "tests_added", "files_changed", "generator_evolution", "verification_evidence"],
    properties: {
      status: { type: "string", enum: ["done", "blocked", "needs-user"] },
      tests_added: { type: "array", items: { type: "string" } },
      files_changed: { type: "array", items: { type: "string" } },
      generator_evolution: { type: "string" },
      verification_evidence: { type: "string" },
      blocker: { type: "string" },
    },
  } })
);

// ── PROGRAMMATIC VERIFICATION GATE (P0 fix) ──────────────────────────────────
// The implement agent SELF-REPORTS status. The prior fabrication (PR #205) proved a
// self-report is not trustworthy: it claimed "bun run ci green" with zero code in the diff.
// The workflow runtime has no shell, so the only enforceable gate is a SEPARATE agent()
// Bash call whose result the JS branches on. This re-runs the truth independently of the
// implement agent's claims: (a) the actual changed paths, (b) a fresh `bun run ci` exit code,
// (c) whether the diff is empty. Dry-run skips the independent verifier, so only
// dry-run uses the self-reported intended files/tests as the no-op signal. Real
// dispatches trust the verifier's git diff over the implementer's arrays.
const selfFiles = Array.isArray(result.files_changed) ? result.files_changed.filter(Boolean) : [];
const selfTests = Array.isArray(result.tests_added) ? result.tests_added.filter(Boolean) : [];
const selfEvidence = result.verification_evidence && result.verification_evidence.trim()
  ? result.verification_evidence.trim()
  : "";
const selfBlocker = result.blocker && result.blocker.trim() ? result.blocker.trim() : "";
if (result.status === "done" && !selfFiles.length && !selfTests.length && !selfEvidence && !selfBlocker) {
  return {
    ...result,
    status: "blocked",
    files_changed: selfFiles,
    tests_added: selfTests,
    verification_evidence: selfEvidence,
    blocker: "tdd-implement schema-default no-op done: implementation agent returned done with no files_changed, tests_added, verification_evidence, or blocker; likely no shell/edit/issue access",
    workflow_defect: true,
    workflow_defect_kind: "tdd-implement-no-op-done",
  };
}
if (cfg.dry_run && result.status === "done" && !selfFiles.length && !selfTests.length) {
  return {
    ...result,
    status: "blocked",
    files_changed: selfFiles,
    tests_added: selfTests,
    verification_evidence: selfEvidence,
    blocker: "tdd-implement dry-run no-op done: implementation agent returned done with no intended files_changed or tests_added; verification_evidence alone is not an implementable claim",
    workflow_defect: true,
    workflow_defect_kind: "tdd-implement-no-op-done",
  };
}
if (!cfg.dry_run && result.status === "done") {
  const fence = ownedPaths.length
    ? `Owned paths (implementation changes MUST be confined to these): ${displayScopePaths(ownedPaths)}. Approved closeout paths allowed only for gate-required artifacts: ${displayScopePaths(closeoutPaths) || "(none)"}.`
    : `No owned_paths were resolved - report changed paths but DO NOT assert containment; flag spec_unresolved=true.`;
  const verify = await agent(
    `INDEPENDENT VERIFICATION of branch ${cfg.branch} in ${ROOT} (read-only - change nothing, commit nothing). The implementing agent claimed status=done; verify the TRUTH. Use Bash.
1. \`git -C ${ROOT} diff --name-only main...${cfg.branch}\` → the ACTUAL changed files. Also \`git -C ${ROOT} diff --stat main...${cfg.branch}\`.
2. If the changed-file list is EMPTY → empty_diff=true (a "done" with no diff is a fabrication).
3. ${fence} For each changed path, is it under an owned path or approved closeout path? List any OUTSIDE as out_of_scope_paths.
4. Re-run the BLOCKING gates from \`curaos/ci-gates.yaml\` FRESH (the single source of truth - \`cd ${ROOT}/curaos && just ci\` or \`bash scripts/ci-local.sh\`; at minimum: ${verifyCmds.map((c) => "`cd " + ROOT + " && " + c + "`").join(" ; ")} ; \`cd ${ROOT}/curaos && node scripts/check-ci-gates-sync.js\`). Capture each exit code (\`echo $?\`). ci_exit = the worst (nonzero if any failed). Set ci_ran=true ONLY if you actually ran the blocking gates and pasted their exit codes; otherwise ci_ran=false. Capture verification_evidence as the VERBATIM last 15 lines + exit code of EACH verification command you re-ran; this independent paste is the fallback claim of record when the implementer omitted one. The sync-check being green confirms the local gate still mirrors the dispatch-only GH workflows, i.e. this re-run is a faithful CI simulation.
5. If a submodule pointer moved, run \`git -C <submodule> branch -r --contains HEAD\` - if EMPTY the pointed commit is UNPUSHED/unreachable → set submodule_unreachable=true (repo-breaking).
Return the OBSERVED facts only - do not trust the implementer's report. If changed_paths is empty, empty_diff MUST be true.`,
    agentOptions({ label: "verify-impl", phase: "Implement", model: CONTRACT.models.verify, schema: {
      type: "object",
      required: ["changed_paths", "empty_diff", "out_of_scope_paths", "ci_exit", "ci_ran", "submodule_unreachable", "verification_evidence"],
      properties: {
        changed_paths: { type: "array", items: { type: "string" } },
        empty_diff: { type: "boolean" },
        out_of_scope_paths: { type: "array", items: { type: "string" } },
        ci_exit: { type: "number" },
        ci_ran: { type: "boolean" },
        submodule_unreachable: { type: "boolean" },
        verification_evidence: { type: "string" },
        spec_unresolved: { type: "boolean" },
        notes: { type: "string" },
      },
    } })
  );

  const fails = [];
  const changedPaths = Array.isArray(verify.changed_paths) ? verify.changed_paths.filter(Boolean) : [];
  const observedOutOfScopePaths = outOfScopePaths(changedPaths, scopePaths);
  const emptyDiff = changedPaths.length === 0;
  const verifierContradiction = verify.empty_diff === true && changedPaths.length > 0;
  const ciExit = normalizeCiExit(verify.ci_exit);
  const ciRan = verify.ci_ran === true;
  const independentEvidence = verify.verification_evidence && verify.verification_evidence.trim()
    ? verify.verification_evidence.trim()
    : "";
  const independentEvidenceHasExitCode = /(?:exit(?: code)?|echo \$\?)\D{0,20}\b[0-9]+\b/i.test(independentEvidence);
  if (verifierContradiction) {
    fails.push("independent verifier reported empty_diff=true with non-empty changed_paths");
  }
  const evidenceParts = [];
  if (result.verification_evidence && result.verification_evidence.trim()) evidenceParts.push(result.verification_evidence.trim());
  if (independentEvidence) {
    evidenceParts.push(`INDEPENDENT VERIFICATION (§8.1 fallback claim of record)\n${independentEvidence}`);
  }
  const verificationEvidence = evidenceParts.join("\n\n");
  if (emptyDiff) fails.push("empty diff - status=done with no code change (fabrication)");
  if (ownedPaths.length === 0 || verify.spec_unresolved === true) fails.push("scope unresolved - no owned_paths fence available for independent containment check");
  if (observedOutOfScopePaths.length) fails.push(`out-of-scope changes: ${observedOutOfScopePaths.join(", ")}`);
  if (!ciRan) fails.push("independent verifier did not prove CI ran (ci_ran=true required)");
  if (ciRan && !independentEvidenceHasExitCode) fails.push("independent verifier did not paste a CI exit code");
  if (ciExit !== 0) fails.push(`independent CI re-run exit=${String(verify.ci_exit)} (normalized=${ciExit}; implementer claimed green)`);
  if (verify.submodule_unreachable) fails.push("submodule pointer moved to an UNPUSHED/unreachable commit (repo-breaking)");
  if (!verificationEvidence || verificationEvidence.trim().length < 40) fails.push("no worker or independent verification_evidence paste (§8.1 - claim of record missing)");

  if (fails.length) {
    const workflowDefectKind = workflowDefectKindForVerification({ emptyDiff, verifierContradiction });
    return {
      ...result,
      status: "blocked",
      blocker: `VERIFICATION GATE FAILED: ${fails.join("; ")}. (independent re-run, not the implementer's self-report)`,
      files_changed: changedPaths,
      verification_evidence: verificationEvidence,
      workflow_defect: !!workflowDefectKind,
      workflow_defect_kind: workflowDefectKind,
    };
  }
  // gate passed - record the OBSERVED changed paths + independent evidence over the self-reported ones
  return { ...result, files_changed: changedPaths, verification_evidence: verificationEvidence };
}

return result;
