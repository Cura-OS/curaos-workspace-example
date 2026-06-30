// scripts/lib/dep-graph.js
// Canonical dependency-graph analysis for CuraOS wave prioritization.
// Plain Node (real shell) - the durable substrate the wave-prioritize workflow calls via Bash.
// ONE owner for the leverage-scoring math (DRY); shares the `gh` env-strip pattern with gh-project.js.
//
// PURPOSE: rank ready-for-agent issues by how much DOWNSTREAM work each unblocks, so a wave dispatches
// the highest-leverage non-overlapping lanes first - maximizing future parallel width while every
// existing gate (§3.4 triage, §3.5 research, §3.7 grill, gen-evo barrier, ADR/spec acceptance) still
// binds. Leverage decides ORDER, never a gate-skip.
//
// SIGNAL (user decision 2026-05-29, "weighted blend"):
//   score = W_UNBLOCK·norm(transitiveUnblock) + W_CP·norm(criticalPathDepth)
//         + W_PRIO·priorityWeight + W_EFFORT·(1/effort)
// Weights are NAMED + config-overridable + every component is returned in the per-issue breakdown so a
// pick is always explainable + the weights are calibratable (the stated risk of a blend). Raw component
// values are min-max normalized to [0,1] across the candidate set BEFORE weighting so one large-range
// component (unblock reach) can't swamp the others by scale alone.
//
// CALIBRATION FEEDBACK LOOP (issue #208): DEFAULT_WEIGHTS below are unvalidated guesses. The sibling lib
// scripts/lib/dep-graph-calibration.js closes the loop WITHOUT touching this file's math: the
// wave-prioritize executor appends one dispatch record per run to scripts/lib/dep-graph-calibration-log.json
// (predicted rank/score per candidate), an outcome backfill records the actual freedCount at wave close, and
// dep-graph-calibration.js measures Pearson + Spearman correlation between prediction and reality. With >= 3
// complete waves it RECOMMENDS a weight set; it NEVER writes DEFAULT_WEIGHTS - a weight change is a T3 (HITL)
// user decision (same class as the 2026-05-29 blend decision) landed via a follow-up gated PR. This file's
// rank() math is unchanged by calibration; calibration only reads rank()'s outputs.
//
// GRAPH: nodes = issues (owner/repo#N). Two native GitHub edge sources:
//   - dependencies/blocking : "i blocks j" - j cannot start until i is done. The PRIMARY leverage edge.
//   - sub_issues            : "parent -> child" - a Story/Epic closes only when its children do, and the
//                             parent typically gates the next Story. Counted as a blocking edge child->parent
//                             so finishing a child contributes to freeing the parent's completion chain.
// Transitive unblock reach of i = | nodes reachable from i over the union edge set |. Cycle-safe DFS
// (memoized, visited-guard) - a dependency cycle (which is itself a tracker bug) cannot infinite-loop.
//
// DEGRADE HARDENING (remediation RP-46, quality-gates fail-closed class 5: silent-empty parse):
// edge fetches used to swallow EVERY failure into an empty list, so a rate-limited or offline run ranked
// every candidate at unblockReach 0 and looked identical to a genuinely flat graph. Now:
//   - every gh call retries transient failures (3 attempts, linear backoff; same shape as gh-project.js,
//     the RP-12 pattern);
//   - each edge-fetch failure (thrown call, exhausted retry, or a non-array body where a list was
//     expected) is COUNTED, never silently emptied;
//   - rank() surfaces { degraded: true, edge_fetch_failures: <n> } so callers can see a partial graph,
//     and stamps the same flags on the returned `ranked` array (non-enumerable, JSON-invisible) so
//     pass-through consumers that forward only `ranked` (wave-prioritize -> calibration) inherit them;
//   - successful edge fetches are cached per run (module-level map, only clean results) so a retried or
//     repeated rank() in the same process never refetches what it already proved;
//   - dep-graph-calibration.js refuses to append a dispatch record built from a degraded run, so the
//     calibration log never learns from a partial graph.
// Ranking itself stays fail-soft (a degraded wave still gets an order); degradation is SURFACED, not fatal.

const { execFileSync } = require("node:child_process");

const ORG = "your-org";

// ---- transient-failure retry (RP-46; same shape as gh-project.js gh(), the RP-12 pattern) ----
const GH_ATTEMPTS = 3;
function sleepMs(ms) {
  execFileSync("sleep", [String(ms / 1000)], { stdio: "ignore" });
}
function isTransientGithubFailure(text) {
  return /(?:\bhttp\s*5\d\d\b|\bstatus\s*5\d\d\b|\bnon-200\s+status\s+5\d\d\b|gateway timeout|bad gateway|service unavailable|github\s+service|github.*unicorn|unicorn.*github)/i.test(String(text || ""));
}
function errorText(error) {
  const parts = [];
  if (error && error.message) parts.push(error.message);
  if (error && error.stderr) parts.push(String(error.stderr));
  if (error && error.stdout) parts.push(String(error.stdout));
  if (error && Array.isArray(error.output)) parts.push(error.output.filter(Boolean).join("\n"));
  return parts.join("\n").trim() || String(error);
}
// withRetry(fn): run fn up to `attempts` times; only TRANSIENT failures (5xx/gateway/unicorn) retry,
// with linear backoff (500ms, 1000ms). Client errors (404/422/parse) throw on the first attempt.
// Injectable isTransient/wait keep the seam deterministic under test (no child-process stubbing).
function withRetry(fn, { attempts = GH_ATTEMPTS, isTransient = isTransientGithubFailure, wait = sleepMs } = {}) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return fn(attempt);
    } catch (error) {
      if (error && error.stderr != null) error.stderr = String(error.stderr);
      if (error && error.stdout != null) error.stdout = String(error.stdout);
      lastError = error;
      if (attempt < attempts && isTransient(errorText(error))) {
        wait(500 * attempt);
        continue;
      }
      break;
    }
  }
  throw lastError;
}

// ---- gh exec (strips GITHUB_TOKEN so the keyring/project-scoped auth is used; same as gh-project.js) ----
// Fully piped stdio so a failed call's stderr rides the thrown error for transient-vs-client
// classification instead of leaking into wave logs.
function gh(args, { json = false, attempts = GH_ATTEMPTS } = {}) {
  const env = { ...process.env };
  delete env.GITHUB_TOKEN;
  return withRetry(() => {
    const out = execFileSync("gh", args, {
      encoding: "utf8",
      env,
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["pipe", "pipe", "pipe"],
    });
    return json ? JSON.parse(out) : out;
  }, { attempts });
}

// ---- default blend weights (override via opts.weights) ----
const DEFAULT_WEIGHTS = Object.freeze({
  unblock: 0.5, // transitive downstream issues this frees - the leverage core
  cp: 0.3, // critical-path depth - position on the longest chain to milestone close
  prio: 0.15, // frontmatter priority (Critical/High/Medium/Low)
  effort: 0.05, // quick-win bias: inverse effort (small issues that unblock rank a touch higher)
});

const PRIORITY_WEIGHT = Object.freeze({ critical: 1.0, high: 0.66, medium: 0.33, low: 0.0 });
// effort -> a positive "size" used as 1/effort; smaller effort => bigger quick-win bias.
const EFFORT_SIZE = Object.freeze({ xs: 1, s: 2, m: 3, l: 5, xl: 8 });

function priorityWeight(p) {
  if (!p) return 0;
  const k = String(p).trim().toLowerCase();
  // accept named tiers (live Project) AND P0..P3 frontmatter shorthand.
  if (k in PRIORITY_WEIGHT) return PRIORITY_WEIGHT[k];
  const pm = { p0: 1.0, p1: 0.66, p2: 0.33, p3: 0.0 };
  return pm[k] ?? 0;
}
function effortInverse(e) {
  if (!e) return 1 / EFFORT_SIZE.m; // unknown effort => treat as medium
  const k = String(e).trim().toLowerCase().replace(/[^a-z]/g, "");
  const size = EFFORT_SIZE[k] ?? EFFORT_SIZE.m;
  return 1 / size;
}

// ---- parse owner/repo#N | full URL | repo#N into a canonical key ----
function parseRef(ref, defaultRepo) {
  if (!ref) return null;
  const s = String(ref).trim();
  const url = s.match(/github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)/i);
  if (url) return `${url[1]}/${url[2]}#${Number(url[3])}`;
  const full = s.match(/^([^/\s]+)\/([^/#\s]+)#(\d+)$/); // owner/repo#N
  if (full) return `${full[1]}/${full[2]}#${Number(full[3])}`;
  const short = s.match(/^([^/#\s]+)#(\d+)$/); // repo#N
  if (short) return `${ORG}/${short[1]}#${Number(short[2])}`;
  const bare = s.match(/^#?(\d+)$/); // #N (needs defaultRepo)
  if (bare && defaultRepo) return `${defaultRepo}#${Number(bare[1])}`;
  return null;
}
function splitRef(key) {
  const m = key.match(/^([^/]+)\/([^#]+)#(\d+)$/);
  if (!m) return null;
  return { owner: m[1], repo: m[2], number: Number(m[3]) };
}

// ---- fetch the native edges for one issue (blocking + sub_issues + parent) ----
// Returns { blocking:[keys], subIssues:[keys], parent:key|null, failures:<n> }. `parent` is the reverse
// sub-issue link (this issue is a child of `parent`): fetched from the CHILD side via GraphQL so a
// candidate's parent is captured even when the parent isn't independently reachable from any other
// candidate. Network failures degrade to empty AND are counted in `failures` (RP-46: degrade is
// surfaced through rank() as degraded:true, never silent).
function fetchEdges(key) {
  const p = splitRef(key);
  if (!p) return { blocking: [], subIssues: [], parent: null, failures: 0 };
  const base = `repos/${p.owner}/${p.repo}/issues/${p.number}`;
  let failures = 0;
  const note = () => { failures += 1; };
  const blocking = safeList(`${base}/dependencies/blocking`, p, note);
  const subIssues = safeList(`${base}/sub_issues`, p, note);
  const parent = fetchParent(p, note);
  return { blocking, subIssues, parent, failures };
}
function fetchParent(p, onFailure) {
  try {
    const q = `query { repository(owner:"${p.owner}", name:"${p.repo}"){ issue(number:${p.number}){ parent { number repository { nameWithOwner } } } } }`;
    const r = gh(["api", "graphql", "-f", `query=${q}`], { json: true });
    const par = r && r.data && r.data.repository && r.data.repository.issue && r.data.repository.issue.parent;
    if (par && par.number && par.repository && par.repository.nameWithOwner) {
      return `${par.repository.nameWithOwner}#${Number(par.number)}`;
    }
    return null;
  } catch (e) {
    if (onFailure) onFailure(`parent probe for ${p.owner}/${p.repo}#${p.number}: ${e && e.message}`);
    return null;
  }
}
function safeList(apiPath, parent, onFailure) {
  try {
    const rows = gh(["api", apiPath], { json: true });
    if (!Array.isArray(rows)) {
      // silent-empty parse class (RP-46): an unexpected non-array body is a FAILURE, not an empty list.
      if (onFailure) onFailure(`non-array response for ${apiPath}`);
      return [];
    }
    return rows
      .map((r) => {
        // a dependency/sub-issue row carries repository + number (cross-repo) or just number (same repo).
        const repoFull = r.repository && r.repository.full_name ? r.repository.full_name : `${parent.owner}/${parent.repo}`;
        return r.number ? `${repoFull}#${Number(r.number)}` : null;
      })
      .filter(Boolean);
  } catch (e) {
    if (onFailure) onFailure(`${apiPath}: ${e && e.message}`);
    return [];
  }
}

// ---- per-run edge cache (RP-46) ----
// Only CLEAN results (failures === 0) are cached: a degraded fetch must be retried by the next run, not
// replayed from cache. The module-level map makes repeated rank() calls in one process (wave passes that
// re-rank after a partial dispatch) reuse already-proven edges; clearEdgeCache() resets between runs/tests.
const RUN_EDGE_CACHE = new Map();
function clearEdgeCache() {
  RUN_EDGE_CACHE.clear();
}
function createCachedFetcher(fetcher = fetchEdges, cache = RUN_EDGE_CACHE) {
  return function cachedFetchEdges(key) {
    if (cache.has(key)) return cache.get(key);
    const res = fetcher(key);
    const failures = Number.isFinite(res && res.failures) ? res.failures : 0;
    if (res && failures === 0) cache.set(key, res);
    return res;
  };
}

// ---- build the graph over a candidate set ----
// candidates: [{ ref, priority, effort }] (ref = owner/repo#N | repo#N | URL). Edges are fetched for EVERY
// reachable node (not just candidates) so transitive reach counts the full downstream subtree, even nodes
// outside the ready set. fetcher is injectable for tests (defaults to the cached live-gh fetcher, RP-46).
// Returns { meta, out, edgeFetchFailures }: a throwing fetcher counts 1 failure for the node (edges
// treated empty, build continues); a fetcher-reported `failures` count is aggregated as-is.
function buildGraph(candidates, { fetcher } = {}) {
  const effectiveFetcher = fetcher || createCachedFetcher();
  const meta = new Map(); // key -> { priority, effort, isCandidate }
  const out = new Map(); // key -> Set(downstream keys: union of blocking + subIssues-as-childToParent)
  const seen = new Set();
  let edgeFetchFailures = 0;

  function ensure(key, { priority, effort, isCandidate } = {}) {
    if (!meta.has(key)) meta.set(key, { priority: priority || null, effort: effort || null, isCandidate: !!isCandidate });
    else {
      const m = meta.get(key);
      if (priority && !m.priority) m.priority = priority;
      if (effort && !m.effort) m.effort = effort;
      if (isCandidate) m.isCandidate = true;
    }
  }

  const queue = [];
  for (const c of candidates) {
    const key = parseRef(c.ref);
    if (!key) continue;
    ensure(key, { priority: c.priority, effort: c.effort, isCandidate: true });
    queue.push(key);
  }

  // BFS over the edge frontier so reach includes downstream nodes outside the candidate set.
  while (queue.length) {
    const key = queue.shift();
    if (seen.has(key)) continue;
    seen.add(key);
    let edges;
    try {
      edges = effectiveFetcher(key) || {};
    } catch (e) {
      // fail-soft for the BUILD (the wave still ranks) but COUNTED so rank() reports degraded:true.
      edgeFetchFailures += 1;
      console.warn(`[dep-graph] edge fetch failed for ${key} (degraded): ${e && e.message}`);
      edges = {};
    }
    if (Number.isFinite(edges.failures) && edges.failures > 0) edgeFetchFailures += edges.failures;
    const blocking = Array.isArray(edges.blocking) ? edges.blocking : [];
    const subIssues = Array.isArray(edges.subIssues) ? edges.subIssues : [];
    const parent = edges.parent || null;
    if (!out.has(key)) out.set(key, new Set());
    // i blocks j  => edge i -> j (finishing i frees j)
    for (const j of blocking) {
      out.get(key).add(j);
      ensure(j, {});
      if (!seen.has(j)) queue.push(j);
    }
    // parent has sub-issue child => edge child -> parent (finishing child advances parent completion).
    // Discovered from BOTH sides so the edge forms regardless of which end is the candidate:
    //   - from the PARENT's sub_issues list (this key is the parent, each child -> this key)
    //   - from the CHILD's `parent` field (this key is the child -> its parent)
    for (const child of subIssues) {
      ensure(child, {});
      if (!out.has(child)) out.set(child, new Set());
      out.get(child).add(key);
      if (!seen.has(child)) queue.push(child);
    }
    if (parent) {
      ensure(parent, {});
      out.get(key).add(parent); // child (this key) -> parent
      if (!seen.has(parent)) queue.push(parent);
    }
  }
  for (const k of meta.keys()) if (!out.has(k)) out.set(k, new Set());
  return { meta, out, edgeFetchFailures };
}

// ---- transitive reach + critical-path depth (cycle-safe, memoized) ----
function analyze(graph) {
  const { out } = graph;
  const reachMemo = new Map(); // key -> Set of all transitively-reachable downstream keys
  const depthMemo = new Map(); // key -> longest downstream chain length (critical-path depth)

  function reach(key, stack) {
    if (reachMemo.has(key)) return reachMemo.get(key);
    if (stack.has(key)) return new Set(); // cycle guard: don't recount the back-edge
    stack.add(key);
    const acc = new Set();
    for (const nxt of out.get(key) || []) {
      acc.add(nxt);
      for (const r of reach(nxt, stack)) acc.add(r);
    }
    stack.delete(key);
    // memoize only when not inside an active cycle frame (safe: closure complete for this node)
    reachMemo.set(key, acc);
    return acc;
  }
  function depth(key, stack) {
    if (depthMemo.has(key)) return depthMemo.get(key);
    if (stack.has(key)) return 0;
    stack.add(key);
    let best = 0;
    for (const nxt of out.get(key) || []) best = Math.max(best, 1 + depth(nxt, stack));
    stack.delete(key);
    depthMemo.set(key, best);
    return best;
  }

  const reachCount = new Map();
  const cpDepth = new Map();
  for (const key of graph.meta.keys()) {
    reachCount.set(key, reach(key, new Set()).size);
    cpDepth.set(key, depth(key, new Set()));
  }
  return { reachCount, cpDepth };
}

// ---- min-max normalize a Map(key->number) to [0,1] (flat 0 if all equal) ----
function normalize(map) {
  const vals = [...map.values()];
  const max = Math.max(...vals, 0);
  const min = Math.min(...vals, 0);
  const span = max - min;
  const norm = new Map();
  for (const [k, v] of map) norm.set(k, span === 0 ? 0 : (v - min) / span);
  return norm;
}

// ---- rank: score every CANDIDATE by the weighted blend; return sorted + per-issue breakdown ----
// Output: { weights, ranked, degraded, edge_fetch_failures }. degraded:true means at least one edge
// fetch failed during the graph build (after retries), so unblockReach/criticalPathDepth may be
// UNDERCOUNTED: the order is still usable for dispatch, but calibration must not learn from it
// (dep-graph-calibration.js appendRecord refuses degraded records). The same flags are stamped on the
// returned `ranked` array (non-enumerable, invisible to JSON/iteration) so consumers that forward only
// `ranked` still carry the degrade signal.
function rank(candidates, { fetcher, weights } = {}) {
  const W = { ...DEFAULT_WEIGHTS, ...(weights || {}) };
  const graph = buildGraph(candidates, fetcher ? { fetcher } : {});
  const { reachCount, cpDepth } = analyze(graph);
  const reachN = normalize(reachCount);
  const cpN = normalize(cpDepth);

  const rows = [];
  for (const [key, m] of graph.meta) {
    if (!m.isCandidate) continue; // only candidates are dispatch targets; non-candidates count only as reach
    const unblock = reachCount.get(key) || 0;
    const cp = cpDepth.get(key) || 0;
    const prioW = priorityWeight(m.priority);
    const effInv = effortInverse(m.effort);
    const components = {
      unblock: { raw: unblock, norm: reachN.get(key) || 0, weighted: W.unblock * (reachN.get(key) || 0) },
      cp: { raw: cp, norm: cpN.get(key) || 0, weighted: W.cp * (cpN.get(key) || 0) },
      prio: { raw: m.priority || null, weight: prioW, weighted: W.prio * prioW },
      effort: { raw: m.effort || null, inverse: effInv, weighted: W.effort * effInv },
    };
    const score = components.unblock.weighted + components.cp.weighted + components.prio.weighted + components.effort.weighted;
    rows.push({ issue: key, score: round(score), unblockReach: unblock, criticalPathDepth: cp, priority: m.priority || null, effort: m.effort || null, breakdown: components });
  }
  // sort: score desc, then raw unblock desc, then cp depth desc, then priority weight desc (deterministic).
  rows.sort((a, b) =>
    b.score - a.score ||
    b.unblockReach - a.unblockReach ||
    b.criticalPathDepth - a.criticalPathDepth ||
    priorityWeight(b.priority) - priorityWeight(a.priority) ||
    a.issue.localeCompare(b.issue),
  );
  const edgeFetchFailures = Number.isFinite(graph.edgeFetchFailures) ? graph.edgeFetchFailures : 0;
  const degraded = edgeFetchFailures > 0;
  // Bridge the degrade signal onto the rows array itself: wave-prioritize passes ONLY `ranked` into
  // calibration.buildRecord, and these non-enumerable props survive that hop without changing the
  // array's JSON shape or iteration behavior.
  Object.defineProperty(rows, "degraded", { value: degraded, enumerable: false });
  Object.defineProperty(rows, "edgeFetchFailures", { value: edgeFetchFailures, enumerable: false });
  return { weights: W, ranked: rows, degraded, edge_fetch_failures: edgeFetchFailures };
}

function round(n) {
  return Math.round(n * 1e4) / 1e4;
}

module.exports = {
  ORG,
  GH_ATTEMPTS,
  DEFAULT_WEIGHTS,
  PRIORITY_WEIGHT,
  EFFORT_SIZE,
  priorityWeight,
  effortInverse,
  parseRef,
  splitRef,
  isTransientGithubFailure,
  withRetry,
  fetchEdges,
  createCachedFetcher,
  clearEdgeCache,
  buildGraph,
  analyze,
  normalize,
  rank,
};
