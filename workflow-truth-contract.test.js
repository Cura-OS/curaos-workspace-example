#!/usr/bin/env node
const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const {
  desiredForFieldCacheRefresh,
  issueKindLabel,
  mergeFrontmatterBackstop,
  milestoneAfterReconcile,
  plannedFieldWrites,
} = require("./roadmap-project-item-sync.js");
const issueSpec = require("./lib/issue-spec.js");
const verificationGate = require("./lib/workflow-verification-gate.js");
const workflowGitLib = require("./lib/workflow-git.js");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function workflowGhRef() {
  return require("./lib/gh-ref.js");
}

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}`);
  assert.notEqual(start, -1, `missing function ${name}`);
  const braceStart = source.indexOf("{", start);
  assert.notEqual(braceStart, -1, `missing function body ${name}`);
  let depth = 0;
  for (let i = braceStart; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    if (source[i] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`unterminated function ${name}`);
}

// Executed-retry harness (RP-34; shared with the codex G-02 all-issue-scan fixture):
// composes an executor's REAL retry helper from its source (the GH_ATTEMPTS constant +
// classifier helpers + ghJson) with execFileSync/sleep stubbed; sleep must never shell
// out here, and the env handed to the composed module carries a GITHUB_TOKEN that the
// executed ghJson must drop before calling gh.
const transientError = () => Object.assign(new Error("HTTP 502 bad gateway"), { stderr: "HTTP 502 bad gateway" });
const fatalError = () => Object.assign(new Error("HTTP 404 Not Found"), { stderr: "HTTP 404 Not Found" });
function buildGhJson(src, withQuotaClassifier, execStub) {
  const constLine = src.match(/const GH_ATTEMPTS = \d+;/);
  assert.ok(constLine, "missing GH_ATTEMPTS constant");
  const parts = [constLine[0], extractFunction(src, "errorText"), extractFunction(src, "isTransientGithubFailure")];
  if (withQuotaClassifier) parts.push(extractFunction(src, "isMaskedProjectGraphqlQuota"));
  parts.push(extractFunction(src, "ghJson"), "return { ghJson, GH_ATTEMPTS };");
  return new Function("execFileSync", "sleep", "process", parts.join("\n"))(execStub, () => {}, { env: { GITHUB_TOKEN: "must-be-dropped" } });
}

function buildGhApi(src, execStub) {
  const constLine = src.match(/const GH_ATTEMPTS = \d+;/);
  assert.ok(constLine, "missing GH_ATTEMPTS constant");
  const parts = [
    constLine[0],
    extractFunction(src, "errorText"),
    extractFunction(src, "isTransientGithubFailure"),
    extractFunction(src, "ghApi"),
    "return { ghApi, GH_ATTEMPTS };",
  ];
  return new Function("execFileSync", "process", parts.join("\n"))(execStub, { env: { GITHUB_TOKEN: "must-be-dropped" } });
}

async function runTddImplementWorkflow({ args, agentResults }) {
  const source = read("scripts/workflows/tdd-implement.workflow.js").replace(/^export const meta =/m, "const meta =");
  const calls = [];
  const agent = async (prompt, options) => {
    calls.push({ prompt, options });
    if (!agentResults.length) throw new Error("unexpected agent call");
    return agentResults.shift();
  };
  const phase = () => {};
  const runner = new Function("agent", "phase", "args", `return (async () => {\n${source}\n})()`);
  const result = await runner(agent, phase, args);
  return { result, calls };
}

test("all-issue scan retries transient GitHub failures and fails closed", () => {
  const scan = read("scripts/workflows/milestone-active-scan.workflow.js");
  const wave = read("scripts/workflows/milestone-wave.workflow.js");
  const playbook = read("docs/agents/workflows/milestone-wave.md");

  // codex G-02: the retry claims in this test's name are EXECUTED, not token-matched.
  // The scan's real ghJson (composed via the shared RP-34 buildGhJson harness, gh stubbed
  // through the injected execFileSync) proves all three behaviors:

  // (a) transient 5xx then success: bounded retry recovers within the budget.
  const recoverCalls = [];
  const recover = buildGhJson(scan, true, (cmd, cmdArgs, opts) => {
    recoverCalls.push({ opts });
    if (recoverCalls.length < 3) throw transientError();
    return JSON.stringify({ issues: ["ok"] });
  });
  assert.deepEqual(recover.ghJson(["issue", "list"]), { issues: ["ok"] }, "transient 5xx then success recovers");
  assert.equal(recoverCalls.length, 3, "two transient 5xx then success = exactly 3 calls");
  assert.ok(recoverCalls.length <= recover.GH_ATTEMPTS, "recovery stays within the bounded budget");
  assert.equal("GITHUB_TOKEN" in recoverCalls[0].opts.env, false, "executed gh env drops GITHUB_TOKEN");

  // (b) persistent transient failure: budget fully spent, then the scan FAILS CLOSED
  // (typed transient error blocks; no silent empty issue list).
  let persistentCalls = 0;
  const persistent = buildGhJson(scan, true, () => { persistentCalls += 1; throw transientError(); });
  assert.throws(() => persistent.ghJson(["issue", "list"]), /github-project-api-transient/, "persistent transient fails closed");
  assert.equal(persistentCalls, persistent.GH_ATTEMPTS, "bounded budget fully spent, never infinite");

  // (c) fatal (404): fail immediately, zero retry burn.
  let fatalCalls = 0;
  const fatal = buildGhJson(scan, true, () => { fatalCalls += 1; throw fatalError(); });
  assert.throws(() => fatal.ghJson(["issue", "list"]), /404/, "fatal 404 propagates");
  assert.equal(fatalCalls, 1, "fatal 404 must not retry");

  // Prose/wave truth pins (docs cannot be executed; retained from the original contract).
  assert.doesNotMatch(scan, /Atomics\.wait/);
  assert.match(scan, /delete env\.GITHUB_TOKEN/);
  assert.match(scan, /github-project-api-transient/);
  assert.match(scan, /isMaskedProjectGraphqlQuota/);
  assert.match(scan, /unknown owner type/);
  assert.match(scan, /every open\s+org issue/);
  assert.match(wave, /milestone fields are tracker metadata, not dispatch gates/);
  assert.match(wave, /github-project-api-transient/);
  assert.match(wave, /unknown owner type/);
  assert.match(wave, /refusing LLM fallback for tracker truth/);
  assert.match(playbook, /every open org issue/);
  assert.match(playbook, /unknown owner type/);
  assert.match(playbook, /it does not narrow candidates or block dispatch/);
  assert.match(playbook, /transient GitHub 5xx\/504/);
});

test("tdd-implement omits raw logical tier model overrides by default", () => {
  const workflow = read("scripts/workflows/tdd-implement.workflow.js");
  const playbook = read("docs/agents/workflows/tdd-implement.md");
  const workflowReadme = read("docs/agents/workflows/README.md");
  const wavePlaybook = read("docs/agents/workflows/milestone-wave.md");
  const prompt = read("docs/agents/milestone-orchestration-prompt.md");

  assert.match(workflow, /function shouldPassLogicalModel/);
  assert.match(workflow, /AGENT_WORKFLOW_KIT_PASS_LOGICAL_MODELS/);
  assert.match(workflow, /function agentOptions/);
  assert.match(workflow, /if \(shouldPassLogicalModel\(\) && model\) options\.model = model/);
  assert.match(workflow, /agentOptions\(\{ label: `tdd-implement/);
  assert.match(workflow, /agentOptions\(\{ label: "verify-impl"/);
  assert.match(workflow, /RUNTIME ACCESS CHECK/);
  assert.match(workflow, /Real\n\/\/ dispatches trust the verifier's git diff/);
  assert.match(playbook, /Harness Model Routing/);
  assert.match(playbook, /omits those strings as raw `agent\(\)` model identifiers by default/);
  assert.match(playbook, /evidence string alone is not an implementable claim/);
  assert.match(workflowReadme, /logical tier labels/);
  assert.match(wavePlaybook, /harness-aware model routing/);
  assert.match(prompt, /model routing is harness-aware/);
});

test("milestone-wave fails closed when triage pipeline drops candidates", () => {
  const workflow = read("scripts/workflows/milestone-wave.workflow.js");
  const playbook = read("docs/agents/workflows/milestone-wave.md");
  const prompt = read("docs/agents/milestone-orchestration-prompt.md");
  const droppedPipelineRows = new Function(`${extractFunction(workflow, "droppedPipelineRows")}\nreturn droppedPipelineRows;`)();

  assert.deepEqual(
    droppedPipelineRows(["owner/repo#1", "owner/repo#2", "owner/repo#3"], [{ issue: "owner/repo#1" }, null], "triage-pipeline-dropped"),
    [
      { issue: "owner/repo#2", missing: "triage-pipeline-dropped" },
      { issue: "owner/repo#3", missing: "triage-pipeline-dropped" },
    ],
  );
  assert.match(workflow, /agent-triage-pipeline-dropped/);
  assert.match(workflow, /refusing partial all-open issue accounting/);
  assert.match(workflow, /gh-issue-triage child failed/);
  assert.match(workflow, /triage-workflow-failed/);
  assert.match(playbook, /Dropped triage pipeline rows are terminal external blockers/);
  assert.match(prompt, /Do not use Agent Workflow Kit `--max-concurrent-agents` as a throughput throttle/);
});

test("milestone-wave degrades per-candidate triage child failures", () => {
  const workflow = read("scripts/workflows/milestone-wave.workflow.js");
  const playbook = read("docs/agents/workflows/milestone-wave.md");
  const prompt = read("docs/agents/milestone-orchestration-prompt.md");
  const triageRuntimeUnavailableLimit = new Function(`${extractFunction(workflow, "triageRuntimeUnavailableLimit")}\nreturn triageRuntimeUnavailableLimit;`)();
  const isTerminalTriageExternal = new Function(`${extractFunction(workflow, "isTerminalTriageExternal")}\nreturn isTerminalTriageExternal;`)();
  const isRuntimeUnavailableKind = new Function(`${extractFunction(workflow, "isRuntimeUnavailableKind")}\nreturn isRuntimeUnavailableKind;`)();

  assert.equal(triageRuntimeUnavailableLimit(0), 1);
  assert.equal(triageRuntimeUnavailableLimit(6), 1);
  assert.equal(triageRuntimeUnavailableLimit(146), 3);
  assert.equal(isTerminalTriageExternal("agent-runtime-quota"), true);
  assert.equal(isTerminalTriageExternal("github-graphql-quota"), true);
  assert.equal(isTerminalTriageExternal("agent-runtime-unavailable"), false);
  assert.equal(isTerminalTriageExternal("triage-workflow-failed"), false);
  assert.equal(isRuntimeUnavailableKind("agent-runtime-unavailable"), true);
  assert.equal(isRuntimeUnavailableKind("agent-runtime-quota"), false);
  assert.match(workflow, /realAgentsEnabled/);
  assert.match(workflow, /AGENT_WORKFLOW_KIT_REAL_AGENTS/);
  assert.match(workflow, /readAgentRuntimeStatus/);
  assert.match(workflow, /agentRuntimeFailureKind/);
  assert.match(workflow, /TRIAGE-RUNTIME-PREFLIGHT:/);
  assert.match(workflow, /TRIAGE-RUNTIME-UNAVAILABLE:/);
  assert.match(workflow, /TRIAGE-DEGRADED:/);
  assert.match(workflow, /TRIAGE-QUOTA-DEFERRED:/);
  assert.match(workflow, /quotaDeferredRows/);
  assert.match(workflow, /runtimeDeferred/);
  assert.match(workflow, /terminalTriageExternal/);
  assert.match(workflow, /triage failed\|triage-blocked\|agent-runtime-unavailable/);
  assert.match(workflow, /c\.triage\.blocked_by_external/);
  assert.match(workflow, /c\.triage\.error_kind \|\| "triage-blocked"/);
  assert.match(playbook, /Per-candidate triage child failures, including `agent-runtime-unavailable` timeouts and `triage-workflow-failed`, degrade to `not_ready` with route `triage-retry`/);
  assert.match(playbook, /TRIAGE-RUNTIME-PREFLIGHT/);
  assert.match(playbook, /TRIAGE-RUNTIME-UNAVAILABLE/);
  assert.match(playbook, /never silently falls back from Codex to Claude/);
  assert.match(playbook, /intentional same-tier configured harness selection/);
  assert.match(prompt, /Per-candidate triage child failures, including `agent-runtime-unavailable` timeouts and `triage-workflow-failed`, degrade to `not_ready` with route `triage-retry`/);
  assert.match(prompt, /Codex runtime preflight before each queued real-agent triage batch/);
  assert.match(prompt, /Do not silently reroute to Claude/);
  assert.match(prompt, /same-tier configured harness/);
  assert.match(prompt, /True provider triage outages such as `agent-runtime-quota`, plus dropped pipeline rows, remain terminal/);
  assert.match(prompt, /GitHub GraphQL quota after queued triage has partial results is deferred into `not_ready` rows/);
});

test("gh-issue-triage has deterministic authoritative-prefetch fast path", () => {
  const workflow = read("scripts/workflows/gh-issue-triage.workflow.js");
  const playbook = read("docs/agents/workflows/gh-issue-triage.md");
  const prompt = read("docs/agents/milestone-orchestration-prompt.md");
  const helpers = new Function(`
${extractFunction(workflow, "sectionContent")}
${extractFunction(workflow, "hasBodySection")}
${extractFunction(workflow, "blockersSectionClear")}
return { sectionContent, blockersSectionClear };
`)();

  assert.match(workflow, /function deterministicFastPathResult/);
  assert.match(workflow, /has_authoritative_prefetch/);
  assert.match(workflow, /hasCanonicalReadyFrontmatter/);
  assert.match(workflow, /hasCanonicalReadySections/);
  assert.match(workflow, /blockersSectionClear/);
  assert.match(workflow, /agentRuntimeStatus\(\)\.agentFailureKind/);
  assert.match(workflow, /deterministic fast path: prefetched ready-for-agent issue has complete frontmatter/);
  assert.match(workflow, /deterministic fast path: existing ready-for-agent label is unsafe/);
  assert.match(playbook, /Deterministic fast path: only authoritative `prefetch` may bypass the agent/);
  assert.match(playbook, /It never promotes raw `needs-triage`/);
  assert.match(playbook, /local Codex session\/status-line no-credit telemetry/);
  assert.match(prompt, /`gh-issue-triage` may use its deterministic authoritative-prefetch fast path/);
  assert.match(prompt, /It must not promote raw `needs-triage` without agent judgement/);
  assert.equal(
    helpers.sectionContent("## Blockers\nNone\nextra blocker text\n\n## Scope\nDo it", "Blockers"),
    "None\nextra blocker text",
  );
  assert.equal(helpers.blockersSectionClear("## Blockers\nNone\n\n## Scope\nDo it"), true);
  assert.equal(helpers.blockersSectionClear("## Blockers\nNone\nextra blocker text\n\n## Scope\nDo it"), false);
});

test("milestone-wave degrades breakdown split timeouts", () => {
  const workflow = read("scripts/workflows/milestone-wave.workflow.js");
  const playbook = read("docs/agents/workflows/milestone-wave.md");
  const prompt = read("docs/agents/milestone-orchestration-prompt.md");

  assert.match(workflow, /BREAKDOWN-DEGRADED:/);
  assert.match(workflow, /breakdown-retry: split failed/);
  assert.match(workflow, /triaged\.not_ready = \[/);
  assert.match(workflow, /breakdown\|foresight/);
  assert.match(playbook, /split agent times out after the assessor proved the parent is too broad, hold the original parent in `not_ready` with route `breakdown-retry`/);
  assert.match(prompt, /breakdown split agent times out after the assessor proved the parent is too broad/);
  assert.match(prompt, /single issue-creation timeout is not a global workflow failure/);
});

test("milestone-wave does not re-split parents with open native subissues", () => {
  const workflow = read("scripts/workflows/milestone-wave.workflow.js");
  const playbook = read("docs/agents/workflows/milestone-wave.md");
  const prompt = read("docs/agents/milestone-orchestration-prompt.md");

  assert.match(workflow, /function existingOpenSubIssueRefs/);
  assert.match(workflow, /BREAKDOWN-IDEMPOTENT:/);
  assert.match(workflow, /breakdown-existing-children:/);
  assert.match(workflow, /already has \$\{existingChildren\.length\} open child issue/);
  assert.match(playbook, /already has open child issues, hold the parent in `not_ready` with route `breakdown-existing-children`/);
  assert.match(prompt, /If a ready parent already has open native subissues/);
  assert.match(prompt, /do not invoke a split agent or create another child set/);
});

test("milestone-wave batches real-agent triage instead of using the kit hard cap", async () => {
  const workflow = read("scripts/workflows/milestone-wave.workflow.js");
  const playbook = read("docs/agents/workflows/milestone-wave.md");
  const runPipelineBatches = new Function(`${extractFunction(workflow, "runPipelineBatches")}\nreturn runPipelineBatches;`)();
  const calls = [];

  const result = await runPipelineBatches([1, 2, 3, 4, 5], 2, async (batch, stage) => {
    calls.push(batch);
    return Promise.all(batch.map(stage));
  }, async (item) => item * 10);

  assert.deepEqual(calls, [[1, 2], [3, 4], [5]]);
  assert.deepEqual(result, [10, 20, 30, 40, 50]);
  assert.match(workflow, /triage_batch_size/);
  assert.match(workflow, /TRIAGE-BATCH/);
  assert.match(workflow, /SCAN-DETERMINISTIC/);
  assert.match(workflow, /Do not send the whole active issue universe through one scan agent call/);
  assert.match(workflow, /state_label === "ready-for-human"/);
  assert.match(workflow, /isDispatchableTriage/);
  assert.match(workflow, /non-dispatchable-triage/);
  assert.match(playbook, /skips the old whole-universe scan agent/);
  assert.match(playbook, /bounded per-issue real-agent batches/);
  assert.match(playbook, /Project sync \+ wire only for dispatch-eligible rows/);
  assert.match(playbook, /Do not use `--max-concurrent-agents` as a throughput throttle/);
});

test("milestone-wave blocks before active scan when GraphQL quota is already zero", () => {
  const workflow = read("scripts/workflows/milestone-wave.workflow.js");
  const playbook = read("docs/agents/workflows/milestone-wave.md");
  const graphqlQuotaStatus = new Function(`${extractFunction(workflow, "graphqlQuotaStatus")}\nreturn graphqlQuotaStatus;`)();

  assert.deepEqual(
    graphqlQuotaStatus({
      graphqlProbe: "rest-fallback",
      budgets: { graphql: { remaining: 0, resetAt: "2026-06-17T12:37:36Z" } },
    }),
    { depleted: true, remaining: 0, resetAt: "2026-06-17T12:37:36Z", probe: "rest-fallback" },
  );
  assert.equal(graphqlQuotaStatus({ budgets: { graphql: { remaining: 1 } } }).depleted, false);
  assert.match(workflow, /ACTIVE-SCAN-PREFLIGHT/);
  assert.match(workflow, /readGraphqlQuotaStatus/);
  assert.match(workflow, /github-graphql-quota/);
  assert.match(playbook, /before starting `milestone-active-scan`/);
});

test("verification gate normalizes model-shaped verifier facts", () => {
  assert.equal(verificationGate.normalizeCiExit(0), 0);
  assert.equal(verificationGate.normalizeCiExit(1), 1);
  assert.equal(verificationGate.normalizeCiExit("0"), 1);
  assert.equal(verificationGate.normalizeCiExit(null), 1);
  assert.equal(verificationGate.normalizeRepoPath("./scripts/workflows/"), "scripts/workflows");
  assert.equal(
    verificationGate.ownedPathMatches("scripts/workflows/tdd-implement.workflow.js", "scripts/workflows/tdd-implement.workflow.js"),
    true,
  );
  assert.equal(
    verificationGate.ownedPathMatches("scripts/workflows/tdd-implement.workflow.js", "scripts/workflows"),
    true,
  );
  assert.equal(
    verificationGate.ownedPathMatches("scripts/workflows/tdd-implement.workflow.js", "scripts/**/*.js"),
    true,
  );
  assert.equal(
    verificationGate.ownedPathMatches(".github/workflows/tier-b-fast-ci.yml", ".github"),
    true,
  );
  assert.equal(
    verificationGate.ownedPathMatches(".github/workflows/tier-b-fast-ci.yml", ".github/workflows"),
    true,
  );
  assert.deepEqual(
    verificationGate.outOfScopePaths(
      ["scripts/workflows/tdd-implement.workflow.js", "docs/agents/workflows/tdd-implement.md"],
      ["scripts/workflows/tdd-implement.workflow.js"],
    ),
    ["docs/agents/workflows/tdd-implement.md"],
  );
  const serviceSpec = {
    owned_paths: ["curaos/backend/services/personal-calendar-service"],
    closeout_paths: ["curaos/backend/packages/calendar-sdk"],
  };
  assert.deepEqual(verificationGate.closeoutPathsForSpec(serviceSpec), [
    "curaos/backend/packages/calendar-sdk",
    "exact:curaos",
    "ai/curaos/docs/DOC-GRAPH.md",
    "ai/curaos/backend/services/personal-calendar-service",
    "curaos/bun.lock",
  ]);
  const serviceScope = verificationGate.scopePathsForSpec(serviceSpec);
  assert.deepEqual(
    verificationGate.outOfScopePaths(
      [
        "curaos/backend/services/personal-calendar-service/src/index.ts",
        "curaos/backend/packages/calendar-sdk/src/index.ts",
        "curaos/bun.lock",
        "ai/curaos/docs/DOC-GRAPH.md",
        "ai/curaos/backend/services/personal-calendar-service/Requirements.md",
        "curaos",
      ],
      serviceScope,
    ),
    [],
  );
  assert.deepEqual(
    verificationGate.outOfScopePaths(
      ["curaos/backend/services/other-service/src/index.ts"],
      serviceScope,
    ),
    ["curaos/backend/services/other-service/src/index.ts"],
  );
  assert.equal(
    verificationGate.workflowDefectKindForVerification({ emptyDiff: true, verifierContradiction: false }),
    "tdd-implement-no-op-done",
  );
  assert.equal(
    verificationGate.workflowDefectKindForVerification({ emptyDiff: false, verifierContradiction: true }),
    "tdd-implement-verifier-contradiction",
  );
  assert.equal(
    verificationGate.workflowDefectKindForVerification({ emptyDiff: false, verifierContradiction: false }),
    "",
  );
});

test("workflow inline verification helpers stay synced with test mirror", () => {
  const workflow = read("scripts/workflows/tdd-implement.workflow.js");
  const mirror = read("scripts/lib/workflow-verification-gate.js");
  for (const name of [
    "normalizeCiExit",
    "workflowDefectKindForVerification",
    "normalizeRepoPath",
    "uniqueStrings",
    "globToRegExp",
    "ownedPathMatches",
    "scopePathMatches",
    "derivedCloseoutPathsForOwnedPaths",
    "closeoutPathsForSpec",
    "scopePathsForSpec",
    "outOfScopePaths",
  ]) {
    assert.equal(extractFunction(workflow, name), extractFunction(mirror, name));
  }
});

// RP-27: artifact writers resolve destinations from an absolute workspace root, never the caller
// cwd and never `../`-relative hops (the .worktrees/ai/ stray-doc class). The grill workflow
// carries an inline copy of the resolver (its source runs via `new Function` here, where
// import.meta is unavailable), mirrored at scripts/lib/workspace-root.js for other writers and
// the RP-75 GC. Behavior tests live in scripts/lib/workspace-root.test.js (nested-worktree
// fixture + stub-run); this test pins the mirror lockstep + the no-escape-path invariant.
test("grill workflow workspace-root helpers stay synced with lib mirror (RP-27)", () => {
  const workflow = read("scripts/workflows/opposite-harness-grill.workflow.js");
  const mirror = read("scripts/lib/workspace-root.js");
  for (const name of ["workspaceRootMarker", "gitPathOutput", "resolveWorkspaceRoot"]) {
    assert.equal(extractFunction(workflow, name), extractFunction(mirror, name));
  }
  // The grills dir derives from the resolved workspace root, not from cwd-relative "./".
  assert.match(workflow, /resolve\(`\$\{workspaceRoot\(\)\}\/ai\/curaos\/docs\/grills`\)/);
  // Relative caller-supplied report paths anchor at the workspace root too.
  assert.match(workflow, /resolve\(`\$\{workspaceRoot\(\)\}\/\$\{cfg\.report_path\}`\)/);
  // No `../`-relative escape paths in the writers (the class that landed artifacts git-invisible).
  assert.doesNotMatch(workflow, /\.\.\//);
  assert.doesNotMatch(mirror, /\.\.\//);
});

test("workflow git helper accepts only owner/repo#number PR refs", () => {
  assert.equal(
    workflowGitLib.observedPrRef({ pr: "your-org/curaos-ai-workspace#500" }),
    "your-org/curaos-ai-workspace#500",
  );
  assert.equal(workflowGitLib.observedPrRef({ pr: " owner.name/repo-name#123 " }), "owner.name/repo-name#123");
  assert.equal(workflowGitLib.observedPrRef({ pr: "no PR opened" }), "");
  assert.equal(workflowGitLib.observedPrRef({ pr: "failed to create PR" }), "");
  assert.equal(workflowGitLib.observedPrRef({ pr: "your-org/curaos-ai-workspace" }), "");
  assert.equal(workflowGitLib.observedPrRef({ pr: "" }), "");
  assert.equal(workflowGitLib.observedPrRef({}), "");
});

test("workflow git helper creates branches from remote default in linked worktrees", (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-git-worktree-"));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

  const remote = path.join(tmp, "remote.git");
  const primary = path.join(tmp, "primary");
  const linked = path.join(tmp, "linked");
  const helperPath = path.join(root, "scripts/lib/workflow-git.js");

  const runGit = (cwd, args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

  execFileSync("git", ["init", "--bare", remote], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  execFileSync("git", ["clone", remote, primary], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  runGit(primary, ["config", "user.email", "workflow-git@example.invalid"]);
  runGit(primary, ["config", "user.name", "Workflow Git Test"]);
  fs.writeFileSync(path.join(primary, "README.md"), "base\n");
  runGit(primary, ["add", "README.md"]);
  runGit(primary, ["commit", "-m", "test: seed default branch"]);
  runGit(primary, ["branch", "-M", "main"]);
  runGit(primary, ["push", "-u", "origin", "main"]);
  runGit(remote, ["symbolic-ref", "HEAD", "refs/heads/main"]);
  runGit(primary, ["remote", "set-head", "origin", "-a"]);
  runGit(primary, ["worktree", "add", "--detach", linked, "origin/main"]);

  const output = execFileSync(
    process.execPath,
    [
      "-e",
      `
        const helper = require(${JSON.stringify(helperPath)});
        const branch = helper.createAndCheckoutBranch("feat/worktree-safe");
        const restore = helper.restoreDefaultBranch("linked worktree cleanup");
        const status = helper.git(["status", "--short", "--branch"]).stdout;
        console.log(JSON.stringify({ branch, restore, status }));
      `,
    ],
    { cwd: linked, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  const result = JSON.parse(output);

  assert.equal(result.branch.branch, "feat/worktree-safe");
  assert.equal(result.branch.blocker, "");
  assert.equal(result.restore.restored, true);
  assert.match(result.status, /^## HEAD \(no branch\)/);

  fs.writeFileSync(path.join(linked, "DIRTY.md"), "dirty\n");
  runGit(linked, ["remote", "set-url", "origin", path.join(tmp, "missing.git")]);
  const failedOutput = execFileSync(
    process.execPath,
    [
      "-e",
      `
        const helper = require(${JSON.stringify(helperPath)});
        const branch = helper.createAndCheckoutBranch("feat/fetch-fails");
        console.log(JSON.stringify(branch));
      `,
    ],
    { cwd: linked, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  const failed = JSON.parse(failedOutput);

  assert.equal(failed.branch, "");
  assert.equal(failed.stashed, true);
});

test("wave-prioritize treats path-valued module frontmatter as owned root", () => {
  const workflow = read("scripts/workflows/wave-prioritize.workflow.js");
  const rootFromPathSource = extractFunction(workflow, "rootFromPath");
  const rootFromModuleSource = extractFunction(workflow, "rootFromModule");
  const rootFromIssueRefSource = extractFunction(workflow, "rootFromIssueRef");
  const ownedRootSource = extractFunction(workflow, "ownedRoot");
  const existing = new Set([
    "./curaos/backend/services/audit-core-service",
    "./curaos/backend/services/calendar-core-service",
  ]);
  let issueFrontmatterCalls = 0;
  const issueFrontmatterResults = [{ module: "audit-core-service" }, {}];
  const helpers = new Function(
    "issueFrontmatter",
    "existsSync",
    "ROOT",
    "splitIssueRef",
    `${rootFromPathSource}\n${rootFromModuleSource}\n${rootFromIssueRefSource}\n${ownedRootSource}\nreturn { rootFromModule, ownedRoot };`,
  )(() => {
    issueFrontmatterCalls += 1;
    return issueFrontmatterResults.shift() || {};
  }, (p) => existing.has(p), ".", (ref) => {
    const match = String(ref).match(/^([^/]+)\/([^#]+)#(\d+)$/);
    return match ? { owner: match[1], repo: match[2], number: Number(match[3]), repoFull: `${match[1]}/${match[2]}` } : null;
  });

  assert.equal(
    helpers.rootFromModule("curaos/backend/services/audit-core-service"),
    "curaos/backend/services/audit-core-service",
  );
  assert.equal(
    helpers.rootFromModule("calendar-core-service"),
    "curaos/backend/services/calendar-core-service",
  );
  assert.equal(helpers.rootFromModule("docs/agents/workflows/opposite-harness-grill"), "workspace");
  assert.equal(helpers.rootFromModule("documents-core-service"), "unknown");
  assert.equal(
    helpers.ownedRoot({ issue: "owner/repo#1" }, new Map([["owner/repo#1", { module: "calendar-core-service" }]])),
    "curaos/backend/services/calendar-core-service",
  );
  assert.equal(issueFrontmatterCalls, 0);
  assert.equal(helpers.ownedRoot({ issue: "owner/curaos#2" }, new Map()), "curaos/backend/services/audit-core-service");
  assert.equal(issueFrontmatterCalls, 1);
  assert.equal(helpers.ownedRoot({ issue: "owner/service-repo#3" }, new Map()), "owner/service-repo");
  assert.equal(issueFrontmatterCalls, 1);
  assert.equal(
    helpers.ownedRoot({ issue: "owner/documents-core-service#4" }, new Map([["owner/documents-core-service#4", { module: "documents-core-service" }]])),
    "owner/documents-core-service",
  );
  assert.equal(issueFrontmatterCalls, 1);
});

test("tdd-implement dry-run blocks evidence-only no-op", async () => {
  const { result, calls } = await runTddImplementWorkflow({
    args: {
      issue: "your-org/curaos-ai-workspace#487",
      branch: "mo/fake-branch",
      dry_run: true,
      issue_spec: {
        owned_paths: ["scripts/workflows/tdd-implement.workflow.js"],
        verification_cmds: ["node --test scripts/workflow-truth-contract.test.js"],
      },
    },
    agentResults: [
      {
        status: "done",
        tests_added: [],
        files_changed: [],
        generator_evolution: "n/a",
        verification_evidence: "dry-run evidence line 1\ndry-run evidence line 2\nexit 0",
      },
    ],
  });

  assert.equal(calls.length, 1);
  assert.equal(result.status, "blocked");
  assert.equal(result.workflow_defect, true);
  assert.equal(result.workflow_defect_kind, "tdd-implement-no-op-done");
  assert.match(result.blocker, /dry-run no-op/);
});

test("tdd-implement real dispatch blocks verifier-observed empty diff", async () => {
  const { result, calls } = await runTddImplementWorkflow({
    args: {
      issue: "your-org/curaos-ai-workspace#487",
      branch: "mo/fake-branch",
      dry_run: false,
      issue_spec: {
        owned_paths: ["scripts/workflows/tdd-implement.workflow.js"],
        verification_cmds: ["node --test scripts/workflow-truth-contract.test.js"],
      },
    },
    agentResults: [
      {
        status: "done",
        tests_added: ["scripts/workflow-truth-contract.test.js"],
        files_changed: ["scripts/workflows/tdd-implement.workflow.js"],
        generator_evolution: "n/a",
        verification_evidence: "worker evidence line 1\nworker evidence line 2\nexit 0",
      },
      {
        changed_paths: [],
        empty_diff: false,
        out_of_scope_paths: [],
        ci_exit: 0,
        submodule_unreachable: false,
        verification_evidence: "independent evidence line 1\nindependent evidence line 2\nexit 0",
      },
    ],
  });

  assert.equal(calls.length, 2);
  assert.equal(result.status, "blocked");
  assert.equal(result.workflow_defect, true);
  assert.equal(result.workflow_defect_kind, "tdd-implement-no-op-done");
  assert.match(result.blocker, /empty diff/);
});

test("tdd-implement real dispatch blocks schema-default done before verifier", async () => {
  const { result, calls } = await runTddImplementWorkflow({
    args: {
      issue: "your-org/curaos-ai-workspace#501",
      branch: "mo/fake-branch",
      dry_run: false,
      issue_spec: {
        owned_paths: ["scripts/workflows/tdd-implement.workflow.js"],
        verification_cmds: ["node --test scripts/workflow-truth-contract.test.js"],
      },
    },
    agentResults: [
      {
        status: "done",
        tests_added: [],
        files_changed: [],
        generator_evolution: "",
        verification_evidence: "",
        blocker: "",
      },
    ],
  });

  assert.equal(calls.length, 1);
  assert.equal(result.status, "blocked");
  assert.equal(result.workflow_defect, true);
  assert.equal(result.workflow_defect_kind, "tdd-implement-no-op-done");
  assert.match(result.blocker, /schema-default no-op done/);
});

test("milestone wave halts serial dispatch after tdd no-op workflow defect", () => {
  const wave = read("scripts/workflows/milestone-wave.workflow.js");
  const isNoOpSource = extractFunction(wave, "isNoOpWorkflowDefect");
  const barrierSource = extractFunction(wave, "blockedByNoOpBarrier");
  const helpers = new Function(
    `${isNoOpSource}\n${barrierSource}\nreturn { isNoOpWorkflowDefect, blockedByNoOpBarrier };`,
  )();

  assert.equal(
    helpers.isNoOpWorkflowDefect({
      workflow_defect: true,
      workflow_defect_kind: "tdd-implement-no-op-done",
    }),
    true,
  );
  assert.equal(
    helpers.isNoOpWorkflowDefect({
      workflow_defect: true,
      workflow_defect_kind: "opposite-harness-report-missing",
    }),
    false,
  );

  const blocked = helpers.blockedByNoOpBarrier("owner/repo#2", "owner/repo#1");
  assert.deepEqual(blocked, {
    issue: "owner/repo#2",
    status: "blocked",
    pr: "",
    workflow_defect: true,
    workflow_defect_kind: "tdd-implement-no-op-done",
    blocker: "workflow-defect:tdd-implement-no-op-done: halted serial dispatch after owner/repo#1 returned no-op done; fix or run native fallback before retrying this lane",
  });
  assert.match(wave, /break;/);
  assert.match(wave, /partition\.lanes\.slice\(index \+ 1\)/);
  assert.match(read("docs/agents/workflows/milestone-wave.md"), /halts the remaining serial attempts/);
  assert.match(read("docs/agents/milestone-orchestration-prompt.md"), /halt the remaining serial dispatch attempts/);
});

test("tdd-implement real dispatch classifies verifier contradiction", async () => {
  const { result, calls } = await runTddImplementWorkflow({
    args: {
      issue: "your-org/curaos-ai-workspace#487",
      branch: "mo/fake-branch",
      dry_run: false,
      issue_spec: {
        owned_paths: ["scripts/workflows/tdd-implement.workflow.js"],
        verification_cmds: ["node --test scripts/workflow-truth-contract.test.js"],
      },
    },
    agentResults: [
      {
        status: "done",
        tests_added: ["scripts/workflow-truth-contract.test.js"],
        files_changed: ["scripts/workflows/tdd-implement.workflow.js"],
        generator_evolution: "n/a",
        verification_evidence: "worker evidence line 1\nworker evidence line 2\nexit 0",
      },
      {
        changed_paths: ["scripts/workflows/tdd-implement.workflow.js"],
        empty_diff: true,
        out_of_scope_paths: [],
        ci_exit: 0,
        submodule_unreachable: false,
        verification_evidence: "independent evidence line 1\nindependent evidence line 2\nexit 0",
      },
    ],
  });

  assert.equal(calls.length, 2);
  assert.equal(result.status, "blocked");
  assert.equal(result.workflow_defect, true);
  assert.equal(result.workflow_defect_kind, "tdd-implement-verifier-contradiction");
  assert.match(result.blocker, /empty_diff=true with non-empty changed_paths/);
});

test("tdd-implement real dispatch passes with observed owned diff and independent evidence", async () => {
  const { result, calls } = await runTddImplementWorkflow({
    args: {
      issue: "your-org/curaos-ai-workspace#487",
      branch: "mo/fake-branch",
      dry_run: false,
      issue_spec: {
        owned_paths: ["scripts/workflows/tdd-implement.workflow.js", "scripts/lib/**"],
        verification_cmds: ["node --test scripts/workflow-truth-contract.test.js"],
      },
    },
    agentResults: [
      {
        status: "done",
        tests_added: ["scripts/workflow-truth-contract.test.js"],
        files_changed: ["self-reported-path.js"],
        generator_evolution: "n/a",
        verification_evidence: "worker evidence line 1\nworker evidence line 2\nworker evidence line 3\nexit 0",
      },
      {
        changed_paths: [
          "scripts/workflows/tdd-implement.workflow.js",
          "scripts/lib/workflow-verification-gate.js",
        ],
        empty_diff: false,
        out_of_scope_paths: [],
        ci_exit: 0,
        ci_ran: true,
        submodule_unreachable: false,
        verification_evidence: "independent evidence line 1\nindependent evidence line 2\nindependent evidence line 3\nexit 0",
      },
    ],
  });

  assert.equal(calls.length, 2);
  assert.equal(result.status, "done");
  assert.deepEqual(result.files_changed, [
    "scripts/workflows/tdd-implement.workflow.js",
    "scripts/lib/workflow-verification-gate.js",
  ]);
  assert.match(result.verification_evidence, /INDEPENDENT VERIFICATION/);
  assert.equal(result.workflow_defect, undefined);
});

test("tdd-implement catches out-of-scope changes from changed_paths even if verifier omits them", async () => {
  const { result, calls } = await runTddImplementWorkflow({
    args: {
      issue: "your-org/curaos-ai-workspace#487",
      branch: "mo/fake-branch",
      dry_run: false,
      issue_spec: {
        owned_paths: ["scripts/workflows/tdd-implement.workflow.js"],
        verification_cmds: ["node --test scripts/workflow-truth-contract.test.js"],
      },
    },
    agentResults: [
      {
        status: "done",
        tests_added: ["scripts/workflow-truth-contract.test.js"],
        files_changed: ["scripts/workflows/tdd-implement.workflow.js"],
        generator_evolution: "n/a",
        verification_evidence: "worker evidence line 1\nworker evidence line 2\nworker evidence line 3\nexit 0",
      },
      {
        changed_paths: [
          "scripts/workflows/tdd-implement.workflow.js",
          "docs/agents/workflows/tdd-implement.md",
        ],
        empty_diff: false,
        out_of_scope_paths: [],
        ci_exit: 0,
        ci_ran: true,
        submodule_unreachable: false,
        verification_evidence: "independent evidence line 1\nindependent evidence line 2\nindependent evidence line 3\nexit 0",
      },
    ],
  });

  assert.equal(calls.length, 2);
  assert.equal(result.status, "blocked");
  assert.equal(result.workflow_defect, false);
  assert.equal(result.workflow_defect_kind, "");
  assert.match(result.blocker, /out-of-scope changes: docs\/agents\/workflows\/tdd-implement\.md/);
});

test("tdd-implement permits approved closeout artifacts without widening implementation scope", async () => {
  const changed = [
    "curaos/backend/services/personal-calendar-service/src/index.ts",
    "curaos/backend/packages/calendar-sdk/src/index.ts",
    "curaos/bun.lock",
    "ai/curaos/docs/DOC-GRAPH.md",
    "ai/curaos/backend/services/personal-calendar-service/Requirements.md",
    "curaos",
  ];
  const { result, calls } = await runTddImplementWorkflow({
    args: {
      issue: "your-org/personal-calendar-service#7",
      branch: "mo/fake-branch",
      dry_run: false,
      issue_spec: {
        owned_paths: ["curaos/backend/services/personal-calendar-service"],
        closeout_paths: ["curaos/backend/packages/calendar-sdk"],
        verification_cmds: ["node --test scripts/workflow-truth-contract.test.js"],
      },
    },
    agentResults: [
      {
        status: "done",
        tests_added: ["curaos/backend/services/personal-calendar-service/src/index.test.ts"],
        files_changed: ["curaos/backend/services/personal-calendar-service/src/index.ts"],
        generator_evolution: "n/a",
        verification_evidence: "worker evidence line 1\nworker evidence line 2\nworker evidence line 3\nexit 0",
      },
      {
        changed_paths: changed,
        empty_diff: false,
        out_of_scope_paths: [],
        ci_exit: 0,
        ci_ran: true,
        submodule_unreachable: false,
        verification_evidence: "independent evidence line 1\nindependent evidence line 2\nindependent evidence line 3\nexit 0",
      },
    ],
  });

  assert.equal(calls.length, 2);
  assert.equal(result.status, "done");
  assert.deepEqual(result.files_changed, changed);
  assert.equal(result.workflow_defect, undefined);
});

test("tdd-implement blocks ci_exit zero without independent CI-run proof", async () => {
  const { result, calls } = await runTddImplementWorkflow({
    args: {
      issue: "your-org/curaos-ai-workspace#487",
      branch: "mo/fake-branch",
      dry_run: false,
      issue_spec: {
        owned_paths: ["scripts/workflows/tdd-implement.workflow.js"],
        verification_cmds: ["node --test scripts/workflow-truth-contract.test.js"],
      },
    },
    agentResults: [
      {
        status: "done",
        tests_added: ["scripts/workflow-truth-contract.test.js"],
        files_changed: ["scripts/workflows/tdd-implement.workflow.js"],
        generator_evolution: "n/a",
        verification_evidence: "worker evidence line 1\nworker evidence line 2\nworker evidence line 3\nexit 0",
      },
      {
        changed_paths: ["scripts/workflows/tdd-implement.workflow.js"],
        empty_diff: false,
        out_of_scope_paths: [],
        ci_exit: 0,
        ci_ran: false,
        submodule_unreachable: false,
        verification_evidence: "independent evidence line 1\nindependent evidence line 2\nindependent evidence line 3\nexit 0",
      },
    ],
  });

  assert.equal(calls.length, 2);
  assert.equal(result.status, "blocked");
  assert.equal(result.workflow_defect, false);
  assert.equal(result.workflow_defect_kind, "");
  assert.match(result.blocker, /independent verifier did not prove CI ran/);
});

test("project sync milestone result reflects board/write truth", () => {
  const fields = {
    "CuraOS Milestone": {
      dataType: "ProjectV2SingleSelectField",
      options: { M12: "option-id" },
    },
  };
  assert.deepEqual(
    plannedFieldWrites({ "CuraOS Milestone": "M16" }, {}, fields),
    [{ field: "CuraOS Milestone", unmapped: "M16", knownOptions: ["M12"] }],
  );
  assert.equal(
    milestoneAfterReconcile({ "CuraOS Milestone": "M16" }, {}, [{ field: "CuraOS Milestone", unmapped: "M16" }]),
    "NONE",
  );
  assert.equal(
    milestoneAfterReconcile({ "CuraOS Milestone": "M12" }, {}, [{ field: "CuraOS Milestone", set: "M12" }]),
    "M12",
  );
  assert.equal(
    milestoneAfterReconcile({ "CuraOS Milestone": "M12" }, { "CuraOS Milestone": "M12" }, []),
    "M12",
  );
  assert.equal(
    milestoneAfterReconcile({ "CuraOS Milestone": "M12" }, { "CuraOS Milestone": "M11" }, []),
    "NONE",
  );
  assert.equal(issueKindLabel("Epic"), "Roadmap");
  assert.equal(issueKindLabel("Task"), "Implementation");
  assert.equal(issueKindLabel("Bug"), "Implementation");
  assert.equal(issueKindLabel("Spike"), "Planning");
  assert.deepEqual(
    desiredForFieldCacheRefresh(
      { "Target Version": "v1", "CuraOS Milestone": "M16", Status: "Ready" },
      {
        Status: { dataType: "ProjectV2SingleSelectField", options: { Ready: "status-id" } },
        "CuraOS Milestone": { dataType: "ProjectV2SingleSelectField", options: { M12: "milestone-id" } },
      },
      [{ field: "CuraOS Milestone", unmapped: "M16", knownOptions: ["M12"] }],
    ),
    { "Target Version": "v1", "CuraOS Milestone": "M16" },
  );
});

test("triage and project sync preserve frontmatter-derived CuraOS Milestone", () => {
  const triage = read("scripts/workflows/gh-issue-triage.workflow.js");
  const triagePlaybook = read("docs/agents/workflows/gh-issue-triage.md");
  const sync = read("scripts/workflows/gh-project-sync.workflow.js");
  const syncHelper = read("scripts/roadmap-project-item-sync.js");
  const syncPlaybook = read("docs/agents/workflows/gh-project-sync.md");
  const gate = read("scripts/workflows/pm-triage-gate.workflow.js");
  const wave = read("scripts/workflows/milestone-wave.workflow.js");
  const gatePlaybook = read("docs/agents/workflows/pm-triage-gate.md");
  const wavePlaybook = read("docs/agents/workflows/milestone-wave.md");
  const prompt = read("docs/agents/milestone-orchestration-prompt.md");
  const issueTracker = read("docs/agents/issue-tracker.md");
  const breakdown = read("scripts/workflows/breakdown.workflow.js");
  const wire = read("scripts/workflows/gh-subissue-wire.workflow.js");
  const activeScan = read("scripts/workflows/milestone-active-scan.workflow.js");
  const ghRef = read("scripts/lib/gh-ref.js");

  assert.match(triage, /function deterministicIssueMetadata/);
  // RP-34: triage's bounded retry is executed (not grepped) in
  // "gh retry helpers execute bounded transient retry against stubs (RP-34)" below.
  assert.match(triage, /blocked_by_external/);
  assert.match(triage, /fields\["CuraOS Milestone"\]/);
  assert.match(triage, /fields\["Target Version"\]/);
  assert.match(triage, /fields\["Issue Kind"\]/);
  assert.doesNotMatch(triage, /fields\.Type/);
  assert.match(triage, /function parentRefFromBody/);
  assert.match(triage, /function nativeParentRef/);
  assert.match(triage, /function leafIssueInWorkspaceRepo/);
  assert.match(triage, /function agentFailureKind/);
  assert.match(triage, /agent-runtime-quota/);
  assert.match(triage, /fail-closed without deterministic fallback/);
  assert.doesNotMatch(triage, /deterministic fallback preserved frontmatter fields/);
  assert.match(triage, /has_wrong_repo_for_leaf/);
  assert.match(triage, /normalizeProjectFields/);
  assert.match(triagePlaybook, /Target Version/);
  assert.match(triagePlaybook, /CuraOS Milestone/);
  assert.match(triagePlaybook, /Issue Kind/);
  assert.match(triagePlaybook, /## Parent/);
  assert.match(triagePlaybook, /agent-runtime-quota/);
  assert.match(triagePlaybook, /never falls back to existing labels/);
  assert.doesNotMatch(triagePlaybook, /project_fields\.Milestone/);

  assert.match(sync, /execFileSync\("node", \["scripts\/roadmap-project-item-sync\.js"/);
  assert.match(syncHelper, /require\("\.\/lib\/gh-project\.js"\)/);
  assert.match(syncHelper, /mergeFrontmatterBackstop/);
  assert.match(syncHelper, /issueKindLabel/);
  assert.match(syncHelper, /desiredForFieldCacheRefresh/);
  assert.match(syncHelper, /fieldMap\(projectNumber, \{ refresh: true \}\)/);
  assert.match(syncHelper, /ghProject\.reconcileFields/);
  assert.match(syncHelper, /project_items_cache/);
  assert.match(sync, /project_items_cache/);
  assert.match(sync, /blocked_by_external/);
  assert.match(gate, /projectItemsCache/);
  assert.match(gate, /projectFieldsForSync/);
  assert.match(gate, /Status/);
  assert.match(gate, /project_items_cache: projectCachePath/);
  assert.match(gate, /skipped: "triage-blocked"/);
  assert.match(wave, /terminalExternal/);
  assert.match(wave, /const externalKind = externalKinds\.length === 1/);
  assert.match(wave, /isTerminalTriageExternal/);
  assert.match(wave, /could not be triaged due to \$\{externalKind\}/);
  assert.match(wave, /PROJECT-CACHE-DEGRADED/);
  assert.match(wave, /project-cache-unavailable/);
  assert.match(wave, /projectFieldsForSync/);
  assert.match(wave, /Status/);
  assert.match(wave, /project_items_cache: projectCache\.path/);
  assert.match(wave, /skipped: "triage-blocked"/);
  assert.doesNotMatch(sync, /const result = await agent/);
  assert.match(syncPlaybook, /executor shells the helper directly/);
  assert.match(syncPlaybook, /project_items_cache/);
  assert.match(gatePlaybook, /blocked_by_external: true/);
  assert.match(wavePlaybook, /non-empty candidate set/);
  assert.match(wavePlaybook, /agent-runtime-unavailable/);
  assert.match(wavePlaybook, /PROJECT-CACHE-DEGRADED/);
  assert.match(wavePlaybook, /metadata only; this does not block readiness/);
  assert.match(prompt, /model output may enrich blocker rationale but may not erase frontmatter-derived Project fields/);
  assert.match(prompt, /Project item-list must be cached once per gate\/wave/);
  assert.match(issueTracker, /parent: "<owner\/repo#n for non-root children/);
  assert.match(issueTracker, /## Hierarchy requirements/);
  assert.match(triage, /deterministic\.parent_ref \|\| normalizeIssueRef/);
  assert.match(triage, /M1\.5 and M1\.\.M17/);
  assert.match(activeScan, /boardSnapshot/);
  assert.match(activeScan, /active-scan: board snapshot/);
  assert.match(activeScan, /itemField\(item, "CuraOS Milestone"\)/);
  assert.match(breakdown, /parent: "\$\{cfg\.issue\}"/);
  assert.match(breakdown, /## Parent section containing \$\{cfg\.issue\}/);
  assert.match(wave, /canonical CuraOS frontmatter including type, target-version/);
  assert.match(wave, /parent: "\$\{issue\}"/);
  assert.match(wave, /## Parent section containing \$\{issue\}/);
  assert.match(wire, /parseIssueRefOrUrl/);
  assert.match(ghRef, /GitHub issue URL/);
});

test("project sync backfills Target Version from canonical frontmatter", () => {
  assert.deepEqual(
    mergeFrontmatterBackstop({}, "---\ntarget-version: v1\nmodule: frontend/apps/admin-app\n---\n"),
    { "Target Version": "v1", Module: "frontend/apps/admin-app" },
  );
});

test("triage gates thread Project Status from resolved state labels", () => {
  // RP-20: scripts/lib/triage-status.js owns statusFromTriage/projectFieldsForSync (the
  // KEEP-IN-SYNC inline copies were the drift class). milestone-wave imports the lib DIRECTLY
  // (lazy createRequire; no inline copy); pm-triage-gate's Claude-style body runs under
  // `new Function` (no require/import.meta) so it keeps an inline copy pinned byte-identical here.
  const lib = read("scripts/lib/triage-status.js");
  const gate = read("scripts/workflows/pm-triage-gate.workflow.js");
  const wave = read("scripts/workflows/milestone-wave.workflow.js");
  assert.equal(extractFunction(gate, "statusFromTriage"), extractFunction(lib, "statusFromTriage"));
  assert.equal(extractFunction(gate, "projectFieldsForSync"), extractFunction(lib, "projectFieldsForSync"));
  assert.match(wave, /localRequire\("\.\.\/lib\/triage-status\.js"\)/);
  assert.doesNotMatch(wave, /function statusFromTriage/);
  assert.doesNotMatch(wave, /function projectFieldsForSync/);

  // Behavior executed against the canonical lib module (the same object the wave imports).
  const helpers = require("./lib/triage-status.js");
  assert.deepEqual(
    helpers.projectFieldsForSync({ state_label: "ready-for-agent", blocker_kind: "none", project_fields: { "Target Version": "v1" } }),
    { "Target Version": "v1", Status: "Ready" },
  );
  assert.equal(helpers.statusFromTriage({ state_label: "ready-for-agent", blocker_kind: "none", has_foresight_marker: true }), "Ready");
  assert.equal(helpers.statusFromTriage({ state_label: "ready-for-human", blocker_kind: "none" }), "Ready");
  assert.equal(helpers.statusFromTriage({ state_label: "ready-for-human", blocker_kind: "real" }), "Blocked");
  assert.equal(helpers.statusFromTriage({ state_label: "ready-for-agent", blocker_kind: "none", has_blocked_marker: true }), "Blocked");
  assert.equal(helpers.statusFromTriage({ state_label: "needs-triage", blocker_kind: "paper", has_blocked_marker: true }), "Blocked");
  assert.equal(helpers.statusFromTriage({ state_label: "needs-triage", blocker_kind: "real" }), "Blocked");
  assert.equal(helpers.statusFromTriage({ state_label: "needs-triage", blocker_kind: "paper", has_foresight_marker: true }), "Backlog");
  assert.equal(helpers.statusFromTriage({ state_label: "needs-info", blocker_kind: "paper" }), "Backlog");
});

test("issue hierarchy parent refs normalize from frontmatter, Parent section, and URLs", () => {
  const triage = read("scripts/workflows/gh-issue-triage.workflow.js");
  const wire = read("scripts/workflows/gh-subissue-wire.workflow.js");
  const triageHelpers = new Function(
    "ghRef",
    `${extractFunction(triage, "normalizeIssueRef")}\n${extractFunction(triage, "parentRefFromBody")}\n${extractFunction(triage, "explicitRootFromBody")}\n${extractFunction(triage, "leafIssueInWorkspaceRepo")}\nreturn { normalizeIssueRef, parentRefFromBody, explicitRootFromBody, leafIssueInWorkspaceRepo };`,
  )(workflowGhRef);
  assert.equal(
    triageHelpers.normalizeIssueRef("https://github.com/your-org/curaos-ai-workspace/issues/618"),
    "your-org/curaos-ai-workspace#618",
  );
  assert.equal(triageHelpers.normalizeIssueRef("https://github.com/../curaos-ai-workspace/issues/618"), "");
  assert.equal(triageHelpers.normalizeIssueRef("https://github.com/your-org/../issues/618"), "");
  assert.equal(
    triageHelpers.parentRefFromBody("## Parent\nhttps://github.com/your-org/curaos-ai-workspace/issues/618\n\n## Scope\n..."),
    "your-org/curaos-ai-workspace#618",
  );
  assert.equal(triageHelpers.explicitRootFromBody("## Parent\nNone. This is a root workflow-defect bug.\n\n## Scope\n..."), true);
  assert.equal(triageHelpers.explicitRootFromBody("## Parent\n\n## Scope\n..."), false);
  assert.equal(triageHelpers.leafIssueInWorkspaceRepo("your-org/curaos-ai-workspace", { type: "Task" }), true);
  assert.equal(triageHelpers.leafIssueInWorkspaceRepo("your-org/audit-core-service", { type: "Task" }), false);

  const parseIssueRef = new Function("ghRef", `${extractFunction(wire, "parseIssueRef")}\nreturn parseIssueRef;`)(workflowGhRef);
  assert.equal(
    parseIssueRef("https://github.com/your-org/curaos-ai-workspace/issues/618", "parent").ref,
    "your-org/curaos-ai-workspace#618",
  );
  assert.throws(() => parseIssueRef("../curaos-ai-workspace#618", "parent"), /dot paths/);
  assert.throws(() => parseIssueRef("your-org/..#618", "parent"), /dot paths/);
});

test("gh issue triage preserves deterministic non-dispatch state labels", () => {
  const triage = read("scripts/workflows/gh-issue-triage.workflow.js");
  const source = extractFunction(triage, "deterministicStateResolution");
  const agentFailureKindSource = extractFunction(triage, "agentFailureKind");
  const { deterministicStateResolution, agentFailureKind } = new Function(`${source}\n${agentFailureKindSource}\nreturn { deterministicStateResolution, agentFailureKind };`)();
  assert.match(triage, /Return EXACTLY ONE JSON object, never an array/);
  assert.equal(
    agentFailureKind("cli-agent-executor: claude exited with status 1: You've hit your session limit resets 7:30pm"),
    "agent-runtime-quota",
  );
  assert.equal(agentFailureKind("cli-agent-executor: claude exited with status 1"), "agent-runtime-unavailable");
  const base = {
    has_foresight_marker: false,
    has_blocked_marker: false,
    has_frontmatter_blocker: false,
  };

  assert.deepEqual(
    deterministicStateResolution({ ...base, state_label: "ready-for-human" }, "paper", "needs-triage"),
    {
      deterministicReady: false,
      deterministicNonDispatchState: true,
      resolvedState: "ready-for-human",
    },
  );
  assert.deepEqual(
    deterministicStateResolution({ ...base, state_label: "needs-info" }, "paper", "needs-triage"),
    {
      deterministicReady: false,
      deterministicNonDispatchState: false,
      resolvedState: "needs-info",
    },
  );
  assert.deepEqual(
    deterministicStateResolution({ ...base, state_label: "needs-info" }, "paper", "ready-for-agent"),
    {
      deterministicReady: false,
      deterministicNonDispatchState: false,
      resolvedState: "ready-for-agent",
    },
  );
  for (const guarded of [
    { has_blocked_marker: true },
    { has_frontmatter_blocker: true },
  ]) {
    assert.deepEqual(
      deterministicStateResolution({ ...base, ...guarded, state_label: "needs-info" }, "paper", "ready-for-agent"),
      {
        deterministicReady: false,
        deterministicNonDispatchState: false,
        resolvedState: "needs-info",
      },
    );
  }
  assert.deepEqual(
    deterministicStateResolution({ ...base, state_label: "needs-info" }, "real", "ready-for-agent"),
    {
      deterministicReady: false,
      deterministicNonDispatchState: false,
      resolvedState: "needs-info",
    },
  );
  assert.deepEqual(
    deterministicStateResolution({ ...base, state_label: "wontfix" }, "paper", "needs-triage"),
    {
      deterministicReady: false,
      deterministicNonDispatchState: true,
      resolvedState: "wontfix",
    },
  );
  assert.deepEqual(
    deterministicStateResolution({ ...base, state_label: "ready-for-agent" }, "paper", "needs-triage"),
    {
      deterministicReady: false,
      deterministicNonDispatchState: false,
      resolvedState: "needs-triage",
    },
  );
  assert.deepEqual(
    deterministicStateResolution({ ...base, state_label: "ready-for-agent" }, "paper", "needs-info"),
    {
      deterministicReady: false,
      deterministicNonDispatchState: false,
      resolvedState: "needs-info",
    },
  );
  assert.deepEqual(
    deterministicStateResolution({ ...base, state_label: "ready-for-agent" }, "paper", "ready-for-agent"),
    {
      deterministicReady: true,
      deterministicNonDispatchState: false,
      resolvedState: "ready-for-agent",
    },
  );
  assert.deepEqual(
    deterministicStateResolution({ ...base, state_label: "ready-for-agent", has_foresight_marker: true }, "paper", "needs-triage"),
    {
      deterministicReady: false,
      deterministicNonDispatchState: false,
      resolvedState: "needs-triage",
    },
  );
  assert.deepEqual(
    deterministicStateResolution({ ...base, state_label: "needs-triage", has_foresight_marker: true }, "paper", "ready-for-agent"),
    {
      deterministicReady: false,
      deterministicNonDispatchState: false,
      resolvedState: "ready-for-agent",
    },
  );
  assert.deepEqual(
    deterministicStateResolution({ ...base, state_label: "needs-info", has_foresight_marker: true }, "paper", "ready-for-agent"),
    {
      deterministicReady: false,
      deterministicNonDispatchState: false,
      resolvedState: "ready-for-agent",
    },
  );
  assert.deepEqual(
    deterministicStateResolution({ ...base, state_label: "ready-for-agent", has_foresight_marker: true }, "paper", "ready-for-agent"),
    {
      deterministicReady: true,
      deterministicNonDispatchState: false,
      resolvedState: "ready-for-agent",
    },
  );
  assert.deepEqual(
    deterministicStateResolution({ ...base, state_label: "needs-triage", has_blocked_marker: true }, "paper", "ready-for-agent"),
    {
      deterministicReady: false,
      deterministicNonDispatchState: false,
      resolvedState: "needs-triage",
    },
  );
  assert.deepEqual(
    deterministicStateResolution({ ...base, state_label: "needs-triage", has_frontmatter_blocker: true }, "paper", "ready-for-agent"),
    {
      deterministicReady: false,
      deterministicNonDispatchState: false,
      resolvedState: "needs-triage",
    },
  );
  assert.deepEqual(
    deterministicStateResolution({ ...base, state_label: "needs-triage" }, "paper", "ready-for-agent"),
    {
      deterministicReady: false,
      deterministicNonDispatchState: false,
      resolvedState: "ready-for-agent",
    },
  );
  assert.deepEqual(
    deterministicStateResolution({ ...base, state_label: "ready-for-agent" }, "real", "needs-triage"),
    {
      deterministicReady: false,
      deterministicNonDispatchState: false,
      resolvedState: "needs-triage",
    },
  );
  assert.deepEqual(
    deterministicStateResolution({ ...base, state_label: "ready-for-human", has_foresight_marker: true }, "real", "needs-triage"),
    {
      deterministicReady: false,
      deterministicNonDispatchState: true,
      resolvedState: "ready-for-human",
    },
  );
  assert.deepEqual(
    deterministicStateResolution({ ...base, state_label: "" }, "paper", "ready-for-agent"),
    {
      deterministicReady: false,
      deterministicNonDispatchState: false,
      resolvedState: "ready-for-agent",
    },
  );
  assert.match(triage, /Apply: set the single resolved state label, removing every OTHER STATE label/);
  assert.match(triage, /dual state labels are forbidden/);
});

test("wrong-repo leaf backstop preserves only human-owned tracker states behaviorally", () => {
  const triage = read("scripts/workflows/gh-issue-triage.workflow.js");
  const helpers = new Function("ghRef", `
${extractFunction(triage, "deterministicStateResolution")}
${extractFunction(triage, "normalizeProjectFields")}
${extractFunction(triage, "normalizeIssueRef")}
${extractFunction(triage, "resolveWrongRepoLeafBackstop")}
return { resolveWrongRepoLeafBackstop };
`)(workflowGhRef);
  const deterministic = {
    state_label: "ready-for-human",
    has_foresight_marker: false,
    has_blocked_marker: false,
    has_frontmatter_blocker: false,
    has_wrong_repo_for_leaf: true,
    is_root: false,
  };
  const result = {
    state_label: "needs-triage",
    blocker_kind: "real",
    rationale: "agent result",
    project_fields: {},
  };

  for (const stateLabel of ["ready-for-human", "needs-info", "wontfix"]) {
    const resolved = helpers.resolveWrongRepoLeafBackstop(result, { ...deterministic, state_label: stateLabel });
    assert.equal(resolved.state_label, stateLabel);
    assert.equal(resolved.blocker_kind, "paper");
    assert.match(resolved.rationale, /existing .* label preserved/);
  }

  for (const stateLabel of ["ready-for-agent", "needs-triage"]) {
    const resolved = helpers.resolveWrongRepoLeafBackstop(result, { ...deterministic, state_label: stateLabel });
    assert.equal(resolved.state_label, "needs-triage");
    assert.equal(resolved.blocker_kind, "paper");
    assert.match(resolved.rationale, /Story\/Task issues must live in the owning submodule repo/);
  }
});

test("gh issue triage apply mode never preserves a second state label", () => {
  const triage = read("scripts/workflows/gh-issue-triage.workflow.js");
  const stateLabel = new Function(`
const STATE_LABELS = ["needs-triage", "needs-info", "ready-for-agent", "ready-for-human", "wontfix"];
${extractFunction(triage, "stateLabel")}
return stateLabel;
`)();
  const calls = [];
  const reconcileStateLabel = new Function(
    "calls",
    `
const STATE_LABELS = ["needs-triage", "needs-info", "ready-for-agent", "ready-for-human", "wontfix"];
const parseIssueRef = () => ({ repo: "owner/repo", number: "7" });
const labelsFor = () => ["needs-triage", "ready-for-human", "blocked", "enhancement"];
const ghJson = () => ({ labels: [] });
const gh = (args) => calls.push(args);
${extractFunction(triage, "reconcileStateLabel")}
return reconcileStateLabel;
`,
  )(calls);

  assert.match(
    triage,
    /Apply: set the single resolved state label, removing every OTHER STATE label/,
  );
  assert.match(triage, /dual state labels are forbidden/);
  assert.doesNotMatch(triage, /except preserve an existing ready-for-human, needs-info, or wontfix state/);
  assert.match(triage, /applyStateLabelOrExternal\(cfg\.issue, resolvedState, cfg\.dry_run\)/);
  assert.equal(stateLabel(["needs-triage", "ready-for-human"]), "ready-for-human");
  assert.equal(stateLabel(["needs-triage", "wontfix"]), "wontfix");
  assert.deepEqual(reconcileStateLabel("owner/repo#7", "ready-for-human"), [
    { action: "add", label: "ready-for-human" },
    { action: "remove", label: "needs-triage" },
  ]);
  assert.deepEqual(calls[0], [
    "issue",
    "edit",
    "7",
    "--repo",
    "owner/repo",
    "--add-label",
    "ready-for-human",
    "--remove-label",
    "needs-triage",
  ]);
});

test("gh issue triage reports label reconciliation quota failures as external blocks", () => {
  const triage = read("scripts/workflows/gh-issue-triage.workflow.js");
  const applyStateLabelOrExternal = new Function(`
const errorText = (error) => [
  error && error.message,
  error && error.stdout,
  error && error.stderr,
  error && Array.isArray(error.output) ? error.output.filter(Boolean).join("\\n") : "",
].filter(Boolean).join("\\n");
const externalFailureKind = (message) => /rate limit/i.test(message) ? "github-graphql-quota" : "";
const reconcileStateLabel = () => {
  const error = new Error("GraphQL: API rate limit already exceeded for user ID 26027239.");
  error.stderr = "GraphQL: API rate limit already exceeded for user ID 26027239.";
  throw error;
};
${extractFunction(triage, "applyStateLabelOrExternal")}
return applyStateLabelOrExternal;
`)();
  const attachLabelApplyResult = new Function(`
${extractFunction(triage, "attachLabelApplyResult")}
return attachLabelApplyResult;
`)();

  const applied = applyStateLabelOrExternal("owner/repo#7", "ready-for-agent", false);
  assert.equal(applied.blocked_by_external, true);
  assert.equal(applied.error_kind, "github-graphql-quota");
  const result = attachLabelApplyResult({
    state_label: "ready-for-agent",
    blocker_kind: "none",
    label_changes: [{ action: "add", label: "ready-for-agent" }],
    rationale: "ready",
  }, applied);
  assert.equal(result.blocked_by_external, true);
  assert.equal(result.blocker_kind, "real");
  assert.match(result.rationale, /Label reconciliation blocked by external GitHub failure/);
});

test("opposite harness probe is deterministic executor code", () => {
  const workflow = read("scripts/workflows/opposite-harness-grill.workflow.js");
  const playbook = read("docs/agents/workflows/opposite-harness-grill.md");
  const prompt = read("docs/agents/milestone-orchestration-prompt.md");

  assert.match(workflow, /function runProbe/);
  assert.match(workflow, /function boundedReportSlug/);
  // RP-33 rename: the within-dir containment check is parameterized by the report dir (live archive
  // vs synthetic quarantine); PR grills derive the canonical <subject-slug>-pr<num>.md name.
  assert.match(workflow, /function reportPathWithinDir/);
  assert.match(workflow, /const reportName = defaultReportName\(cfg\.subject, cfg\.pr\)/);
  assert.ok(workflow.includes('const slug = reportName.replace(/\\.md$/, "");'));
  assert.match(workflow, /opposite-harness-report-path-outside-grills/);
  assert.match(workflow, /const probe = runProbe\(opposite, probeTimeoutMs\)/);
  assert.doesNotMatch(workflow, /const probe = await agent/);
  assert.match(workflow, /grill-result-missing-report/);
  assert.match(workflow, /reportWrittenSince\(finalReportPath, grillStartedAt\)/);
  assert.match(playbook, /deterministic local `harness-probe`/);
  assert.match(playbook, /returns an empty `report_path`/);
  assert.match(prompt, /workflow probes CLI\/auth\/model liveness deterministically in executor code/);
  assert.match(prompt, /missing grill artifact is never a completed adversarial review/);
});

test("opposite harness bounds default report slugs and rejects empty report paths", () => {
  const workflow = read("scripts/workflows/opposite-harness-grill.workflow.js");
  const helpers = new Function(
    "createHash",
    `const MAX_REPORT_SLUG_CHARS = 96;\n${extractFunction(workflow, "rawReportSlug")}\n${extractFunction(workflow, "boundedReportSlug")}\nreturn { rawReportSlug, boundedReportSlug };`,
  )(crypto.createHash);
  const subject = `issue-408 ${"healthstack phi boundary layer six closed schemas ".repeat(20)}`;
  const raw = helpers.rawReportSlug(subject);
  const bounded = helpers.boundedReportSlug(subject);

  assert.ok(raw.length > 240);
  assert.ok(bounded.length <= 96);
  assert.match(bounded, /-[a-f0-9]{12}$/);
  assert.match(workflow, /result && result\.report_path \? result\.report_path : "<empty>"/);
  assert.match(workflow, /workflow_defect_kind: "opposite-harness-report-missing"/);
  // RP-33: the rejection message names the dir the run was bound to (live grills archive, or the
  // synthetic quarantine dir for fixture runs) and the gate passes that same dir into the check.
  assert.match(workflow, /expected path under \${expectedDir}/);
  assert.match(workflow, /invalidReportPathResult\(reportPath, requestedReportPath, cfg, opposite, grillAgentType, grillTimeoutMs, reportDir\)/);
  // Executed naming predicates (RP-34 direction): canonical pr-name, no double -pr<num>, hashed PR-less fallback.
  const namers = new Function(
    "createHash",
    `const MAX_REPORT_SLUG_CHARS = 96;\n${extractFunction(workflow, "rawReportSlug")}\n${extractFunction(workflow, "boundedReportSlug")}\n${extractFunction(workflow, "prNumberFrom")}\n${extractFunction(workflow, "defaultReportName")}\nreturn { defaultReportName };`,
  )(crypto.createHash);
  assert.equal(namers.defaultReportName("m11-s3 commerce events", "your-org/curaos#494"), "m11-s3-commerce-events-pr494.md");
  assert.equal(namers.defaultReportName("issue-317 codegen pr246", "246"), "issue-317-codegen-pr246.md");
  assert.match(namers.defaultReportName("local diff only", ""), /^local-diff-only-[a-f0-9]{12}\.md$/);
});

test("context-load derives issue scope before model output", () => {
  const workflow = read("scripts/workflows/context-load.workflow.js");
  const playbook = read("docs/agents/workflows/context-load.md");
  const prompt = read("docs/agents/milestone-orchestration-prompt.md");
  const body = `---
type: task
module: audit-core-service
milestone: M12
priority: medium
effort: M
parent: your-org/curaos-ai-workspace#26
requires: []
blocked-by: []
---

## Scope:

- \`curaos/backend/services/audit-core-service/src/consumer/audit-chain-validator.service.ts\`
- \`curaos/tools/codegen/templates/service-core/src/audit/**\`, \`service-personal/src/audit/**\`, and \`service-business/src/audit/**\`

## Do not touch

- \`curaos/backend/services/identity-service/**\`

## Acceptance

- Replay validation stays idempotent.
- Generated audit templates keep trio symmetry.

## Verification:

- \`bun run ci\`
- \`node scripts/check-workflow-sync.js --json\`
- \`cd curaos && just ci\`

See ADR-0212 §2.1.`;

  const spec = issueSpec.issueSpecFromIssueText({ title: "Audit validator scope", body });
  const frontmatter = issueSpec.parseFrontmatter(body);
  assert.deepEqual(frontmatter.requires, []);
  assert.deepEqual(frontmatter["blocked-by"], []);
  assert.deepEqual(spec.owned_paths, [
    "curaos/backend/services/audit-core-service/src/consumer/audit-chain-validator.service.ts",
    "curaos/tools/codegen/templates/service-core/src/audit/**",
    "curaos/tools/codegen/templates/service-personal/src/audit/**",
    "curaos/tools/codegen/templates/service-business/src/audit/**",
  ]);
  assert.deepEqual(spec.closeout_paths, []);
  assert.deepEqual(spec.forbidden_paths, ["curaos/backend/services/identity-service/**"]);
  assert.deepEqual(spec.acceptance, [
    "Replay validation stays idempotent.",
    "Generated audit templates keep trio symmetry.",
  ]);
  assert.deepEqual(spec.verification_cmds, [
    "bun run ci",
    "node scripts/check-workflow-sync.js --json",
    "cd curaos && just ci",
  ]);
  assert.deepEqual(spec.adr_refs, ["ADR-0212 §2.1"]);
  assert.equal(spec.effort, "M");

  // Deterministic issue-spec lib is loaded via localRequire (lazy, post-meta per workflow-defect #508 meta-first reorder).
  assert.match(workflow, /localRequire\("\.\.\/lib\/issue-spec\.js"\)/);
  assert.match(workflow, /ghApiJson\(\[`repos\/\$\{repo\}\/issues\/\$\{number\}`\]\)/);
  assert.match(workflow, /ghApiJson\(\["--paginate", "--slurp", `repos\/\$\{repo\}\/issues\/\$\{number\}\/comments`\]\)/);
  assert.match(workflow, /github-rest-unavailable/);
  assert.match(workflow, /github-rest-not-found/);
  assert.match(workflow, /const kind = externalFailureKind\(message\) \|\| "github-rest-unavailable"/);
  assert.match(workflow, /mergeIssueSpec\(deterministicSpec, result\.issue_spec \|\| \{\}\)/);
  assert.match(workflow, /stripResolvedIssueSpecBlockers\(result\.blockers, ownedPaths\)/);
  assert.match(workflow, /issue-spec-unresolved: deterministic REST parser resolved no owned_paths/);
  assert.match(playbook, /executor code first reads GitHub through REST/);
  assert.match(playbook, /may not erase deterministic issue-spec fields/);
  assert.match(prompt, /prefetch the issue body in executor code through GitHub REST/);
  assert.match(prompt, /Project-visible scoped issue has `## Scope`\/frontmatter but context-load returns `issue_spec\.owned_paths: \[\]`/);
});

test("issue spec extracts closeout paths from acceptance but not verification commands", () => {
  const body = `## Scope

- \`curaos/backend/services/personal-calendar-service\`

## Acceptance

- Update paired mirror docs in \`ai/curaos/backend/services/personal-calendar-service\`.
- Emit SDK artifacts under \`curaos/backend/packages/calendar-sdk\`.

## Verification

- \`node scripts/check-workflow-sync.js --json\`
`;

  const spec = issueSpec.issueSpecFromIssueText({ title: "Calendar closeout scope", body });
  assert.deepEqual(spec.closeout_paths, [
    "ai/curaos/backend/services/personal-calendar-service",
    "curaos/backend/packages/calendar-sdk",
  ]);
  assert.doesNotMatch(spec.closeout_paths.join("\n"), /scripts\/check-workflow-sync\.js/);
});

test("subissue wiring is deterministic REST executor code", () => {
  const workflow = read("scripts/workflows/gh-subissue-wire.workflow.js");
  const wave = read("scripts/workflows/milestone-wave.workflow.js");
  const gate = read("scripts/workflows/pm-triage-gate.workflow.js");
  const ghProject = read("scripts/lib/gh-project.js");
  const playbook = read("docs/agents/workflows/gh-subissue-wire.md");
  const gatePlaybook = read("docs/agents/workflows/pm-triage-gate.md");
  const prompt = read("docs/agents/milestone-orchestration-prompt.md");

  assert.match(workflow, /localRequire\("\.\.\/lib\/gh-project\.js"\)/);
  assert.match(workflow, /listSubIssues\(parent\.repo, parent\.number\)/);
  assert.match(workflow, /issueParent\(child\)/);
  assert.match(workflow, /function isNotFound\(error\)/);
  assert.match(workflow, /if \(!isNotFound\(error\)\) throw error/);
  assert.match(workflow, /function externalFailureKind\(message\)/);
  assert.match(workflow, /function isSubissueDepthLimit\(message\)/);
  assert.match(workflow, /function externalWireResult\(kind, message, dryRun\)/);
  assert.match(workflow, /blocked_by_external: true/);
  assert.match(workflow, /subissues_depth_limited/);
  assert.match(workflow, /github-subissue-depth-limit/);
  assert.match(workflow, /if \(kind\) return externalWireResult\(kind, message, dryRun\)/);
  assert.match(workflow, /catch \{\n      throw new Error\(`gh-subissue-wire: args\.\$\{fieldName\} must be a JSON array`\)/);
  assert.match(workflow, /addSubIssue\(parent\.repo, parent\.number, childDbId, Date\.now\(\)\)/);
  assert.match(workflow, /removeSubIssue\(currentParent\.repo, currentParent\.number, childDbId, Date\.now\(\)\)/);
  assert.match(workflow, /addBlockedBy\(issue\.repo, issue\.number, issueDbId\(blocking\), Date\.now\(\)\)/);
  assert.match(workflow, /"api", "--paginate", `repos\/\$\{issue\.repo\}\/issues\/\$\{issue\.number\}\/dependencies\/blocked_by`/);
  assert.doesNotMatch(workflow, /const result = await agent/);
  assert.match(ghProject, /"api", "--paginate", `repos\/\$\{repo\}\/issues\/\$\{issueNumber\}\/sub_issues`/);
  assert.match(ghProject, /function removeSubIssue/);
  assert.match(ghProject, /`repos\/\$\{repo\}\/issues\/\$\{parentNumber\}\/sub_issue`/);
  assert.match(ghProject, /`sub_issue_id=\$\{childDbId\}`/);
  assert.match(playbook, /An LLM\/agent may not perform or claim these edge writes/);
  assert.match(playbook, /REST-first/);
  assert.match(playbook, /Reparent-safe/);
  assert.match(playbook, /subissues_depth_limited/);
  assert.match(playbook, /blocked_by_external/);
  assert.match(gatePlaybook, /deterministically ensures native sub-issue \+ dependency edges via REST helpers/);
  for (const src of [wave, gate]) {
    assert.match(src, /subissues_depth_limited/);
    assert.match(src, /const depthLimited = Array\.isArray\(w\.subissues_depth_limited\)/);
  }
  assert.match(prompt, /Do not accept an LLM\/agent-claimed edge write as proof/);
  assert.match(prompt, /record `workflow-defect`/);
  assert.match(prompt, /report it in `reparented`/);
});

test("milestone wave keeps ready candidates on inconclusive breakdown output", () => {
  const wave = read("scripts/workflows/milestone-wave.workflow.js");
  const playbook = read("docs/agents/workflows/milestone-wave.md");
  const prompt = read("docs/agents/milestone-orchestration-prompt.md");

  assert.match(wave, /grabable=false but proposed_children=\[\]; keeping original issue as a ready leaf/);
  assert.match(wave, /Breakdown assessor timed out for \$\{issue\}: \$\{message\}; keeping original issue as a ready leaf/);
  assert.match(wave, /if \(!\/timed out\/i\.test\(message\)\) throw error;/);
  assert.match(wave, /readyLeaves\.push\(issue\);\n    continue;/);
  assert.match(playbook, /grabable:false` but returns no `proposed_children`/);
  assert.match(playbook, /read-only assessor times out/);
  assert.match(playbook, /keep the original ready candidate as a dispatchable leaf/);
  assert.match(playbook, /non-empty `triaged\.ready` with no `dispatched`, no `dispatch_order`, no `needs_user`, and `done:false` is impossible/);
  assert.match(prompt, /If a breakdown assessor says a ready issue is not grab-able but returns no concrete child issues/);
  assert.match(prompt, /read-only assessor times out/);
  assert.match(prompt, /Do not drop the ready issue from the wave/);
});

test("post-triage roadmap mirror refreshes board snapshot after tracker mutations", () => {
  const wave = read("scripts/workflows/milestone-wave.workflow.js");
  const mirror = read("scripts/workflows/gh-roadmap-mirror.workflow.js");
  const renderer = read("scripts/render-issue-roadmap.js");
  const playbook = read("docs/agents/workflows/gh-roadmap-mirror.md");

  assert.match(wave, /gh-roadmap-mirror\.workflow\.js` \}, \{ dry_run: false, refresh: true \}/);
  assert.match(mirror, /refresh: \{ type: "boolean", required: false, description: "force-refresh the board snapshot before rendering" \}/);
  assert.match(mirror, /if \(cfg\.refresh === true\) render\.push\("--refresh"\)/);
  assert.match(renderer, /else if \(a === "--refresh"\) cfg\.refresh = true/);
  assert.match(renderer, /boardSnapshot\(\{ snapshotPath: cfg\.snapshot, refresh: cfg\.refresh \}\)/);
  assert.match(playbook, /refresh: \{ type: boolean, required: false, description: "force-refresh the board snapshot before rendering" \}/);
  assert.match(playbook, /post-triage wave callers, pass `refresh: true`/);
});

// RP-47: the haiku enrich-frontmatter agent is GONE from the wave (redundant + lossy: it returned
// candidates without priority/effort, nulling the calibration capture). Prioritize candidates are
// built deterministically from the triage context; wave-prioritize itself backfills any missing
// priority/effort from issue frontmatter before ranking.
test("milestone wave builds prioritize candidates deterministically from triage context (RP-47)", () => {
  const wave = read("scripts/workflows/milestone-wave.workflow.js");
  const playbook = read("docs/agents/workflows/milestone-wave.md");
  const prompt = read("docs/agents/milestone-orchestration-prompt.md");

  assert.match(wave, /let readyCandidateContext = new Map\(\)/);
  assert.match(wave, /module: fields\.Module/);
  assert.match(wave, /owned_path: fields\["Owned Path"\]/);
  assert.doesNotMatch(wave, /label: "enrich-frontmatter"/);
  assert.match(wave, /const enrichedCandidates = readyLeaves\.map\(\(ref\) => readyCandidateContext\.get\(ref\) \|\| \{ ref \}\)/);
  assert.match(wave, /candidates: JSON\.stringify\(enrichedCandidates\)/);
  assert.match(playbook, /no LLM enrichment step; RP-47 removed the haiku enrich-frontmatter agent/);
  // Durable invariant (survives the RP-47 prompt rewording): an empty candidate list never reaches
  // prioritization while ready leaves exist.
  assert.match(prompt, /Never pass an empty candidate list to prioritization for a non-empty ready set\./);
});

test("wave prioritize ranks and partitions in executor code", () => {
  const prioritize = read("scripts/workflows/wave-prioritize.workflow.js");
  const wave = read("scripts/workflows/milestone-wave.workflow.js");
  const playbook = read("docs/agents/workflows/wave-prioritize.md");
  const prompt = read("docs/agents/milestone-orchestration-prompt.md");

  // Deterministic dep-graph lib is loaded via localRequire (lazy, post-meta per workflow-defect #508 meta-first reorder).
  assert.match(prioritize, /localRequire(?:Lib)?\("\.\.\/lib\/dep-graph\.js"\)/);
  // RP-47 null-capture fix: missing priority/effort is backfilled from issue frontmatter BEFORE
  // rank() so the calibration dispatch record captures real values, never null.
  assert.match(prioritize, /const \{ weights, ranked \} = depGraph\.rank\(rankInput, \{ weights: weightsOverride \}\)/);
  assert.match(prioritize, /c\.priority == null && fm\.priority \? \{ priority: fm\.priority \} : \{\}/);
  assert.match(prioritize, /c\.effort == null && fm\.effort \? \{ effort: fm\.effort \} : \{\}/);
  assert.match(prioritize, /function partitionLanes\(ranked, candidateByIssue, maxLanes\)/);
  assert.match(prioritize, /throw new Error\("wave-prioritize: deterministic dep-graph rank returned no rows for non-empty candidates"\)/);
  assert.match(prioritize, /if \(!cfg\.dry_run\)/);
  assert.doesNotMatch(prioritize, /const result = await agent/);
  assert.match(wave, /dry_run: dryRun/);
  assert.match(playbook, /workflow executor calls the lib directly and partitions in code/);
  assert.match(playbook, /dry_run:true` skips this append/);
  assert.match(prompt, /`wave-prioritize` must rank and partition in executor code/);
});

test("milestone wave uses worktree dispatch by default and keeps serial fallback", () => {
  const wave = read("scripts/workflows/milestone-wave.workflow.js");
  const playbook = read("docs/agents/workflows/milestone-wave.md");
  const prompt = read("docs/agents/milestone-orchestration-prompt.md");
  const taskExecute = read("docs/agents/workflows/task-execute.md");
  const childTaskOutput = new Function(`${extractFunction(wave, "childTaskOutput")}\nreturn childTaskOutput;`)();

  assert.match(wave, /createIsolatedLaneWorktree/);
  assert.match(wave, /DISPATCH-WORKTREE:/);
  assert.match(wave, /workflow-run",\s*"task-execute"/);
  assert.match(wave, /parsed\.result && typeof parsed\.result === "object"/);
  assert.deepEqual(
    childTaskOutput({ status: "completed", result: { status: "needs-user", blocker: "decision needed" } }),
    { status: "needs-user", blocker: "decision needed" },
  );
  assert.deepEqual(
    childTaskOutput({ status: "completed", output: { status: "blocked", blocker: "gate failed" } }),
    { status: "blocked", blocker: "gate failed" },
  );
  assert.deepEqual(childTaskOutput({ status: "completed", runId: "wf_wrapper_only" }), {});
  assert.match(wave, /DISPATCH-SERIAL:/);
  assert.match(wave, /dispatch_mode/);
  assert.match(wave, /const laneNeedsUser = dispatched/);
  assert.match(wave, /kind: "Worker-needs-user"/);
  assert.match(playbook, /default dispatch is worktree-isolated/);
  assert.match(playbook, /Worktree dispatch propagates the child `task-execute` result payload/);
  assert.match(playbook, /low-resource same-checkout fallback serializes actual branch-changing dispatch/);
  assert.match(prompt, /same-checkout workflow executors must serialize branch-changing dispatch/);
  assert.match(taskExecute, /parallel orchestrator must run each `task-execute` lane from a distinct git worktree/);
});

test("task execution evidence gate uses independent evidence and derives empty diff from paths", () => {
  const tdd = read("scripts/workflows/tdd-implement.workflow.js");
  const taskExecute = read("scripts/workflows/task-execute.workflow.js");
  const wave = read("scripts/workflows/milestone-wave.workflow.js");
  const workflowGit = read("scripts/lib/workflow-git.js");
  const tddPlaybook = read("docs/agents/workflows/tdd-implement.md");
  const taskPlaybook = read("docs/agents/workflows/task-execute.md");
  const wavePlaybook = read("docs/agents/workflows/milestone-wave.md");
  const prompt = read("docs/agents/milestone-orchestration-prompt.md");

  assert.match(tdd, /required: \["changed_paths", "empty_diff", "out_of_scope_paths", "ci_exit", "ci_ran", "submodule_unreachable", "verification_evidence"\]/);
  assert.match(tdd, /const changedPaths = Array\.isArray\(verify\.changed_paths\)/);
  assert.match(tdd, /const emptyDiff = changedPaths\.length === 0/);
  assert.match(tdd, /const verifierContradiction = verify\.empty_diff === true && changedPaths\.length > 0/);
  assert.match(tdd, /function normalizeCiExit\(value\)/);
  assert.match(tdd, /function workflowDefectKindForVerification/);
  assert.match(tdd, /const ciExit = normalizeCiExit\(verify\.ci_exit\)/);
  assert.match(tdd, /const ciRan = verify\.ci_ran === true/);
  assert.match(tdd, /independent verifier did not prove CI ran/);
  assert.match(tdd, /independent verifier did not paste a CI exit code/);
  assert.match(tdd, /const selfFiles = Array\.isArray\(result\.files_changed\)/);
  assert.match(tdd, /tdd-implement dry-run no-op done/);
  assert.match(tdd, /workflow_defect: true/);
  assert.match(tdd, /workflow_defect_kind: "tdd-implement-no-op-done"/);
  assert.match(tdd, /cfg\.dry_run && result\.status === "done" && !selfFiles\.length && !selfTests\.length/);
  assert.match(tdd, /result\.status === "done" && !selfFiles\.length && !selfTests\.length && !selfEvidence && !selfBlocker/);
  assert.match(tdd, /tdd-implement schema-default no-op done/);
  assert.match(tdd, /verification_evidence alone is not an implementable claim/);
  assert.match(tdd, /const workflowDefectKind = workflowDefectKindForVerification\(\{ emptyDiff, verifierContradiction \}\)/);
  assert.doesNotMatch(tdd, /\|\| verify\.empty_diff === true/);
  assert.match(tdd, /independent verifier reported empty_diff=true with non-empty changed_paths/);
  assert.match(tdd, /spec_unresolved: \{ type: "boolean" \}/);
  assert.match(tdd, /ownedPaths\.length === 0 \|\| verify\.spec_unresolved === true/);
  assert.match(tdd, /INDEPENDENT VERIFICATION \(§8\.1 fallback claim of record\)/);
  assert.match(tdd, /no worker or independent verification_evidence paste/);
  assert.match(workflowGit, /function createAndCheckoutBranch/);
  assert.match(workflowGit, /function resolveDefaultBranch/);
  assert.match(workflowGit, /function remoteDefaultRef/);
  assert.match(workflowGit, /function fetchDefaultBranch/);
  assert.match(workflowGit, /function isPrRef\(value\)/);
  assert.match(workflowGit, /return isPrRef\(ref\) \? ref : ""/);
  assert.match(workflowGit, /refs\/remotes\/origin\/HEAD/);
  assert.match(workflowGit, /ls-remote", "--symref", "origin", "HEAD"/);
  assert.match(workflowGit, /"checkout", "--no-track", "-b", branchName, remoteDefaultRef\(defaultBranch\)/);
  assert.match(workflowGit, /"checkout", "--detach", remoteDefaultRef\(defaultBranch\)/);
  assert.match(workflowGit, /ls-remote", "--exit-code", "--heads", "origin"/);
  assert.match(workflowGit, /exitCode === 2/);
  assert.match(workflowGit, /remote branch probe failed/);
  assert.match(workflowGit, /unable to resolve default branch/);
  assert.doesNotMatch(workflowGit, /return match \? match\[1\] : "main"/);
  assert.match(workflowGit, /module\.exports = \{/);
  assert.match(taskExecute, /localRequire\("\.\.\/lib\/workflow-git\.js"\)/);
  assert.match(taskExecute, /branch-create-failed: expected/);
  assert.match(taskExecute, /pr-create-failed: agent returned <empty-or-invalid>/);
  assert.match(taskExecute, /post-pr default-branch restore failed/);
  assert.match(taskExecute, /tdd-implement reached done without §8\.1 verification_evidence/);
  assert.match(taskExecute, /workflow_defect: \{ type: "boolean"/);
  assert.match(taskExecute, /workflow_defect: impl\.workflow_defect === true/);
  assert.match(taskExecute, /workflow_defect_kind: impl\.workflow_defect_kind \|\| ""/);
  assert.match(wave, /localRequire\("\.\.\/lib\/workflow-git\.js"\)/);
  assert.match(wave, /branch-create-failed: expected/);
  assert.match(wave, /pr-create-failed: agent returned <empty-or-invalid>/);
  assert.match(wave, /post-pr default-branch restore failed/);
  assert.match(wave, /tdd-implement reached done without §8\.1 verification_evidence/);
  assert.match(wave, /workflow-defect:\$\{impl\.workflow_defect_kind/);
  assert.match(wave, /workflow_defect: impl\.workflow_defect === true/);
  assert.match(wave, /workflow_defect_kind: impl\.workflow_defect_kind \|\| ""/);
  assert.match(tddPlaybook, /independent verifier's git diff is the truth/);
  assert.match(tddPlaybook, /Self-reported arrays alone do not veto a real diff/);
  assert.match(tddPlaybook, /verifier's observed git diff decides no-op truth/);
  assert.match(tddPlaybook, /normalizes non-integer `ci_exit` to failing\/nonzero/);
  assert.match(tddPlaybook, /`ci_exit:0` only when the verifier also returns `ci_ran:true`/);
  assert.match(tddPlaybook, /numeric `ci_exit:0` alone is not proof/);
  assert.match(tddPlaybook, /workflow_defect:true/);
  assert.match(tddPlaybook, /tdd-implement-no-op-done/);
  assert.match(tddPlaybook, /empty_diff:true` with non-empty paths blocks as contradictory verifier output/);
  assert.match(tddPlaybook, /missing `owned_paths` or any out-of-scope file/);
  assert.match(tddPlaybook, /independent paste becomes the §8\.1 fallback claim of record/);
  assert.match(taskPlaybook, /deterministic executor code/);
  assert.match(taskPlaybook, /repository remote default ref/);
  assert.match(taskPlaybook, /scripts\/lib\/workflow-git\.js/);
  assert.match(taskPlaybook, /Remote branch probes fail closed/);
  assert.match(taskPlaybook, /empty or malformed PR ref/);
  assert.match(taskPlaybook, /non-empty model string such as `no PR opened` is not a PR ref/);
  assert.match(taskPlaybook, /restore or stash back to the default branch/);
  assert.match(taskPlaybook, /Missing evidence is a workflow block, not a PR-open condition/);
  assert.match(taskPlaybook, /preserves `workflow_defect` and `workflow_defect_kind`/);
  assert.match(wavePlaybook, /branch-create-failed/);
  assert.match(wavePlaybook, /repository remote default ref/);
  assert.match(wavePlaybook, /scripts\/lib\/workflow-git\.js/);
  assert.match(wavePlaybook, /Remote branch probes fail closed/);
  assert.match(wavePlaybook, /valid `owner\/repo#N` PR ref/);
  assert.match(wavePlaybook, /restore or stash the shared checkout back to the default branch/);
  assert.match(wavePlaybook, /missing evidence, empty\/malformed PR ref, or failed restore is `blocked`, never `pr-open`/);
  assert.match(wavePlaybook, /workflow_defect:true` with `workflow_defect_kind`/);
  assert.match(prompt, /branch creation must be deterministic executor code/);
  assert.match(prompt, /scripts\/lib\/workflow-git\.js/);
  assert.match(prompt, /Remote branch probes and default-branch resolution must fail closed/);
  assert.match(prompt, /workflow JS can enforce an `owned_paths` scope fence from the independent verifier's observed `changed_paths`/);
  assert.match(prompt, /verifier does not prove `ci_ran:true` with an exit-code paste/);
  assert.match(prompt, /the independent verifier's observed `changed_paths` decides no-op truth/);
  assert.match(prompt, /workflow_defect:true/);
  assert.match(prompt, /opposite-harness-report-missing/);
  assert.match(prompt, /independent verifier paste may become the fallback claim of record/);
});

test("opposite harness grill missing report is a machine-readable workflow defect", () => {
  const grill = read("scripts/workflows/opposite-harness-grill.workflow.js");
  const grillPlaybook = read("docs/agents/workflows/opposite-harness-grill.md");

  assert.match(grill, /reportWrittenSince\(finalReportPath, grillStartedAt\)/);
  assert.match(grill, /function pathsMatch/);
  assert.match(grill, /function missingReportResult/);
  assert.match(grill, /function finalizeGrillResult/);
  assert.match(grill, /grill-result-report-path-missing-or-mismatched/);
  assert.match(grill, /workflow_defect: true/);
  assert.match(grill, /workflow_defect_kind: "opposite-harness-report-missing"/);
  assert.match(grill, /Returning pass\/issues-found\/block without a non-empty report_path/);
  assert.match(grillPlaybook, /workflow_defect:true/);
  assert.match(grillPlaybook, /opposite-harness-report-missing/);
  assert.match(grillPlaybook, /claude-rescue` failure mode where the agent reports `pass` without writing the required report/);
  assert.match(grillPlaybook, /Empty, mismatched, missing, or stale `report_path`/);
  assert.match(grillPlaybook, /missing grill artifact is a failed adversarial leg/);
});

test("opposite harness artifact gate rejects empty report_path and accepts a fresh persisted report", () => {
  const grill = read("scripts/workflows/opposite-harness-grill.workflow.js");
  const helpers = new Function(
    "existsSync",
    "statSync",
    "resolve",
    `${extractFunction(grill, "pathsMatch")}\n${extractFunction(grill, "reportWrittenSince")}\n${extractFunction(grill, "finalizeGrillResult")}\nreturn { pathsMatch, reportWrittenSince, finalizeGrillResult };`,
  )(fs.existsSync, fs.statSync, path.resolve);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "curaos-grill-"));
  const reportPath = path.join(tmpDir, "report.md");
  const grillStartedAt = Date.now();

  const missing = helpers.finalizeGrillResult(
    { verdict: "pass", issues: [], report_path: "" },
    reportPath,
    grillStartedAt,
    (detail, result) => ({ detail, result }),
  );
  assert.equal(missing.detail, "grill-result-report-path-missing-or-mismatched");
  assert.equal(missing.result.report_path, "");

  fs.writeFileSync(reportPath, "# report\n");
  const ok = helpers.finalizeGrillResult(
    { verdict: "pass", issues: [], report_path: reportPath },
    reportPath,
    grillStartedAt,
    () => ({ detail: "unexpected" }),
  );
  assert.equal(ok.verdict, "pass");
  assert.equal(ok.report_path, reportPath);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("opposite harness workflow preserves blocked grill classification for missing report", async () => {
  const grill = read("scripts/workflows/opposite-harness-grill.workflow.js")
    .replace(/^export const meta =/m, "const meta =")
    .replace(/^export default async function workflow/m, "async function workflow");
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "curaos-grill-workflow-"));
  const originalCwd = process.cwd();
  const fakeProcess = {
    getBuiltinModule(name) {
      if (name === "node:child_process") return { execFileSync: () => "OK\n" };
      if (name === "node:crypto") return crypto;
      if (name === "node:fs") return fs;
      if (name === "node:path") return path;
      throw new Error(`unexpected builtin ${name}`);
    },
  };

  try {
    process.chdir(tmpDir);
    const runner = new Function(
      "process",
      "args",
      "agent",
      "phase",
      "log",
      `return (async () => {\n${grill}\nreturn workflow({ args, agent, phase, log });\n})()`,
    );
    const result = await runner(
      fakeProcess,
      { subject: "issue-621 synthetic missing report", probe_timeout_ms: 1 },
      async () => ({ verdict: "pass", issues: [], report_path: "" }),
      () => {},
      () => {},
    );

    assert.equal(result.workflow_defect, true);
    assert.equal(result.workflow_defect_kind, "opposite-harness-report-missing");
    assert.equal(result.grill, "blocked-harness-unavailable");
    // RP-33 fixture quarantine: this subject carries "synthetic", so the report lands under
    // scripts/test-fixtures/grills/, never beside real verdicts in ai/curaos/docs/grills/.
    assert.match(result.report_path, /scripts\/test-fixtures\/grills\/issue-621-synthetic-missing-report-/);
    assert.doesNotMatch(result.report_path, /ai\/curaos\/docs\/grills\//);
    assert.match(fs.readFileSync(result.report_path, "utf8"), /^GRILL-SYNTHETIC: true$/m);
  } finally {
    process.chdir(originalCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// issue #706 P1b: the bounded poll loop replaces the single reportWrittenSince snapshot so the
// executor waits for the WRITTEN rescue report (a job-id placeholder or a still-flushing report)
// before declaring opposite-harness-report-missing. Executed against the REAL helper with a virtual
// clock + injected exists/stat/sleep, so no real timers fire.
test("opposite harness grill bounded poll waits for the written report (#706 P1b)", () => {
  const grill = read("scripts/workflows/opposite-harness-grill.workflow.js");
  assert.match(grill, /function pollForReport/);
  // The workflow finalizes via the poll spec (not a bare single check).
  assert.match(grill, /poll_timeout_ms: pollTimeoutMs, poll_interval_ms: pollIntervalMs/);
  const { pollForReport } = new Function(
    "existsSync", "statSync",
    `${extractFunction(grill, "pollForReport")}\nreturn { pollForReport };`,
  )(() => false, () => ({ mtimeMs: 0 }));

  // (a) report appears on the 3rd poll: returns true, stops polling immediately after.
  let now = 1000;
  let calls = 0;
  const startedAt = 1000;
  const appearsAt = 3; // becomes present on the 3rd exists check
  const okPoll = pollForReport("/g/r.md", startedAt, 30000, 5000, {
    nowFn: () => now,
    existsFn: () => { calls += 1; return calls >= appearsAt; },
    statFn: () => ({ mtimeMs: now }),
    sleepFn: (ms) => { now += ms; },
  });
  assert.equal(okPoll, true, "poll resolves true once the report is freshly written");

  // (b) report never appears within the bounded budget: returns false (then the executor defects).
  now = 1000;
  const missPoll = pollForReport("/g/r.md", 1000, 12000, 5000, {
    nowFn: () => now,
    existsFn: () => false,
    statFn: () => ({ mtimeMs: 0 }),
    sleepFn: (ms) => { now += ms; },
  });
  assert.equal(missPoll, false, "poll resolves false when no fresh report lands within the budget");

  // (c) non-positive budget degrades to a single check (legacy reportWrittenSince behavior).
  let single = 0;
  const degraded = pollForReport("/g/r.md", 1000, 0, 5000, {
    nowFn: () => 1000,
    existsFn: () => { single += 1; return false; },
    statFn: () => ({ mtimeMs: 0 }),
    sleepFn: () => { throw new Error("must not sleep on a zero budget"); },
  });
  assert.equal(degraded, false);
  assert.equal(single, 1, "zero budget is a single existence check, no poll loop");
});

// issue #706 P5a: the fan-in dedup aggregator + worst-verdict fold collapse the parallel grill
// dimensions into one severity-ranked deduped list with wall-clock = max(dimension).
test("opposite harness grill fan-in dedups + ranks parallel dimensions (#706 P5a)", () => {
  const grill = read("scripts/workflows/opposite-harness-grill.workflow.js");
  assert.match(grill, /function dedupeGrillFindings/);
  assert.match(grill, /function worstGrillVerdict/);
  assert.match(grill, /function grillFindingEvidenceKey/);
  assert.match(grill, /Promise\.all\(requestedDimensions\.map/);
  const { dedupeGrillFindings, worstGrillVerdict } = new Function(
    "createHash",
    `${extractFunction(grill, "grillFindingEvidenceKey")}\n${extractFunction(grill, "dedupeGrillFindings")}\n${extractFunction(grill, "worstGrillVerdict")}\nreturn { dedupeGrillFindings, worstGrillVerdict };`,
  )(crypto.createHash);

  // P2 (issue #706 dedup soundness): a TRUE duplicate (same severity + title + evidence/location)
  // collapses; two findings sharing severity+title but with DIFFERENT evidence/location SURVIVE
  // (distinct findings, not one). The key includes a location/evidence hash, not just (severity,title).
  const merged = dedupeGrillFindings([
    [{ severity: "high", what: "SQL injection", evidence: "same-evidence" }, { severity: "low", what: "nit", evidence: "n" }],
    [{ severity: "high", what: "sql injection", evidence: "same-evidence" }, { severity: "critical", what: "PHI leak", evidence: "p" }],
    [],
    null,
  ]);
  assert.deepEqual(merged.map((f) => `${f.severity}:${f.what}`), ["critical:PHI leak", "high:SQL injection", "low:nit"], "true duplicate (same severity+title+evidence) collapses, severity-ranked");

  // Two same-title-diff-location findings BOTH survive (the P2 fix: coarse (severity,title) key would
  // have dropped the second real issue).
  const distinct = dedupeGrillFindings([
    [{ severity: "high", what: "missing authz", location: "GET /a", evidence: "endpoint a" }],
    [{ severity: "high", what: "missing authz", location: "GET /b", evidence: "endpoint b" }],
  ]);
  assert.equal(distinct.length, 2, "same severity+title but different location => both survive");
  assert.deepEqual(distinct.map((f) => f.location).sort(), ["GET /a", "GET /b"]);
  // Same title + same location but different evidence text => still a duplicate location => collapses.
  const sameLoc = dedupeGrillFindings([
    [{ severity: "high", what: "missing authz", location: "GET /a", evidence: "phrasing one" }],
    [{ severity: "high", what: "missing authz", location: "GET /a", evidence: "phrasing two" }],
  ]);
  assert.equal(sameLoc.length, 1, "same severity+title+location collapses regardless of evidence phrasing");

  assert.equal(worstGrillVerdict(["pass", "issues-found", "pass"]), "issues-found");
  assert.equal(worstGrillVerdict(["pass", "issues-found", "block"]), "block");
  assert.equal(worstGrillVerdict(["pass", "pass"]), "pass");
  assert.equal(worstGrillVerdict([]), "pass");
});

// issue #706 P4b: the grill cache key binds (head/diff identity, prompt-template-hash, cache_bust)
// so a same-input re-run can reuse a verdict while an independent re-grill cycle (distinct
// cache_bust) recomputes.
test("opposite harness grill cache key binds head + prompt-hash + cache_bust (#706 P4b)", () => {
  const grill = read("scripts/workflows/opposite-harness-grill.workflow.js");
  assert.match(grill, /function grillPromptTemplateHash/);
  assert.match(grill, /function grillCacheKey/);
  const { grillPromptTemplateHash, grillCacheKey } = new Function(
    "createHash",
    `${extractFunction(grill, "grillPromptTemplateHash")}\n${extractFunction(grill, "grillCacheKey")}\nreturn { grillPromptTemplateHash, grillCacheKey };`,
  )(crypto.createHash);

  const sha = "a".repeat(40);
  const h1 = grillPromptTemplateHash("prompt body v1");
  const h2 = grillPromptTemplateHash("prompt body v2");
  assert.notEqual(h1, h2, "a prompt-template change changes the hash");
  const base = grillCacheKey(sha, h1, "");
  assert.equal(grillCacheKey(sha, h1, ""), base, "same (sha, prompt-hash, bust) => same key (reuse within cycle)");
  assert.notEqual(grillCacheKey(sha, h1, "cycle-2"), base, "a distinct cache_bust recomputes (fresh across cycles)");
  assert.notEqual(grillCacheKey("b".repeat(40), h1, ""), base, "a new head sha recomputes");
  assert.notEqual(grillCacheKey(sha, h2, ""), base, "a prompt-template change recomputes");
});

// issue #706 P5b: the workspace-root marker assertion refuses to write a grill report into a code
// submodule (a real git toplevel that is not the AGENTS.md + ai/ workspace root), while allowing the
// pure cwd fallback (stub/fixture path: gitTopFn returns "" / a non-absolute token).
test("opposite harness grill refuses an unsafe submodule report root (#706 P5b)", () => {
  const grill = read("scripts/workflows/opposite-harness-grill.workflow.js");
  assert.match(grill, /function grillRootUnsafeReason/);
  assert.match(grill, /grill-report-root-unsafe/);
  const { grillRootUnsafeReason } = new Function(
    "workspaceRootMarker", "gitPathOutput", "isAbsolute",
    `${extractFunction(grill, "grillRootUnsafeReason")}\nreturn { grillRootUnsafeReason };`,
  )(() => false, () => "", path.isAbsolute);

  // (a) marker present => safe.
  assert.equal(grillRootUnsafeReason("/ws", { markerFn: () => true }), "");
  // (b) no marker + a real ABSOLUTE git toplevel => unsafe (the submodule danger).
  const unsafe = grillRootUnsafeReason("/repo/curaos/backend/services/audit-core-service", {
    markerFn: () => false,
    gitTopFn: () => "/repo/curaos/backend/services/audit-core-service",
    isAbsoluteFn: path.isAbsolute,
  });
  assert.match(unsafe, /refusing to write a grill report into a code submodule/);
  // (c) no marker + no git toplevel (pure cwd fallback / stub) => safe.
  assert.equal(grillRootUnsafeReason("/tmp/fixture", { markerFn: () => false, gitTopFn: () => "", isAbsoluteFn: path.isAbsolute }), "");
  // (d) no marker + a NON-absolute stub token (fake execFileSync echoing "OK") => safe.
  assert.equal(grillRootUnsafeReason("/tmp/fixture", { markerFn: () => false, gitTopFn: () => "OK", isAbsoluteFn: path.isAbsolute }), "");
});

// issue #706 P5a + P1b END-TO-END: run the REAL grill workflow body with dimensions set. Proves the
// fan-out dispatches one adversary per dimension CONCURRENTLY, each writes its per-dimension report,
// the executor writes the canonical aggregate report (fan-in deduped), the poll loop sees the fresh
// report, and the result carries the consensus sha + worst verdict. fakeProcess pattern as test 1468.
test("opposite harness grill fan-out runs dimensions concurrently + writes aggregate (#706 P5a/P1b)", async () => {
  const grill = read("scripts/workflows/opposite-harness-grill.workflow.js")
    .replace(/^export const meta =/m, "const meta =")
    .replace(/^export default async function workflow/m, "async function workflow");
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "curaos-grill-fanout-"));
  const originalCwd = process.cwd();
  // Marker-bearing fake workspace so P5b passes and reports land under ai/curaos/docs/grills.
  fs.writeFileSync(path.join(tmpDir, "AGENTS.md"), "# fixture\n");
  fs.mkdirSync(path.join(tmpDir, "ai"), { recursive: true });
  const headSha = "a".repeat(40);
  const fakeProcess = {
    env: { WORKSPACE_ROOT: tmpDir },
    getBuiltinModule(name) {
      if (name === "node:child_process") return { execFileSync: () => "OK\n" };
      if (name === "node:crypto") return crypto;
      if (name === "node:fs") return fs;
      if (name === "node:path") return path;
      throw new Error(`unexpected builtin ${name}`);
    },
  };
  const dims = [];
  let concurrentPeak = 0;
  let inflight = 0;
  const agent = async (prompt, options) => {
    inflight += 1;
    concurrentPeak = Math.max(concurrentPeak, inflight);
    const label = String(options.label || "");
    const dim = label.split(":")[2] || "";
    dims.push(dim);
    await new Promise((r) => setTimeout(r, 5));
    // Each dimension writes its per-dimension report (the executor told it the path in the prompt).
    const m = prompt.match(/WRITE a grill verdict to (\S+\.md)/);
    if (m) { fs.mkdirSync(path.dirname(m[1]), { recursive: true }); fs.writeFileSync(m[1], `# ${dim}\nGRILL-VERIFIED-SHA: ${headSha}\n`); }
    inflight -= 1;
    // security finds a high; correctness finds the SAME high at the SAME location (a true dup that
    // collapses under P2's location-aware key) + a critical; others clean.
    if (dim === "security") return { verdict: "issues-found", issues: [{ severity: "high", what: "missing authz", location: "GET /patients", evidence: "x" }], report_path: m[1], verified_sha: headSha };
    if (dim === "correctness") return { verdict: "issues-found", issues: [{ severity: "high", what: "missing authz", location: "GET /patients", evidence: "y" }, { severity: "critical", what: "race", evidence: "z" }], report_path: m[1], verified_sha: headSha };
    return { verdict: "pass", issues: [], report_path: m[1], verified_sha: headSha };
  };
  try {
    process.chdir(tmpDir);
    const runner = new Function("process", "args", "agent", "phase", "log",
      `return (async () => {\n${grill}\nreturn workflow({ args, agent, phase, log });\n})()`);
    const result = await runner(
      fakeProcess,
      { subject: "m9-s2 fanout", pr: "your-org/curaos#494", dimensions: ["security", "correctness", "contract-PHI", "performance"], probe_timeout_ms: 1 },
      agent, () => {}, () => {},
    );
    assert.equal(concurrentPeak, 4, "all 4 dimensions dispatched concurrently (wall-clock = max(dimension))");
    assert.deepEqual([...dims].sort(), ["contract-PHI", "correctness", "performance", "security"]);
    assert.equal(result.verdict, "issues-found", "worst verdict across dimensions");
    assert.equal(result.verified_sha, headSha, "consensus verified_sha");
    // fan-in dedup: the duplicate (high, missing authz) appears once; ranked critical -> high.
    assert.deepEqual(result.issues.map((i) => `${i.severity}:${i.what}`), ["critical:race", "high:missing authz"]);
    // canonical aggregate report freshly written by the executor (poll loop sees it).
    assert.match(result.report_path, /ai\/curaos\/docs\/grills\//);
    const agg = fs.readFileSync(result.report_path, "utf8");
    assert.match(agg, /GRILL-DIMENSIONS: security, correctness, contract-PHI, performance/);
    assert.match(agg, /Fan-in deduped findings/);
  } finally {
    process.chdir(originalCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// P1-1 (issue #706 grill BLOCK regression): the cache key binds the RESOLVED head sha, not the PR
// ref. A second commit on the SAME PR moves the head, so the cache key changes and a stale PASS is
// NOT reused. Executed against the real resolveHeadSha + grillCacheKey + the call-site shape; carries
// a MUTANT demonstration that the OLD `${cfg.pr}|...` key collides across commits on one PR.
test("opposite harness grill cache key is head-bound, not PR-bound (#706 P1-1)", () => {
  const grill = read("scripts/workflows/opposite-harness-grill.workflow.js");
  assert.match(grill, /function resolveHeadSha/);
  // The call site resolves the head sha BEFORE the key and passes it (not cfg.pr) as the sha arg.
  assert.match(grill, /const resolvedHeadSha = resolveHeadSha\(verifiedShaCmd\)/);
  assert.match(grill, /grillCacheKey\(resolvedHeadSha,/);
  assert.doesNotMatch(grill, /grillCacheKey\(`\$\{cfg\.pr/);

  const { resolveHeadSha, grillCacheKey, grillPromptTemplateHash } = new Function(
    "execFileSync", "createHash",
    `${extractFunction(grill, "normalizedVerifiedSha")}\n${extractFunction(grill, "resolveHeadSha")}\n${extractFunction(grill, "grillCacheKey")}\n${extractFunction(grill, "grillPromptTemplateHash")}\nreturn { resolveHeadSha, grillCacheKey, grillPromptTemplateHash };`,
  )(() => { throw new Error("must use injected runFn"); }, crypto.createHash);

  // resolveHeadSha normalizes the command output to 40-hex, or "".
  const shaA = "a".repeat(40);
  const shaB = "b".repeat(40);
  assert.equal(resolveHeadSha("cmd", () => `${shaA}\n`), shaA, "valid 40-hex resolves");
  assert.equal(resolveHeadSha("cmd", () => "not-a-sha"), "", "non-sha output normalizes to empty");
  assert.equal(resolveHeadSha("cmd", () => ""), "", "empty output is empty");

  // The EXECUTED defect class: same PR, two commits => two head shas => two DISTINCT cache keys.
  const promptHash = grillPromptTemplateHash("prompt body");
  const keyCommit1 = grillCacheKey(resolveHeadSha("cmd", () => shaA), promptHash, "|");
  const keyCommit2 = grillCacheKey(resolveHeadSha("cmd", () => shaB), promptHash, "|");
  assert.notEqual(keyCommit1, keyCommit2, "a second commit on the same PR must NOT hit the prior cache entry");

  // MUTANT: the OLD key fed `${cfg.pr}|${diffCmd}|${dimensionLabel}` as the sha arg - the PR ref is
  // identical across commits, so the key COLLIDES (the stale-PASS reuse bug). Only head-binding fixes it.
  const pr = "owner/repo#7";
  const oldKeyCommit1 = grillCacheKey(`${pr}|gh pr diff 7|`, promptHash, "");
  const oldKeyCommit2 = grillCacheKey(`${pr}|gh pr diff 7|`, promptHash, "");
  assert.equal(oldKeyCommit1, oldKeyCommit2, "MUTANT: the PR-bound key collides across commits (the regression the fix removes)");
});

// P1-4 (issue #706 fan-in soundness): the parallel fan-out requires ALL dimensions to report the
// SAME 40-hex head sha; a divergent or missing sha fails closed (mixed-head dimensions are not one
// review). The prior `.find(Boolean)` took the FIRST valid sha and aggregated mixed heads under it.
test("opposite harness grill fan-out blocks divergent or missing dimension shas (#706 P1-4)", () => {
  const grill = read("scripts/workflows/opposite-harness-grill.workflow.js");
  assert.match(grill, /function fanInConsensusSha/);
  // The call site uses fanInConsensusSha + blocks on consensus.block (no `.find(Boolean)` shortcut).
  assert.match(grill, /const consensus = fanInConsensusSha\(dimResults\)/);
  assert.match(grill, /if \(consensus\.block\)/);
  assert.doesNotMatch(grill, /\.map\(\(r\) => normalizedVerifiedSha\(r && r\.verified_sha\)\)\.find\(Boolean\)/);

  const { fanInConsensusSha } = new Function(
    `${extractFunction(grill, "normalizedVerifiedSha")}\n${extractFunction(grill, "fanInConsensusSha")}\nreturn { fanInConsensusSha };`,
  )();
  const shaA = "a".repeat(40);
  const shaB = "b".repeat(40);

  // (a) all dimensions agree => consensus sha, no block.
  assert.deepEqual(fanInConsensusSha([{ verified_sha: shaA }, { verified_sha: shaA }]), { sha: shaA });
  // (b) divergent shas => BLOCK (the mixed-head defect the fix closes).
  const divergent = fanInConsensusSha([{ verified_sha: shaA }, { verified_sha: shaB }]);
  assert.ok(divergent.block, "divergent-SHA dimensions block");
  assert.match(divergent.block, /divergent head shas/);
  // (c) a missing/blank sha on any dimension => BLOCK (unproven dimension).
  const missing = fanInConsensusSha([{ verified_sha: shaA }, { verified_sha: "" }]);
  assert.ok(missing.block, "a dimension with no valid sha blocks");
  assert.match(missing.block, /no valid 40-hex/);
  // (d) empty => block (no consensus possible).
  assert.ok(fanInConsensusSha([]).block);
});

// P1-4 END-TO-END: an errored dimension (its `.catch` returns skipped-harness-unavailable) and a
// divergent-sha dimension BOTH block the whole fan-out instead of folding into a pass. Drives the
// REAL grill body with dimensions set (fakeProcess pattern), so the executor's fail-closed path runs.
test("opposite harness grill fan-out fails closed on errored or divergent dimension (#706 P1-4)", async () => {
  const grillSrc = read("scripts/workflows/opposite-harness-grill.workflow.js")
    .replace(/^export const meta =/m, "const meta =")
    .replace(/^export default async function workflow/m, "async function workflow");
  const runFanout = async (perDimResult) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "curaos-grill-p14-"));
    fs.writeFileSync(path.join(tmpDir, "AGENTS.md"), "# fixture\n");
    fs.mkdirSync(path.join(tmpDir, "ai"), { recursive: true });
    const originalCwd = process.cwd();
    const fakeProcess = {
      env: { WORKSPACE_ROOT: tmpDir },
      getBuiltinModule(name) {
        if (name === "node:child_process") return { execFileSync: () => "OK\n" };
        if (name === "node:crypto") return crypto;
        if (name === "node:fs") return fs;
        if (name === "node:path") return path;
        throw new Error(`unexpected builtin ${name}`);
      },
    };
    const agent = async (prompt, options) => {
      const dim = String(options.label || "").split(":")[2] || "";
      const m = prompt.match(/WRITE a grill verdict to (\S+\.md)/);
      if (m) { fs.mkdirSync(path.dirname(m[1]), { recursive: true }); fs.writeFileSync(m[1], `# ${dim}\n`); }
      return perDimResult(dim, m && m[1]);
    };
    try {
      process.chdir(tmpDir);
      const runner = new Function("process", "args", "agent", "phase", "log",
        `return (async () => {\n${grillSrc}\nreturn workflow({ args, agent, phase, log });\n})()`);
      return await runner(fakeProcess,
        { subject: "p14 fanout", pr: "your-org/curaos#494", dimensions: ["security", "correctness"], probe_timeout_ms: 1 },
        agent, () => {}, () => {});
    } finally {
      process.chdir(originalCwd);
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  };
  const shaA = "a".repeat(40);
  const shaB = "b".repeat(40);

  // An errored dimension (the agent throws => its .catch yields skipped-harness-unavailable) blocks.
  const errored = await runFanout((dim, p) => {
    if (dim === "security") throw new Error("dimension boom");
    return { verdict: "pass", issues: [], report_path: p, verified_sha: shaA };
  });
  assert.equal(errored.verdict, "skipped-harness-unavailable", "an errored dimension is NOT swallowed as pass");
  assert.equal(errored.verified_sha, "");

  // Divergent shas across two passing dimensions block the fan-out (mixed-head review).
  const divergent = await runFanout((dim, p) => ({ verdict: "pass", issues: [], report_path: p, verified_sha: dim === "security" ? shaA : shaB }));
  assert.equal(divergent.verdict, "skipped-harness-unavailable", "divergent-sha dimensions block, never pass");
  assert.equal(divergent.verified_sha, "");
});

// P1-3 (issue #706 delta-regrill soundness): the executor backstop. A delta re-grill that returns
// issues-found while OMITTING a prior finding it never touched must NOT drop that finding - the
// executor folds un-re-asserted prior findings into unresolved_findings. A pass/block clears them.
test("opposite harness grill carries unresolved prior findings across a clean delta (#706 P1-3)", () => {
  const grill = read("scripts/workflows/opposite-harness-grill.workflow.js");
  assert.match(grill, /function mergeUnresolvedFindings/);
  assert.match(grill, /prior_findings:/); // the input is declared in the contract
  assert.match(grill, /unresolved_findings: mergeUnresolvedFindings\(finalized, priorFindings\)/);
  const { mergeUnresolvedFindings } = new Function(
    `${extractFunction(grill, "findingKey")}\n${extractFunction(grill, "mergeUnresolvedFindings")}\nreturn { mergeUnresolvedFindings };`,
  )();

  const prior = [{ severity: "high", what: "missing authz on /a" }, { severity: "critical", what: "PHI leak in logs" }];

  // A clean delta (issues-found on a DIFFERENT hunk, prior findings not re-asserted) keeps the prior
  // findings open: silence is NOT resolution.
  const carried = mergeUnresolvedFindings(
    { verdict: "issues-found", issues: [{ severity: "low", what: "nit in new hunk" }], unresolved_findings: [] },
    prior,
  );
  assert.deepEqual(
    carried.map((f) => f.what).sort(),
    ["PHI leak in logs", "missing authz on /a", "nit in new hunk"],
    "an unresolved full-review finding survives a delta re-grill that only covers other hunks",
  );

  // When the adversary explicitly re-asserts a prior finding, it stays (no double count).
  const reAsserted = mergeUnresolvedFindings(
    { verdict: "issues-found", issues: [], unresolved_findings: [{ severity: "high", what: "missing authz on /a" }] },
    prior,
  );
  assert.deepEqual(reAsserted.map((f) => f.what).sort(), ["PHI leak in logs", "missing authz on /a"]);

  // A pass verdict (adversary affirmatively cleared the change) drops the prior set - resolved.
  assert.deepEqual(mergeUnresolvedFindings({ verdict: "pass", issues: [], unresolved_findings: [] }, prior), []);
  // A block verdict escalates everything; the prior set is not carried as "unresolved-to-fix".
  assert.deepEqual(mergeUnresolvedFindings({ verdict: "block", issues: [{ severity: "critical", what: "exploit" }] }, prior).map((f) => f.what), ["exploit"]);
});

// issue #706 P2a/P2b END-TO-END: drive the REAL pr-verify-merge body through an issues-found grill
// so the in-workflow delta re-grill fix-cycle loop fires: cycle 1 fix worker + re-grill (still
// issues-found), cycle 2 fix worker + re-grill (now pass). Asserts the loop dispatched a fix worker
// per cycle, re-grilled the delta, and the final verdict reflects the resolved re-grill.
test("pr-verify-merge in-workflow re-grill loop fixes then re-grills the delta (#706 P2a/P2b)", async () => {
  const source = read("scripts/workflows/pr-verify-merge.workflow.js").replace(/^export const meta =/m, "const meta =");
  const head = "c".repeat(40);
  // grill returns issues-found, issues-found, then pass across the 3 grill dispatches.
  const grillSeq = [
    { verdict: "issues-found", issues: [{ severity: "high", what: "a" }], report_path: "/g/r.md", grill: "opposite-harness", verified_sha: head },
    { verdict: "issues-found", issues: [{ severity: "medium", what: "b" }], report_path: "/g/r.md", grill: "opposite-harness", verified_sha: head },
    { verdict: "pass", issues: [], report_path: "/g/r.md", grill: "opposite-harness", verified_sha: head },
  ];
  const grillArgsSeen = [];
  const fixCycles = [];
  const agent = async (prompt, options) => {
    const label = String((options && options.label) || "");
    if (label === "ci-check") return { local_gate_exit: 0, checks: [] };
    if (label === "local-review-signal") return { verdict: "clean", blocking: false, findings: [] };
    if (label === "thread-check") return { unresolved: 0, needs_human: 0 };
    if (label.startsWith("regrill-fix:")) { fixCycles.push(label); return { status: "done" }; }
    if (label === "merge") return { merged: true };
    if (label === "strip-state-labels") return { stripped: [] };
    if (label === "advance-board-status") return { advanced: [] };
    if (label === "clear-notif") return { cleared: true };
    if (label === "default-branch-readiness") return { readiness: "clean" };
    throw new Error(`unexpected agent call ${label}`);
  };
  const workflow = async ({ scriptPath }, wfArgs) => {
    const p = String(scriptPath);
    if (p.includes("lens-review")) return { lens: wfArgs.lens, verdict: "pass", findings: [] };
    if (p.includes("opposite-harness-grill")) { grillArgsSeen.push(wfArgs); return grillSeq.shift(); }
    if (p.includes("gh-pr-gate-snapshot")) return { head_sha: head, minutes_since_last_push: 12, blocked_by_external: false, error: "" };
    throw new Error(`unexpected workflow call ${p}`);
  };
  const parallel = (thunks) => Promise.all(thunks.map((thunk) => thunk()));
  const runner = new Function("args", "agent", "workflow", "parallel", "phase", "log",
    `return (async () => {\n${source}\n})()`);
  const result = await runner({ pr: "owner/repo#7", auto_merge: true }, agent, workflow, parallel, () => {}, () => {});

  assert.equal(fixCycles.length, 2, "one fix worker per re-grill cycle (2 issues-found cycles)");
  assert.equal(grillArgsSeen.length, 3, "initial grill + 2 re-grills");
  // re-grills are delta-scoped to <prev-sha>..HEAD and carry a per-cycle cache_bust.
  assert.equal(grillArgsSeen[1].diff_ref, `${head}..HEAD`);
  assert.equal(grillArgsSeen[1].cache_bust, "regrill-cycle-1");
  assert.equal(grillArgsSeen[2].cache_bust, "regrill-cycle-2");
  // P1-3: every cycle APPENDS to ONE stable canonical report path (no per-cycle fork) so a clean
  // delta cannot replace the full-review verdict file.
  const reportPaths = new Set(grillArgsSeen.map((a) => a.report_path));
  assert.equal(reportPaths.size, 1, "all cycles write the SAME stable report_path (append, never fork)");
  assert.match([...reportPaths][0], /^ai\/curaos\/docs\/grills\/.*-pr7\.md$/, "stable report path is the canonical PR grill file");
  // P1-3: the re-grills carry prior unresolved findings forward (a delta re-grill must re-verify them).
  assert.ok(Array.isArray(grillArgsSeen[1].prior_findings), "cycle-1 re-grill carries prior_findings");
  assert.ok(grillArgsSeen[1].prior_findings.some((f) => f.what === "a"), "the initial full-review finding is carried into the cycle-1 re-grill");
  // cycle-2 carries the UNION (the cycle-1 re-grill's still-open finding too).
  assert.ok(grillArgsSeen[2].prior_findings.some((f) => f.what === "a"), "an unresolved full-review finding survives into the cycle-2 re-grill");
  assert.equal(result.grill_verdict, "pass", "final grill verdict reflects the resolved re-grill");
  // P1-2 (issue #706): a re-grill cycle pushed fix commits, so the head moved PAST the pre-loop
  // checksGreen/headSha snapshot. Even a resolved re-grill must NOT auto-merge on that stale snapshot;
  // it defers to changes-requested so the next pass re-runs the local gate + re-binds against the
  // fresh head (mirrors milestone-wave).
  assert.equal(result.verdict, "changes-requested", "re-grilled lane defers (stale snapshot), never auto-merges");
});

// issue #706 P2a/P2b: the re-grill loop is BOUNDED - a grill that stays issues-found is capped at
// max_regrill_cycles (3) and the PR is changes-requested, not looped forever.
test("pr-verify-merge re-grill loop is hard-capped at 3 cycles (#706 P2a)", async () => {
  const source = read("scripts/workflows/pr-verify-merge.workflow.js").replace(/^export const meta =/m, "const meta =");
  const head = "d".repeat(40);
  let grillCalls = 0;
  let fixCalls = 0;
  const agent = async (prompt, options) => {
    const label = String((options && options.label) || "");
    if (label === "ci-check") return { local_gate_exit: 0, checks: [] };
    if (label === "local-review-signal") return { verdict: "clean", blocking: false, findings: [] };
    if (label === "thread-check") return { unresolved: 0, needs_human: 0 };
    if (label.startsWith("regrill-fix:")) { fixCalls += 1; return { status: "done" }; }
    throw new Error(`unexpected agent call ${label}`);
  };
  const workflow = async ({ scriptPath }, wfArgs) => {
    const p = String(scriptPath);
    if (p.includes("lens-review")) return { lens: wfArgs.lens, verdict: "pass", findings: [] };
    if (p.includes("opposite-harness-grill")) { grillCalls += 1; return { verdict: "issues-found", issues: [{ severity: "high", what: "persistent" }], report_path: "/g/r.md", grill: "opposite-harness", verified_sha: head }; }
    if (p.includes("gh-pr-gate-snapshot")) return { head_sha: head, minutes_since_last_push: 12, blocked_by_external: false, error: "" };
    throw new Error(`unexpected workflow call ${p}`);
  };
  const parallel = (thunks) => Promise.all(thunks.map((thunk) => thunk()));
  const runner = new Function("args", "agent", "workflow", "parallel", "phase", "log",
    `return (async () => {\n${source}\n})()`);
  const result = await runner({ pr: "owner/repo#7" }, agent, workflow, parallel, () => {}, () => {});
  assert.equal(grillCalls, 4, "initial grill + exactly 3 re-grills (3-cycle cap), never unbounded");
  assert.equal(fixCalls, 3, "exactly 3 fix-worker dispatches");
  assert.equal(result.verdict, "changes-requested", "persistent issues-found => changes-requested, not infinite loop");
});

// P1-2 (issue #706 grill BLOCK regression): after a re-grill cycle pushed a fix, the pre-loop
// checksGreen + head snapshot are STALE (read before the fix worker committed). A re-grilled lane
// must NOT auto-merge on that stale-green snapshot - it defers to changes-requested so the next pass
// re-runs the local gate against the fresh head. Drives the REAL pr-verify-merge body; carries a
// MUTANT that strips the guard and reaches merge-ok on the stale snapshot.
test("pr-verify-merge defers a re-grilled lane instead of merging the stale gate snapshot (#706 P1-2)", async () => {
  const head = "e".repeat(40);
  const runWith = async (sourceOverride) => {
    const source = (sourceOverride || read("scripts/workflows/pr-verify-merge.workflow.js")).replace(/^export const meta =/m, "const meta =");
    // initial grill issues-found (fires one re-grill), re-grill PASS - the gate would be merge-ok
    // were it not for the stale-snapshot guard. The pre-loop ci-check is GREEN throughout.
    const grillSeq = [
      { verdict: "issues-found", issues: [{ severity: "high", what: "a" }], report_path: "/g/r.md", grill: "opposite-harness", verified_sha: head, unresolved_findings: [] },
      { verdict: "pass", issues: [], report_path: "/g/r.md", grill: "opposite-harness", verified_sha: head, unresolved_findings: [] },
    ];
    const agent = async (prompt, options) => {
      const label = String((options && options.label) || "");
      if (label === "ci-check") return { local_gate_exit: 0, checks: [] };
      if (label === "local-review-signal") return { verdict: "clean", blocking: false, findings: [] };
      if (label === "thread-check") return { unresolved: 0, needs_human: 0 };
      if (label.startsWith("regrill-fix:")) return { status: "done" };
      if (label === "merge") return { merged: true };
      if (label === "strip-state-labels") return { stripped: [] };
      if (label === "advance-board-status") return { advanced: [] };
      if (label === "clear-notif") return { cleared: true };
      if (label === "default-branch-readiness") return { readiness: "clean" };
      throw new Error(`unexpected agent call ${label}`);
    };
    const workflow = async ({ scriptPath }, wfArgs) => {
      const p = String(scriptPath);
      if (p.includes("lens-review")) return { lens: wfArgs.lens, verdict: "pass", findings: [] };
      if (p.includes("opposite-harness-grill")) return grillSeq.shift();
      if (p.includes("gh-pr-gate-snapshot")) return { head_sha: head, minutes_since_last_push: 12, blocked_by_external: false, error: "" };
      throw new Error(`unexpected workflow call ${p}`);
    };
    const parallel = (thunks) => Promise.all(thunks.map((thunk) => thunk()));
    const runner = new Function("args", "agent", "workflow", "parallel", "phase", "log",
      `return (async () => {\n${source}\n})()`);
    return runner({ pr: "owner/repo#7", auto_merge: true }, agent, workflow, parallel, () => {}, () => {});
  };

  // Real body: the resolved re-grill still defers (stale snapshot), and does NOT merge.
  const real = await runWith();
  assert.equal(real.grill_verdict, "pass", "re-grill resolved to pass");
  assert.equal(real.verdict, "changes-requested", "a re-grilled lane defers; never merges the stale snapshot");
  assert.equal(real.merged, false, "a fix commit that moved the head past the gate snapshot must NOT reach merge-ok");

  // MUTANT: strip the stale-snapshot guard while keeping the comment token; the mutant reaches
  // merge-ok and merges on the stale snapshot - exactly the regression this guard removes.
  const src = read("scripts/workflows/pr-verify-merge.workflow.js");
  const guardLine = 'if (regrillCycles > 0 && verdict === "merge-ok") verdict = "changes-requested";';
  assert.ok(src.includes(guardLine), "expected the canonical stale-snapshot guard");
  const mutant = src.replace(guardLine, '// regrillCycles > 0 && verdict === "merge-ok" => changes-requested (guard removed in mutant)');
  const mutantRun = await runWith(mutant);
  assert.equal(mutantRun.verdict, "merge-ok", "MUTANT: without the guard a re-grilled lane merges on the stale snapshot");
  assert.equal(mutantRun.merged, true, "MUTANT: the stale-snapshot merge slips through; the executed guard above is the real pin");
});

// issue #706 P3: the checked-in cross-submodule parity manifest reader is fail-closed (a missing or
// malformed committed manifest throws, never silently passes a parity gate) and its drift compare
// surfaces stale committed facts. Generalizes the service-producer-topics.json approach (#688).
test("parity manifest reader is fail-closed + drift-aware (#706 P3)", () => {
  const pm = require("./lib/parity-manifest.js");

  // Missing committed manifest => fail closed (the parity gate must not pass without it).
  assert.throws(() => pm.loadParityManifest("/no/such/manifest.json", { existsFn: () => false }), /committed manifest missing/);
  // Malformed JSON => fail closed.
  assert.throws(() => pm.loadParityManifest("/m.json", { existsFn: () => true, readFn: () => "{ not json" }), /not valid JSON/);
  // Non-object root => fail closed.
  assert.throws(() => pm.loadParityManifest("/m.json", { existsFn: () => true, readFn: () => "[1,2]" }), /root must be a JSON object/);

  const committed = {
    version: 1,
    generated_from: "gen:producer-topics",
    "audit-core-service": { topics: ["audit.created.v1", "audit.updated.v1"] },
    "calendar-core-service": { topics: ["calendar.event.v1"] },
  };
  const manifest = pm.loadParityManifest("/m.json", { existsFn: () => true, readFn: () => JSON.stringify(committed) });
  assert.deepEqual(Object.keys(pm.manifestEntries(manifest)), ["audit-core-service", "calendar-core-service"], "reserved metadata keys stripped");

  // No drift when the regenerated facts match (order-independent).
  const fresh = {
    "audit-core-service": { topics: ["audit.updated.v1", "audit.created.v1"] },
    "calendar-core-service": { topics: ["calendar.event.v1"] },
  };
  assert.equal(pm.parityDrift(committed, fresh).clean, true, "matching facts => no drift");

  // Drift / missing / extra each surface so a stale committed manifest fails the gate.
  const drifted = pm.parityDrift(committed, {
    "audit-core-service": { topics: ["audit.created.v1"] },
    "documents-core-service": { topics: ["doc.created.v1"] },
  });
  assert.deepEqual(drifted.drifted, ["audit-core-service"]);
  assert.deepEqual(drifted.missing, ["calendar-core-service"]);
  assert.deepEqual(drifted.extra, ["documents-core-service"]);
  assert.equal(drifted.clean, false);
});

// issue #706 P5c: the two-level submodule pointer-drift parser classifies `git submodule status
// --recursive` markers, and initSubmodulesRecursive composes init + the recursive recheck (gh
// runner injected so no real git runs).
test("submodule pointer-drift parser + init helper classify two-level status (#706 P5c)", () => {
  const wg = require("./lib/workflow-git.js");

  const drift = wg.parseSubmoduleDrift([
    " 1111111111111111111111111111111111111111 curaos/backend/services/audit-core-service (v1)",
    "+2222222222222222222222222222222222222222 curaos/backend/services/calendar-core-service (heads/main)",
    "-3333333333333333333333333333333333333333 curaos/backend/services/documents-core-service",
    "U4444444444444444444444444444444444444444 curaos/frontend/apps/admin (conflict)",
  ].join("\n"));
  assert.deepEqual(drift.drifted, ["curaos/backend/services/calendar-core-service"]);
  assert.deepEqual(drift.uninitialized, ["curaos/backend/services/documents-core-service"]);
  assert.deepEqual(drift.conflicted, ["curaos/frontend/apps/admin"]);
  assert.equal(drift.clean, false);

  // A submodule-less / fully-clean tree => clean true.
  assert.equal(wg.parseSubmoduleDrift("").clean, true);
  assert.equal(wg.parseSubmoduleDrift(" 5555555555555555555555555555555555555555 pkg/a (v2)").clean, true);

  // initSubmodulesRecursive composes init + recursive recheck via the injected git runner.
  const calls = [];
  const okInit = wg.initSubmodulesRecursive({ gitFn: (args) => {
    calls.push(args.join(" "));
    if (args[0] === "submodule" && args[1] === "update") return { ok: true, stdout: "" };
    if (args[0] === "submodule" && args[1] === "status") return { ok: true, stdout: " 6666666666666666666666666666666666666666 pkg/a (v1)" };
    return { ok: false, stdout: "", stderr: "unexpected" };
  } });
  assert.deepEqual(calls, ["submodule update --init --recursive --jobs 8", "submodule status --recursive"]);
  assert.equal(okInit.initialized, true);
  assert.equal(okInit.clean, true);

  const customCalls = [];
  wg.initSubmodulesRecursive({ submoduleJobs: 3, gitFn: (args) => {
    customCalls.push(args.join(" "));
    return { ok: true, stdout: "" };
  } });
  assert.deepEqual(customCalls, ["submodule update --init --recursive --jobs 3", "submodule status --recursive"]);

  // A failed init surfaces init_error but never throws.
  const badInit = wg.initSubmodulesRecursive({ gitFn: (args) => (args[1] === "update" ? { ok: false, stderr: "network down" } : { ok: true, stdout: "" }) });
  assert.equal(badInit.initialized, false);
  assert.match(badInit.init_error, /network down/);
});

// issue #706 P2a/P2b: the in-workflow delta re-grill fix-cycle loop is present + bounded in both
// merge paths, scopes the re-grill to the delta, and threads a per-cycle cache_bust (token pins;
// the loop body only fires on issues-found, which the existing stub harnesses never return).
test("in-workflow delta re-grill loop is bounded + delta-scoped in both merge paths (#706 P2a/P2b)", () => {
  const verify = read("scripts/workflows/pr-verify-merge.workflow.js");
  const wave = read("scripts/workflows/milestone-wave.workflow.js");
  for (const [name, src] of [["pr-verify-merge", verify], ["milestone-wave", wave]]) {
    assert.match(src, /Number\.isFinite\(cfg\.max_regrill_cycles\) \? Math\.max\(0, cfg\.max_regrill_cycles\) : 3/, `${name}: 3-cycle cap`);
    assert.match(src, /verdict === "issues-found" && regrillCycles < maxRegrillCycles/, `${name}: loop gated on issues-found + the cap`);
    assert.match(src, /regrillArgs\.diff_ref = `\$\{prevSha\}\.\.HEAD`/, `${name}: re-grill scoped to prev-sha..HEAD delta`);
    assert.match(src, /cache_bust: `regrill-cycle-\$\{regrillCycles\}`/, `${name}: per-cycle cache_bust`);
    assert.match(src, /regrill-fix:cycle\$\{regrillCycles\}/, `${name}: fix-worker dispatch per cycle`);
    // P1-3: BOTH paths pin a stable report_path (append, never fork) + carry prior_findings into the
    // re-grill so a clean delta cannot silently drop a prior full-review finding.
    assert.match(src, /const stableReportPath = /, `${name}: stable report path for the whole loop`);
    assert.match(src, /report_path: stableReportPath/, `${name}: re-grill reuses the stable report path`);
    assert.match(src, /prior_findings: carriedFindings\.slice\(0, 50\)/, `${name}: re-grill carries prior unresolved findings`);
    assert.match(src, /unresolved_findings/, `${name}: carries the grill's unresolved_findings forward`);
    // P1-2: BOTH paths defer a re-grilled lane (stale snapshot) instead of merging on the stale gate.
    assert.match(src, /if \(regrillCycles > 0 && verdict === "merge-ok"\) verdict = "changes-requested"/, `${name}: stale-snapshot defer`);
  }
});

// issue #706 P4a: the wave ci-check leg + over-claim re-run are affected-scoped (Turbo affected +
// remote cache) and the executor makes ZERO ci-local.sh edits (Track A owns that wiring).
test("milestone wave ci-check is affected-scoped and leaves ci-local.sh to Track A (#706 P4a)", () => {
  const wave = read("scripts/workflows/milestone-wave.workflow.js");
  assert.match(wave, /AFFECTED-SCOPED with remote-cache reuse \(P4a\)/);
  assert.match(wave, /just ci-affected/);
  assert.match(wave, /Track A owns its ci-local\.sh wiring/);
});

// issue #706: the verification-stack rule codifies the 3-cycle re-grill cap + delta-scoping +
// the committed parity-manifest convention as BINDING (not prose-only).
test("verification-stack rule codifies the re-grill cap + parity manifest as binding (#706)", () => {
  const rule = read("ai/rules/curaos_verification_stack_rule.md");
  assert.match(rule, /In-workflow delta re-grill cap \+ delta-scoping \(BINDING, issue #706\)/);
  assert.match(rule, /max_regrill_cycles/);
  assert.match(rule, /diff_ref = "<prev-grill-sha>\.\.HEAD"/);
  assert.match(rule, /Exhaustive-first first grill \(BINDING\)/);
  assert.match(rule, /Cross-submodule parity via a committed manifest \(BINDING, issue #706 P3\)/);
  assert.match(rule, /scripts\/lib\/parity-manifest\.js loadParityManifest\(\)/);
});

// workflow-defect #508: every executor must open with `export const meta` (a pure literal) so it loads in
// BOTH Claude's native Workflow() tool AND the agent-workflow-kit runtime. The Workflow() tool rejects any
// require/process/setup statement before meta with "meta must be the FIRST statement". This is the in-suite
// regression guard mirroring scripts/check-workflow-portability.js.
function firstWorkflowStatement(source) {
  let i = 0;
  const n = source.length;
  while (i < n) {
    while (i < n && /\s/.test(source[i])) i += 1;
    if (i >= n) break;
    if (source[i] === "/" && source[i + 1] === "/") {
      while (i < n && source[i] !== "\n") i += 1;
      continue;
    }
    if (source[i] === "/" && source[i + 1] === "*") {
      i += 2;
      while (i < n && !(source[i] === "*" && source[i + 1] === "/")) i += 1;
      i += 2;
      continue;
    }
    break;
  }
  return source.slice(i, i + 60);
}

test("every workflow executor is meta-first (#508 portability regression guard)", () => {
  const dir = path.join(root, "scripts", "workflows");
  const files = fs.readdirSync(dir).filter((name) => name.endsWith(".workflow.js"));
  assert.ok(files.length > 0, "expected at least one *.workflow.js executor");
  for (const file of files) {
    const source = fs.readFileSync(path.join(dir, file), "utf8");
    const head = firstWorkflowStatement(source);
    assert.match(
      head,
      /^export const meta\s*=/,
      `${file}: \`export const meta = {…}\` must be the FIRST statement (Claude Workflow() rejects meta-not-first); found "${head.split("\n")[0]}"`,
    );
  }
});

// workflow-defect #508 (workflow-defect follow-up): the meta-first guard must require a PURE object literal RHS.
// `export const meta = buildMeta()` (or any call/identifier/expression) defeats the loader contract because
// Claude's Workflow() tool reads meta as a static literal; a call would also ReferenceError at load if it
// touched process/require. metaFirstProblem is the canonical predicate (scripts/lib/meta-first-guard.js)
// shared with scripts/check-workflow-portability.js, so this test fails if the predicate regresses to
// accept a non-literal RHS.
const { metaFirstProblem } = require("./lib/meta-first-guard.js");

test("meta-first guard rejects a non-literal meta RHS and accepts an object literal (#508 RHS-literal)", () => {
  const portability = read("scripts/check-workflow-portability.js");
  // The CI gate consumes the same shared predicate and keeps the RHS-literal error message.
  assert.match(portability, /require\("\.\/lib\/meta-first-guard\.js"\)/);
  assert.match(portability, /metaProblem === "meta-rhs-not-literal"/);
  assert.match(portability, /must be a pure object literal starting with/);

  // ACCEPTED: meta is first and its RHS is a pure object literal.
  assert.equal(metaFirstProblem("export const meta = {\n  name: \"x\",\n};\nexport default async function () {}\n"), "");
  // REJECTED: meta RHS is a call expression (the #508 follow-up case).
  assert.equal(metaFirstProblem("export const meta = buildMeta();\nexport default async function () {}\n"), "meta-rhs-not-literal");
  // REJECTED: meta RHS is a bare identifier (e.g. an alias to CONTRACT).
  assert.equal(metaFirstProblem("export const meta = CONTRACT;\nexport default async function () {}\n"), "meta-rhs-not-literal");
  // REJECTED: a require/setup statement runs before meta.
  assert.equal(metaFirstProblem("const x = require(\"fs\");\nexport const meta = {};\n"), "meta-not-first");
  // Leading line/block comments + blank lines are skipped before the first code statement.
  assert.equal(metaFirstProblem("// header\n/* block */\n\nexport const meta = { name: \"y\" };\n"), "");
  assert.equal(metaFirstProblem("// header\nexport const meta = buildMeta();\n"), "meta-rhs-not-literal");
});

// workflow-defect #508 (workflow-defect follow-up): lazy `createRequire(`${process.cwd()}/...`)` ties module
// resolution to the caller's working directory, so `localRequire("../lib/...")` fails MODULE_NOT_FOUND when
// the workflow runs from a non-repo-root cwd. Every executor must resolve module-relative via
// createRequire(import.meta.url). The portability gate enforces this.
test("no workflow executor ties lazy require to process.cwd() (#508 module-relative require)", () => {
  const portability = read("scripts/check-workflow-portability.js");
  // The gate carries the cwd-tied guard regex and recommends the module-relative form.
  assert.ok(portability.includes("createRequire\\(\\s*`\\$\\{process\\.cwd\\(\\)\\}"));
  assert.ok(portability.includes("createRequire(import.meta.url)"));

  const dir = path.join(root, "scripts", "workflows");
  const files = fs.readdirSync(dir).filter((name) => name.endsWith(".workflow.js"));
  for (const file of files) {
    const source = fs.readFileSync(path.join(dir, file), "utf8");
    assert.doesNotMatch(
      source,
      /createRequire\(\s*`\$\{process\.cwd\(\)\}/,
      `${file}: lazy require must use createRequire(import.meta.url), not createRequire(\`\${process.cwd()}/…\`)`,
    );
  }
});

// RP-03 (#202 incident class): grill verdicts bind to the exact commit they reviewed; both merge
// paths (pr-verify-merge gate + milestone-wave inline verify leg) fail closed on a missing or
// mismatched verified_sha vs the PR's current REST /pulls/N head.sha.
async function runPrVerifyMerge({ grillResult, headSha, reviewProbe, ciCheck, localReview, sourceOverride, workflowCalls }) {
  // sourceOverride (RP-34): lets the mutation-demonstration fixtures run a behavior-stripped
  // MUTANT of the real executor body through the identical stub harness.
  const source = (sourceOverride !== undefined ? sourceOverride : read("scripts/workflows/pr-verify-merge.workflow.js")).replace(/^export const meta =/m, "const meta =");
  const reviewValue = reviewProbe || { head_sha: headSha || "a".repeat(40), minutes_since_last_push: 12, blocked_by_external: false, error: "" };
  let snapshotArgs = null;
  const agent = async (prompt, options) => {
    switch (options && options.label) {
      case "ci-check": return ciCheck !== undefined ? ciCheck : { local_gate_exit: 0, checks: [] };
      case "local-review-signal": return localReview !== undefined ? localReview : { verdict: "clean", blocking: false, findings: [] };
      case "thread-check": return { unresolved: 0, needs_human: 0 };
      default: throw new Error(`unexpected agent call ${options && options.label}`);
    }
  };
  const workflow = async ({ scriptPath }, wfArgs) => {
    if (workflowCalls) workflowCalls.push(String(scriptPath));
    if (String(scriptPath).includes("lens-review")) return { lens: wfArgs.lens, verdict: "pass", findings: [] };
    if (String(scriptPath).includes("opposite-harness-grill")) return grillResult;
    if (String(scriptPath).includes("gh-pr-gate-snapshot")) {
      snapshotArgs = wfArgs;
      if (reviewValue instanceof Error) throw reviewValue;
      return { head_sha: headSha, ...reviewValue };
    }
    throw new Error(`unexpected workflow call ${scriptPath}`);
  };
  const parallel = (thunks) => Promise.all(thunks.map((thunk) => thunk()));
  const runner = new Function(
    "args",
    "agent",
    "workflow",
    "parallel",
    "phase",
    "log",
    `return (async () => {\n${source}\n})()`,
  );
  const result = await runner({ pr: "owner/repo#7" }, agent, workflow, parallel, () => {}, () => {});
  return { ...result, __snapshotArgs: snapshotArgs };
}

test("merge gates bind grill verdicts to the reviewed commit sha (RP-03)", async () => {
  const grill = read("scripts/workflows/opposite-harness-grill.workflow.js");
  const verify = read("scripts/workflows/pr-verify-merge.workflow.js");
  const wave = read("scripts/workflows/milestone-wave.workflow.js");
  const grillPlaybook = read("docs/agents/workflows/opposite-harness-grill.md");
  const verifyPlaybook = read("docs/agents/workflows/pr-verify-merge.md");
  const wavePlaybook = read("docs/agents/workflows/milestone-wave.md");

  // The grill agent schema + CONTRACT outputs REQUIRE verified_sha, and the report carries the line.
  assert.match(grill, /required: \["verdict", "issues", "report_path", "verified_sha"\]/);
  assert.match(grill, /verified_sha: \{ type: "string" \}/);
  assert.match(grill, /verified_sha: \{ type: "string", description: "the git head commit SHA the grill actually reviewed/);
  assert.match(grill, /GRILL-VERIFIED-SHA/);
  assert.match(grill, /function normalizedVerifiedSha/);
  assert.match(grillPlaybook, /verified_sha/);
  assert.match(grillPlaybook, /GRILL-VERIFIED-SHA/);
  assert.match(verifyPlaybook, /Grill-SHA binding gate/);
  assert.match(wavePlaybook, /grill-SHA binding gate/);

  // Both merge paths run the IDENTICAL fail-closed check: the lib owns it (RP-20), the wave imports
  // it directly, and pr-verify-merge's inline copy (its Claude-style body runs under new Function,
  // no require/import.meta) is pinned byte-identical to the lib.
  const mergeHygiene = read("scripts/lib/merge-hygiene.js");
  const mismatchSource = extractFunction(verify, "grillShaMismatch");
  assert.equal(mismatchSource, extractFunction(mergeHygiene, "grillShaMismatch"));
  assert.match(wave, /localRequire\("\.\.\/lib\/merge-hygiene\.js"\)/);
  assert.doesNotMatch(wave, /function grillShaMismatch/);
  const { grillShaMismatch } = new Function(`${mismatchSource}\nreturn { grillShaMismatch };`)();
  const sha = "a".repeat(40);
  assert.equal(grillShaMismatch({ verified_sha: sha }, sha), false);
  assert.equal(grillShaMismatch({ verified_sha: sha }, "b".repeat(40)), true); // stale grill blocks
  assert.equal(grillShaMismatch({}, sha), true); // missing verified_sha fails closed
  assert.equal(grillShaMismatch({ verified_sha: sha }, ""), true); // unresolved head fails closed
  assert.equal(grillShaMismatch({ verified_sha: "not-a-sha" }, sha), true); // malformed fails closed

  // Both paths block on grillShaBlocked and use deterministic current-head facts.
  assert.match(verify, /\|\| grillShaBlocked/);
  assert.match(verify, /gh-pr-gate-snapshot\.workflow\.js/);
  assert.match(verify, /Do not run generated-file writers before the gate/);
  assert.doesNotMatch(verify, /check-doc-graph\.js --write/);
  assert.match(verify, /const headProbe = \{ head_sha: prGateSnapshot\.head_sha \|\| "" \}/);
  assert.match(wave, /\|\| grillShaBlocked/);
  assert.match(wave, /gh-pr-gate-snapshot\.workflow\.js/);

  // End-to-end through the real pr-verify-merge body: mismatch blocks, missing blocks, match passes.
  const head = "c".repeat(40);
  const cleanGrill = { verdict: "pass", issues: [], report_path: "/g/report.md", grill: "opposite-harness" };

  const stale = await runPrVerifyMerge({ grillResult: { ...cleanGrill, verified_sha: "d".repeat(40) }, headSha: head });
  assert.equal(stale.verdict, "block");
  assert.ok(stale.blocking_findings.some((f) => f.source === "grill-sha-gate"));

  const missing = await runPrVerifyMerge({ grillResult: { ...cleanGrill }, headSha: head });
  assert.equal(missing.verdict, "block");
  assert.ok(missing.blocking_findings.some((f) => f.source === "grill-sha-gate"));

  const fresh = await runPrVerifyMerge({ grillResult: { ...cleanGrill, verified_sha: head }, headSha: head });
  assert.equal(fresh.verdict, "merge-ok");
  assert.ok(!fresh.blocking_findings.some((f) => f.source === "grill-sha-gate"));

  const workflowCalls = [];
  const redCi = await runPrVerifyMerge({
    grillResult: { ...cleanGrill, verified_sha: head },
    headSha: head,
    ciCheck: { local_gate_exit: 1, checks: [] },
    workflowCalls,
  });
  assert.equal(redCi.verdict, "block");
  assert.ok(
    !workflowCalls.some((scriptPath) => scriptPath.includes("lens-review") || scriptPath.includes("opposite-harness-grill")),
    "red local gate must skip expensive lens and grill workflows",
  );
});

test("pr-verify has no paid review or advisory review contract surface", () => {
  const source = read("scripts/workflows/pr-verify-merge.workflow.js");
  const removedPrSurface = new RegExp([
    "Code" + "Rabbit",
    "code" + "rabbit",
    "code" + "rabbit_verdict",
    "advisory" + "_review_observed",
    "head" + "_review_present",
    "wait" + "_until_settled",
    "settle" + "_timeout_minutes",
    "review" + "-settled",
    "review" + "_settled",
  ].join("|"));
  assert.doesNotMatch(source, removedPrSurface);
  assert.match(source, /local deterministic review signal/);
});

test("pr-verify blocks high local review signal before expensive review legs", async () => {
  const head = "f".repeat(40);
  const workflowCalls = [];
  const result = await runPrVerifyMerge({
    grillResult: { verdict: "pass", report_path: "/g/report.md", grill: "opposite-harness", verified_sha: head },
    headSha: head,
    localReview: {
      verdict: "block",
      blocking: true,
      findings: [{ source: "semgrep", severity: "high", path: "src/app.ts", line: 42, message: "unsafe request handling" }],
    },
    workflowCalls,
  });

  assert.equal(result.verdict, "block");
  assert.ok(result.blocking_findings.some((f) => f.source === "local-review-signal"));
  assert.ok(
    !workflowCalls.some((scriptPath) => scriptPath.includes("lens-review") || scriptPath.includes("opposite-harness-grill")),
    "local review block must skip expensive lens and grill workflows",
  );
});

// RP-20: shared phase bodies are single-owned in scripts/lib (the KEEP-IN-SYNC inline-copy drift
// class). The merge+hygiene leg's deterministic core (ghPrCommand / isBlockedHarnessUnavailable /
// grillShaMismatch) lives in scripts/lib/merge-hygiene.js: milestone-wave imports it directly
// (lazy createRequire); pr-verify-merge's inline copies (its Claude-style body runs under
// `new Function`, no require/import.meta) are pinned byte-identical here. pickImplementModel's
// canonical copy is scripts/lib/model-tier.js; the sandboxed executors carry inline copies whose
// BEHAVIOR is pinned against the lib across a tier fixture battery + the null guard.
test("shared phase helpers live once in scripts/lib and inline copies stay pinned (RP-20)", () => {
  const verify = read("scripts/workflows/pr-verify-merge.workflow.js");
  const wave = read("scripts/workflows/milestone-wave.workflow.js");
  const mergeHygiene = read("scripts/lib/merge-hygiene.js");

  for (const name of ["ghPrCommand", "isBlockedHarnessUnavailable", "grillShaMismatch"]) {
    assert.equal(extractFunction(verify, name), extractFunction(mergeHygiene, name));
    assert.doesNotMatch(wave, new RegExp(`function ${name}\\b`));
  }
  assert.match(wave, /localRequire\("\.\.\/lib\/merge-hygiene\.js"\)/);
  assert.match(wave, /localRequire\("\.\.\/lib\/triage-status\.js"\)/);

  // Behavior executed against the canonical lib (the same object the wave imports).
  const hygiene = require("./lib/merge-hygiene.js");
  assert.equal(hygiene.ghPrCommand("view", "owner/repo#7"), "gh pr view 7 --repo owner/repo");
  assert.equal(hygiene.ghPrCommand("checks", "12"), "gh pr checks 12");
  assert.throws(() => hygiene.ghPrCommand("merge", "no PR opened"), /invalid PR ref/); // injection-guard fails closed
  assert.equal(hygiene.isBlockedHarnessUnavailable({ grill: "blocked-harness-unavailable" }), true);
  assert.equal(hygiene.isBlockedHarnessUnavailable({ verdict: "skipped-harness-unavailable" }), true);
  assert.equal(hygiene.isBlockedHarnessUnavailable({ verdict: "pass" }), false);
  assert.equal(hygiene.isBlockedHarnessUnavailable(null), false);

  // pickImplementModel: the canonical lib copy carries the null guard + the opus-bias tiers.
  const modelTier = require("./lib/model-tier.js");
  const tierFixtures = [
    [null, "", "opus"], // null guard: a missing spec yields the opus default, never a throw
    [{}, "", "opus"],
    [{ effort: "S", owned_paths: ["a"], adr_refs: [], acceptance: ["apply X"] }, "", "sonnet"],
    [{ effort: "S", owned_paths: ["a"], adr_refs: [], acceptance: ["fix typo"] }, "rename only", "haiku"],
    [{ effort: "XL", owned_paths: ["a", "b"], adr_refs: ["ADR-0001"], acceptance: ["design it"] }, "", "opus"],
    [{ effort: "M", owned_paths: ["a", "b"], adr_refs: [], acceptance: ["build"] }, "", "opus"],
  ];
  for (const [spec, hint, want] of tierFixtures) {
    assert.equal(modelTier.pickImplementModel(spec, hint), want, `lib pickImplementModel(${JSON.stringify(spec)})`);
  }

  // The sandboxed executors (require() forbidden in their dual-runtime bodies) keep inline copies
  // that must BEHAVE identically to the lib across the battery; all copies carry the null guard
  // (RP-20: tdd-implement's missing guard was the drift; the null fixture now executes against
  // every inline copy, closing the "null guard present in all paths" acceptance).
  const contextLoad = read("scripts/workflows/context-load.workflow.js");
  const tdd = read("scripts/workflows/tdd-implement.workflow.js");
  const contextPick = new Function(`${extractFunction(contextLoad, "pickImplementModel")}\nreturn pickImplementModel;`)();
  const tddPick = new Function(`${extractFunction(tdd, "pickImplementModel")}\nreturn pickImplementModel;`)();
  for (const [spec, hint, want] of tierFixtures) {
    assert.equal(contextPick(spec, hint), want, `context-load pickImplementModel(${JSON.stringify(spec)})`);
    assert.equal(tddPick(spec, hint), want, `tdd-implement pickImplementModel(${JSON.stringify(spec)})`);
  }
});

// RP-48 pre-breakdown trigger: an Epic/Story whose LAST blocked-by closes (dependency_cleared)
// but which triage did NOT promote into the active ready set gets its story set DRAFTED now and
// filed through foresight-capture as staged foresight Backlog at birth. Later §3.4 triage promotes
// relevant, complete, unblocked children. Sized from the calibration throughput
// signal (RP-47 sizing).
test("milestone wave drafts story sets for just-unblocked unpromoted Epics as staged foresight (RP-48)", () => {
  const wave = read("scripts/workflows/milestone-wave.workflow.js");
  const playbook = read("docs/agents/workflows/milestone-wave.md");

  // Fixture: the Epic whose last blocker closed (dependency_cleared) and was NOT promoted to ready
  // enters the draft set; promoted/ready issues never do (no double-drafting of active work).
  const helpers = new Function(
    `${extractFunction(wave, "clearedUnpromotedRefs")}\n${extractFunction(wave, "draftCapFromSizing")}\nreturn { clearedUnpromotedRefs, draftCapFromSizing };`,
  )();
  assert.deepEqual(
    helpers.clearedUnpromotedRefs(["org/repo#372", "org/repo#545"], ["org/repo#545"]),
    ["org/repo#372"], // the unblocked-but-unpromoted Epic is drafted; the promoted one is not
  );
  assert.deepEqual(helpers.clearedUnpromotedRefs([], []), []);
  assert.deepEqual(helpers.clearedUnpromotedRefs(["org/repo#1"], ["org/repo#1"]), []);
  assert.deepEqual(helpers.clearedUnpromotedRefs([null, "", "org/repo#2"], []), ["org/repo#2"]);
  // Throughput sizing (RP-47): suggestedWaveSize caps the per-pass draft fan-out; missing/zero
  // sizing degrades to the fixed fallback (advisory, never fails the wave).
  assert.equal(helpers.draftCapFromSizing({ suggestedWaveSize: 3 }, 8), 3);
  assert.equal(helpers.draftCapFromSizing(null, 8), 8);
  assert.equal(helpers.draftCapFromSizing({ suggestedWaveSize: 0 }, 8), 8);
  assert.equal(helpers.draftCapFromSizing({ suggestedWaveSize: Number.NaN }, 8), 8);

  // The drafted story set routes through foresight-capture (the sanctioned staging pipeline:
  // foresight label plus Project Status Backlog at birth); capture itself never feeds dispatch lanes.
  assert.match(wave, /const clearedUnpromoted = clearedUnpromotedRefs\(scan\.dependency_cleared, \[\.\.\.readyLeaves, \.\.\.\(triaged\.ready \|\| \[\]\)\]\)/);
  assert.match(wave, /label: `pre-breakdown:\$\{ref\}`/);
  assert.match(wave, /READ-ONLY - create NOTHING, label NOTHING/);
  const preBreakdownBlock = wave.slice(wave.indexOf("// Phase 3.5: PRE-BREAKDOWN TRIGGER"), wave.indexOf("// Phase 4: PRIORITIZE"));
  assert.ok(preBreakdownBlock.length > 0, "pre-breakdown block sits before the Prioritize phase");
  assert.match(preBreakdownBlock, /foresight-capture\.workflow\.js/);
  assert.match(preBreakdownBlock, /kind: "prereq"/);
  assert.match(preBreakdownBlock, /dry_run: dryRun/);
  // Quarantine invariants: the trigger mutates no labels itself (foresight-capture owns the staging
  // labels) and never feeds the dispatch lanes or the ready set.
  assert.doesNotMatch(preBreakdownBlock, /--add-label|--remove-label|set the issue label/);
  assert.doesNotMatch(preBreakdownBlock, /partition\.lanes/);
  assert.doesNotMatch(preBreakdownBlock, /readyLeaves\.push/);
  assert.match(wave, /pre_breakdown: preBreakdown/);
  assert.match(wave, /loadCalibration\(\)\.analyze\(\)\.sizing/);
  assert.match(playbook, /Pre-breakdown trigger \(RP-48\)/);
  assert.match(playbook, /suggestedWaveSize/);
});

// RP-49: every prioritize run writes the wave-plan.json artifact with the three planning surfaces
// (lane assignments, critical path, velocity-sized scope). Advisory only: the version working-set
// predicate stays the closure gate (curaos_version_planning_rule); the plan never gates closure.
test("wave prioritize writes the wave-plan.json artifact with the three planning fields (RP-49)", (t) => {
  const prioritize = read("scripts/workflows/wave-prioritize.workflow.js");
  const playbook = read("docs/agents/workflows/wave-prioritize.md");

  // Schema executed from the pure builder.
  const { buildWavePlan } = new Function(
    `${extractFunction(prioritize, "buildWavePlan")}\nreturn { buildWavePlan };`,
  )();
  const ranked = [
    { issue: "org/a#1", score: 0.9, unblockReach: 4, criticalPathDepth: 2 },
    { issue: "org/b#2", score: 0.7, unblockReach: 1, criticalPathDepth: 3 },
    { issue: "org/c#3", score: 0.5, unblockReach: 0, criticalPathDepth: 0 },
  ];
  const lanes = [
    { issue: "org/a#1", score: 0.9, owned_root: "curaos/backend/services/a" },
    { issue: "org/b#2", score: 0.7, owned_root: "curaos/backend/services/b" },
    { issue: "org/c#3", score: 0.5, owned_root: "workspace" },
  ];
  const plan = buildWavePlan(ranked, lanes, "M11", { suggestedWaveSize: 2 }, "2026-06-10T00:00:00Z");
  assert.equal(plan.schemaVersion, 1);
  assert.equal(plan.milestone, "M11");
  // Field 1: lane assignments.
  assert.deepEqual(plan.lanes, lanes);
  // Field 2: critical path, deepest-first, depth-0 rows omitted (no chain).
  assert.deepEqual(plan.critical_path.map((r) => r.issue), ["org/b#2", "org/a#1"]);
  // Field 3: velocity-sized scope from the calibration sizing signal.
  assert.deepEqual(plan.velocity_sized_scope, { suggestedWaveSize: 2, source: "calibration", scope: ["org/a#1", "org/b#2"] });
  // No sizing signal (<3 complete waves): all lanes, fallback source.
  const fallbackPlan = buildWavePlan(ranked, lanes, "unknown", null, "2026-06-10T00:00:00Z");
  assert.deepEqual(fallbackPlan.velocity_sized_scope, { suggestedWaveSize: null, source: "fallback-all-lanes", scope: ["org/a#1", "org/b#2", "org/c#3"] });

  // The write path executes for real (relative to cwd) and round-trips the schema.
  const writeHelpers = new Function(
    "process",
    "console",
    `const WAVE_PLAN_PATH = ".scratch/workflow-cache/wave-plan.json";\n${extractFunction(prioritize, "writeWavePlan")}\nreturn { writeWavePlan };`,
  )(process, console);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "curaos-wave-plan-"));
  const originalCwd = process.cwd();
  t.after(() => {
    process.chdir(originalCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
  process.chdir(tmpDir);
  const written = writeHelpers.writeWavePlan(plan);
  assert.equal(written, ".scratch/workflow-cache/wave-plan.json");
  const roundTrip = JSON.parse(fs.readFileSync(path.join(tmpDir, written), "utf8"));
  assert.deepEqual(roundTrip, plan);
  process.chdir(originalCwd);

  // Executor + playbook carry the artifact contract; the output surface names the path.
  assert.match(prioritize, /const wavePlanPath = writeWavePlan\(buildWavePlan\(ranked, lanes, milestoneLabel, sizing, new Date\(\)\.toISOString\(\)\)\)/);
  assert.match(prioritize, /calibrationLogged, wavePlanPath \};/);
  assert.match(prioritize, /wavePlanPath: \{ type: "string"/);
  assert.match(playbook, /wave-plan\.json artifact \(RP-49/);
  assert.match(playbook, /velocity_sized_scope/);
  assert.match(playbook, /version working-set predicate stays the closure gate/);
});

// RP-32: the deterministic scan resolves the Project by TITLE (no hardcoded board number),
// in lockstep with lib/gh-project.js PROJECT_TITLE; resolution fails closed on 0 or >1 match.
// (Queued by the RP-32 lane; applied with a plain optional ghJsonImpl param because the harness
// extractFunction brace-matches from the first "{" and cannot extract destructured params.)
test("active scan resolves the roadmap project by title, fail-closed (RP-32)", () => {
  const scan = read("scripts/workflows/milestone-active-scan.workflow.js");
  const lib = read("scripts/lib/gh-project.js");

  assert.doesNotMatch(scan, /PROJECT_NUMBER\s*=\s*"\d+"/);
  const scanTitle = scan.match(/const PROJECT_TITLE = "([^"]+)"/);
  const libTitle = lib.match(/const PROJECT_TITLE = "([^"]+)"/);
  assert.ok(scanTitle && libTitle, "both scan and lib declare PROJECT_TITLE");
  assert.equal(scanTitle[1], libTitle[1]);

  // NOTE: `let _projectNumber;` is declared at module level in the executor (memo), so the
  // harness re-declares it alongside the extracted function.
  const resolver = new Function(
    `const PROJECT_TITLE = ${JSON.stringify(scanTitle[1])};\n const OWNER = "your-org";\n const ghJson = () => { throw new Error("default ghJson must not be reached in this test"); };\n let _projectNumber;\n${extractFunction(scan, "resolveProjectNumber")}\nreturn resolveProjectNumber;`,
  )();
  const board = { projects: [
    { title: "CuraOS Roadmap", number: 2, closed: false },
    { title: "CuraOS Roadmap", number: 1, closed: true },
    { title: "Other", number: 9, closed: false },
  ] };
  assert.equal(resolver(() => board), "2");
  // memoized: second call issues zero gh calls
  assert.equal(resolver(() => { throw new Error("must not re-list"); }), "2");
  assert.throws(
    () => new Function(
      `const PROJECT_TITLE = "CuraOS Roadmap";\n const OWNER = "x";\n const ghJson = () => ({ projects: [] });\n let _projectNumber;\n${extractFunction(scan, "resolveProjectNumber")}\nreturn resolveProjectNumber;`,
    )()(),
    /resolution failed: 0 open projects/,
  );
});

// RP-04: the wave consumes the deterministic scan's generator_inflight flag and deterministically
// holds generated-scope candidates out of dispatch lanes; the prompt probe is server-side paginated
// and fail-closed on truncation.
test("milestone wave enforces the in-flight generator barrier on dispatch lanes (RP-04)", () => {
  const wave = read("scripts/workflows/milestone-wave.workflow.js");
  const scan = read("scripts/workflows/milestone-active-scan.workflow.js");
  const playbook = read("docs/agents/workflows/milestone-wave.md");
  const prompt = read("docs/agents/milestone-orchestration-prompt.md");

  // The scope test is the scan's own (extractFunction equality keeps the two in lockstep).
  assert.equal(extractFunction(wave, "isGeneratorScope"), extractFunction(scan, "isGeneratorScope"));

  const helpers = new Function(
    `${extractFunction(wave, "isGeneratorScope")}\n${extractFunction(wave, "applyGeneratorBarrier")}\nreturn { isGeneratorScope, applyGeneratorBarrier };`,
  )();
  const barrier = helpers.applyGeneratorBarrier(
    ["org/curaos-ai-workspace#618", "org/curaos-website#3", "org/auth-sdk#9"],
    "org/curaos-ai-workspace#604",
    (issue) => (issue.endsWith("#618") ? "codegen Dockerfile trio templates" : ""),
  );
  // No generated-scope candidate reaches dispatch; held entries carry the binding reason.
  assert.deepEqual(barrier.dispatchable, ["org/curaos-website#3"]);
  assert.deepEqual(barrier.held, [
    { issue: "org/curaos-ai-workspace#618", reason: "gen-evo barrier: org/curaos-ai-workspace#604 in-flight" },
    { issue: "org/auth-sdk#9", reason: "gen-evo barrier: org/curaos-ai-workspace#604 in-flight" },
  ]);
  // No barrier flag = pass-through (nothing held).
  const open = helpers.applyGeneratorBarrier(["org/auth-sdk#9"], "", () => "");
  assert.deepEqual(open.dispatchable, ["org/auth-sdk#9"]);
  assert.deepEqual(open.held, []);

  // The wave threads scan.generator_inflight into the filter BEFORE prioritize and merges held lanes.
  assert.match(wave, /scan\.generator_inflight = deterministicActiveScan && deterministicActiveScan\.generator_inflight/);
  assert.match(wave, /applyGeneratorBarrier\(readyLeaves, scan\.generator_inflight/);
  assert.match(wave, /readyLeaves = generatorBarrier\.dispatchable/);
  assert.match(wave, /held: \[\.\.\.generatorBarrier\.held/);
  // The false "already bound upstream" comment is gone: the barrier is enforced here.
  assert.doesNotMatch(wave, /every gate already bound upstream/);
  assert.match(wave, /gen-evo barrier is NOT bound upstream of this point/);
  assert.match(playbook, /gen-evo barrier: <ref> in-flight/);
  assert.doesNotMatch(playbook, /generator-evolution barrier, ADR\/spec acceptance\) already bound upstream/);

  // Prompt §3.10 probe: server-side paginated with a label: qualifier; old fail-open form is gone;
  // the truncated-probe-is-BLOCKED sentence exists in §3.10 and §11.
  assert.match(prompt, /gh api -X GET --paginate search\/issues/);
  assert.match(prompt, /label:agent-PR-open/);
  assert.doesNotMatch(prompt, /gh search issues --owner your-org --state open \\/);
  const blockedSentences = prompt.match(/truncated, errored, or timed-out probe is BLOCKED, not clear/g) || [];
  assert.ok(blockedSentences.length >= 2, "BLOCKED-not-clear sentence must appear in §3.10 and §11");
});

// RP-05: the BINDING §2 queue-scan command is GET (gh defaults to POST with -f params and POSTing
// search/issues 404s), paginated, and projects the REAL REST search-item fields. The schema is
// fixture-validated; live emptiness is NOT a failure (population/search-index lag, not command health).
test("binding queue-scan command is GET, paginated, and schema-correct on a fixture (RP-05)", () => {
  const prompt = read("docs/agents/milestone-orchestration-prompt.md");
  const commandMatch = prompt.match(/`(gh api -X GET --paginate search\/issues -f q='org:your-org is:issue is:open' [^`]*)`/);
  assert.ok(commandMatch, "missing the binding §2 queue-scan command");
  const command = commandMatch[1];
  assert.match(command, /-X GET/);
  assert.match(command, /--paginate/);
  // The dead projection fields must stay gone (REST search items have repository_url/updated_at).
  assert.doesNotMatch(command, /\{repository,/);
  assert.doesNotMatch(command, /updatedAt/);
  // The self-test expectation line sits adjacent to the command.
  assert.match(prompt, /an EMPTY array is a PASS/);
  assert.match(prompt, /non-null `repo`/);

  const jqMatch = command.match(/--jq '([^']+)'/);
  assert.ok(jqMatch, "queue-scan command must carry a --jq projection");
  // Recorded fixture response (one dispatchable item, one agent-claimed item that must drop out).
  const fixture = {
    total_count: 2,
    incomplete_results: false,
    items: [
      {
        repository_url: "https://api.github.com/repos/your-org/curaos",
        number: 7,
        title: "fixture ready issue",
        labels: [{ name: "ready-for-agent" }],
        assignees: [],
        updated_at: "2026-06-10T00:00:00Z",
        url: "https://api.github.com/repos/your-org/curaos/issues/7",
      },
      {
        repository_url: "https://api.github.com/repos/your-org/curaos",
        number: 8,
        title: "fixture claimed issue",
        labels: [{ name: "agent-claimed:claude" }],
        assignees: [],
        updated_at: "2026-06-10T00:00:00Z",
        url: "https://api.github.com/repos/your-org/curaos/issues/8",
      },
    ],
  };
  const out = execFileSync("jq", [jqMatch[1]], { input: JSON.stringify(fixture), encoding: "utf8" });
  const rows = JSON.parse(out);
  assert.equal(rows.length, 1, "agent-claimed fixture item must be filtered out");
  assert.deepEqual(Object.keys(rows[0]).sort(), ["assignees", "labels", "number", "repo", "title", "updated_at", "url"]);
  assert.equal(rows[0].repo, "https://api.github.com/repos/your-org/curaos");
  assert.equal(rows[0].number, 7);
  assert.notEqual(rows[0].repo, null, "every projected item must carry a non-null repo");
});

// checks go green, so the merge gate BLOCKS while no paid review review exists for the PR's CURRENT
// head sha and the post-push settle window has not elapsed. An elapsed window or a head-sha
// paid review review unblocks; an unparseable probe fails closed.
test("pr-verify-merge normalizes bare PR refs before child workflows", () => {
  const prVerify = read("scripts/workflows/pr-verify-merge.workflow.js");
  const normalizePrRef = new Function(
    "ghRef",
    `${extractFunction(prVerify, "normalizePrRef")}\nreturn normalizePrRef;`,
  )(workflowGhRef);

  assert.equal(
    normalizePrRef("7", () => ({ number: 7, baseRepository: { nameWithOwner: "owner/repo" } })),
    "owner/repo#7",
  );
  assert.equal(normalizePrRef("owner/repo#8", () => {
    throw new Error("owner/repo#N must not call gh pr view");
  }), "owner/repo#8");
  assert.throws(() => normalizePrRef("7", () => ({ number: 7, baseRepository: {} })), /baseRepository/);
  assert.match(prVerify, /cfg\.pr = normalizePrRef\(cfg\.pr\)/);
});

test("pr-verify-merge pins merge to the reviewed head sha", () => {
  const prVerify = read("scripts/workflows/pr-verify-merge.workflow.js");
  const prRefParts = new Function("ghRef", `
${extractFunction(prVerify, "prRefParts")}
return prRefParts;
`)(workflowGhRef);
  assert.deepEqual(prRefParts("owner/repo#7"), { repo: "owner/repo", number: "7" });
  assert.equal(prRefParts("7"), null);
  assert.equal(prRefParts("../repo#7"), null);
  assert.equal(prRefParts("owner/..#7"), null);
  assert.match(prVerify, /const headProbe = \{ head_sha: prGateSnapshot\.head_sha \|\| "" \};\nif \(runGrill\)/);
  assert.match(prVerify, /sha='\$\{headProbe\.head_sha\}'; if \[ -z "\$repo" \]/);
  assert.match(prVerify, /grep -Eq '\^\[0-9a-fA-F\]\{40\}\$'/);
  assert.match(prVerify, /-f sha="\$sha"/);
  assert.match(prVerify, /repo='\$\{prRef \? prRef\.repo : ""\}'; num='\$\{prRef \? prRef\.number : ""\}'/);
  assert.doesNotMatch(prVerify, /\.split\(["']#["']\)/);
});

test("gh-pr-gate-snapshot rejects dot-path PR owner or repo segments", () => {
  const snapshot = read("scripts/workflows/gh-pr-gate-snapshot.workflow.js");
  const parsePrRef = new Function("ghRef", `
${extractFunction(snapshot, "parsePrRef")}
return parsePrRef;
`)(workflowGhRef);

  assert.deepEqual(parsePrRef("owner/repo#7"), { slug: "owner/repo", number: "7" });
  assert.throws(() => parsePrRef("../repo#7"), /dot paths/);
  assert.throws(() => parsePrRef("owner/..#7"), /dot paths/);
});

test("gh-pr-gate-snapshot retries transient gh api failures", () => {
  const snapshot = read("scripts/workflows/gh-pr-gate-snapshot.workflow.js");
  const recoverCalls = [];
  const recover = buildGhApi(snapshot, (_cmd, args, opts) => {
    recoverCalls.push(args);
    assert.equal(opts.env.GITHUB_TOKEN, undefined);
    assert.equal(args[0], "api");
    if (recoverCalls.length < recover.GH_ATTEMPTS) throw transientError();
    return "ok\n";
  });
  assert.equal(recover.ghApi("repos/owner/repo/pulls/7", ".head.sha"), "ok");
  assert.equal(recoverCalls.length, recover.GH_ATTEMPTS);

  let persistentCalls = 0;
  const persistent = buildGhApi(snapshot, () => {
    persistentCalls += 1;
    throw transientError();
  });
  assert.throws(() => persistent.ghApi("repos/owner/repo/pulls/7", ".head.sha"), /502/);
  assert.equal(persistentCalls, persistent.GH_ATTEMPTS);

  let fatalCalls = 0;
  const fatal = buildGhApi(snapshot, () => {
    fatalCalls += 1;
    throw fatalError();
  });
  assert.throws(() => fatal.ghApi("repos/owner/repo/pulls/7", ".head.sha"), /404/);
  assert.equal(fatalCalls, 1);
});

test("gh-pr-gate-snapshot default export maps REST failures to a blocked envelope", async () => {
  const snapshot = read("scripts/workflows/gh-pr-gate-snapshot.workflow.js")
    .replace(/^export const meta =/m, "const meta =")
    .replace(/^export default async function workflow/m, "async function workflow")
    .replace('process.getBuiltinModule("node:child_process").execFileSync', "execFileSyncStub");
  let calls = 0;
  const workflow = new Function("execFileSyncStub", `${snapshot}; return workflow;`)(() => {
    calls += 1;
    throw fatalError();
  });

  const result = await workflow({ args: { pr: "owner/repo#7" }, phase: () => {}, log: () => {} });
  assert.equal(calls, 1);
  assert.equal(result.head_sha, "");
  assert.equal(result.minutes_since_last_push, -1);
  assert.equal(result.blocked_by_external, true);
  assert.match(result.error, /404/);
});

test("gh-pr-gate-snapshot exposes only PR head facts", () => {
  const snapshot = read("scripts/workflows/gh-pr-gate-snapshot.workflow.js");
  assert.match(snapshot, /function snapshotPrGate/);
  const removedSnapshotSurface = new RegExp([
    "Code" + "Rabbit",
    "code" + "rabbit",
    "head" + "_review_present",
    "advisory" + "_review_observed",
    "wait" + "_until_settled",
    "settle" + "_timeout_minutes",
    "poll" + "_interval_ms",
    "review" + "SettleSnapshot",
    "code" + "RabbitReviewedHead",
  ].join("|"));
  assert.doesNotMatch(snapshot, removedSnapshotSurface);
});

test("gh-pr-gate-snapshot minutesSincePrUpdate handles invalid and future timestamps", () => {
 const snapshot = read("scripts/workflows/gh-pr-gate-snapshot.workflow.js");
 assert.doesNotMatch(snapshot, /repos\/\$\{slug\}\/commits\/\$\{sha\}/);
 const fixedNow = Date.parse("2026-06-11T09:00:00.000Z");
  const build = (dateText) => new Function(
    "dateText",
    "fixedNow",
    "ghRef",
    `
const Date = { now: () => fixedNow, parse: globalThis.Date.parse };
const ghApi = () => dateText;
${extractFunction(snapshot, "parsePrRef")}
${extractFunction(snapshot, "prUpdatedAt")}
${extractFunction(snapshot, "minutesSincePrUpdate")}
return minutesSincePrUpdate;
`,
  )(dateText, fixedNow, workflowGhRef);
  assert.equal(build("not-a-date")("owner/repo#7", "a".repeat(40)), -1);
  const past = new Date(fixedNow - 5 * 60000).toISOString();
  assert.equal(build(past)("owner/repo#7", "a".repeat(40)), 5);
  const future = new Date(fixedNow + 60000).toISOString();
  assert.equal(build(future)("owner/repo#7", "a".repeat(40)), 0);
});

test("gh-pr-gate-snapshot has no review settle wait loop", () => {
  const snapshot = read("scripts/workflows/gh-pr-gate-snapshot.workflow.js");
  const removedWaitSurface = new RegExp([
    "review" + "SettleSnapshot",
    "wait" + "_until_settled",
    "settle" + "_timeout_minutes",
    "poll" + "_interval_ms",
    "head" + "_review_present",
    "advisory" + "_review_observed",
  ].join("|"));
  assert.doesNotMatch(snapshot, removedWaitSurface);
});

// ---------------------------------------------------------------------------
// RP-11 / RP-12 / RP-77 (milestone-wave verify correctness + gh-project sync degradation + dead code)
// ---------------------------------------------------------------------------

const ghProjectLib = require("./lib/gh-project.js");
const { pathToFileURL } = require("node:url");

// Stub-run harness for the WAVE's verify phase: real runMilestoneWave body, every agent()/workflow()
// boundary stubbed, with a start/end EVENT LOG so leg overlap is observable. The triage pool is kept
// empty (no candidates) so the run goes scan -> verify directly; PRs arrive via scan.open_prs.
async function runMilestoneWaveVerify({ prs, mergeResultFor, agentDelayMs = 5, ciCheckFor, grillFor }) {
  const { default: runWave } = await import(
    pathToFileURL(path.join(root, "scripts/workflows/milestone-wave.workflow.js")).href
  );
  const sha = "a".repeat(40);
  const events = [];
  const snapshotArgs = [];
  const record = async (label) => {
    events.push({ type: "start", label });
    await new Promise((resolve) => setTimeout(resolve, agentDelayMs));
    events.push({ type: "end", label });
  };
  const agent = async (prompt, options) => {
    const label = options && options.label ? String(options.label) : "";
    await record(label);
    if (label === "scan") return { milestones: ["M-test"], candidates: [], needs_user: [], open_prs: prs };
    if (label.startsWith("head-sha:")) return { head_sha: sha };
    if (label.startsWith("thread-gate:")) return { all_threads_resolved: true, open_needs_human: false };
    if (label.startsWith("ci-check:")) return ciCheckFor ? ciCheckFor(label.slice("ci-check:".length)) : { local_gate_exit: 0, checks: [] };
    if (label.startsWith("merge:")) return mergeResultFor(label.slice("merge:".length));
    if (label.startsWith("strip-labels:")) return { stripped: [] };
    if (label.startsWith("advance-board:")) return { advanced: [] };
    if (label.startsWith("notify-clear:")) return { cleared: true, gate_exit: 0, blocker: "" };
    if (label.startsWith("default-branch:")) return { workspace_ready: "clean" };
    if (label === "foresight-discover") return { findings: [] };
    throw new Error(`unexpected agent call ${label}`);
  };
  const workflow = async ({ scriptPath }, wfArgs) => {
    const p = String(scriptPath);
    if (p.includes("milestone-active-scan")) {
      return { milestones: ["M-test"], candidates: [], open_prs: prs, needs_user: [], project_scan_completed: true, generator_inflight: "" };
    }
    if (p.includes("lens-review")) {
      await record(`lens:${wfArgs.pr}:${wfArgs.lens}`);
      return { lens: wfArgs.lens, verdict: "pass" };
    }
    if (p.includes("opposite-harness-grill")) return grillFor ? grillFor(sha) : { verdict: "pass", verified_sha: sha, report_path: "/g/r.md" };
    if (p.includes("gh-pr-gate-snapshot")) {
      snapshotArgs.push(wfArgs);
      return { head_sha: sha, minutes_since_last_push: 12, blocked_by_external: false, error: "" };
    }
    if (p.includes("foresight-capture")) return { seeded: [], skipped: [] };
    throw new Error(`unexpected workflow call ${p}`);
  };
  const parallel = (thunks) => Promise.all(thunks.map((thunk) => thunk()));
  const pipeline = async () => {
    throw new Error("pipeline must not run: the verify harness keeps the triage pool empty");
  };
  const result = await runWave({
    args: { milestone: "active", auto_merge: true },
    agent,
    workflow,
    pipeline,
    parallel,
    phase: () => {},
    log: () => {},
  });
  return { result, events, snapshotArgs };
}

/**
 * Stub-run helper for a not-ready-only milestone-wave pass.
 * It simulates a paper-blocked candidate triaged as ready-for-human, with the
 * scan, foresight, triage, project sync, and roadmap mirror boundaries stubbed
 * so the pending_tracker_work route is verified without live GitHub reads.
 */
async function runMilestoneWaveNotReadyOnly() {
  const { default: runWave } = await import(
    pathToFileURL(path.join(root, "scripts/workflows/milestone-wave.workflow.js")).href
  );
  const candidate = "your-org/curaos-ai-workspace#407";
  const agent = async (_prompt, options) => {
    const label = options && options.label ? String(options.label) : "";
    if (label === "scan") return { milestones: [], candidates: [], needs_user: [], open_prs: [] };
    if (label === "foresight-discover") return { findings: [] };
    throw new Error(`unexpected agent call ${label}`);
  };
  const workflow = async ({ scriptPath }, wfArgs) => {
    const p = String(scriptPath);
    if (p.includes("milestone-active-scan")) {
      return {
        milestones: ["M12"],
        candidates: [candidate],
        paper_blocked_candidates: [],
        promotable_foresight: [],
        dependency_cleared: [],
        generator_inflight: "",
        open_prs: [],
        needs_user: [],
        project_scan_completed: true,
      };
    }
    if (p.includes("gh-issue-triage")) {
      assert.equal(wfArgs.issue, candidate);
      return {
        state_label: "ready-for-human",
        blocker_kind: "paper",
        blocker_reason: "operator live-run gate",
        project_fields: {},
        parent_ref: "",
        is_root: true,
      };
    }
    if (p.includes("gh-project-sync")) return { item_id: "item-407", field_writes: [] };
    if (p.includes("gh-roadmap-mirror")) return { mirrored: true };
    throw new Error(`unexpected workflow call ${p}`);
  };
  const pipeline = async (items, ...stages) => Promise.all(items.map(async (item) => {
    let value = item;
    for (const stage of stages) value = await stage(value);
    return value;
  }));
  const cachePath = path.join(root, ".scratch", "workflow-cache", "roadmap-items.json");
  const previousCache = fs.existsSync(cachePath) ? fs.readFileSync(cachePath, "utf8") : null;
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  fs.writeFileSync(cachePath, JSON.stringify({ fetchedAtMs: Date.now(), projectNumber: 2, items: [] }));
  try {
    return await runWave({
      args: { milestone: "active" },
      agent,
      workflow,
      pipeline,
      parallel: (thunks) => Promise.all(thunks.map((thunk) => thunk())),
      phase: () => {},
      log: () => {},
    });
  } finally {
    if (previousCache === null) fs.rmSync(cachePath, { force: true });
    else fs.writeFileSync(cachePath, previousCache);
  }
}

async function runMilestoneWaveMixedPendingAndReady({ pendingMode = "ready-for-human", dependencyCleared = false } = {}) {
  const { default: runWave } = await import(
    pathToFileURL(path.join(root, "scripts/workflows/milestone-wave.workflow.js")).href
  );
  const pending = "your-org/curaos-ai-workspace#407";
  const ready = "your-org/curaos-ai-workspace#588";
  const cleared = "your-org/curaos-ai-workspace#545";
  const candidates = pendingMode === "runtime-held" ? [ready] : [pending, ready];
  const preBreakdownRefs = [];
  const agent = async (_prompt, options) => {
    const label = options && options.label ? String(options.label) : "";
    if (label === "scan") return { milestones: [], candidates: [], needs_user: [], open_prs: [] };
    if (label === "foresight-discover") return { findings: [] };
    if (label.startsWith("pre-breakdown:")) {
      preBreakdownRefs.push(label.slice("pre-breakdown:".length));
      return {
        proposed_children: [{
          title: "Drafted dependency-cleared story",
          scope: "Keep unpromoted work staged",
          owned_path: "ai/curaos/docs/ISSUE-ROADMAP.md",
          acceptance: "Draft remains staged until normal triage promotes it",
        }],
      };
    }
    return { grabable: true, proposed_children: [], findings: [] };
  };
  const workflow = async (call, wfArgs = {}) => {
    const p = String(call.scriptPath || "");
    const args = { ...call, ...wfArgs };
    if (p.includes("milestone-active-scan")) {
      return {
        milestones: ["M12", "M16"],
        candidates,
        paper_blocked_candidates: [],
        promotable_foresight: [],
        dependency_cleared: dependencyCleared ? [cleared] : [],
      runtime_held_candidates: pendingMode === "runtime-held" ? [pending] : [],
        open_prs: [],
        needs_user: [],
        open_issue_count: 2,
        project_scan_completed: true,
      };
    }
    if (p.includes("gh-issue-triage")) {
    if (args.issue === pending && pendingMode === "foresight") {
      return {
        state_label: "needs-triage",
        blocker_kind: "paper",
        blocker_reason: "staged foresight issue",
        has_foresight_marker: true,
        is_root: true,
      };
    }

    if (args.issue === pending && pendingMode !== "runtime-held") {
      return {
        state_label: "ready-for-human",
        blocker_kind: "paper",
          blocker_reason: "operator live-run gate",
          project_fields: {},
          parent_ref: "",
          is_root: true,
        };
      }
      if (args.issue === ready) {
        return {
          state_label: "ready-for-agent",
          blocker_kind: "none",
          blocker_reason: "",
          project_fields: {
            Priority: "P2",
            Effort: "S",
            Module: "workflow",
            "Owned Path": "scripts/workflows/milestone-wave.workflow.js",
          },
          parent_ref: "",
          is_root: true,
        };
      }
      if (args.issue === cleared && dependencyCleared) {
        return {
          state_label: "needs-triage",
          blocker_kind: "paper",
          blocker_reason: "dependency-cleared epic not promoted yet",
          project_fields: {},
          parent_ref: "",
          is_root: true,
        };
      }
      throw new Error(`unexpected triage issue ${args.issue}`);
    }
    if (p.includes("gh-project-sync")) return { item_id: `item-${args.issue}`, field_writes: [] };
    if (p.includes("gh-roadmap-mirror")) return { mirrored: true };
    if (p.includes("wave-prioritize")) {
      return {
        ranked: [{ issue: ready, score: 1, unblockReach: 0 }],
        lanes: [{ issue: ready, score: 1, owned_root: "workspace" }],
        rationale: "non-blocking tracker rows report without freezing unrelated lanes",
      };
    }
    if (p.includes("foresight-capture")) return { seeded: ["staged-child"], skipped: [] };
    throw new Error(`unexpected workflow call ${p}`);
  };
  const pipeline = async (items, ...stages) => Promise.all(items.map(async (item) => {
    let value = item;
    for (const stage of stages) value = await stage(value);
    return value;
  }));
  const cachePath = path.join(root, ".scratch", "workflow-cache", "roadmap-items.json");
  const previousCache = fs.existsSync(cachePath) ? fs.readFileSync(cachePath, "utf8") : null;
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  fs.writeFileSync(cachePath, JSON.stringify({ fetchedAtMs: Date.now(), projectNumber: 2, items: [] }));
  try {
    const result = await runWave({
      args: { milestone: "active", dry_run: true },
      agent,
      workflow,
      pipeline,
      parallel: (thunks) => Promise.all(thunks.map((thunk) => thunk())),
      phase: () => {},
      log: () => {},
    });
    return { result, pending, ready, cleared, preBreakdownRefs };
  } finally {
    if (previousCache === null) fs.rmSync(cachePath, { force: true });
    else fs.writeFileSync(cachePath, previousCache);
  }
}

// RP-11(a)+(c): a stubbed merge FAILURE must surface merged:false in the wave output (the old
// hard-set `merged = true;` swallowed it), close-path hygiene + foresight must not run on it, and
// `parallel` must be destructured from the runtime context (the kit's import() path passes ONE
// context object to the default export and injects no globals - an unbound `parallel` is a
// guaranteed ReferenceError the first time verify runs).
test("wave verify reflects the actual merge result, not a hard true (RP-11)", async () => {
  const wave = read("scripts/workflows/milestone-wave.workflow.js");
  // Symbolic anchors (no line numbers): the real-merge-result marker + the context destructure.
  assert.match(wave, /merged = !!\(mergeRes && mergeRes\.merged\); \/\/ reflect the actual merge result, not a hard true/);
  assert.doesNotMatch(wave, /^\s*merged = true;\s*$/m);
  assert.match(wave, /export default async function runMilestoneWave\(\{ args, agent, workflow, pipeline, parallel, phase, log \}\)/);

  const failed = await runMilestoneWaveVerify({ prs: ["o/r#5"], mergeResultFor: () => ({ merged: false }) });
  assert.equal(failed.result.pr_verdicts.length, 1);
  assert.equal(failed.result.pr_verdicts[0].verdict, "merge-ok");
  assert.deepEqual(failed.snapshotArgs[0], { pr: "o/r#5" });
  assert.equal(failed.result.pr_verdicts[0].merged, false);
  assert.equal(failed.result.pr_verdicts[0].workspace_ready, "n/a");
  assert.equal(failed.result.done, false, "an unattended failed autoMerge is unfinished work, never a terminal pass");
  assert.ok(!failed.events.some((e) => e.label.startsWith("strip-labels:")), "failed merge must not strip labels");
  assert.ok(!failed.events.some((e) => e.label.startsWith("notify-clear:")), "failed merge must not clear notifications");
  assert.ok(!failed.events.some((e) => e.label.startsWith("default-branch:")), "failed merge must not restore-as-merged");
  assert.ok(!failed.events.some((e) => e.label === "foresight-discover"), "failed merge must not trigger the post-merge foresight pass");

  const merged = await runMilestoneWaveVerify({ prs: ["o/r#5"], mergeResultFor: () => ({ merged: true }) });
  assert.equal(merged.result.pr_verdicts[0].merged, true);
  assert.equal(merged.result.pr_verdicts[0].workspace_ready, "clean");
  assert.ok(merged.events.some((e) => e.label === "strip-labels:o/r#5"));
  assert.ok(merged.events.some((e) => e.label === "foresight-discover"));
});

// RP-11(b): the checkout-changing legs (ci-check `gh pr checkout` + local gate, merge, close-path
// hygiene, default-branch restore) run SERIALLY in one for-loop - no overlapping checkout markers in
// the stub-run event log - while the read-only review legs (lens/grill/head-sha/thread-gate) still
// fan out in parallel across PRs.
test("wave verify serializes checkout-changing legs and keeps review legs parallel (RP-11)", async () => {
  const wave = read("scripts/workflows/milestone-wave.workflow.js");
  assert.match(wave, /VERIFY-SERIAL:/);
  assert.match(wave, /for \(const leg of reviewLegs\)/);
  assert.doesNotMatch(wave, /prVerdicts = await parallel\(prsToVerify\.map/);

  const { result, events } = await runMilestoneWaveVerify({
    prs: ["o/r#1", "o/r#2"],
    mergeResultFor: () => ({ merged: true }),
  });
  assert.equal(result.pr_verdicts.length, 2);
  assert.ok(result.pr_verdicts.every((v) => v.merged === true));

  const checkoutLeg = /^(ci-check|merge|strip-labels|advance-board|notify-clear|default-branch):/;
  // No two checkout legs are ever active at once (the one-checkout invariant).
  let active = 0;
  let maxActive = 0;
  for (const e of events) {
    if (!checkoutLeg.test(e.label)) continue;
    if (e.type === "start") {
      active += 1;
      maxActive = Math.max(maxActive, active);
    } else {
      active -= 1;
    }
  }
  assert.equal(maxActive, 1, "checkout-changing verify legs overlapped in the event log");
  // Whole-PR serialization: PR#2's first checkout leg starts only after PR#1's last one ended.
  const firstStart2 = events.findIndex((e) => e.type === "start" && checkoutLeg.test(e.label) && e.label.endsWith("#2"));
  const end1Indexes = events
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => e.type === "end" && checkoutLeg.test(e.label) && e.label.endsWith("#1"))
    .map(({ i }) => i);
  assert.ok(firstStart2 > Math.max(...end1Indexes), "PR#2 checkout legs must start after PR#1's finish");
  // Review legs DID fan out: all six lens legs (2 PRs x 3 lenses) start before any ci-check starts.
  const firstCi = events.findIndex((e) => e.type === "start" && e.label.startsWith("ci-check:"));
  const lensStartCount = events.filter((e) => e.type === "start" && e.label.startsWith("lens:")).length;
  assert.equal(lensStartCount, 6);
  assert.ok(events.findIndex((e) => e.type === "start" && e.label.startsWith("lens:o/r#2")) < firstCi);
});

// Stub-run harness for pm-triage-gate: real runPmTriageGate body; gh-issue-triage / gh-project-sync /
// gh-roadmap-mirror stubbed at the workflow() boundary; projectItemsCache satisfied by a PATH gh stub.
async function runPmTriageGateStub({ candidates, syncFor }) {
  const { default: runGate } = await import(
    pathToFileURL(path.join(root, "scripts/workflows/pm-triage-gate.workflow.js")).href
  );
  const workflow = async ({ scriptPath }, wfArgs) => {
    const p = String(scriptPath);
    if (p.includes("gh-issue-triage")) {
      return { state_label: "ready-for-agent", blocker_kind: "none", is_root: true, project_fields: {} };
    }
    if (p.includes("gh-project-sync")) return syncFor(wfArgs.issue);
    if (p.includes("gh-roadmap-mirror")) return { issue_roadmap_updated: true };
    throw new Error(`unexpected workflow call ${p}`);
  };
  const pipeline = (items, ...stages) =>
    Promise.all(
      items.map(async (item) => {
        let acc = await stages[0](item);
        for (const stage of stages.slice(1)) acc = await stage(acc);
        return acc;
      }),
    );
  return runGate({
    args: { candidates: JSON.stringify(candidates) },
    workflow,
    pipeline,
    phase: () => {},
    log: () => {},
  });
}

// PATH gh stub for the RP-12 fixtures: answers `gh project item-list` (the gate's cache read) and
// `gh api graphql` (the sync leg drives the REAL scripts/lib/gh-project.js gh() against it), failing
// the first WTC_GH_FAIL_TIMES graphql calls with GitHub's exact 502 shape.
const WTC_GH_STUB = `#!/usr/bin/env bun
const fs = require("node:fs");
const args = process.argv.slice(2);
if (process.env.WTC_GH_LEDGER) fs.appendFileSync(process.env.WTC_GH_LEDGER, JSON.stringify(args) + "\\n");
if (args[0] === "project" && args[1] === "item-list") {
  process.stdout.write(JSON.stringify({ items: [] }));
  process.exit(0);
}
if (args[0] === "api" && args[1] === "graphql") {
  const failTimes = Number(process.env.WTC_GH_FAIL_TIMES || 0);
  const counterPath = process.env.WTC_GH_FAIL_COUNTER;
  let n = 0;
  if (counterPath) {
    try { n = Number(fs.readFileSync(counterPath, "utf8")) || 0; } catch {}
  }
  if (counterPath && n < failTimes) {
    fs.writeFileSync(counterPath, String(n + 1));
    process.stdout.write('{"message":"Bad Gateway","status":"502"}');
    process.stderr.write("gh: Bad Gateway (HTTP 502)\\n");
    process.exit(1);
  }
  process.stdout.write(JSON.stringify({ data: {} }));
  process.exit(0);
}
process.stderr.write("wtc-gh-stub: unhandled " + JSON.stringify(args) + "\\n");
process.exit(64);
`;

async function withWtcGhStub(failTimes, fn) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wtc-gh-stub-"));
  const bin = path.join(tmp, "bin");
  fs.mkdirSync(bin, { recursive: true });
  fs.writeFileSync(path.join(bin, "gh"), WTC_GH_STUB, { mode: 0o755 });
  const ledger = path.join(tmp, "ledger.jsonl");
  const counter = path.join(tmp, "counter");
  const extra = {
    PATH: `${bin}${path.delimiter}${process.env.PATH}`,
    WTC_GH_LEDGER: ledger,
    WTC_GH_FAIL_TIMES: String(failTimes),
    WTC_GH_FAIL_COUNTER: counter,
  };
  const saved = Object.fromEntries(Object.keys(extra).map((k) => [k, process.env[k]]));
  for (const [k, v] of Object.entries(extra)) process.env[k] = v;
  try {
    const graphqlCalls = () =>
      fs.existsSync(ledger)
        ? fs.readFileSync(ledger, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((a) => a[0] === "api" && a[1] === "graphql")
        : [];
    return await fn({ graphqlCalls });
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// RP-12 transient fixture: ONE stubbed 502 followed by success on the retry recovers fully - the
// pass completes, the bounded retry is observed in the gh ledger, and the candidate is NOT degraded
// (absent from not_ready).
test("transient sync 502 recovers on the gh() retry and degrades nothing (RP-12)", async () => {
  await withWtcGhStub(1, async ({ graphqlCalls }) => {
    const result = await runPmTriageGateStub({
      candidates: ["o/r#1", "o/r#2"],
      syncFor: (issue) => {
        // Drive the REAL gh() through the PATH stub: the first call 502s once and recovers in-call.
        const out = ghProjectLib.gh(["api", "graphql", "-f", "query=mutation{m0: noop}"], { json: true });
        assert.deepEqual(out, { data: {} });
        return { item_id: `item-${issue}` };
      },
    });
    assert.deepEqual(result.ready.sort(), ["o/r#1", "o/r#2"]);
    assert.deepEqual(result.not_ready, []);
    assert.ok(!result.blocked_by_external);
    assert.equal(result.mirror_refreshed, true);
    // retry observed: 2 candidates -> 3 graphql calls (1 failed + its retry + 1 clean)
    assert.equal(graphqlCalls().length, 3);
  });
});

// RP-12 persistent fixture: a 502 persisting through all bounded attempts degrades ONLY that
// candidate into not_ready with a recorded reason; the rest of the ready set stays dispatchable and
// the pass is NOT aborted. Genuine quota exhaustion keeps the fail-closed terminal stop.
test("persistent sync 502 degrades only that candidate; quota still fails closed (RP-12)", async () => {
  const gate = read("scripts/workflows/pm-triage-gate.workflow.js");
  const wave = read("scripts/workflows/milestone-wave.workflow.js");
  const gatePlaybook = read("docs/agents/workflows/pm-triage-gate.md");
  const wavePlaybook = read("docs/agents/workflows/milestone-wave.md");
  const ghProjectSrc = read("scripts/lib/gh-project.js");
  // Symbolic anchors: both executors carry the SAME degradation section (quota-only terminal),
  // and the lib carries the bounded retry + true alias batching the :8 header claims.
  for (const src of [gate, wave]) {
    assert.match(src, /RP-12 SYNC-DEGRADATION SECTION/);
    assert.match(src, /error_kind === "github-graphql-quota"/);
    assert.match(src, /SYNC-DEGRADED:/);
  }
  assert.match(wave, /github-subissue-wire-external/);
  assert.match(wave, /WIRE-DEGRADED:/);
  assert.match(wave, /splitWire && splitWire\.blocked_by_external/);
  assert.match(wave, /function isSubissueDepthLimit\(message\)/);
  assert.match(wave, /WIRE-DEPTH-LIMIT:/);
  assert.match(wave, /subissues_depth_limited: allChildren/);
  assert.match(wavePlaybook, /native tree-wiring failures, including GraphQL quota/);
  assert.match(wavePlaybook, /WIRE-DEPTH-LIMIT/);
  assert.match(gatePlaybook, /Sync-failure degradation \(per-candidate, RP-12\)/);
  assert.match(ghProjectSrc, /const GH_ATTEMPTS = 3/);
  assert.match(ghProjectSrc, /isTransientGithubFailure\(errorText\(error\)\)/);
  assert.match(ghProjectSrc, /`m\$\{i\}: \$\{m\}`/);

  await withWtcGhStub(99, async ({ graphqlCalls }) => {
    const result = await runPmTriageGateStub({
      candidates: ["o/r#1", "o/r#2"],
      syncFor: (issue) => {
        if (issue === "o/r#2") {
          // The REAL gh() exhausts its bounded retry against the always-502 stub and throws; the
          // gate's per-candidate catch classifies it transient-external.
          ghProjectLib.gh(["api", "graphql", "-f", "query=mutation{m0: noop}"], { json: true });
          throw new Error("unreachable: the stubbed 502 must throw");
        }
        return { item_id: `item-${issue}` };
      },
    });
    assert.deepEqual(result.ready, ["o/r#1"], "the surviving ready set stays dispatchable");
    assert.deepEqual(result.not_ready, [{ issue: "o/r#2", missing: "github-project-api-transient" }]);
    assert.ok(!result.blocked_by_external, "a transient per-candidate failure must not abort the pass");
    assert.equal(result.mirror_refreshed, true);
    assert.equal(graphqlCalls().length, ghProjectLib.GH_ATTEMPTS, "bounded retry budget fully spent before degrading");
  });

  // Quota exhaustion keeps the fail-closed terminal stop (every candidate held, pass aborted).
  await withWtcGhStub(0, async () => {
    const result = await runPmTriageGateStub({
      candidates: ["o/r#1", "o/r#2"],
      syncFor: (issue) => {
        if (issue === "o/r#2") throw new Error("unknown owner type; GraphQL quota likely exhausted");
        return { item_id: `item-${issue}` };
      },
    });
    assert.equal(result.blocked_by_external, true);
    assert.equal(result.error_kind, "github-project-sync-external");
    assert.deepEqual(result.ready, []);
    assert.deepEqual(result.not_ready, [{ issue: "o/r#2", missing: "github-graphql-quota" }]);
  });
});

// RP-77: the unreachable undrainedNeedsTriage barrier (declaration + compatibility emit block +
// misleading comment lines incl. the mangled mid-line `- //` comment) and the wave-side consumption
// of the always-empty cross_milestone_candidates legacy bucket are gone; the LIVE §321
// milestone-field hygiene note stays.
test("milestone wave dead barrier and legacy bucket consumption are removed (RP-77)", () => {
  const wave = read("scripts/workflows/milestone-wave.workflow.js");
  assert.doesNotMatch(wave, /undrainedNeedsTriage/);
  assert.doesNotMatch(wave, /3\.4-BARRIER/);
  assert.doesNotMatch(wave, /barrier_undrained/);
  assert.doesNotMatch(wave, /needs-triage box undrained/);
  assert.doesNotMatch(wave, /gate - \/\//, "the mangled mid-line comment is gone");
  assert.doesNotMatch(wave, /cross_milestone_candidates/);
  assert.match(wave, /unsetMilestoneField/);
  assert.match(wave, /§321-FIELD-NOTE/);
  assert.match(wave, /unsetMilestoneField\.slice\(0, 25\)/);
});

test("milestone wave exposes not-ready-only tracker work as a continuation bucket", async () => {
  const scan = read("scripts/workflows/milestone-active-scan.workflow.js");
  const wave = read("scripts/workflows/milestone-wave.workflow.js");
  assert.match(scan, /open_issue_count/);
  assert.match(scan, /runtime_held_candidates/);
  assert.match(wave, /runtime_held_candidates/);
  const result = await runMilestoneWaveNotReadyOnly();
  assert.equal(result.done, false);
  assert.deepEqual(result.triaged.ready, []);
  assert.deepEqual(result.pending_tracker_work, [
    {
      issue: "your-org/curaos-ai-workspace#407",
      missing: "state=ready-for-human, blocker=paper",
      route: "user-escalation",
    },
  ]);
  assert.equal(result.next_action, "drain-pending-tracker-work");
});

test("milestone wave routes non-drainable tracker rows without freezing independent lanes", () => {
  const wave = read("scripts/workflows/milestone-wave.workflow.js");
  assert.equal((wave.match(/function routePendingTrackerWork/g) || []).length, 1);
  assert.doesNotMatch(wave, /const routePendingTrackerWork =/);
const helpers = new Function(`
${extractFunction(wave, "validIssueRef")}
${extractFunction(wave, "routePendingTrackerWork")}
${extractFunction(wave, "pendingTrackerBlocksDispatch")}
return { validIssueRef, routePendingTrackerWork, pendingTrackerBlocksDispatch };
`)();

  assert.equal(helpers.validIssueRef("owner/repo#7"), true);
  assert.equal(helpers.validIssueRef("owner/..#7"), false);
  assert.equal(helpers.validIssueRef("not-a-ref"), false);
  assert.match(wave, /malformed_tracker_refs/);
  assert.match(wave, /missing: "malformed tracker ref"/);

  const cases = [
    ["state=ready-for-human, blocker=paper", "user-escalation", false],
    ["state=needs-info, blocker=paper", "tracker-triage", false],
    ["state=needs-info, blocker=paper (blocked by missing spec)", "tracker-triage", false],
    ["subissue-unwired", "tracker-repair", false],
  ["foresight staged backlog", "planning-breakdown", false],
    ["state=needs-triage, blocker=real", "blocker-follow-up", false],
    ["state=needs-triage, blocker=paper, markers=blocked", "blocker-follow-up", false],
  ["state=needs-triage, blocker=paper, markers=foresight+blocked", "planning-breakdown", false],
  ["state=wontfix, blocker=none", "closed-out", false],
    ["github-project-api-transient", "sync-degradation", false],
    ["project-sync-blocked", "sync-degradation", false],
    ["triage failed", "triage-retry", false],
    ["runtime-held: agent-claimed or agent-PR-open", "runtime-lane-check", false],
    ["unclassified tracker defect", "investigate", false],
  ];

  for (const [missing, route, blocks] of cases) {
    assert.equal(helpers.routePendingTrackerWork(missing), route);
    assert.equal(helpers.pendingTrackerBlocksDispatch({ route }), blocks, missing);
  }
});

test("milestone wave merge gate uses advisory sha-pinned PR facts", () => {
  const wave = read("scripts/workflows/milestone-wave.workflow.js");
  const helpers = new Function("ghRef", `
${extractFunction(wave, "prRefParts")}
return { prRefParts };
`)(workflowGhRef);

  assert.deepEqual(helpers.prRefParts("owner/repo#7"), { repo: "owner/repo", number: "7" });
  assert.equal(helpers.prRefParts("owner/repo"), null);
  assert.equal(helpers.prRefParts(""), null);
  assert.equal(helpers.prRefParts("../repo#7"), null);
  assert.equal(helpers.prRefParts("owner/..#7"), null);
  assert.doesNotMatch(wave, /reviewNotSettled/);
  assert.doesNotMatch(wave, new RegExp("review" + "SettledBlocked"));
  assert.match(wave, /gh-pr-gate-snapshot\.workflow\.js/);
  assert.doesNotMatch(wave, new RegExp("wait" + "_until_settled"));
  assert.match(wave, /-f sha=\$sha/);
  assert.doesNotMatch(wave, /gh pr merge \$\{pr\}/);
});

test("milestone wave reports user-escalation tracker work without freezing unrelated ready dispatch", async () => {
  const { result, pending, ready } = await runMilestoneWaveMixedPendingAndReady();
  assert.deepEqual(result.triaged.ready.map((row) => typeof row === "string" ? row : row.issue), [ready]);
  assert.deepEqual(result.pending_tracker_work, [
    {
      issue: pending,
      missing: "state=ready-for-human, blocker=paper",
      route: "user-escalation",
    },
  ]);
  assert.deepEqual(result.dispatch_order.map((row) => typeof row.issue === "string" ? row.issue : row.issue.issue), [ready]);
  assert.deepEqual(result.dispatched.map((row) => ({
    ...row,
    issue: typeof row.issue === "string" ? row.issue : row.issue.issue,
  })), [
    {
      issue: ready,
      status: "dry-run (would dispatch)",
      pr: "",
      blocker: "",
    },
  ]);
  assert.equal(result.next_action, "drain-pending-tracker-work");
  assert.equal(result.done, false);
});

test("milestone wave reports runtime-held tracker work without freezing unrelated ready dispatch", async () => {
  const { result, pending, ready } = await runMilestoneWaveMixedPendingAndReady({ pendingMode: "runtime-held" });
  assert.deepEqual(result.triaged.ready, [ready]);
  assert.deepEqual(result.pending_tracker_work, [
    {
      issue: pending,
      missing: "runtime-held: agent-claimed or agent-PR-open",
      route: "runtime-lane-check",
    },
  ]);
  assert.deepEqual(result.dispatch_order.map((row) => row.issue), [ready]);
  assert.deepEqual(result.dispatched.map((row) => ({
    issue: typeof row.issue === "string" ? row.issue : row.issue.issue,
    status: row.status,
  })), [{
    issue: ready,
    status: "dry-run (would dispatch)",
  }]);
  assert.equal(result.next_action, "drain-pending-tracker-work");
  assert.equal(result.done, false);
});

test("milestone wave reports foresight tracker rows without freezing unrelated ready dispatch", async () => {
  const { result, pending, ready } = await runMilestoneWaveMixedPendingAndReady({ pendingMode: "foresight" });
  assert.deepEqual(result.triaged.ready, [ready]);
  assert.deepEqual(result.pending_tracker_work, [
    {
      issue: pending,
      missing: "state=needs-triage, blocker=paper, markers=foresight",
      route: "planning-breakdown",
    },
  ]);
  assert.deepEqual(result.dispatch_order.map((row) => typeof row.issue === "string" ? row.issue : row.issue.issue), [ready]);
  assert.deepEqual(result.dispatched.map((row) => ({
    ...row,
    issue: typeof row.issue === "string" ? row.issue : row.issue.issue,
  })), [
    {
      issue: ready,
      status: "dry-run (would dispatch)",
      pr: "",
      blocker: "",
    },
  ]);
  assert.equal(result.next_action, "drain-pending-tracker-work");
  assert.equal(result.done, false);
});

test("milestone wave keeps dependency-cleared pre-breakdown while reporting pending tracker work", async () => {
  const { result, pending, ready, cleared, preBreakdownRefs } =
    await runMilestoneWaveMixedPendingAndReady({ dependencyCleared: true });
  assert.deepEqual(result.triaged.ready.map((row) => typeof row === "string" ? row : row.issue), [ready]);
  assert.deepEqual(preBreakdownRefs, [cleared]);
  assert.deepEqual(result.pre_breakdown.drafted.map((row) => row.issue), [cleared]);
  assert.deepEqual(result.pending_tracker_work.map((row) => row.issue), [pending, cleared]);
  assert.deepEqual(result.dispatch_order.map((row) => typeof row.issue === "string" ? row.issue : row.issue.issue), [ready]);
  assert.deepEqual(result.dispatched.map((row) => ({
    ...row,
    issue: typeof row.issue === "string" ? row.issue : row.issue.issue,
  })), [
    {
      issue: ready,
      status: "dry-run (would dispatch)",
      pr: "",
      blocker: "",
    },
  ]);
  assert.equal(result.next_action, "drain-pending-tracker-work");
});

test("WORKFLOW-STATUS table is live, complete, and fails a stale ok on a defect-tagged workflow (RP-56)", () => {
  const {
    parseWorkflowStatusTable,
    validateWorkflowStatus,
  } = require("./lib/workflow-status.js");
  const executors = fs
    .readdirSync(path.join(root, "scripts/workflows"))
    .filter((f) => f.endsWith(".workflow.js"))
    .map((f) => f.replace(/\.workflow\.js$/, ""))
    .sort();
  const rows = parseWorkflowStatusTable(read("docs/agents/WORKFLOW-STATUS.md"));

  // The committed table lists every executor with a valid status row.
  assert.deepEqual(validateWorkflowStatus(rows, { executors }), []);
  assert.deepEqual(rows.map((r) => r.workflow).sort(), executors);

  // Acceptance: a workflow with an open workflow-defect issue and an "ok"
  // status FAILS (violation kind stale-ok).
  const defectUrl = "https://github.com/your-org/curaos-ai-workspace/issues/508";
  const staleViolations = validateWorkflowStatus(rows, {
    executors,
    openDefects: { [rows[0].workflow]: defectUrl },
  });
  assert.equal(staleViolations.length, 1);
  assert.equal(staleViolations[0].kind, "stale-ok");
  assert.match(staleViolations[0].message, /open workflow-defect issue/);
});

// RP-46: a degraded dep-graph build (edge-fetch failures after retries) must reach the
// calibration guard so the log only learns from complete graphs; the degrade flag rides the
// ranked rows as a non-enumerable marker and appendRecord refuses degraded records.
test("dep-graph degrade signal reaches the calibration guard", () => {
  const lib = read("scripts/lib/dep-graph.js");
  assert.match(lib, /edge_fetch_failures: edgeFetchFailures/);
  assert.match(lib, /Object\.defineProperty\(rows, "degraded"/);
  const calSrc = read("scripts/lib/dep-graph-calibration.js");
  assert.match(calSrc, /rec\.degraded === true/);
  assert.match(calSrc, /skipping append: dispatch record marked degraded/);
});

// ---------------------------------------------------------------------------
// Batch integration (2026-06-10): queued truth-contract entries from
// .scratch/integration-queue/ rp-39 / rp-42 / rp-50 / rp-51 / rp-33(1d) / rp-21(9, partial).
// ---------------------------------------------------------------------------

test("deterministic prefetch is threaded into active scan, breakdown, and tdd-implement prompts (RP-39)", () => {
  const wave = read("scripts/workflows/milestone-wave.workflow.js");
  const triage = read("scripts/workflows/gh-issue-triage.workflow.js");
  const breakdown = read("scripts/workflows/breakdown.workflow.js");
  const tdd = read("scripts/workflows/tdd-implement.workflow.js");

  // Active scan: deterministic candidate JSON is consumed directly; the whole tracker set is not
  // handed to one scan agent before the bounded per-issue triage pipeline.
assert.match(wave, /SCAN-DETERMINISTIC/);
assert.match(wave, /Do not send the whole active issue universe through one scan agent call/);
assert.match(wave, /scan\.candidates = \[\.\.\.new Set\(\[\.\.\.deterministicActiveScan\.candidates\.filter\(Boolean\), \.\.\.scan\.candidates\.filter\(Boolean\)\]\)\]\.sort\(\)/);
assert.match(wave, /scan\.open_prs = \[\.\.\.new Set\(\[\.\.\.deterministicActiveScan\.open_prs\.filter\(Boolean\), \.\.\.scan\.open_prs\.filter\(Boolean\)\]\)\]\.sort\(\)/);
assert.doesNotMatch(wave, /scan\.candidates\.length === 0 && Array\.isArray\(deterministicActiveScan\.candidates\)/);

  // RP-36 batch map feeds the triage call + breakdown assess + tdd-implement issue_body.
  assert.match(wave, /function prefetchTriageBatch\(batch\)/);
  assert.match(wave, /return ghProjectLib\.batchIssueRead\(/);
  assert.match(wave, /\.\.\.\(prefetched\.has\(issue\) \? \{ prefetch: prefetched\.get\(issue\) \} : \{\}\)/);
  assert.match(wave, /\.\.\.\(prefetched\.has\(issue\) && prefetched\.get\(issue\)\.body \? \{ issue_body: prefetched\.get\(issue\)\.body \} : \{\}\)/);
  assert.match(triage, /deterministicIssueMetadataFromPrefetch/);
  assert.match(triage, /AUTHORITATIVE PREFETCH/);
  assert.match(triage, /Do not re-fetch the issue body/);

  // breakdown + tdd-implement: authoritative injected body with the mandated-read fallback.
  for (const src of [breakdown, tdd]) {
    assert.match(src, /PREFETCHED ISSUE BODY \(authoritative\)/);
    assert.match(src, /permitted, not mandated/);
    assert.match(src, /cfg\.issue_body \?/);
  }
  // Fallback (no prefetch) keeps the mandated read in both executors.
  assert.match(breakdown, /`Read it: \\`gh issue view \$\{cfg\.issue\} --comments\\`/);
  assert.match(tdd, /AUTHORITATIVE SCOPE - you MUST first run \\`env -u GITHUB_TOKEN gh issue view \$\{cfg\.issue\} --comments\\`/);

  // Playbooks document the threading (CONTRACT lockstep is check-workflow-sync's job).
  assert.match(read("docs/agents/workflows/milestone-wave.md"), /skips the old whole-universe scan agent/);
  assert.match(read("docs/agents/workflows/milestone-wave.md"), /Batch prefetch \(RP-36\)/);
  assert.match(read("docs/agents/workflows/tdd-implement.md"), /Prefetch threading \(RP-39\)/);
  assert.match(read("docs/agents/workflows/breakdown.md"), /Prefetch threading \(RP-39\)/);
});

// rp-42.md queued test, adapted to this suite's node:test/assert idiom as the queue entry
// authorizes ("adjust the require-assertion to the file's actual import idiom at apply time");
// the load-bearing assertions are the BUDGET-PREFLIGHT log marker + held-path routing.
test("milestone-wave dispatch leg runs the gh-budget preflight and routes deferrals into held (RP-42)", () => {
  const src = read("scripts/workflows/milestone-wave.workflow.js");
  assert.ok(src.includes('createRequire(import.meta.url)("../lib/gh-budget.js")'));
  assert.ok(src.includes("BUDGET-PREFLIGHT"));
  assert.ok(src.includes("budget-preflight deferral"));
  // deferral must hold lanes, not drop them
  assert.match(src, /partition\.held\.push\([\s\S]{0,200}budget-preflight deferral/);
});

test("dispatch lanes get a plan-time context bundle and the worker prompt anchors to it (RP-50)", () => {
  const prioritize = read("scripts/workflows/wave-prioritize.workflow.js");
  const wave = read("scripts/workflows/milestone-wave.workflow.js");
  const bundleLib = require("./lib/lane-context-bundle.js");

  // Plan-time writer wired after the wave-plan write; fail-soft; output surface present.
  assert.match(prioritize, /contextBundles = laneBundle\.writeLaneBundles\(\{/);
  assert.match(prioritize, /context_bundles: \{ type: "array"/);
  assert.match(prioritize, /context_bundles: contextBundles, calibrationLogged, wavePlanPath \};/);

  // Worker prompt anchor block (threaded via context_summary into tdd-implement).
  assert.match(wave, /PRE-CODING ANCHORS \(RP-50\) - confirm each BEFORE writing any file:/);
  assert.match(wave, /\.scratch\/\$\{laneSlug\}\/context-bundle\.md/);
  assert.match(wave, /context_summary: `\$\{anchorBlock\}\\n\\n\$\{ctx\.context_summary \|\| ""\}`/);

  // Executed bundle behavior: path derivation + anchors + no-dash sanitation (lib owns the rest).
  assert.equal(bundleLib.bundlePathFor("o/r#1"), ".scratch/o-r-1/context-bundle.md");
  const md = bundleLib.buildLaneBundle({ lane: { issue: "o/r#1", owned_root: "workspace" }, readFile: () => null });
  assert.match(md, /## Pre-coding anchors/);
  assert.equal(/[\u2014\u2013]/.test(md), false);

  // Playbook documents the bundle surface.
  assert.match(read("docs/agents/workflows/wave-prioritize.md"), /Per-lane context bundle \(RP-50/);
});

test("dispatch schedules near-completion lanes before fresh lanes of equal priority (RP-51)", () => {
  const prioritize = read("scripts/workflows/wave-prioritize.workflow.js");
  const wave = read("scripts/workflows/milestone-wave.workflow.js");
  const { orderLanes } = require("./lib/lane-schedule.js");

  // Executor wiring: ordering applied between partition and the wave-plan write; input declared.
  assert.match(prioritize, /lanes = laneSchedule\.orderLanes\(lanes, \{ ranked, nearCompletion:/);
  assert.match(prioritize, /near_completion: \{ type: "string", required: false/);

  // Wave derives near-completion refs from the shared board snapshot and threads them through.
  assert.match(wave, /in progress\|in review/i);
  assert.match(wave, /near_completion: JSON\.stringify\(nearCompletionRefs\)/);

  // Executed acceptance: near-completion lane (open PR awaiting verify) schedules BEFORE a fresh
  // lane of equal priority; FIFO holds within the class; membership never changes.
  const lanes = [{ issue: "o/fresh#1" }, { issue: "o/resume#2" }, { issue: "o/fresh2#3" }];
  const ranked = [
    { issue: "o/fresh#1", criticalPathDepth: 0, priority: "High" },
    { issue: "o/resume#2", criticalPathDepth: 0, priority: "High" },
    { issue: "o/fresh2#3", criticalPathDepth: 0, priority: "High" },
  ];
  const ordered = orderLanes(lanes, { ranked, nearCompletion: ["o/resume#2"] });
  assert.deepEqual(ordered.map((l) => l.issue), ["o/resume#2", "o/fresh#1", "o/fresh2#3"]);

  // Playbook documents the policy.
  assert.match(read("docs/agents/workflows/wave-prioritize.md"), /Lane scheduling \(RP-51/);
});

test("grill workflow fixture-quarantine helpers stay synced with lib mirror (RP-33)", () => {
  const workflow = read("scripts/workflows/opposite-harness-grill.workflow.js");
  const mirror = read("scripts/lib/grill-fixture-quarantine.js");
  assert.equal(extractFunction(workflow, "isSyntheticGrillSubject"), extractFunction(mirror, "isSyntheticGrillSubject"));
  const markerLine = 'const SYNTHETIC_GRILL_MARKER = "GRILL-SYNTHETIC: true";';
  assert.ok(workflow.includes(markerLine));
  assert.ok(mirror.includes(markerLine));
  assert.match(workflow, /resolve\(`\$\{workspaceRoot\(\)\}\/scripts\/test-fixtures\/grills`\)/);
});

// rp-21.md section 9, applied PARTIALLY: executors are frozen this batch and rp-21 items 3/4/5
// (doc-governance + foresight-sweep parseArgs normalization, gh-project-sync externalFailureKind
// normalization) have not landed, so those copies are excluded from the byte pin via
// PENDING_NORMALIZATION below. The exclusion list must only ever SHRINK: when an owner lane lands
// an item, delete its entry here so the pin tightens to the queue's strict form.
test("workflow micro-helpers live once in scripts/lib/workflow-common and inline copies stay pinned (RP-21)", () => {
  const lib = read("scripts/lib/workflow-common.js");
  const common = require("./lib/workflow-common.js");
  const PENDING_NORMALIZATION = new Set([
    "scripts/workflows/doc-governance.workflow.js", // rp-21 item 3
    "scripts/workflows/foresight-sweep.workflow.js", // rp-21 item 4
    "scripts/workflows/gh-project-sync.workflow.js", // rp-21 item 5
  ]);

  // (a) parseArgs: every executor that defines one is byte-identical to the lib owner.
  const canonicalParseArgs = extractFunction(lib, "parseArgs");
  const parseArgsFiles = fs.readdirSync(path.join(root, "scripts/workflows"))
    .filter((f) => f.endsWith(".workflow.js"))
    .map((f) => `scripts/workflows/${f}`)
    .filter((f) => read(f).includes("function parseArgs"));
  assert.ok(parseArgsFiles.length >= 17, `expected >= 17 parseArgs copies, saw ${parseArgsFiles.length}`);
  for (const file of parseArgsFiles) {
    if (PENDING_NORMALIZATION.has(file)) continue;
    assert.equal(extractFunction(read(file), "parseArgs"), canonicalParseArgs, `parseArgs drift in ${file}`);
  }

  // (b) externalFailureKind GraphQL/Projects flavor: inline copies == lib owner (milestone-wave
  // imports the lib directly, asserted in (f); gh-project-sync rides PENDING_NORMALIZATION).
  const canonicalGraphql = extractFunction(lib, "externalFailureKind");
  for (const file of ["scripts/workflows/gh-project-sync.workflow.js", "scripts/workflows/pm-triage-gate.workflow.js"]) {
    if (PENDING_NORMALIZATION.has(file)) continue;
    assert.equal(extractFunction(read(file), "externalFailureKind"), canonicalGraphql, `externalFailureKind drift in ${file}`);
  }

  // (c) flavor copies: byte-identical to their lib owner modulo the function NAME.
  const nameSwapped = (source, fromName, toName) =>
    extractFunction(source, fromName).replace(`function ${fromName}`, `function ${toName}`);
  assert.equal(
    nameSwapped(read("scripts/workflows/gh-issue-triage.workflow.js"), "externalFailureKind", "externalIssueFailureKind"),
    extractFunction(lib, "externalIssueFailureKind")
  );
  assert.equal(
    nameSwapped(read("scripts/workflows/context-load.workflow.js"), "externalFailureKind", "externalRestFailureKind"),
    extractFunction(lib, "externalRestFailureKind")
  );

  // (d) isTransientGithubFailure: every remaining copy == lib owner.
  const canonicalTransient = extractFunction(lib, "isTransientGithubFailure");
  for (const file of [
    "scripts/workflows/gh-issue-triage.workflow.js",
    "scripts/workflows/gh-pr-gate-snapshot.workflow.js",
    "scripts/workflows/context-load.workflow.js",
    "scripts/workflows/milestone-active-scan.workflow.js",
    "scripts/lib/gh-project.js",
    "scripts/lib/dep-graph.js",
  ]) {
    if (!read(file).includes("function isTransientGithubFailure")) continue; // retired to a direct require
    assert.equal(extractFunction(read(file), "isTransientGithubFailure"), canonicalTransient, `isTransientGithubFailure drift in ${file}`);
  }

  // (e) model-tier catalog: tdd-implement's impl_model whitelist == MODEL_TIERS.
  const { MODEL_TIERS } = require("./lib/model-tier.js");
  const tdd = read("scripts/workflows/tdd-implement.workflow.js");
  const whitelist = tdd.match(/cfg\.impl_model === "([a-z]+)"(?:\s*\|\|\s*cfg\.impl_model === "([a-z]+)")*/);
  assert.ok(whitelist, "tdd-implement impl_model whitelist missing");
  for (const tier of MODEL_TIERS) assert.ok(whitelist[0].includes(`"${tier}"`), `tdd-implement whitelist missing tier ${tier}`);
  assert.equal((whitelist[0].match(/cfg\.impl_model === /g) || []).length, MODEL_TIERS.length, "tdd-implement whitelist tier count != MODEL_TIERS");

  // (f) milestone-wave imports the lib owners directly (no inline copies left).
  const wave = read("scripts/workflows/milestone-wave.workflow.js");
  assert.match(wave, /localRequire\("\.\.\/lib\/workflow-common\.js"\)/);
  assert.doesNotMatch(wave, /^function externalFailureKind/m);
  assert.doesNotMatch(wave, /^function parseArgs/m);

  // (g) executed behavior comes from THIS lib (one fixture per family; full battery lives in
  // scripts/lib/workflow-common.test.js).
  assert.equal(common.externalFailureKind("HTTP 502 bad gateway"), "github-project-api-transient");
  assert.equal(common.externalIssueFailureKind("HTTP 502 bad gateway"), "github-api-transient");
  assert.equal(common.externalRestFailureKind("HTTP 401 unauthorized"), "github-rest-unavailable");
  assert.deepEqual(common.parseFrontmatter("---\nk: v\nxs:\n  - a\n---"), { k: "v", xs: ["a"] });
  assert.deepEqual(common.parseArgs('{"a":1}'), { a: 1 });
});

// rp-21.md section 9 second test, applied PARTIALLY: the consumer pins (pr-verify-merge inline
// mergeCleanVerdict copy + both verdict-chain replacements) are rp-21 items 6c/7, which the queue's
// own ORDERING note ties to one integration commit that also relaxes the RP-03 literal-chain pin.
// Executors are frozen this batch, so this test pins what is true NOW: the lib owns the decision
// table (executed below) and the wave already spreads merge-hygiene through loadSharedPhaseHelpers.
// When items 6c/7 land, add the queue's consumer assertions here in the same commit.
test("merge-clean verdict decision table has one code owner in scripts/lib/merge-hygiene (RP-21 partial)", () => {
  const { mergeCleanVerdict } = require("./lib/merge-hygiene.js");
  const wave = read("scripts/workflows/milestone-wave.workflow.js");
  assert.match(wave, /localRequire\("\.\.\/lib\/merge-hygiene\.js"\)/);
  assert.doesNotMatch(wave, /^function mergeCleanVerdict/m);

  // Executed behavior: both consumers' decision tables, from THIS lib.
  const base = { lensBlock: false, lensChanges: false, grillVerdict: "merge-ok", grillBlockedHarnessUnavailable: false, grillShaBlocked: false, checksGreen: true, threadsResolved: true, needsHumanOpen: false };
  assert.equal(mergeCleanVerdict({ ...base, unattended: false }), "merge-ok");
  assert.equal(mergeCleanVerdict({ ...base, unattended: false, threadsResolved: false }), "changes-requested");
  assert.equal(mergeCleanVerdict({ ...base, unattended: true, threadsResolved: false }), "block");
  assert.equal(mergeCleanVerdict({ ...base, unattended: true, needsHumanOpen: true }), "block");
  assert.equal(mergeCleanVerdict({ ...base, unattended: true, checksGreen: false }), "block");
});

// ---------------------------------------------------------------------------
// RP-34: migrate the three named truth-contract assertion families (merge-gate checksGreen,
// blocked-harness predicate, GH retry) from source-text token matches to EXECUTED predicates.
// Each test runs the real executor body (or its extracted helper) against stubs and carries a
// MUTANT demonstration: a behavior-stripping mutation that keeps the legacy token in source/comment
// still satisfies the old grep but fails the executed predicate, so a comment containing the token
// can no longer satisfy the contract.
// ---------------------------------------------------------------------------

test("merge gate executes checksGreen: red local CI or a failing dispatched check blocks (RP-34)", async () => {
  const head = "f".repeat(40);
  const cleanGrill = { verdict: "pass", issues: [], report_path: "/g/report.md", grill: "opposite-harness", verified_sha: head };

  // Red LOCAL gate blocks (local-CI-first: the local blocking gate IS the merge gate).
  const redLocal = await runPrVerifyMerge({ grillResult: cleanGrill, headSha: head, ciCheck: { local_gate_exit: 1, checks: [] } });
  assert.equal(redLocal.verdict, "block");

  // A manually-dispatched failing GH check blocks even with a green local gate.
  const redDispatch = await runPrVerifyMerge({ grillResult: cleanGrill, headSha: head, ciCheck: { local_gate_exit: 0, checks: [{ name: "tier-1", state: "FAILURE", bucket: "fail" }] } });
  assert.equal(redDispatch.verdict, "block");

  // A dispatched check that exists but is not SUCCESS (still pending) blocks: fail-closed.
  const pendingDispatch = await runPrVerifyMerge({ grillResult: cleanGrill, headSha: head, ciCheck: { local_gate_exit: 0, checks: [{ name: "tier-1", state: "PENDING", bucket: "pending" }] } });
  assert.equal(pendingDispatch.verdict, "block");

  // Green local gate + SUCCESS dispatched check pass.
  const green = await runPrVerifyMerge({ grillResult: cleanGrill, headSha: head, ciCheck: { local_gate_exit: 0, checks: [{ name: "tier-1", state: "SUCCESS", bucket: "pass" }] } });
  assert.equal(green.verdict, "merge-ok");

  // Wave side: the same executed predicate through the real wave verify leg.
  const waveRed = await runMilestoneWaveVerify({ prs: ["o/r#9"], mergeResultFor: () => ({ merged: true }), ciCheckFor: () => ({ local_gate_exit: 1, checks: [] }) });
  assert.equal(waveRed.result.pr_verdicts[0].verdict, "block");
  assert.equal(waveRed.result.pr_verdicts[0].merged, false);
  assert.ok(!waveRed.events.some((e) => e.label.startsWith("strip-labels:")), "blocked PR must not strip labels");

  // MUTANT demonstration: hard-true checksGreen with the predicate text preserved in a comment
  // still satisfies the legacy token greps but MERGES a red-CI PR; only execution catches it.
  const real = read("scripts/workflows/pr-verify-merge.workflow.js");
  const checksGreenLine = "const checksGreen = ciCheck.local_gate_exit === 0 && !dispatchedFailing;";
  assert.ok(real.includes(checksGreenLine), "expected the canonical checksGreen definition");
  const mutant = real.replace(checksGreenLine, "const checksGreen = true; // checksGreen = ciCheck.local_gate_exit === 0 && !dispatchedFailing");
  assert.match(mutant, /!checksGreen/); // the legacy token grep still passes on the mutant
  const mutantRun = await runPrVerifyMerge({ grillResult: cleanGrill, headSha: head, ciCheck: { local_gate_exit: 1, checks: [] }, sourceOverride: mutant });
  assert.equal(mutantRun.verdict, "merge-ok", "mutant slips past token assertions; the executed predicate above is the real pin");
});

test("merge gate executes the blocked-harness predicate: a blocked grill never merges (RP-34)", async () => {
  const head = "9".repeat(40);
  const blockedGrill = { verdict: "skipped-harness-unavailable", grill: "blocked-harness-unavailable", issues: [{ severity: "blocker", what: "opposite harness unavailable" }], report_path: "/g/blocked.md", verified_sha: head };

  // pr-verify-merge path: everything else green, blocked harness alone must block.
  const blocked = await runPrVerifyMerge({ grillResult: blockedGrill, headSha: head });
  assert.equal(blocked.verdict, "block");
  assert.ok(blocked.blocking_findings.some((f) => f.source === "grill-probe-blocked"));

  // milestone-wave path: the same predicate through the real wave verify leg.
  const waveBlocked = await runMilestoneWaveVerify({
    prs: ["o/r#11"],
    mergeResultFor: () => ({ merged: true }),
    grillFor: (sha) => ({ verdict: "skipped-harness-unavailable", grill: "blocked-harness-unavailable", verified_sha: sha, report_path: "/g/blocked.md" }),
  });
  assert.equal(waveBlocked.result.pr_verdicts[0].verdict, "block");
  assert.equal(waveBlocked.result.pr_verdicts[0].merged, false);

  // MUTANT demonstration: severing the predicate from the gate while keeping the token in a
  // comment still satisfies the legacy grep but merges a blocked-harness PR.
  const real = read("scripts/workflows/pr-verify-merge.workflow.js");
  const gateLine = "grillBlockedHarnessUnavailable = isBlockedHarnessUnavailable(grillResult);";
  assert.ok(real.includes(gateLine), "expected the canonical blocked-harness gate line");
  const mutant = real.replace(gateLine, "grillBlockedHarnessUnavailable = false; // isBlockedHarnessUnavailable(grillResult) blocked-harness-unavailable");
  assert.match(mutant, /blocked-harness-unavailable/); // the legacy token grep still passes on the mutant
  const mutantRun = await runPrVerifyMerge({ grillResult: blockedGrill, headSha: head, sourceOverride: mutant });
  assert.equal(mutantRun.verdict, "merge-ok", "mutant slips past token assertions; the executed predicate above is the real pin");
});

test("gh retry helpers execute bounded transient retry against stubs (RP-34)", () => {
  // Harness (buildGhJson + transientError/fatalError) is module-scope above; it composes
  // the executor's REAL retry helper from its source with execFileSync/sleep stubbed.
  const scanSrc = read("scripts/workflows/milestone-active-scan.workflow.js");
  const triageSrc = read("scripts/workflows/gh-issue-triage.workflow.js");

  for (const [name, src, withQuotaClassifier, persistentTransientShape] of [
    ["milestone-active-scan", scanSrc, true, /github-project-api-transient/],
    ["gh-issue-triage", triageSrc, false, /HTTP 502/],
  ]) {
    // Transient failures retry, then succeed within the budget.
    const recoverCalls = [];
    const recover = buildGhJson(src, withQuotaClassifier, (cmd, cmdArgs, opts) => {
      recoverCalls.push({ cmd, opts });
      if (recoverCalls.length < 3) throw transientError();
      return JSON.stringify({ ok: true });
    });
    assert.deepEqual(recover.ghJson(["issue", "list"]), { ok: true }, `${name}: transient retry recovers`);
    assert.equal(recoverCalls.length, 3, `${name}: two transient failures then success = 3 calls`);
    assert.equal("GITHUB_TOKEN" in recoverCalls[0].opts.env, false, `${name}: gh env must drop GITHUB_TOKEN`);

    // Persistent transient failure: the budget is fully spent, then the failure propagates.
    let persistentCalls = 0;
    const persistent = buildGhJson(src, withQuotaClassifier, () => { persistentCalls += 1; throw transientError(); });
    assert.throws(() => persistent.ghJson(["issue", "list"]), persistentTransientShape, `${name}: persistent transient fails closed`);
    assert.equal(persistentCalls, persistent.GH_ATTEMPTS, `${name}: bounded retry budget fully spent`);

    // Non-transient failure: fail closed immediately, no retry burn.
    let fatalCalls = 0;
    const fatal = buildGhJson(src, withQuotaClassifier, () => { fatalCalls += 1; throw fatalError(); });
    assert.throws(() => fatal.ghJson(["issue", "list"]), /404/, `${name}: non-transient propagates`);
    assert.equal(fatalCalls, 1, `${name}: non-transient must not retry`);
  }

  // Scan-only classifier: "unknown owner type" on a project read surfaces as masked GraphQL quota.
  const quota = buildGhJson(scanSrc, true, () => { throw Object.assign(new Error("unknown owner type"), { stderr: "unknown owner type" }); });
  assert.throws(() => quota.ghJson(["project", "item-list"]), /github-graphql-quota/);

  // MUTANT demonstration: a retry-less ghJson with the GH_ATTEMPTS token still in source satisfies
  // the legacy /const GH_ATTEMPTS = 3/ grep but burns no retries; only execution catches it.
  const realGhJson = extractFunction(scanSrc, "ghJson");
  const mutantGhJson = realGhJson.replace("attempt <= GH_ATTEMPTS", "attempt <= 1");
  assert.notEqual(mutantGhJson, realGhJson, "expected the retry loop bound to be mutable");
  const mutantSrc = scanSrc.replace(realGhJson, mutantGhJson);
  assert.match(mutantSrc, /const GH_ATTEMPTS = 3/); // the legacy token grep still passes on the mutant
  let mutantCalls = 0;
  const mutant = buildGhJson(mutantSrc, true, () => { mutantCalls += 1; throw transientError(); });
  assert.throws(() => mutant.ghJson(["issue", "list"]));
  assert.equal(mutantCalls, 1, "mutant slips past token assertions; the executed bounded-retry pin above is the real contract");
});
