// lane-context-bundle.js - RP-50 dispatch enrichment: per-lane context bundle, written at PLAN
// time (wave-prioritize, right after wave-plan.json) so every dispatched lane's bundle exists
// BEFORE its worker starts. One bundle per lane at .scratch/<lane-slug>/context-bundle.md.
//
// The bundle resolves ONCE, deterministically, the context a worker otherwise re-derives per
// lane: the owned root's mirror docs (CONTEXT.md + Requirements.md + AGENTS.md under ai/curaos/,
// per curaos_ai_mirror_rule), the ADR index, contract sources, the lane's plan row, and the
// PRE-CODING ANCHORS (naming / contract / no-dash invariants) the worker must confirm before
// writing files. Structural code questions stay with CodeGraph at execution time (codegraph_context
// first); this bundle carries the document context, not a code dump.
//
// Fail-soft per lane: a bundle write failure never aborts planning (mirrors the wave-plan write
// contract). No em or en dashes in generated content (curaos_no_em_dash_rule).

const SNIPPET_MAX_LINES = 40;

function laneSlug(issue) {
  return String(issue || "").replace(/[^a-z0-9]+/gi, "-").toLowerCase().replace(/^-+|-+$/g, "");
}

function bundlePathFor(issue, scratchDir = ".scratch") {
  const slug = laneSlug(issue);
  if (!slug) return "";
  return `${scratchDir}/${slug}/context-bundle.md`;
}

// Mirror doc candidates for an owned root (curaos_ai_mirror_rule: agent docs for curaos/<path>
// live at ai/curaos/<path>). "workspace"/unknown roots fall back to the workspace doc set.
function mirrorDocsForRoot(ownedRoot) {
  const root = String(ownedRoot || "").trim().replace(/\/+$/, "");
  if (root && root !== "workspace" && root !== "unknown" && (root === "curaos" || root.startsWith("curaos/"))) {
    const mirror = `ai/${root}`;
    return [`${mirror}/CONTEXT.md`, `${mirror}/Requirements.md`, `${mirror}/AGENTS.md`];
  }
  return ["AGENTS.md", "ai/rules/README.md", "ai/curaos/CONTEXT.md", "ai/curaos/Requirements.md"];
}

function stripDashGlyphs(text) {
  // Generated content must carry zero em/en dashes (curaos_no_em_dash_rule); source docs may
  // still contain strays awaiting the sweep lane, so sanitize on the way into the bundle.
  // Escaped U+2014 U+2013: a literal glyph here would trip the no-dash gate (the PR#310 class).
  return String(text || "").replace(/[\u2014\u2013]/g, "-");
}

function snippetOf(content, maxLines = SNIPPET_MAX_LINES) {
  const lines = String(content || "").split(/\r?\n/);
  const head = lines.slice(0, maxLines).join("\n").trimEnd();
  return lines.length > maxLines ? `${head}\n[... truncated at ${maxLines} lines]` : head;
}

const PRE_CODING_ANCHORS = [
  "1. Naming invariants (module Requirements.md + AGENTS.md section 7): kebab-case only; services end in `-service`; layer grouping `<domain>-core-service` / `personal-<domain>-service` / `business-<domain>-service`; no wrapper or staging dirs.",
  "2. Contract invariants: APIs/events/data are VERSIONED; never break a published contract - forward migration + semver bump per curaos_rolling_update_rule (no `-v2`/`-next` parallel paths).",
  "3. Zero em/en dashes in EVERY produced file, commit, issue, or PR (curaos_no_em_dash_rule); use hyphen, comma, semicolon, colon, or parentheses.",
  "4. Keep implementation inside the issue's owned paths. Use approved closeout paths only for gate-required artifacts such as DOC-GRAPH.md, mirror docs, lockfiles, generated SDK artifacts named by acceptance, or parent submodule pointers.",
  "5. Structural code questions: consult CodeGraph (codegraph_context) BEFORE text search; this bundle resolves the document context once so the worker does not re-enumerate it.",
];

// buildLaneBundle: pure renderer (fs injected via opts.readFile) -> markdown string.
function buildLaneBundle({ lane, rankedRow, candidate, milestone, wavePlanPath, generatedAt, readFile }) {
  const issue = lane && lane.issue ? String(lane.issue) : "";
  const issues = lane && Array.isArray(lane.issues) && lane.issues.length ? lane.issues.map(String) : (issue ? [issue] : []);
  const ownedRoot = lane && lane.owned_root ? String(lane.owned_root) : "unknown";
  const row = rankedRow || {};
  const cand = candidate || {};
  const docs = mirrorDocsForRoot(ownedRoot);
  const lines = [];
  lines.push(`# Lane context bundle: ${issue}`);
  lines.push("");
  lines.push(`Generated: ${generatedAt || new Date().toISOString()} (plan time, RP-50). Source plan: ${wavePlanPath || "(wave-plan write skipped)"}; milestone: ${milestone || "unknown"}.`);
  lines.push("");
  lines.push("## Plan row");
  lines.push("");
  lines.push(`- issue: ${issue}`);
  if (issues.length > 1) lines.push(`- bundled_issues: ${issues.join(", ")}`);
  lines.push(`- owned_root: ${ownedRoot}`);
  if (Number.isFinite(row.score)) lines.push(`- score: ${row.score}`);
  if (Number.isFinite(row.unblockReach)) lines.push(`- unblockReach: ${row.unblockReach}`);
  if (Number.isFinite(row.criticalPathDepth)) lines.push(`- criticalPathDepth: ${row.criticalPathDepth}`);
  if (cand.priority || row.priority) lines.push(`- priority: ${cand.priority || row.priority}`);
  if (cand.effort || row.effort) lines.push(`- effort: ${cand.effort || row.effort}`);
  if (cand.module) lines.push(`- module: ${cand.module}`);
  if (cand.owned_path) lines.push(`- owned_path: ${cand.owned_path}`);
  lines.push("");
  lines.push("## Pre-coding anchors (confirm BEFORE writing any file)");
  lines.push("");
  for (const anchor of PRE_CODING_ANCHORS) lines.push(anchor);
  lines.push("");
  lines.push("## Module context (mirror docs, resolved once at plan time)");
  lines.push("");
  const resolved = [];
  for (const doc of docs) {
    let content = null;
    try {
      content = readFile ? readFile(doc) : null;
    } catch {
      content = null;
    }
    if (content === null || content === undefined) continue;
    resolved.push(doc);
    lines.push(`### ${doc}`);
    lines.push("");
    lines.push("```markdown");
    lines.push(stripDashGlyphs(snippetOf(content)));
    lines.push("```");
    lines.push("");
  }
  if (!resolved.length) {
    lines.push(`(no mirror doc resolved for owned_root ${ownedRoot}; worker falls back to context-load's canonical read list)`);
    lines.push("");
  }
  lines.push("## ADR + contract sources");
  lines.push("");
  lines.push("- ADR index: ai/curaos/docs/adr/RESOLUTION-MAP.md (rules in ai/rules/ outrank ADRs; read the map before any individual ADR).");
  lines.push("- Cited ADRs: the issue body's adr_refs (threaded by context-load issue_spec) are binding; implement to them exactly.");
  lines.push("- CI gate set: every BLOCKING gate in curaos/ci-gates.yaml (run via `just ci` / `bash scripts/ci-local.sh`); the LOCAL gate is the merge gate.");
  lines.push("");
  return `${lines.join("\n")}\n`;
}

// writeLaneBundles: plan-time writer. lanes/ranked/candidates from the prioritize run.
// Returns [{issue, path}] for bundles actually written; fail-soft per lane (skips + warns).
function writeLaneBundles({ lanes, ranked, candidates, milestone, wavePlanPath, scratchDir = ".scratch", fsLike, now, warn } = {}) {
  const fsImpl = fsLike || require("node:fs");
  const pathMod = require("node:path");
  const warnFn = warn || ((msg) => console.warn(msg));
  const generatedAt = now || new Date().toISOString();
  const rankedByIssue = new Map();
  for (const row of Array.isArray(ranked) ? ranked : []) {
    if (row && row.issue) rankedByIssue.set(String(row.issue), row);
  }
  const candidateByRef = new Map();
  for (const cand of Array.isArray(candidates) ? candidates : []) {
    if (cand && cand.ref) candidateByRef.set(String(cand.ref), cand);
  }
  const written = [];
  for (const lane of Array.isArray(lanes) ? lanes : []) {
    const issue = lane && lane.issue ? String(lane.issue) : "";
    const bundlePath = bundlePathFor(issue, scratchDir);
    if (!bundlePath) continue;
    try {
      const content = buildLaneBundle({
        lane,
        rankedRow: rankedByIssue.get(issue),
        candidate: candidateByRef.get(issue),
        milestone,
        wavePlanPath,
        generatedAt,
        readFile: (p) => (fsImpl.existsSync(p) ? fsImpl.readFileSync(p, "utf8") : null),
      });
      fsImpl.mkdirSync(pathMod.dirname(bundlePath), { recursive: true });
      fsImpl.writeFileSync(bundlePath, content);
      written.push({ issue, path: bundlePath });
    } catch (error) {
      // Fail-soft: a bundle failure never aborts the plan; the worker prompt's anchor block
      // tells the worker to fall back to context-load's canonical reads when the bundle is absent.
      warnFn(`lane-context-bundle: skipped ${issue}: ${error && error.message ? error.message : error}`);
    }
  }
  return written;
}

module.exports = {
  SNIPPET_MAX_LINES,
  PRE_CODING_ANCHORS,
  laneSlug,
  bundlePathFor,
  mirrorDocsForRoot,
  buildLaneBundle,
  writeLaneBundles,
};
