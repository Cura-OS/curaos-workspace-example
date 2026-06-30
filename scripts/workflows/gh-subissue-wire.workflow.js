// gh-subissue-wire - diff-first native sub-issues + blocked_by deps. Calls scripts/lib/gh-project.js.
// Contract: docs/agents/workflows/gh-subissue-wire.md
//
// Dual-runtime shape (workflow-defect #508): `export const meta` MUST be the FIRST statement so Claude's
// native Workflow() tool loads it. The gh-project lib is reached only through the lazy wrappers below
// (call-time require, never module top level); the kit runs this file via process-bearing import() because it
// exports a default function.
export const meta = {
  name: "gh-subissue-wire",
  description: "Wire native sub-issues + dependencies diff-first (idempotent)",
  phases: [{ title: "Wire", detail: "list existing edges + add only missing" }],
};

// Lazy gh-project lib: resolves `process`/`require` only at call time so module load stays meta-first and the
// Claude Workflow() tool (no process/require) can parse the file. Thin hoisted wrappers keep call sites intact.
let _ghProjectLib;
function ghProjectLib() {
  if (!_ghProjectLib) {
    const { createRequire } = process.getBuiltinModule("node:module");
    // Resolve module-relative via import.meta.url (NOT process.cwd()) so ../lib resolves from any cwd.
    const localRequire = createRequire(import.meta.url);
    _ghProjectLib = localRequire("../lib/gh-project.js");
  }
  return _ghProjectLib;
}
function gh(...callArgs) { return ghProjectLib().gh(...callArgs); }
function listSubIssues(...callArgs) { return ghProjectLib().listSubIssues(...callArgs); }
function addSubIssue(...callArgs) { return ghProjectLib().addSubIssue(...callArgs); }
function removeSubIssue(...callArgs) { return ghProjectLib().removeSubIssue(...callArgs); }
function addBlockedBy(...callArgs) { return ghProjectLib().addBlockedBy(...callArgs); }
function isNotFound(error) { return ghProjectLib().isNotFound(error); }
function probeIssueHierarchyFields(...callArgs) { return ghProjectLib().probeIssueHierarchyFields(...callArgs); }
function issueHierarchy(...callArgs) { return ghProjectLib().issueHierarchy(...callArgs); }

const CONTRACT = {
  name: "gh-subissue-wire",
  kind: "atomic",
  version: "0.2.2",
  inputs: {
    parent: { type: "string", required: true, description: "owner/repo#N parent issue" },
    children: { type: "string", required: true, description: "JSON array of owner/repo#N child issues to wire as sub-issues" },
    blocked_by: { type: "string", required: false, description: "JSON array of {issue, blocking} dependency pairs to wire" },
    dry_run: { type: "boolean", required: false, description: "report planned edges without creating them" },
  },
  outputs: {
    subissues_added: { type: "array", description: "child refs newly wired (diff-first: existing skipped)" },
    subissues_depth_limited: { type: "array", description: "child refs GitHub refused to native-wire because the native sub-issue tree exceeded GitHub's max depth" },
    deps_added: { type: "array", description: "dependency edges newly wired" },
    already_wired: { type: "array", description: "edges that already existed (no-op)" },
    reparented: { type: "array", description: "child refs moved from a stale native parent before wiring" },
    blocked_by_external: { type: "boolean", description: "true when GitHub API/quota prevents deterministic wiring" },
    error_kind: { type: "string", description: "external failure kind when blocked_by_external is true" },
    error: { type: "string", description: "external failure detail when blocked_by_external is true" },
  },
  guarantees: { idempotent: true, determinism: "control-flow-only", side_effects: "github" },
  verification: "T1",
  models: { wire: "haiku" },
  composes: [],
};

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
  return workflowRequire("../lib/workflow-common.js").externalFailureKind(message);
}

function isSubissueDepthLimit(message) {
  return /\bmore than\s+7\s+layers\s+of\s+sub-issues\b/i.test(String(message || ""));
}

function externalWireResult(kind, message, dryRun) {
  return {
    subissues_added: [],
    subissues_depth_limited: [],
    deps_added: [],
    already_wired: [],
    reparented: [],
    dry_run: dryRun,
    blocked_by_external: true,
    error_kind: kind,
    error: message,
  };
}

let _ghRef;
function workflowRequire(name) {
  const { createRequire } = process.getBuiltinModule("node:module");
  const { pathToFileURL } = process.getBuiltinModule("node:url");
  let base = "";
  try { base = eval("import.meta.url"); } catch {}
  if (!base && typeof __filename === "string" && /scripts\/workflows\/gh-subissue-wire\.workflow\.js$/.test(__filename)) base = __filename;
  if (!base) base = pathToFileURL(`${process.cwd()}/scripts/workflows/gh-subissue-wire.workflow.js`).href;
  return createRequire(base)(name);
}
function ghRef() {
  if (!_ghRef) _ghRef = workflowRequire("../lib/gh-ref.js");
  return _ghRef;
}
function parseIssueRef(ref, fieldName) {
  return ghRef().parseIssueRefOrUrl(ref, { source: "gh-subissue-wire", fieldName });
}

function parseJsonArray(value, fieldName) {
  if (value === undefined || value === null || value === "") return [];
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    let parsed;
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new Error(`gh-subissue-wire: args.${fieldName} must be a JSON array`);
    }
    if (Array.isArray(parsed)) return parsed;
  }
  throw new Error(`gh-subissue-wire: args.${fieldName} must be a JSON array`);
}

function normalizeRepositoryUrl(url) {
  const match = String(url || "").match(/\/repos\/([^/]+\/[^/]+)$/);
  return match ? match[1] : "";
}

function issueRefFromApiIssue(issue) {
  const repo = normalizeRepositoryUrl(issue && issue.repository_url);
  const number = Number(issue && issue.number);
  if (!repo || !Number.isFinite(number)) return "";
  return `${repo}#${number}`;
}

function uniqueRefs(refs, fieldName) {
  const seen = new Set();
  const out = [];
  for (const ref of refs) {
    const parsed = parseIssueRef(ref, fieldName);
    if (seen.has(parsed.ref)) continue;
    seen.add(parsed.ref);
    out.push(parsed);
  }
  return out;
}

// Classified REST fallback pair (2 calls/child): used ONLY when the schema probe says
// Issue.parent/subIssues are unavailable. The primary path is ONE aliased GraphQL hierarchy
// read via issueHierarchy(); the lib's isNotFound() classifies the expected parent-probe 404
// on the structured payload, and gh() captures its stderr so the noise never reaches wave logs.
function issueDbId(issue) {
  const data = gh(["api", `repos/${issue.repo}/issues/${issue.number}`], { json: true });
  if (!data || !Number.isFinite(Number(data.id))) {
    throw new Error(`gh-subissue-wire: could not resolve DB id for ${issue.ref}`);
  }
  return Number(data.id);
}

function issueParent(issue) {
  try {
    const parent = gh(["api", `repos/${issue.repo}/issues/${issue.number}/parent`], { json: true });
    const ref = issueRefFromApiIssue(parent);
    if (!ref) return null;
    return parseIssueRef(ref, "parent");
  } catch (error) {
    if (!isNotFound(error)) throw error;
    return null;
  }
}

function listBlockedBy(issue) {
  return gh(["api", "--paginate", `repos/${issue.repo}/issues/${issue.number}/dependencies/blocked_by`], { json: true });
}

export default async function runGhSubissueWire({ args, phase }) {
  phase("Wire");
  const cfg = parseArgs(typeof args !== "undefined" ? args : undefined);
  if (!cfg.parent || !cfg.children) throw new Error("gh-subissue-wire: args.parent and args.children are required");

  const dryRun = !!cfg.dry_run;
  try {
    const parent = parseIssueRef(cfg.parent, "parent");
    const children = uniqueRefs(parseJsonArray(cfg.children, "children"), "children");
    const dependencies = parseJsonArray(cfg.blocked_by || "[]", "blocked_by");
    const existingSubissues = new Set(listSubIssues(parent.repo, parent.number).map(issueRefFromApiIssue).filter(Boolean));

    const subissuesAdded = [];
    const subissuesDepthLimited = [];
    const depsAdded = [];
    const alreadyWired = [];
    const reparented = [];
    let depthLimitMessage = "";

    // ONE aliased GraphQL hierarchy read (parent + databaseId) for all children needing wiring,
    // chunked at 50 aliases inside issueHierarchy(). Schema-probe-gated: when Issue.parent/subIssues
    // are unavailable the per-child classified REST pair (issueParent + issueDbId) takes over.
    const pendingChildren = children.filter((child) => !existingSubissues.has(child.ref));
    const hierarchy = pendingChildren.length && probeIssueHierarchyFields()
      ? issueHierarchy(pendingChildren.map((child) => ({ repo: child.repo, number: child.number })))
      : null;

    for (const child of children) {
      if (existingSubissues.has(child.ref)) {
        alreadyWired.push(child.ref);
        continue;
      }
      const info = hierarchy ? hierarchy.get(child.ref) : null;
      const currentParent = info
        ? (info.parent ? parseIssueRef(`${info.parent.repo}#${info.parent.number}`, "parent") : null)
        : issueParent(child);
      const childDbId = info ? info.databaseId : issueDbId(child);
      if (currentParent && currentParent.ref !== parent.ref) {
        if (!dryRun) removeSubIssue(currentParent.repo, currentParent.number, childDbId, Date.now());
        reparented.push(`${child.ref} from ${currentParent.ref} to ${parent.ref}`);
      }
      if (!dryRun) {
        try {
          addSubIssue(parent.repo, parent.number, childDbId, Date.now());
        } catch (error) {
          const message = errorText(error);
          if (isSubissueDepthLimit(message)) {
            subissuesDepthLimited.push(child.ref);
            if (!depthLimitMessage) depthLimitMessage = message;
            continue;
          }
          throw error;
        }
      }
      subissuesAdded.push(child.ref);
      existingSubissues.add(child.ref);
    }

    for (const pair of dependencies) {
      if (!pair || typeof pair !== "object") throw new Error("gh-subissue-wire: blocked_by entries must be {issue, blocking}");
      const issue = parseIssueRef(pair.issue, "blocked_by.issue");
      const blocking = parseIssueRef(pair.blocking, "blocked_by.blocking");
      const edge = `${issue.ref} blocked_by ${blocking.ref}`;
      const existingDeps = new Set(listBlockedBy(issue).map(issueRefFromApiIssue).filter(Boolean));
      if (existingDeps.has(blocking.ref)) {
        alreadyWired.push(edge);
        continue;
      }
      if (!dryRun) addBlockedBy(issue.repo, issue.number, issueDbId(blocking), Date.now());
      depsAdded.push(edge);
    }

    const result = {
      subissues_added: subissuesAdded,
      subissues_depth_limited: subissuesDepthLimited,
      deps_added: depsAdded,
      already_wired: alreadyWired,
      reparented,
      dry_run: dryRun,
    };
    if (subissuesDepthLimited.length) {
      result.blocked_by_external = false;
      result.error_kind = "github-subissue-depth-limit";
      result.error = depthLimitMessage;
    }
    return result;
  } catch (error) {
    const message = errorText(error);
    const kind = externalFailureKind(message);
    if (kind) return externalWireResult(kind, message, dryRun);
    throw error;
  }
}
