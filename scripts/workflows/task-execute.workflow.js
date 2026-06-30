// task-execute - execute one ready-for-agent issue: context-load -> branch -> tdd-implement -> PR.
// Composes context-load + tdd-implement via workflow({scriptPath}). Contract: docs/agents/workflows/task-execute.md
//
// Dual-runtime shape (workflow-defect #490): this file is invoked BOTH by Claude's native
// Workflow() tool (which requires `export const meta` as the FIRST statement) AND by the
// agent-workflow-kit runtime. The kit classifies a source as "Claude-style" when it has
// `export const meta` but NO `export default`/`export function workflow`, and runs Claude-style
// bodies in a node:vm sandbox that does NOT inject `process`/`require`/`module` - so the old
// top-level `process.getBuiltinModule(...)`/`process.cwd()` localRequire threw
// `ReferenceError: process is not defined` before any phase ran. Exporting a default function
// routes the kit through its unrestricted `import()` path (where `process` exists), while keeping
// `export const meta` first preserves Claude Workflow() compatibility. The git-helper require is
// lazy + inside the function so it only executes on the process-bearing path.
export const meta = {
  name: "task-execute",
  description: "Execute one issue end-to-end: load context + blockers, branch, TDD implement, open PR",
  phases: [
    { title: "Context", detail: "context-load + blocker check" },
    { title: "Branch", detail: "create short-lived working branch" },
    { title: "Implement", detail: "tdd-implement + Generator-Evolution" },
    { title: "PR", detail: "push + open PR" },
  ],
};

const CONTRACT = {
  name: "task-execute",
  kind: "composite",
  version: "0.2.0",
  inputs: {
    issue: { type: "string", required: true, description: "owner/repo#N ready-for-agent issue to execute" },
    bundle_issues: { type: "string", required: false, description: "OPTIONAL JSON array of same-owner issue refs bundled into this lane; issue remains the lead issue for branch and PR refs" },
    bundle_issue_bodies: { type: "string", required: false, description: "OPTIONAL JSON object mapping bundled issue refs to deterministically prefetched issue bodies" },
    branch: { type: "string", required: false, description: "optional branch name supplied by a parent worktree dispatcher" },
    branch_precreated: { type: "boolean", required: false, description: "true when the caller already created and checked out branch in an isolated worktree" },
    dry_run: { type: "boolean", required: false, description: "plan + report without branch/commit/PR side effects" },
  },
  outputs: {
    status: { type: "string", description: "pr-open | blocked | needs-user" },
    branch: { type: "string", description: "the working branch" },
    pr: { type: "string", description: "the opened PR ref (if status=pr-open)" },
    generator_evolution: { type: "string", description: "the §8.75 closeout line" },
    blocker: { type: "string", description: "if not pr-open, the concrete blocker" },
    workflow_defect: { type: "boolean", description: "true when a child workflow blocked impossible executor/agent output" },
    workflow_defect_kind: { type: "string", description: "stable workflow-defect classifier when workflow_defect=true" },
  },
  guarantees: { idempotent: false, determinism: "control-flow-only", side_effects: "git" },
  verification: "T1",
  models: { branch: "haiku" },
  composes: ["context-load", "tdd-implement"],
};

const ROOT = ".";
const WF = "scripts/workflows";
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

function uniqueIssues(lead, extra) {
  const out = [];
  for (const value of [lead, ...(Array.isArray(extra) ? extra : [])]) {
    const ref = String(value || "").trim();
    if (ref && !out.includes(ref)) out.push(ref);
  }
  return out;
}

function valuesForSpec(rows, key) {
  const out = [];
  for (const row of rows) {
    const spec = row && row.ctx && row.ctx.issue_spec ? row.ctx.issue_spec : {};
    const value = spec[key];
    const list = Array.isArray(value) ? value : (value ? [value] : []);
    for (const item of list) {
      const text = String(item || "").trim();
      if (text && !out.includes(text)) out.push(text);
    }
  }
  return out;
}

function acceptanceForIssue(issue, acceptance) {
  const list = Array.isArray(acceptance) ? acceptance : (acceptance ? [acceptance] : []);
  return list
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .map((item) => `${issue}: ${item}`);
}

function combineIssueSpec(rows) {
  const primary = rows[0] && rows[0].ctx && rows[0].ctx.issue_spec ? rows[0].ctx.issue_spec : {};
  const acceptance = rows.length === 1
    ? valuesForSpec(rows, "acceptance")
    : rows.flatMap((row) => acceptanceForIssue(row.issue, row.ctx && row.ctx.issue_spec ? row.ctx.issue_spec.acceptance : []));
  return {
    ...primary,
    acceptance,
    owned_paths: valuesForSpec(rows, "owned_paths"),
    closeout_paths: valuesForSpec(rows, "closeout_paths"),
    forbidden_paths: valuesForSpec(rows, "forbidden_paths"),
    verification_cmds: valuesForSpec(rows, "verification_cmds"),
    adr_refs: valuesForSpec(rows, "adr_refs"),
    bundled_issues: rows.map((row) => row.issue),
    bundled_acceptance: rows.map((row) => ({
      issue: row.issue,
      acceptance: row.ctx && row.ctx.issue_spec ? row.ctx.issue_spec.acceptance || [] : [],
    })),
  };
}

function combineContextSummary(rows) {
  if (rows.length === 1) return rows[0].ctx.context_summary || "";
  return [
    `BUNDLED LANE ISSUES: ${rows.map((row) => row.issue).join(", ")}`,
    ...rows.map((row) => `\n## ${row.issue}\n${row.ctx.context_summary || "(no context summary)"}`),
  ].join("\n");
}

function combineIssueBodies(issues, bodyMap) {
  const bodies = [];
  for (const issue of issues) {
    const body = bodyMap && typeof bodyMap === "object" ? bodyMap[issue] : "";
    if (body) bodies.push(`## ${issue}\n${String(body).trim()}`);
  }
  return bodies.join("\n\n");
}

// Lazy git-helper load - only reached on the kit `import()` path / Claude harness, both of which
// provide `process`. Never executes under the kit's Claude-style vm sandbox (that path is avoided
// entirely by exporting a default function below, per the #490 header note).
function loadGitHelpers() {
  const { createRequire } = process.getBuiltinModule("node:module");
  // Resolve module-relative via import.meta.url (NOT process.cwd()) so ../lib resolves from any cwd.
  const localRequire = createRequire(import.meta.url);
  return localRequire("../lib/workflow-git.js");
}

function currentBranch() {
  const { execFileSync } = process.getBuiltinModule("node:child_process");
  return execFileSync("git", ["branch", "--show-current"], { encoding: "utf8" }).trim();
}

export default async function runTaskExecute(context) {
  const { args, agent, phase, workflow } = context;
  const {
    createAndCheckoutBranch,
    observedPrRef,
    resolveDefaultBranch,
    restoreDefaultBranch,
    restoreSuffix,
  } = loadGitHelpers();

  phase("Context");
  const cfg = parseArgs(typeof args !== "undefined" ? args : undefined);
  if (!cfg.issue) throw new Error("task-execute: args.issue (owner/repo#N) is required");
  const dryRun = !!cfg.dry_run;
  const bundleIssues = uniqueIssues(cfg.issue, parseJson(cfg.bundle_issues, []));
  const bundleIssueBodies = parseJson(cfg.bundle_issue_bodies, {});

  // Phase 1: context-load (composed atomic)
  const contextRows = [];
  for (const issue of bundleIssues) {
    const ctx = await workflow({ scriptPath: `${WF}/context-load.workflow.js` }, { issue, scope_hint: "" });
    if (ctx.blockers && ctx.blockers.length) {
      return { status: "blocked", branch: "", pr: "", generator_evolution: "n/a", blocker: `${issue}: ${ctx.blockers.join("; ")}` };
    }
    contextRows.push({ issue, ctx });
  }
  const primaryCtx = contextRows[0].ctx;
  const combinedIssueSpec = combineIssueSpec(contextRows);
  const combinedContextSummary = combineContextSummary(contextRows);
  const combinedIssueBody = combineIssueBodies(bundleIssues, bundleIssueBodies);

  // Phase 2: branch (deterministic executor code; no agent self-report)
  phase("Branch");
  const branchName = cfg.branch || `feat/${cfg.issue.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
  if (!dryRun) {
    if (cfg.branch_precreated === true) {
      const actualBranch = currentBranch();
      if (actualBranch !== branchName) {
        return { status: "blocked", branch: actualBranch, pr: "", generator_evolution: "n/a", blocker: `branch-precreated-mismatch: expected ${branchName}, found ${actualBranch || "<detached>"}` };
      }
    } else {
      const branch = createAndCheckoutBranch(branchName);
      if (branch.branch !== branchName) {
        const restore = restoreDefaultBranch(`branch-create-failed ${branchName}`);
        return { status: "blocked", branch: branch.branch || "", pr: "", generator_evolution: "n/a", blocker: `branch-create-failed: expected ${branchName}, ${branch.blocker || "git branch creation failed"}${restoreSuffix(restore)}` };
      }
    }
  }

  // Phase 3: tdd-implement (composed atomic). issue_spec threads the owned-path scope fence +
  // acceptance + verification_cmds resolved by context-load; tdd-implement's programmatic gate
  // (independent diff + CI re-run + owned-path + reachable-pointer) forces status=blocked on any
  // fabrication or out-of-scope change - so a self-reported "done" can no longer sail to a PR.
  phase("Implement");
  const impl = await workflow({ scriptPath: `${WF}/tdd-implement.workflow.js` }, {
    issue: cfg.issue,
    branch: branchName,
    context_summary: combinedContextSummary,
    generated_code: contextRows.some((row) => row.ctx.generated_code === true),
    issue_spec: combinedIssueSpec,
    impl_model: primaryCtx.recommended_model,
    ...(combinedIssueBody ? { issue_body: combinedIssueBody } : {}),
    dry_run: dryRun,
  });

  if (impl.status !== "done") {
    const restore = dryRun ? { restored: true, stashed: false } : restoreDefaultBranch(`task-execute blocked ${branchName}`);
    return {
      status: impl.status === "needs-user" ? "needs-user" : "blocked",
      branch: branchName,
      pr: "",
      generator_evolution: impl.generator_evolution || "n/a",
      blocker: `${impl.blocker || "tdd-implement did not reach done"}${restoreSuffix(restore)}`,
      workflow_defect: impl.workflow_defect === true,
      workflow_defect_kind: impl.workflow_defect_kind || "",
    };
  }
  if (!impl.verification_evidence || impl.verification_evidence.trim().length < 40) {
    const restore = dryRun ? { restored: true, stashed: false } : restoreDefaultBranch(`task-execute missing-evidence ${branchName}`);
    return {
      status: "blocked",
      branch: branchName,
      pr: "",
      generator_evolution: impl.generator_evolution || "n/a",
      blocker: `tdd-implement reached done without §8.1 verification_evidence${restoreSuffix(restore)}`,
      workflow_defect: impl.workflow_defect === true,
      workflow_defect_kind: impl.workflow_defect_kind || "",
    };
  }

  // Phase 4: PR
  phase("PR");
  if (dryRun) {
    return { status: "blocked", branch: branchName, pr: "(dry_run - no PR opened)", generator_evolution: impl.generator_evolution, blocker: "dry_run" };
  }
  const pr = await agent(
    `From ${ROOT} on branch ${branchName}: push the branch and open one PR for bundled lane issues ${bundleIssues.join(", ")} with \`env -u GITHUB_TOKEN gh pr create\`. The PR body MUST be generated from the ACTUAL change - run \`git diff --stat ${resolveDefaultBranch()}...${branchName}\` and describe ONLY what the diff shows; do NOT claim work absent from the diff. Include: link every bundled issue; the real changed-file summary; the verification_evidence block below verbatim (§8.1 claim of record - it may include an INDEPENDENT VERIFICATION fallback paste; the pastes cover the BLOCKING gates in curaos/ci-gates.yaml, the single source of truth; GH auto-CI is OFF per ai/rules/curaos_local_ci_first_rule.md so these LOCAL pastes ARE the merge gate, not a green GitHub check); the closeout line and "GENERATOR-EVOLUTION: ${impl.generator_evolution}". If VERIFICATION_EVIDENCE is missing or says "(none provided)", STOP and report no PR. Before pushing, if the diff moves any submodule pointer, verify the pointed commit is pushed/reachable (\`git -C <submodule> branch -r --contains HEAD\` non-empty) - if not, do NOT push; report the broken pointer. Then set every bundled issue label to agent-PR-open (remove agent-claimed:*). Conventional Commit title; NO AI attribution trailers. Report the PR ref (owner/repo#N).\n\nVERIFICATION_EVIDENCE (paste verbatim into the PR body):\n${impl.verification_evidence}`,
    { label: "pr", phase: "PR", model: "sonnet", schema: { type: "object", required: ["pr"], properties: { pr: { type: "string" } } } }
  );

  const prRef = observedPrRef(pr);
  const restore = restoreDefaultBranch(`task-execute pr-open ${branchName}`);
  if (!prRef) {
    return { status: "blocked", branch: branchName, pr: "", generator_evolution: impl.generator_evolution, blocker: `pr-create-failed: agent returned <empty-or-invalid>${restoreSuffix(restore)}` };
  }
  if (restore.restored !== true) {
    return { status: "blocked", branch: branchName, pr: prRef, generator_evolution: impl.generator_evolution, blocker: `post-pr default-branch restore failed${restoreSuffix(restore)}` };
  }
  return { status: "pr-open", branch: branchName, pr: prRef, generator_evolution: impl.generator_evolution, blocker: "", issues: bundleIssues };
}
