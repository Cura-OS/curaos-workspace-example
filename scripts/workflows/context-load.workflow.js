// context-load - read canonical CuraOS context + surface blockers before work starts. Read-only atomic.
// Contract: docs/agents/workflows/context-load.md
//
// Dual-runtime shape (workflow-defect #508): `export const meta` MUST be the FIRST statement so Claude's
// native Workflow() tool loads it. node:child_process + the issue-spec lib are reached only through the lazy
// accessors below (call-time, never module top level); the kit runs this file via process-bearing import()
// because it exports a default function.
export const meta = {
  name: "context-load",
  description: "Read canonical context a worker needs + surface in-flight/precondition blockers before starting a task",
  phases: [{ title: "Load", detail: "read rules/AGENTS/handover + barrier check" }],
};

// Lazy accessors: resolve `process`/`require` only at call time so module load stays meta-first and the
// Claude Workflow() tool (no process/require) can parse the file.
let _execFileSync;
function execFileSync(...callArgs) {
  if (!_execFileSync) _execFileSync = process.getBuiltinModule("node:child_process").execFileSync;
  return _execFileSync(...callArgs);
}
// Proxy keeps every `issueSpecLib.method(...)` call site unchanged while deferring the require() until first
// property access (runtime), so nothing executes at module top level.
let _issueSpecLib;
const issueSpecLib = new Proxy({}, {
  get(_target, prop) {
    if (!_issueSpecLib) {
      const { createRequire } = process.getBuiltinModule("node:module");
      // Resolve module-relative via import.meta.url (NOT process.cwd()) so ../lib resolves from any cwd.
      const localRequire = createRequire(import.meta.url);
      _issueSpecLib = localRequire("../lib/issue-spec.js");
    }
    return _issueSpecLib[prop];
  },
});

const CONTRACT = {
  name: "context-load",
  kind: "atomic",
  version: "0.1.0",
  inputs: {
    issue: { type: "string", required: false, description: "owner/repo#N of the issue being worked, if any" },
    target_paths: { type: "string", required: false, description: "comma-separated repo-relative paths the task will touch" },
    scope_hint: { type: "string", required: false, description: "free-text hint about the work (e.g. 'NestJS service', 'frontend app', 'contract package')" },
  },
  outputs: {
    context_summary: { type: "string", description: "distilled context the worker needs: relevant rules, owners, gotchas" },
    generated_code: { type: "boolean", description: "true if the target touches generated/scaffolded code (triggers the Generator-Evolution Gate)" },
    blockers: { type: "array", description: "any in-flight-generator/SDK barrier or precondition that blocks this work" },
    must_read: { type: "array", description: "the canonical docs/rules the worker must honor for this task" },
    issue_spec: { type: "object", description: "the resolved issue contract (when issue set): owned_paths, closeout_paths, forbidden_paths, acceptance, verification_cmds, adr_refs - the AUTHORITATIVE scope fence the worker must obey" },
    recommended_model: { type: "string", description: "complexity-derived implement tier (opus|sonnet|haiku) for tdd-implement, opus-default per [[curaos-model-tiering-rule]]; derived from issue_spec effort/owned_paths/adr_refs/acceptance" },
  },
  guarantees: { idempotent: true, determinism: "control-flow-only", side_effects: "none" },
  verification: "T1",
  models: { load: "sonnet" },
  composes: [],
};

// OPUS-DEFAULT implement-tier derivation (user policy 2026-05-29 + [[curaos-model-tiering-rule]]).
// Inlined (workflow sandbox forbids require(); canonical copy: scripts/lib/model-tier.js - keep in sync).
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
  return "opus";
}

const ROOT = ".";
const GH_ATTEMPTS = 3;
// args arrives as a JSON string from the Workflow tool, OR an object from a parent workflow() call.
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
  if (!base && typeof __filename === "string" && /scripts\/workflows\/context-load\.workflow\.js$/.test(__filename)) base = __filename;
  if (!base) base = pathToFileURL(`${process.cwd()}/scripts/workflows/context-load.workflow.js`).href;
  return createRequire(base)(name);
}
function ghRef() {
  if (!_ghRef) _ghRef = workflowRequire("../lib/gh-ref.js");
  return _ghRef;
}
function parseIssueRef(ref) {
  return ghRef().parseIssueRef(ref, { source: "context-load" });
}
function errorText(error) {
  return [
    error && error.message,
    error && error.stdout,
    error && error.stderr,
    error && Array.isArray(error.output) ? error.output.filter(Boolean).join("\n") : "",
  ].filter(Boolean).join("\n");
}
function isTransientGithubFailure(text) {
  return /(?:\bhttp\s*5\d\d\b|\bstatus\s*5\d\d\b|\bnon-200\s+status\s+5\d\d\b|gateway timeout|bad gateway|service unavailable|github\s+service|github.*unicorn|unicorn.*github)/i.test(String(text || ""));
}
function externalFailureKind(message) {
  if (/(?:rest|api).*(?:rate limit|quota)|(?:rate limit|quota).*(?:rest|api)/i.test(message)) return "github-rest-quota";
  if (/\b(?:http\s*)?40[134]\b|authentication|unauthorized|forbidden|permission|resource not accessible/i.test(message)) return "github-rest-unavailable";
  if (/\b(?:http\s*)?404\b|not found/i.test(message)) return "github-rest-not-found";
  if (isTransientGithubFailure(message)) return "github-api-transient";
  return "";
}
function sleep(ms) {
  execFileSync("sleep", [String(ms / 1000)], { stdio: "ignore" });
}
function ghApiJson(args) {
  const env = { ...process.env };
  delete env.GITHUB_TOKEN;
  let lastError = null;
  for (let attempt = 1; attempt <= GH_ATTEMPTS; attempt++) {
    try {
      const text = execFileSync("gh", ["api", ...args], { encoding: "utf8", env, maxBuffer: 20 * 1024 * 1024 });
      return JSON.parse(text);
    } catch (error) {
      lastError = error;
      const message = errorText(error);
      if (attempt < GH_ATTEMPTS && isTransientGithubFailure(message)) {
        sleep(500 * attempt);
        continue;
      }
      break;
    }
  }
  throw lastError;
}
function flattenPages(value) {
  if (!Array.isArray(value)) return [];
  if (!value.some(Array.isArray)) return value;
  return value.flatMap((page) => (Array.isArray(page) ? page : [page]));
}
function deterministicIssuePrefetch(issue, targetPaths, scopeHint) {
  const { repo, number } = parseIssueRef(issue);
  const data = ghApiJson([`repos/${repo}/issues/${number}`]);
  const comments = flattenPages(ghApiJson(["--paginate", "--slurp", `repos/${repo}/issues/${number}/comments`]))
    .map((comment) => comment && comment.body)
    .filter(Boolean);
  const body = data && data.body ? data.body : "";
  const title = data && data.title ? data.title : "";
  const spec = issueSpecLib.issueSpecFromIssueText({ title, body, comments, target_paths: targetPaths, scope_hint: scopeHint });
  return {
    title,
    body,
    comments,
    issue_spec: spec,
    context_summary: issueSpecLib.issueSpecSummary(issue, title, spec),
    generated_code: issueSpecLib.generatedCodeFromSpec(spec, `${title}\n${body}\n${comments.join("\n")}\n${scopeHint || ""}`),
    must_read: Array.isArray(spec.adr_refs) ? spec.adr_refs : [],
  };
}
function uniqueStrings(values) {
  const out = [];
  const seen = new Set();
  for (const value of values || []) {
    const v = typeof value === "string" ? value.trim() : value;
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}
function stripResolvedIssueSpecBlockers(blockers, ownedPaths) {
  const list = Array.isArray(blockers) ? blockers.filter(Boolean) : [];
  if (!ownedPaths || !ownedPaths.length) return list;
  return list.filter((blocker) => !/^issue-spec-unresolved\b/i.test(String(blocker || "").trim()));
}

export default async function workflow({ args, agent, phase }) {
  phase("Load");
  const cfg = parseArgs(args);
  let deterministic = null;
  if (cfg.issue) {
    try {
      deterministic = deterministicIssuePrefetch(cfg.issue, cfg.target_paths || "", cfg.scope_hint || "");
    } catch (error) {
      const message = errorText(error);
      const invalidRef = /context-load: invalid issue ref/i.test(message);
      const kind = externalFailureKind(message) || "github-rest-unavailable";
      if (!invalidRef) {
          const unresolved = { owned_paths: [], closeout_paths: [], forbidden_paths: [], acceptance: [], verification_cmds: [], adr_refs: [] };
        return {
          context_summary: `context-load deterministic REST prefetch failed for ${cfg.issue}: ${message}`,
          generated_code: false,
          blockers: [`issue-spec-unresolved: deterministic REST prefetch failed for ${cfg.issue}: ${message}`],
          must_read: [],
          issue_spec: unresolved,
          recommended_model: pickImplementModel(unresolved, ""),
          blocked_by_external: true,
          error_kind: kind,
          error: message,
        };
      }
      throw error;
    }
  }

  const result = await agent(
    `Load the canonical CuraOS context for a worker about to start a task. Read (Bash/Read), from ${ROOT}:
- AGENTS.md, CLAUDE.md, ai/rules/README.md, ai/rules/curaos_model_tiering_rule.md, ai/rules/curaos_cli_agents_rule.md, ai/rules/curaos_generator_evolution_rule.md (READ its "In-flight generator/SDK barrier" section carefully)
- ai/curaos/AGENTS.md, ai/curaos/CONTEXT.md, ai/curaos/Requirements.md, ai/curaos/docs/HANDOVER.md, ai/curaos/docs/ISSUE-ROADMAP.md
- docs/agents/issue-tracker.md, docs/agents/github-roadmap-project.md
TASK CONTEXT: issue=${cfg.issue || "(none)"}, target_paths=${cfg.target_paths || "(unspecified)"}, scope_hint=${cfg.scope_hint || "(none)"}.
${cfg.issue ? `
DETERMINISTIC ISSUE-SPEC PREFETCH (AUTHORITATIVE): executor code already read ${cfg.issue} through GitHub REST (\`gh api repos/:owner/:repo/issues/:number\` + comments) and produced this issue_spec. Model output may enrich context_summary/blocker rationale but MUST NOT erase or narrow these deterministic fields:
${JSON.stringify(deterministic ? deterministic.issue_spec : {}, null, 2)}

	ISSUE RESOLUTION (REQUIRED - issue is set): use the deterministic issue_spec above as the floor. If you read the issue body/comments for extra context, do it only to enrich, not replace. Extract VERBATIM additions into issue_spec:
	- owned_paths[] - the repo-relative path root(s) this issue is allowed to touch (from "## Scope", "owned-path", the module/submodule named in the title/body). This is the AUTHORITATIVE scope fence. If the body names a worker brief with an exact file list, capture those roots.
	- closeout_paths[] - non-implementation artifacts explicitly required by acceptance, verification, or gates (for example paired ai/curaos mirror docs, ai/curaos/docs/DOC-GRAPH.md, curaos/bun.lock, generated SDK paths, or parent submodule pointers). These never expand product implementation scope.
	- forbidden_paths[] - anything "## Do not touch" names, plus any path NOT under owned_paths by default.
- acceptance[] - each "## Acceptance" criterion as a checkable line.
- verification_cmds[] - the exact test/CI commands the issue/ADR mandates (e.g. the specific bun test paths). The CANONICAL CI gate set is the BLOCKING gates in curaos/ci-gates.yaml (the single source of truth - run via \`just ci\` / \`bash scripts/ci-local.sh\`, includes typecheck + the \`bun run ci\` aggregate + depcruise + the \`ci-gates-sync\` drift self-gate); GH auto-CI is OFF (workflow_dispatch-only per ai/rules/curaos_local_ci_first_rule.md) so this LOCAL gate IS the merge gate. Capture the issue-specific buckets here; the worker runs the full ci-gates.yaml blocking set as the gate. Do NOT hand-pick a frozen command list - defer to the config.
- adr_refs[] - every ADR/RFC/research doc the body cites the worker MUST implement to (e.g. ADR-0212 §2.1).
If the issue body is empty or unreadable, set issue_spec.owned_paths=[] and add a blocker "issue-spec-unresolved: <why>".` : ""}

Produce:
1. context_summary - the distilled set of rules/owners/gotchas THIS task must honor (not a doc dump; the 5-10 things that matter for this specific task). When issue is set, this MUST be derived from the resolved issue body, NOT a generic summary.
2. generated_code - true iff the issue's owned_paths/scope indicate a NestJS service, frontend app, contract package, BPM workflow, SDK, or codegen template (i.e. generated/scaffolded code → the Generator-Evolution Gate applies).
3. blockers - if a downstream-milestone task is being started while any module=codegen|*-sdk|contracts lane carries agent-claimed:* or agent-PR-open (check ISSUE-ROADMAP + HANDOVER for the active milestone + in-flight lanes), list "inflight-generator-sdk-barrier: <detail>". Also list any missing precondition + any "issue-spec-unresolved". Empty if clear.
4. must_read - the canonical doc/rule paths the worker must honor for this task (include the adr_refs).
5. issue_spec - the resolved contract above (when issue set). Omit/empty object when no issue.
Read-only: do NOT edit anything.`,
    { label: "context-load", phase: "Load", model: CONTRACT.models.load, schema: {
      type: "object",
      required: ["context_summary", "generated_code", "blockers", "must_read"],
      properties: {
        context_summary: { type: "string" },
        generated_code: { type: "boolean" },
        blockers: { type: "array", items: { type: "string" } },
        must_read: { type: "array", items: { type: "string" } },
        issue_spec: {
          type: "object",
	          properties: {
	            owned_paths: { type: "array", items: { type: "string" } },
	            closeout_paths: { type: "array", items: { type: "string" } },
	            forbidden_paths: { type: "array", items: { type: "string" } },
            acceptance: { type: "array", items: { type: "string" } },
            verification_cmds: { type: "array", items: { type: "string" } },
            adr_refs: { type: "array", items: { type: "string" } },
          },
        },
      },
    } }
  );

  if (cfg.issue) {
    const deterministicSpec = deterministic ? deterministic.issue_spec : {};
    result.issue_spec = issueSpecLib.mergeIssueSpec(deterministicSpec, result.issue_spec || {});
    const ownedPaths = Array.isArray(result.issue_spec.owned_paths) ? result.issue_spec.owned_paths.filter(Boolean) : [];
    result.blockers = stripResolvedIssueSpecBlockers(result.blockers, ownedPaths);
    if (!ownedPaths.length) result.blockers = uniqueStrings([...(result.blockers || []), "issue-spec-unresolved: deterministic REST parser resolved no owned_paths"]);
    result.generated_code = !!(result.generated_code || (deterministic && deterministic.generated_code) || issueSpecLib.generatedCodeFromSpec(result.issue_spec, result.context_summary || ""));
    result.must_read = uniqueStrings([...(Array.isArray(result.must_read) ? result.must_read : []), ...((deterministic && deterministic.must_read) || []), ...(result.issue_spec.adr_refs || [])]);
    if (!result.context_summary || !result.context_summary.trim()) {
      result.context_summary = deterministic ? deterministic.context_summary : `Issue ${cfg.issue}: context-load resolved no summary.`;
    }
  }

  // Derive the implement tier from the resolved spec (opus-default). tdd-implement consumes this
  // via impl_model; if context-load is bypassed it falls back to its own inlined picker.
  result.recommended_model = cfg.issue ? pickImplementModel(result.issue_spec, result.context_summary) : "opus";

  return result;
}
