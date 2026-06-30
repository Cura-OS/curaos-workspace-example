// gh-issue-triage - triage one issue to its canonical state label + paper-vs-real blocker. Contract: docs/agents/workflows/gh-issue-triage.md
//
// Dual-runtime shape (workflow-defect #508): `export const meta` MUST be the FIRST statement so Claude's
// native Workflow() tool loads it. node:child_process is reached only through the lazy execFileSync wrapper
// below (call-time, never module top level); the kit runs this file via process-bearing import() because it
// exports a default function.
export const meta = {
  name: "gh-issue-triage",
  description: "Triage one issue to its canonical state label + classify blocker paper-vs-real (idempotent)",
  phases: [{ title: "Triage", detail: "read + classify + apply single state label" }],
};

// Lazy node:child_process accessor: resolves `process` only at call time so module load stays meta-first
// and the Claude Workflow() tool (no process/require) can parse the file.
let _execFileSync;
function execFileSync(...callArgs) {
  if (!_execFileSync) _execFileSync = process.getBuiltinModule("node:child_process").execFileSync;
  return _execFileSync(...callArgs);
}

const CONTRACT = {
  name: "gh-issue-triage",
  kind: "atomic",
  version: "0.1.1",
  inputs: {
    issue: { type: "string", required: true, description: "owner/repo#N to triage" },
    dry_run: { type: "boolean", required: false, description: "report the triage decision + label changes without applying" },
    prefetch: { type: "object", required: false, description: "optional batchIssueRead record with body, labels, and native parent data" },
  },
  outputs: {
    state_label: { type: "string", description: "the resolved state label (needs-triage|needs-info|ready-for-agent|ready-for-human|wontfix)" },
    blocker_kind: { type: "string", description: "paper | real | none - per the orchestrator paper-vs-real triage" },
    label_changes: { type: "array", description: "labels added/removed" },
    rationale: { type: "string", description: "why this state was chosen" },
    project_fields: { type: "object", description: "CuraOS Roadmap field name -> option label, derived from the issue frontmatter (Target Version, CuraOS Milestone, Priority, Cycle, Initiative, Effort, Module, Issue Kind); omit any field the frontmatter does not declare" },
    parent_ref: { type: "string", description: "the issue parent from frontmatter parent:, ## Parent, or native parent endpoint, normalized as owner/repo#N or empty string when parent metadata is absent" },
    is_root: { type: "boolean", description: "true only when parent: is explicitly empty and ## Parent explicitly says None or Root; downstream wiring uses this as root truth" },
    blocked_by_external: { type: "boolean", description: "true only when deterministic issue prefetch or the triage agent hit an external quota/runtime failure; callers must stop dispatch and retry later" },
    error_kind: { type: "string", description: "external failure classifier when blocked_by_external=true" },
  },
  guarantees: { idempotent: true, determinism: "control-flow-only", side_effects: "github" },
  verification: "T1",
  models: { triage: "sonnet" },
  composes: [],
};

const ROOT = ".";
const GH_ATTEMPTS = 3;
const STATE_LABELS = ["needs-triage", "needs-info", "ready-for-agent", "ready-for-human", "wontfix"];
function parseArgs(a) {
  if (a && typeof a === "object") return a;
  if (typeof a === "string" && a.trim()) { try { return JSON.parse(a); } catch { return {}; } }
  return {};
}
let _ghRef;
let _agentRuntimeStatus;
function workflowRequire(name) {
  const { createRequire } = process.getBuiltinModule("node:module");
  const { pathToFileURL } = process.getBuiltinModule("node:url");
  let base = "";
  try { base = eval("import.meta.url"); } catch {}
  if (!base && typeof __filename === "string" && /scripts\/workflows\/gh-issue-triage\.workflow\.js$/.test(__filename)) base = __filename;
  if (!base) base = pathToFileURL(`${process.cwd()}/scripts/workflows/gh-issue-triage.workflow.js`).href;
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
function parseIssueRef(ref) {
  return ghRef().parseIssueRef(ref, { source: "gh-issue-triage" });
}
function normalizeIssueRef(value) {
  return ghRef().normalizeIssueRef(value);
}
function parentRefFromBody(body) {
  const match = String(body || "").match(/^##\s+Parent\s*\r?\n([\s\S]*?)(?=^##\s+|\s*$)/mi);
  return match ? normalizeIssueRef(match[1]) : "";
}
function explicitRootFromBody(body) {
  const match = String(body || "").match(/^##\s+Parent\s*\r?\n([\s\S]*?)(?=^##\s+|\s*$)/mi);
  return !!match && /\b(?:none|root|true root)\b/i.test(match[1]);
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
function ghJson(args) {
  const env = { ...process.env };
  delete env.GITHUB_TOKEN;
  let lastError = null;
  for (let attempt = 1; attempt <= GH_ATTEMPTS; attempt++) {
    try {
      const text = execFileSync("gh", args, { encoding: "utf8", env, maxBuffer: 20 * 1024 * 1024 });
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
function gh(args) {
  const env = { ...process.env };
  delete env.GITHUB_TOKEN;
  let lastError = null;
  for (let attempt = 1; attempt <= GH_ATTEMPTS; attempt++) {
    try {
      return execFileSync("gh", args, { encoding: "utf8", env, maxBuffer: 20 * 1024 * 1024 }).trim();
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
function sleep(ms) {
  execFileSync("sleep", [String(ms / 1000)], { stdio: "ignore" });
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
  if (/unknown owner type/i.test(message)) return "github-graphql-quota";
  if (/(?:graphql|api).*(?:rate limit|quota)|(?:rate limit|quota).*(?:graphql|api)/i.test(message)) return "github-graphql-quota";
  if (isTransientGithubFailure(message)) return "github-api-transient";
  return "";
}
function agentFailureKind(message) {
  const text = String(message || "");
  if (/\b(?:session|usage)\s+limit\b|rate\s+limit|quota|too many requests|\b429\b|\bresets?\b/i.test(text)) return "agent-runtime-quota";
  try {
    return agentRuntimeStatus().agentFailureKind(text);
  } catch {}
  return "agent-runtime-unavailable";
}
function unquote(value) {
  const v = String(value || "").trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) return v.slice(1, -1);
  if (v === "[]") return [];
  return v;
}
function parseFrontmatter(body) {
  const match = String(body || "").match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  const out = {};
  let listKey = null;
  for (const raw of match[1].split(/\r?\n/)) {
    const line = raw.trimEnd();
    const keyMatch = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (keyMatch) {
      listKey = null;
      const key = keyMatch[1];
      const value = unquote(keyMatch[2]);
      out[key] = value;
      if (keyMatch[2].trim() === "") {
        out[key] = [];
        listKey = key;
      }
      continue;
    }
    const itemMatch = line.trim().match(/^-\s*(.*)$/);
    if (listKey && itemMatch) out[listKey].push(unquote(itemMatch[1]));
  }
  return out;
}
function priorityLabel(value) {
  const normalized = String(value || "").toLowerCase();
  const map = {
    P0: "Critical",
    P1: "High",
    P2: "Medium",
    P3: "Low",
    critical: "Critical",
    high: "High",
    medium: "Medium",
    low: "Low",
  };
  return map[value] || map[normalized] || value;
}
function issueKindLabel(value) {
  const normalized = String(value || "").trim().toLowerCase();
  const map = {
    initiative: "Roadmap",
    epic: "Roadmap",
    story: "Implementation",
    task: "Implementation",
    bug: "Implementation",
    spike: "Planning",
    gate: "Gate",
    verification: "Verification",
  };
  return map[normalized] || value;
}
function normalizeProjectFields(fields) {
  const src = fields && typeof fields === "object" && !Array.isArray(fields) ? fields : {};
  const out = {};
  for (const [key, value] of Object.entries(src)) {
    if (value === undefined || value === null || value === "") continue;
    const normalizedKey = key === "Milestone" ? "CuraOS Milestone" : key;
    out[normalizedKey] = value;
  }
  return out;
}
function projectFieldsFromFrontmatter(frontmatter) {
  const fields = {};
  const targetVersion = frontmatter["target-version"] || frontmatter.target_version || frontmatter.targetVersion;
  if (targetVersion) fields["Target Version"] = String(targetVersion);
  if (frontmatter.milestone) fields["CuraOS Milestone"] = String(frontmatter.milestone);
  if (frontmatter.priority) fields.Priority = priorityLabel(String(frontmatter.priority));
  if (frontmatter.cycle) fields.Cycle = String(frontmatter.cycle);
  if (frontmatter.initiative) fields.Initiative = String(frontmatter.initiative);
  if (frontmatter.effort) fields.Effort = String(frontmatter.effort);
  if (frontmatter.module) fields.Module = String(frontmatter.module);
  if (frontmatter.type) fields["Issue Kind"] = issueKindLabel(frontmatter.type);
  return fields;
}
function nativeParentRef(repo, number) {
  try {
    return issueRefFromApiIssue(ghJson(["api", `repos/${repo}/issues/${number}/parent`]));
  } catch (error) {
    if (/\bHTTP 404\b|not found/i.test(errorText(error))) return "";
    throw error;
  }
}
function labelsFor(value) {
  if (!Array.isArray(value)) return [];
  return value.map((label) => (typeof label === "string" ? label : label?.name)).filter(Boolean);
}
function stateLabel(labels) {
  const present = STATE_LABELS.filter((label) => labels.includes(label));
  if (present.length === 1) return present[0];
  const parked = ["ready-for-human", "needs-info", "wontfix"].find((label) => present.includes(label));
  return parked || "needs-triage";
}
function reconcileStateLabel(issue, resolvedState) {
  const { repo, number } = parseIssueRef(issue);
  const data = ghJson(["issue", "view", number, "--repo", repo, "--json", "labels"]);
  const current = labelsFor(data.labels);
  const remove = STATE_LABELS.filter((label) => label !== resolvedState && current.includes(label));
  const args = ["issue", "edit", number, "--repo", repo, "--add-label", resolvedState];
  for (const label of remove) args.push("--remove-label", label);
  gh(args);
  return [
    { action: "add", label: resolvedState },
    ...remove.map((label) => ({ action: "remove", label })),
  ];
}
function applyStateLabelOrExternal(issue, resolvedState, dryRun) {
  if (dryRun) return { label_changes: [] };
  try {
    return { label_changes: reconcileStateLabel(issue, resolvedState) };
  } catch (error) {
    const message = errorText(error);
    const kind = externalFailureKind(message);
    if (!kind) throw error;
    return {
      label_changes: [],
      blocked_by_external: true,
      error_kind: kind,
      error: message,
    };
  }
}
function attachLabelApplyResult(base, applied) {
  if (!applied || !applied.blocked_by_external) {
    return {
      ...base,
      label_changes: [
        ...(Array.isArray(base.label_changes) ? base.label_changes : []),
        ...((applied && applied.label_changes) || []),
      ],
    };
  }
  return {
    ...base,
    blocker_kind: "real",
    label_changes: Array.isArray(base.label_changes) ? base.label_changes : [],
    rationale: `${base.rationale} Label reconciliation blocked by external GitHub failure: ${applied.error}`,
    blocked_by_external: true,
    error_kind: applied.error_kind,
    error: applied.error,
  };
}
function isEmptyListish(value) {
  if (value === undefined || value === null || value === "") return true;
  if (Array.isArray(value)) return value.length === 0;
  return String(value).trim() === "[]";
}
function frontmatterValue(frontmatter, ...keys) {
  for (const key of keys) {
    if (frontmatter && Object.prototype.hasOwnProperty.call(frontmatter, key) && !isEmptyListish(frontmatter[key])) {
      return frontmatter[key];
    }
  }
  return "";
}
function sectionContent(body, heading) {
  const escaped = String(heading || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = String(body || "").match(new RegExp(`(?:^|\\r?\\n)##\\s+${escaped}\\s*\\r?\\n([\\s\\S]*?)(?=\\r?\\n##\\s+|\\s*$)`, "i"));
  return match ? match[1].trim() : "";
}
function hasBodySection(body, heading) {
  return sectionContent(body, heading).length > 0;
}
function blockersSectionClear(body) {
  const content = sectionContent(body, "Blockers");
  if (!content) return false;
  const normalized = content
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/^[\s*-]+/gm, "")
    .trim();
  return /^(?:none|n\/a|no blockers|blocked-by:\s*\[\]|\[\])\.?$/i.test(normalized);
}
function hasCanonicalReadySections(body, isRoot) {
  const required = ["Scope", "Do not touch", "Acceptance", "Verification", "Docs", "Blockers"];
  if (!isRoot) required.push("Parent");
  return required.every((heading) => hasBodySection(body, heading)) && blockersSectionClear(body);
}
function hasCanonicalReadyFrontmatter(frontmatter, parentRef, isRoot) {
  const required = [
    frontmatterValue(frontmatter, "target-version", "target_version", "targetVersion"),
    frontmatterValue(frontmatter, "milestone"),
    frontmatterValue(frontmatter, "priority"),
    frontmatterValue(frontmatter, "effort"),
    frontmatterValue(frontmatter, "module"),
    frontmatterValue(frontmatter, "type"),
  ];
  return required.every((value) => !isEmptyListish(value)) && (isRoot === true || !!parentRef);
}
function deterministicReadinessFacts(body, frontmatter, parentRef, isRoot) {
  return {
    has_ready_frontmatter: hasCanonicalReadyFrontmatter(frontmatter, parentRef, isRoot),
    has_ready_sections: hasCanonicalReadySections(body, isRoot),
    has_clear_blockers_section: blockersSectionClear(body),
  };
}
function leafIssueInWorkspaceRepo(repo, frontmatter) {
  const type = String((frontmatter && frontmatter.type) || "").trim().toLowerCase();
  return repo === "your-org/curaos-ai-workspace" && (type === "story" || type === "task");
}
function parentRefFromPrefetch(record) {
  if (!record || !record.parent || !record.parent.repo || !record.parent.number) return "";
  return normalizeIssueRef(`${record.parent.repo}#${record.parent.number}`);
}
function deterministicIssueMetadataFromPrefetch(issue, record) {
  if (!record || typeof record !== "object" || Array.isArray(record) || record.body === undefined) return null;
  const { repo } = parseIssueRef(issue);
  const body = record.body == null ? "" : String(record.body);
  const labels = labelsFor(record.labels);
  const frontmatter = parseFrontmatter(body);
  const parent_ref = normalizeIssueRef(frontmatter.parent) || parentRefFromBody(body) || parentRefFromPrefetch(record);
  const declaresParent = Object.prototype.hasOwnProperty.call(frontmatter, "parent");
  const is_root = !parent_ref && declaresParent && isEmptyListish(frontmatter.parent) && explicitRootFromBody(body);
  const readiness = deterministicReadinessFacts(body, frontmatter, parent_ref, is_root);
  return {
    state_label: stateLabel(labels),
    blocker_kind: "none",
    label_changes: [],
    rationale: "deterministic fallback from prefetched labels + frontmatter",
    project_fields: projectFieldsFromFrontmatter(frontmatter),
    parent_ref,
    is_root,
    labels,
    has_foresight_marker: labels.includes("foresight"),
    has_blocked_marker: labels.includes("blocked"),
    has_frontmatter_blocker: !isEmptyListish(frontmatter["blocked-by"]),
    has_wrong_repo_for_leaf: leafIssueInWorkspaceRepo(repo, frontmatter),
    has_authoritative_prefetch: true,
    ...readiness,
  };
}
function deterministicIssueMetadata(issue, prefetch) {
  const prefetched = deterministicIssueMetadataFromPrefetch(issue, prefetch);
  if (prefetched) return prefetched;
  const { repo, number } = parseIssueRef(issue);
  const data = ghJson(["issue", "view", number, "--repo", repo, "--json", "body,labels,state"]);
  const labels = labelsFor(data.labels);
  const frontmatter = parseFrontmatter(data.body || "");
  const parent_ref = normalizeIssueRef(frontmatter.parent) || parentRefFromBody(data.body || "") || nativeParentRef(repo, number);
  const declaresParent = Object.prototype.hasOwnProperty.call(frontmatter, "parent");
  const is_root = !parent_ref && declaresParent && isEmptyListish(frontmatter.parent) && explicitRootFromBody(data.body || "");
  const readiness = deterministicReadinessFacts(data.body || "", frontmatter, parent_ref, is_root);
  return {
    state_label: stateLabel(labels),
    blocker_kind: "none",
    label_changes: [],
    rationale: "deterministic fallback from existing labels + frontmatter",
    project_fields: projectFieldsFromFrontmatter(frontmatter),
    parent_ref,
    is_root,
    labels,
    has_foresight_marker: labels.includes("foresight"),
    has_blocked_marker: labels.includes("blocked"),
    has_frontmatter_blocker: !isEmptyListish(frontmatter["blocked-by"]),
    has_wrong_repo_for_leaf: leafIssueInWorkspaceRepo(repo, frontmatter),
    has_authoritative_prefetch: false,
    ...readiness,
  };
}

function deterministicStateResolution(deterministic, agentBlocker, agentState) {
  const readyGuardsClear =
    !deterministic.has_blocked_marker &&
    !deterministic.has_frontmatter_blocker &&
    agentBlocker !== "real";
  const deterministicReady =
    deterministic.state_label === "ready-for-agent" &&
    readyGuardsClear &&
    agentState === "ready-for-agent";
  const deterministicNeedsInfo = deterministic.state_label === "needs-info";
  const promotableNeedsInfo =
    deterministicNeedsInfo &&
    agentState === "ready-for-agent" &&
    readyGuardsClear;
  const deterministicNonDispatchState = Boolean(
    deterministic.state_label &&
    deterministic.state_label !== "needs-triage" &&
    deterministic.state_label !== "ready-for-agent" &&
    deterministic.state_label !== "needs-info",
  );
  let resolvedState = agentState;
  if (deterministicReady) {
    resolvedState = "ready-for-agent";
  } else if (promotableNeedsInfo) {
    resolvedState = "ready-for-agent";
  } else if (deterministicNeedsInfo) {
    resolvedState = "needs-info";
  } else if (deterministicNonDispatchState) {
    resolvedState = deterministic.state_label;
  } else if (agentState === "ready-for-agent" && !readyGuardsClear) {
    resolvedState = "needs-triage";
  }
  return { deterministicReady, deterministicNonDispatchState, resolvedState };
}

function resolveWrongRepoLeafBackstop(result, deterministic) {
  const agentBlocker = result && result.blocker_kind ? result.blocker_kind : "paper";
  const agentState = result && result.state_label ? result.state_label : "needs-triage";
  const { deterministicNonDispatchState, resolvedState } =
    deterministicStateResolution(deterministic, agentBlocker, agentState);
  const preservesWrongRepoState = ["ready-for-human", "needs-info", "wontfix"].includes(resolvedState);
  return {
    ...result,
    state_label: preservesWrongRepoState ? resolvedState : "needs-triage",
    blocker_kind: "paper",
    rationale: deterministicNonDispatchState || preservesWrongRepoState
      ? `deterministic state-label truth: existing ${resolvedState} label preserved over workspace-hosted leaf dispatch backstop`
      : "Story/Task issues must live in the owning submodule repo, not curaos-ai-workspace; transfer or recreate the issue before dispatch.",
    project_fields: {
      ...normalizeProjectFields(result && result.project_fields),
      ...deterministic.project_fields,
    },
    parent_ref: deterministic.parent_ref || normalizeIssueRef(result && result.parent_ref),
    is_root: deterministic.is_root === true || result.is_root === true,
    has_foresight_marker: deterministic.has_foresight_marker,
    has_blocked_marker: deterministic.has_blocked_marker,
  };
}

function deterministicFastPathResult(deterministic) {
  if (!deterministic || deterministic.has_authoritative_prefetch !== true) return null;
  const base = {
    ...deterministic,
    label_changes: [],
    project_fields: deterministic.project_fields || {},
    parent_ref: deterministic.parent_ref || "",
    is_root: deterministic.is_root === true,
  };
  if (deterministic.has_wrong_repo_for_leaf) {
    return resolveWrongRepoLeafBackstop({
      ...base,
      state_label: deterministic.state_label,
      blocker_kind: "paper",
      rationale: "deterministic fast path: workspace-hosted Story/Task leaf backstop from prefetched issue metadata",
    }, deterministic);
  }
  if (deterministic.state_label === "ready-for-human" || deterministic.state_label === "wontfix") {
    return {
      ...base,
      blocker_kind: "real",
      rationale: `deterministic fast path: existing ${deterministic.state_label} state label is authoritative and non-dispatchable`,
    };
  }
  if (deterministic.state_label === "needs-info") {
    return {
      ...base,
      blocker_kind: "paper",
      rationale: "deterministic fast path: existing needs-info label is authoritative until an agent or operator confirms promotion",
    };
  }
  if (deterministic.has_blocked_marker || deterministic.has_frontmatter_blocker) {
    return {
      ...base,
      state_label: "needs-triage",
      blocker_kind: "real",
      rationale: "deterministic fast path: blocked marker or blocked-by frontmatter prevents ready-for-agent without model triage",
    };
  }
  if (
    deterministic.state_label === "ready-for-agent" &&
    deterministic.has_ready_frontmatter &&
    deterministic.has_ready_sections &&
    deterministic.has_clear_blockers_section
  ) {
    return {
      ...base,
      state_label: "ready-for-agent",
      blocker_kind: "none",
      rationale: "deterministic fast path: prefetched ready-for-agent issue has complete frontmatter, required sections, clear blockers, and native parent/root truth",
    };
  }
  if (deterministic.state_label === "ready-for-agent") {
    return {
      ...base,
      state_label: "needs-info",
      blocker_kind: "paper",
      rationale: "deterministic fast path: existing ready-for-agent label is unsafe because prefetched issue metadata is missing required frontmatter, sections, parent/root truth, or a clear blockers section",
    };
  }
  return null;
}

export default async function workflow({ args, agent, phase }) {
  phase("Triage");
  const cfg = parseArgs(args);
  if (!cfg.issue) throw new Error("gh-issue-triage: args.issue (owner/repo#N) is required");
  let deterministic;
  try {
    deterministic = deterministicIssueMetadata(cfg.issue, cfg.prefetch);
  } catch (error) {
    const message = errorText(error);
    const kind = externalFailureKind(message);
    if (kind) {
      return {
        state_label: "needs-triage",
        blocker_kind: "real",
        label_changes: [],
        rationale: `gh-issue-triage deterministic prefetch blocked by external GitHub failure: ${message}`,
        project_fields: {},
        parent_ref: "",
        blocked_by_external: true,
        error_kind: kind,
        error: message,
      };
    }
    throw error;
  }

  const fastPath = deterministicFastPathResult(deterministic);
  if (fastPath) {
    const applied = applyStateLabelOrExternal(cfg.issue, fastPath.state_label, cfg.dry_run);
    return attachLabelApplyResult(fastPath, applied);
  }

  const hasPrefetch = cfg.prefetch && typeof cfg.prefetch === "object" && typeof cfg.prefetch.body === "string";
  const prefetchedLabels = hasPrefetch ? labelsFor(cfg.prefetch.labels) : [];
  const prefetchedParent = hasPrefetch ? parentRefFromPrefetch(cfg.prefetch) : "";
  const prefetchBlock = hasPrefetch
    ? `\n\nAUTHORITATIVE PREFETCH for ${cfg.issue}\nLabels: ${prefetchedLabels.length ? prefetchedLabels.join(", ") : "(none)"}\nNative parent: ${prefetchedParent || "(none)"}\nBody:\n<<<ISSUE_BODY\n${cfg.prefetch.body}\nISSUE_BODY\n>>>`
    : "";
  const issueReadStep = hasPrefetch
    ? "Use the AUTHORITATIVE PREFETCH below for body, labels, and native parent. Do not re-fetch the issue body. You may do one targeted comments or dependency spot-check only if the prefetched body explicitly requires comments to decide."
    : `Read it: gh issue view ${cfg.issue} --comments. Read body + comments + any linked deps.`;

  const result = await agent(
    `Triage issue ${cfg.issue} per docs/agents/triage-labels.md + the orchestrator §3 Paper-vs-Real triage. Work from ${ROOT} (Bash, \`env -u GITHUB_TOKEN gh\`).
1. ${issueReadStep} ALSO parse the body's leading YAML frontmatter (the \`---\` ... \`---\` block) for: target-version, milestone, priority, cycle, initiative, effort, module, type, parent.
   Build project_fields = a map of CuraOS Roadmap field NAME -> desired option label, using ONLY keys the frontmatter actually declares (omit any the frontmatter does not declare - null/absent over guessed; NEVER invent a value):
   - "CuraOS Milestone": the frontmatter milestone: verbatim (e.g. M9). This is the SOURCE OF TRUTH for the roadmap GROUPING field; whenever frontmatter declares milestone: MX, project_fields["CuraOS Milestone"] MUST equal "MX". Valid values are the current roadmap Project options, including M1.5 and M1..M17. (The Project's grouping single-select is literally named "CuraOS Milestone"; do NOT use the bare "Milestone" key; that resolves to GitHub's built-in milestone field and silently drops the write.)
   - "Priority": map frontmatter priority P0->"Critical", P1->"High", P2->"Medium", P3->"Low"; ALSO accept already-named "Critical"/"High"/"Medium"/"Low" verbatim. (NOT P0..P3 - the Project option labels are the named tiers.)
   - "Cycle": one of C1-Foundation..C6-Production-Hardening (frontmatter cycle:).
   - "Initiative": one of the 8 charter initiatives (frontmatter initiative:).
   - "Effort": frontmatter effort: verbatim.
   - "Module": frontmatter module: verbatim.
   - "Issue Kind": map frontmatter type to the live Project option: Initiative/Epic -> "Roadmap"; Story/Task/Bug -> "Implementation"; Spike -> "Planning"; Gate -> "Gate"; Verification -> "Verification".
   - "Target Version": frontmatter target-version: verbatim.
   Also set parent_ref = the frontmatter parent: value, or the first issue reference in ## Parent, or the native issue parent endpoint. Normalize to owner/repo#N. Empty means parent metadata is absent, not necessarily root. Set is_root=true only when parent: is explicitly empty and ## Parent explicitly says None or Root; downstream wiring uses is_root as root truth.
2. Classify any blocker: paper (a missing spec/section you could fill from current code/specs/research - NOT a real blocker) vs real (genuine external/user dependency) vs none. Note: \`blocked\` is NOT a state label; real blockers belong in blocked-by frontmatter + native GitHub dependency.
3. Resolve EXACTLY ONE state label: needs-triage | needs-info | ready-for-agent | ready-for-human | wontfix. ready-for-agent ONLY if the body is complete (all ## sections present + frontmatter current); otherwise needs-info/needs-triage.
   **FORESIGHT DEPENDENCY RULE (BINDING):** the \`foresight\` label is a discovered-dependency marker, not a parking state. Do NOT park an issue solely because it carries \`foresight\`. If it is relevant to the active working set or is needed by a current dependency chain, has a complete body/frontmatter, and has no real blocker, resolve it \`ready-for-agent\` like any other work. Preserve the \`foresight\` marker until close-path hygiene. If a foresight item is incomplete, has a real blocker, belongs to a future Target Version with no current dependency chain, or needs user/operator action, use the normal state/blocker result and name that actual blocker. An unmet real/external blocker stays \`needs-triage\` plus \`blocked\`, never ready-for-agent.
4. ${cfg.dry_run ? "DRY RUN: report the decision + the label changes you WOULD make + the derived project_fields/parent_ref; change NOTHING (deriving fields is read-only - no mutations regardless)." : "Apply: set the single resolved state label, removing every OTHER STATE label (needs-triage|needs-info|ready-for-agent|ready-for-human|wontfix). Do not preserve a previous state label when the resolved state differs; dual state labels are forbidden and collapse tracker truth on the next pass. PRESERVE the category label (enhancement|bug) AND the marker labels (foresight|blocked): those are orthogonal markers, NOT state labels, and must never be stripped here. Deriving project_fields/parent_ref is READ-ONLY - do NOT write any Project field here; just return them for the gate to stamp."}
Return EXACTLY ONE JSON object, never an array and never a list of alternatives. Object fields: state_label, blocker_kind (paper|real|none), label_changes (added/removed), rationale, project_fields (Roadmap field name -> option label; omit undeclared), parent_ref (owner/repo#N or ""), is_root (boolean).${prefetchBlock}`,
    { label: "gh-issue-triage", phase: "Triage", model: CONTRACT.models.triage, schema: {
      type: "object",
      required: ["state_label", "blocker_kind", "label_changes", "rationale", "project_fields", "parent_ref"],
      properties: {
        state_label: { type: "string", enum: ["needs-triage", "needs-info", "ready-for-agent", "ready-for-human", "wontfix"] },
        blocker_kind: { type: "string", enum: ["paper", "real", "none"] },
        label_changes: { type: "array", items: { type: "string" } },
        rationale: { type: "string" },
        project_fields: { type: "object", description: "Roadmap field name -> option label (Target Version/CuraOS Milestone/Priority/Cycle/Initiative/Effort/Module/Issue Kind); omit any field the frontmatter does not declare. The grouping field key is exactly 'CuraOS Milestone', NOT bare 'Milestone'." },
        parent_ref: { type: "string", description: "normalized parent issue ref owner/repo#N or empty string" },
        is_root: { type: "boolean", description: "true only for explicit root issues" },
      },
    } }
  ).catch((error) => ({
    ...deterministic,
    state_label: "needs-triage",
    blocker_kind: "real",
    label_changes: [],
    rationale: `gh-issue-triage agent unavailable; fail-closed without deterministic fallback: ${errorText(error)}`,
    blocked_by_external: true,
    error_kind: agentFailureKind(errorText(error)),
    error: errorText(error),
  }));

  const agentBlocker = result && result.blocker_kind ? result.blocker_kind : "paper";
  const agentState = result && result.state_label ? result.state_label : "needs-triage";
  const applyResolvedState = (resolvedState) => applyStateLabelOrExternal(cfg.issue, resolvedState, cfg.dry_run);
  if (deterministic.has_wrong_repo_for_leaf) {
    const resolved = resolveWrongRepoLeafBackstop(result, deterministic);
    const applied = applyResolvedState(resolved.state_label);
    return attachLabelApplyResult(resolved, applied);
  }
  const { deterministicReady, deterministicNonDispatchState, resolvedState } =
    deterministicStateResolution(deterministic, agentBlocker, agentState);
  const resolvedBlocker = deterministicReady ? "none" : agentBlocker;
  const resolvedRationale = deterministicReady
    ? "deterministic state-label truth: existing ready-for-agent label confirmed by fresh triage, no blocked marker, no blocked-by frontmatter, and no real blocker"
    : deterministicNonDispatchState
      ? `deterministic state-label truth: existing ${deterministic.state_label} label preserved over agent triage`
    : result.rationale;

  return attachLabelApplyResult({
    ...result,
    state_label: resolvedState,
    blocker_kind: resolvedBlocker,
    label_changes: Array.isArray(result.label_changes) ? result.label_changes : [],
    rationale: resolvedRationale,
    project_fields: {
      ...normalizeProjectFields(result && result.project_fields),
      ...deterministic.project_fields,
    },
    parent_ref: deterministic.parent_ref || normalizeIssueRef(result && result.parent_ref),
    is_root: deterministic.is_root === true || result.is_root === true,
    has_foresight_marker: deterministic.has_foresight_marker,
    has_blocked_marker: deterministic.has_blocked_marker,
  }, applyResolvedState(resolvedState));
}
