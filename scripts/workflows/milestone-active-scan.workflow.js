// milestone-active-scan: deterministic read-only scan of the CuraOS Roadmap Project and every open org issue.
// Milestone fields are tracker metadata, not dispatch gates. Composed by milestone-wave.
//
// Dual-runtime shape (workflow-defect #508): `export const meta` MUST be the FIRST statement so Claude's
// native Workflow() tool loads it. node:child_process is reached only through the lazy execFileSync wrapper
// below (call-time, never module top level); the kit runs this file via process-bearing import() because it
// exports a default function.
export const meta = {
  name: "milestone-active-scan",
  description: "Deterministic read-only scan: all open issue candidates + Project metadata + open PRs",
  phases: [{ title: "Scan", detail: "read Project items + ready issues + open PRs (no mutation)" }],
};

// Machine-checkable pairing contract. Playbook: docs/agents/workflows/milestone-active-scan.md;
// gate: scripts/check-workflow-sync.js (forward pair pass + RP-19 reverse pass). No `models` key
// because this executor makes no agent() call: the scan is fully deterministic.
const CONTRACT = {
  name: "milestone-active-scan",
  kind: "atomic",
  version: "0.2.1",
  inputs: {
    dry_run: { type: "boolean", required: false, description: "echoed back in the result; the scan itself is read-only either way" },
  },
  outputs: {
    active_target_version: { type: "string", description: "lowest open Target Version on the board (empty when the board carries none)" },
    target_versions: { type: "array", description: "every Target Version carried by an open issue, ascending" },
    milestones_by_target_version: { type: "object", description: "map of Target Version to its CuraOS Milestones (board metadata)" },
    milestones: { type: "array", description: "every CuraOS Milestone carried by an open issue, ascending" },
    open_issue_count: { type: "number", description: "raw count of every open org issue before runtime-label exclusion" },
    candidates: { type: "array", description: "every open org issue not held by agent-claimed:* or agent-PR-open" },
    runtime_held_candidates: { type: "array", description: "open issues held out by agent-claimed:* or agent-PR-open; orchestrator must verify the runtime lane before treating the queue as done" },
    paper_blocked_candidates: { type: "array", description: "candidates carrying the blocked label; a label, not a disposition" },
    promotable_foresight: { type: "array", description: "legacy bucket, always empty; promotion is decided downstream of dependency_cleared" },
    dependency_cleared: { type: "array", description: "foresight/blocked issues whose every named blocked-by ref is now CLOSED" },
    generator_inflight: { type: "string", description: "issue ref of an in-flight codegen/SDK/contracts lane, empty when none; downstream generated work stays frozen while set" },
    needs_user: { type: "array", description: "always empty; the scan never crosses a user-decision boundary" },
    open_prs: { type: "array", description: "open PRs linked to open org issues, as owner/repo#N refs" },
    project_scan_completed: { type: "boolean", description: "true only when board, issue, and PR scans all completed below their fail-closed caps" },
    dry_run: { type: "boolean", description: "echo of inputs.dry_run" },
  },
  guarantees: { idempotent: true, determinism: "control-flow-only", side_effects: "none" },
  verification: "T1",
  composes: [],
};

// Lazy node:child_process accessor: resolves `process` only at call time so module load stays meta-first
// and the Claude Workflow() tool (no process/require) can parse the file.
let _execFileSync;
function execFileSync(...callArgs) {
  if (!_execFileSync) _execFileSync = process.getBuiltinModule("node:child_process").execFileSync;
  return _execFileSync(...callArgs);
}

const OWNER = "your-org";
// RP-32: resolve the board by TITLE at call time (lockstep with lib/gh-project.js
// PROJECT_TITLE). The number is NOT hardcoded: prose said /1, the old constant said "2";
// the generated schema doc (docs/agents/github-roadmap-project-schema.md) records identity.
// Read-only fail-closed resolution; never create (ensureProject's create-on-miss is a
// triage-path side effect, wrong for a scan).
const PROJECT_TITLE = "CuraOS Roadmap";
const PROJECT_ITEM_LIMIT = 1000;
const ISSUE_SEARCH_LIMIT = 1000;
const PR_SEARCH_LIMIT = 1000;
const GH_ATTEMPTS = 3;

function sleep(ms) {
  execFileSync("sleep", [String(ms / 1000)], { stdio: "ignore" });
}

function errorText(error) {
  return [
    error && error.message,
    error && error.stdout,
    error && error.stderr,
  ].filter(Boolean).join("\n");
}

function isTransientGithubFailure(text) {
  return /(?:\bhttp\s*5\d\d\b|\bstatus\s*5\d\d\b|\bnon-200\s+status\s+5\d\d\b|gateway timeout|bad gateway|service unavailable|github\s+service|github.*unicorn|unicorn.*github)/i.test(String(text || ""));
}

function isMaskedProjectGraphqlQuota(message, args) {
  return Array.isArray(args) && args[0] === "project" && /unknown owner type/i.test(String(message || ""));
}

function ghJson(args) {
  const env = { ...process.env };
  delete env.GITHUB_TOKEN;
  let lastError = null;
  for (let attempt = 1; attempt <= GH_ATTEMPTS; attempt++) {
    try {
      const text = execFileSync("gh", args, {
        encoding: "utf8",
        env,
        maxBuffer: 20 * 1024 * 1024,
      });
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
  const message = errorText(lastError);
  if (isMaskedProjectGraphqlQuota(message, args)) {
    throw new Error(`github-graphql-quota: gh ${args.join(" ")} failed; gh project owner lookup returned "unknown owner type", which can mask exhausted GraphQL quota\n${message}`);
  }
  if (isTransientGithubFailure(message)) {
    throw new Error(`github-project-api-transient: gh ${args.join(" ")} failed after ${GH_ATTEMPTS} attempts\n${message}`);
  }
  throw lastError;
}

function issueRefForContent(content) {
  if (!content || content.type !== "Issue" || !content.repository || !content.number) return "";
  return `${content.repository}#${content.number}`;
}

function labelsFor(value) {
  if (!Array.isArray(value)) return [];
  return value.map((label) => (typeof label === "string" ? label : label?.name)).filter(Boolean);
}

function normalizedFieldName(name) {
  return String(name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function itemField(item, fieldName) {
  const wanted = normalizedFieldName(fieldName);
  for (const [key, value] of Object.entries(item || {})) {
    if (normalizedFieldName(key) === wanted) return value;
  }
  return "";
}

function targetVersionForItem(item) {
  return String(itemField(item, "Target Version") || "").trim();
}

function versionSortKey(version) {
  const text = String(version || "").trim();
  const match = /^v(\d+(?:\.\d+)*)$/i.exec(text);
  if (!match) return [Number.MAX_SAFE_INTEGER, text.toLowerCase()];
  return match[1].split(".").map((part) => Number(part));
}

function compareTargetVersion(a, b) {
  const ak = versionSortKey(a);
  const bk = versionSortKey(b);
  const len = Math.max(ak.length, bk.length);
  for (let i = 0; i < len; i++) {
    const av = ak[i] ?? 0;
    const bv = bk[i] ?? 0;
    if (typeof av === "number" && typeof bv === "number" && av !== bv) return av - bv;
    if (typeof av === "string" || typeof bv === "string") return String(av).localeCompare(String(bv));
  }
  return String(a).localeCompare(String(b), undefined, { numeric: true });
}

// Only the genuinely-unavailable (a worker holds it or
// a PR is open). ready-for-human is NOT excluded here, because per curaos_foresight_rule it means
// "interview the user to unblock THIS wave," not "skip"; the new candidate buckets must surface it
// so the orchestrator's §3.6 interview path can act on it (review #562 finding).
function isClaimedOrPrOpen(labels) {
  return labels.some((label) => label.startsWith("agent-claimed:") || label === "agent-PR-open");
}

// In-flight generator/SDK barrier (curaos_generator_evolution_rule + user directive 2026-05-27):
// while ANY codegen / curaos/*-sdk / curaos/contracts issue is already agent-claimed:* or
// agent-PR-open, downstream generated work must stay FROZEN (every service the next wave produces
// inherits the defect the in-flight fix is removing). Every candidate bucket the scan emits
// inherits this lock so frozen downstream work never surfaces (review #562 finding).
function isGeneratorScope(ref, title) {
  return /codegen|[-/]sdk\b|\bsdk[-/]|contracts/i.test(`${ref} ${title || ""}`);
}
function generatorLaneInflight(openIssues) {
  for (const [ref, issue] of openIssues.entries()) {
    const labels = labelsFor(issue.labels);
    const claimed = labels.some((l) => l.startsWith("agent-claimed:") || l === "agent-PR-open");
    if (claimed && isGeneratorScope(ref, issue.title)) return ref;
  }
  return "";
}

// Accept ONLY a real `owner/repo#N` issue ref; anything else (prose blockers like
// "GA wave 2 activation", bare "#5", empty) returns "". Without this, a prose entry survives,
// reaches issueState(), becomes UNKNOWN, and would wrongly keep a genuinely-cleared story out of
// dependency_cleared (review #570 Major). A blocked-by carrying a prose blocker therefore yields
// NO parsed refs from that entry, so the story stays staged until a real dependency clears - correct,
// because a prose blocker is a human gate this scan cannot resolve.
function normalizeBlockedByRef(value) {
  const ref = String(value || "").trim().replace(/^['"]|['"]$/g, "");
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+#\d+$/.test(ref) ? ref : "";
}

// Parse the `blocked-by:` YAML-list from an issue body's frontmatter into owner/repo#N refs.
// (the foresight/breakdown convention writes `blocked-by:\n  - <owner>/<repo>#<n>` or `blocked-by: []`)
function parseBlockedBy(body) {
  const text = String(body || "");
  const fmMatch = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const fm = fmMatch ? fmMatch[1] : text;
  const refs = [];
  // inline form: blocked-by: [a, b]  OR  blocked-by: []
  const inline = fm.match(/^\s*blocked-by:\s*\[([^\]]*)\]\s*$/m);
  if (inline) {
    for (const part of inline[1].split(",")) {
      const r = normalizeBlockedByRef(part);
      if (r) refs.push(r);
    }
    return refs;
  }
  // block form: blocked-by:\n  - ref\n  - ref
  const blockStart = fm.search(/^\s*blocked-by:\s*$/m);
  if (blockStart >= 0) {
    const after = fm.slice(blockStart).split(/\r?\n/).slice(1);
    for (const line of after) {
      const m = line.match(/^\s*-\s*(.+?)\s*$/);
      if (!m) break; // end of the list
      const r = normalizeBlockedByRef(m[1]);
      if (r) refs.push(r); // non-ref (prose) entries are dropped by normalizeBlockedByRef
    }
  }
  return refs;
}

// Raw-string gh call (NO JSON.parse) for `--jq`-extracted scalar fields like `.body` / `.state`.
// ghJson would JSON.parse the raw string and throw; these fields are not JSON. Retries on transient
// GitHub failures (same backoff as ghJson) and FAILS CLOSED: a non-transient error propagates rather
// than being swallowed, so a blocker probe never silently degrades dependency_cleared (CR #570 Major).
function ghText(args) {
  const env = { ...process.env };
  delete env.GITHUB_TOKEN;
  let lastError = null;
  for (let attempt = 1; attempt <= GH_ATTEMPTS; attempt++) {
    try {
      return execFileSync("gh", args, { encoding: "utf8", env, maxBuffer: 20 * 1024 * 1024 });
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

function issueBody(ref) {
  const m = String(ref).match(/^([^/]+)\/([^#]+)#(\d+)$/);
  if (!m) return "";
  return ghText(["issue", "view", m[3], "--repo", `${m[1]}/${m[2]}`, "--json", "body", "--jq", ".body"]) || "";
}

function issueState(ref) {
  const m = String(ref).match(/^([^/]+)\/([^#]+)#(\d+)$/);
  if (!m) return "UNKNOWN";
  return String(ghText(["issue", "view", m[3], "--repo", `${m[1]}/${m[2]}`, "--json", "state", "--jq", ".state"]) || "").trim().toUpperCase();
}

// A `foresight`/`blocked` issue whose `blocked-by:` frontmatter refs are ALL CLOSED is now
// dependency-cleared: its gate just opened (e.g. M16 #538 merged unblocks M17-S2 #545), so it is
// promotable EVEN IF its milestone is not marked active on the board. The scan reads the body only
// for the small foresight/blocked set (not every open issue), so this stays cheap. Issues whose
// blocked-by includes a prose/non-ref blocker (e.g. "GA wave 2 activation") are NOT cleared by this
// (parseBlockedBy drops prose), so they stay staged until a real dependency clears.
// issueState() now fails closed (ghText throws on a non-transient probe failure) - a blocker lookup
// failure surfaces as a thrown error to the caller instead of silently dropping a cleared story.
function isDependencyCleared(body, openIssues) {
  const blockers = parseBlockedBy(body);
  if (!blockers.length) return false; // blocked-by:[] is the #407 mislabel class, handled elsewhere
  for (const b of blockers) {
    if (openIssues.has(b)) return false; // a blocker is still OPEN (in the open-issue set)
    if (issueState(b) !== "CLOSED") return false; // not open in set, but confirm it is CLOSED (not unknown/missing)
  }
  return true; // every named blocker is closed
}

function assertBelowCap(kind, count, limit) {
  if (count >= limit) {
    throw new Error(`${kind} reached gh --limit ${limit}; refusing to scan a truncated result set`);
  }
}

function ghProjectLib() {
  const { createRequire } = process.getBuiltinModule("node:module");
  return createRequire(import.meta.url)("../lib/gh-project.js");
}

function isProjectReadUnavailable(message) {
  return /github-graphql-quota|(?:graphql|api).*(?:rate limit|quota)|(?:rate limit|quota).*(?:graphql|api)|unknown owner type/i.test(String(message || ""));
}

// RP-32 title->number resolution (memoized; uses the scan's OWN ghJson so the
// isMaskedProjectGraphqlQuota "unknown owner type" classification still applies; the
// lib/gh-project.js call path would bypass it). Plain optional param instead of a destructured
// default: the truth-contract extractFunction harness brace-matches from the first "{" and
// cannot extract a destructured parameter list. Fails closed on 0 or >1 open title match.
let _projectNumber;
function resolveProjectNumber(ghJsonImpl) {
  if (_projectNumber === undefined) {
    const impl = ghJsonImpl || ghJson;
    const data = impl(["project", "list", "--owner", OWNER, "--format", "json", "--limit", "100"]);
    const projects = Array.isArray(data.projects) ? data.projects : [];
    const matches = projects.filter((p) => p && p.title === PROJECT_TITLE && !p.closed);
    if (matches.length !== 1) {
      throw new Error(`project title resolution failed: ${matches.length} open projects titled "${PROJECT_TITLE}" (expected exactly 1)`);
    }
    _projectNumber = String(matches[0].number);
  }
  return _projectNumber;
}

function projectItems(logFn) {
  // RP-38: share the same TTL board snapshot as milestone-wave. A fresh snapshot costs zero
  // GraphQL Project calls; stale or missing snapshots still refetch and fail closed on quota,
  // transient errors, or truncation through boardSnapshot()/fetchBoardItems().
  const ghProject = ghProjectLib();
  try {
    const projectNumber = Number(resolveProjectNumber());
    const snap = ghProject.boardSnapshot({
      projectNumber,
      ghFn: (projectArgs) => ghJson(projectArgs),
    });
    const items = Array.isArray(snap.items) ? snap.items : [];
    assertBelowCap("project item-list", items.length, PROJECT_ITEM_LIMIT);
    if (logFn) logFn(`active-scan: board snapshot ${snap.fromCache ? "cache-hit" : "refreshed"} items=${items.length}`);
    return items;
  } catch (error) {
    const message = errorText(error);
    if (!isProjectReadUnavailable(message)) throw error;
    const cached = ghProject.loadBoardSnapshotFile();
    const items = cached && Array.isArray(cached.items) ? cached.items : [];
    if (!items.length) {
      throw new Error(`github-graphql-quota: active-scan Project read failed and no local board snapshot fallback was available\n${message}`);
    }
    assertBelowCap("project item-list", items.length, PROJECT_ITEM_LIMIT);
    if (logFn) logFn(`active-scan: board snapshot stale-cache-fallback items=${items.length}`);
    return items;
  }
}

function openIssuesByRef() {
  const items = ghJson(["search", "issues", "--owner", OWNER, "--state", "open", "--json", "repository,number,title,labels,url", "--limit", String(ISSUE_SEARCH_LIMIT)]);
  assertBelowCap("open issue search", items.length, ISSUE_SEARCH_LIMIT);
  const byRef = new Map();
  for (const item of items) {
    const repo = item.repository?.fullName || item.repository?.nameWithOwner || item.repository?.name;
    if (!repo || !item.number) continue;
    byRef.set(`${repo}#${item.number}`, item);
  }
  return byRef;
}

function openPrRefs(openIssueRefs) {
  const prs = ghJson(["search", "prs", "--owner", OWNER, "--state", "open", "--json", "repository,number,title,body,url", "--limit", String(PR_SEARCH_LIMIT)]);
  assertBelowCap("open PR search", prs.length, PR_SEARCH_LIMIT);
  const refs = [];
  for (const pr of prs) {
    const repo = pr.repository?.fullName || pr.repository?.nameWithOwner || pr.repository?.name;
    if (!repo || !pr.number) continue;
    const text = `${pr.title || ""}\n${pr.body || ""}`;
    const linked = [...text.matchAll(/your-org\/([A-Za-z0-9_.-]+)#(\d+)/g)]
      .map((match) => `your-org/${match[1]}#${match[2]}`);
    const local = [...text.matchAll(/(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)/gi)]
      .map((match) => `${repo}#${match[1]}`);
    if ([...linked, ...local].some((ref) => openIssueRefs.has(ref))) {
      refs.push(`${repo}#${pr.number}`);
    }
  }
  return [...new Set(refs)].sort();
}

export default async function workflow({ args, phase, log }) {
  phase("Active Scan");
  const items = projectItems(log);
  const openIssues = openIssuesByRef();
  const milestonesByIssue = new Map();
  const targetVersionByIssue = new Map();
  const allMilestones = [];
  const targetVersions = [];
  const milestonesByTargetVersion = new Map();

  for (const item of items) {
    const milestone = String(itemField(item, "CuraOS Milestone") || "").trim();
    const targetVersion = targetVersionForItem(item);
    const ref = issueRefForContent(item.content);
    if (ref && milestone) {
      milestonesByIssue.set(ref, milestone);
      if (openIssues.has(ref) && !allMilestones.includes(milestone)) allMilestones.push(milestone);
    }
    if (ref && targetVersion) {
      targetVersionByIssue.set(ref, targetVersion);
      if (openIssues.has(ref) && !targetVersions.includes(targetVersion)) targetVersions.push(targetVersion);
    }
    if (!milestone || !targetVersion) continue;
    if (!milestonesByTargetVersion.has(targetVersion)) milestonesByTargetVersion.set(targetVersion, []);
    const versionMilestones = milestonesByTargetVersion.get(targetVersion);
    if (!versionMilestones.includes(milestone)) versionMilestones.push(milestone);
  }

  targetVersions.sort(compareTargetVersion);
  allMilestones.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  for (const milestones of milestonesByTargetVersion.values()) {
    milestones.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }

  // Gather the FULL issue set. Milestone is metadata for roadmap grouping and closure reporting, not a
  // dispatch gate. The scan classifies every open, unclaimed issue; downstream §3 paper-vs-real triage
  // + working-tree partition decide what actually dispatches.
  //   candidates                 = every open issue not held by agent-claimed:* / agent-PR-open
  //   paper_blocked_candidates   = carry the `blocked` label but `blocked` is a label, not a disposition
  //   dependency_cleared         = foresight/blocked issues whose named blockers are now all closed
  // If a codegen/SDK/contracts lane is already in-flight, downstream generated work stays FROZEN
  // (in-flight generator barrier).
  const generator_inflight = generatorLaneInflight(openIssues);
  const candidates = [];
  const runtime_held_candidates = [];
  const paper_blocked_candidates = [];
  const promotable_foresight = [];
  const depCheckQueue = []; // foresight/blocked issues to test for a now-cleared blocked-by gate
  for (const [ref, issue] of openIssues.entries()) {
    const labels = labelsFor(issue.labels);
    // Only agent-claimed:* / agent-PR-open are genuinely unavailable. ready-for-human is kept (it
    // means interview-the-user, surfaced for §3.6), so the new buckets do not silently drop it.
    if (isClaimedOrPrOpen(labels)) {
      runtime_held_candidates.push(ref);
      continue;
    }
    const isBlockedLabel = labels.includes("blocked");
    const isForesight = labels.includes("foresight");
    candidates.push(ref);
    if (isBlockedLabel) paper_blocked_candidates.push(ref);
    if ((isForesight || isBlockedLabel) && (!generator_inflight || isGeneratorScope(ref, issue.title))) {
      depCheckQueue.push(ref);
    }
  }

  // dependency_cleared: foresight/blocked non-active issues whose every named `blocked-by` ref is now
  // CLOSED. This is the gate-just-opened set the label-only scan misses (a merged PR closes the blocker
  // but the downstream story may still carry foresight/Backlog until triage promotes it). Bodies are
  // fetched only for the small depCheckQueue, not every open issue.
  const dependency_cleared = [];
  for (const ref of depCheckQueue) {
    try {
      if (isDependencyCleared(issueBody(ref), openIssues)) dependency_cleared.push(ref);
    } catch (error) {
      // A transient GitHub failure is unrecoverable for a correct scan: re-throw so the wave retries
      // rather than running on a partial dependency view. A non-transient probe failure (e.g. a deleted
      // blocker ref -> 404) is local to THIS story: skip it (fail closed -> not cleared) so one bad
      // ref cannot abort the whole scan, but it is never silently treated as cleared (CR #570 Major).
      if (isTransientGithubFailure(errorText(error))) throw error;
    }
  }

  const open_prs = openPrRefs(openIssues);
  log(`active-scan: target_versions=${targetVersions.join(",") || "(none)"} milestones=${allMilestones.join(",") || "(none)"} open_issues=${openIssues.size} candidates=${candidates.length} runtime_held=${runtime_held_candidates.length} paper_blocked=${paper_blocked_candidates.length} promotable_foresight=${promotable_foresight.length} dependency_cleared=${dependency_cleared.length} generator_inflight=${generator_inflight || "none"} open_prs=${open_prs.length}`);

  return {
    active_target_version: targetVersions[0] || "",
    target_versions: targetVersions,
    milestones_by_target_version: Object.fromEntries(milestonesByTargetVersion),
    milestones: allMilestones,
    open_issue_count: openIssues.size,
    candidates: candidates.sort(),
    runtime_held_candidates: runtime_held_candidates.sort(),
    paper_blocked_candidates: paper_blocked_candidates.sort(),
    promotable_foresight: promotable_foresight.sort(),
    dependency_cleared: dependency_cleared.sort(),
    generator_inflight,
    needs_user: [],
    open_prs,
    project_scan_completed: true,
    dry_run: !!(args && args.dry_run),
  };
}
