// doc-governance - review -> adversarial-sweep -> fix -> verify, over a doc set.
// Persisted form of the 2026-05-29 doc-review pipeline. Contract: docs/agents/workflows/doc-governance.md
// Invoke: Workflow({ scriptPath: "scripts/workflows/doc-governance.workflow.js", args: { manifest, standards?, mode?, cluster_size? } })

// NOTE: the Workflow runtime requires `export const meta` to be the FIRST statement.
export const meta = {
  name: "doc-governance",
  description: "Review a doc set vs standards, adversarially verify, fix regressions, gate on doc-graph + mirror",
  phases: [
    { title: "Cluster", detail: "partition manifest into sibling-grouped clusters" },
    { title: "Review", detail: "one opus reviewer per cluster vs standards baseline" },
    { title: "Sweep", detail: "adversarial reviewers hunt regressions in proposed edits" },
    { title: "Fix", detail: "surgical correction of confirmed regressions (skipped in review-only)" },
    { title: "Verify", detail: "doc-graph + mirror programmatic gate" },
  ],
};

// CONTRACT: kept as a plain const (not exported) - the Workflow runtime accepts only `meta` as a
// top-level export. The sync gate (scripts/check-workflow-sync.js) reads this block by name.
const CONTRACT = {
  name: "doc-governance",
  kind: "composite",
  version: "0.1.1",
  inputs: {
    manifest: { type: "string", required: true, desc: "absolute path to a newline-delimited file of doc paths to govern, OR a glob the orchestrator pre-expanded" },
    standards: { type: "string", required: false, desc: "absolute path to the standards baseline; defaults to ai/research/doc-review-standards.md" },
    mode: { type: "string", required: false, desc: "review-only | review-and-fix (default review-and-fix)" },
    cluster_size: { type: "number", required: false, desc: "max docs per review agent (default 30)" },
  },
  outputs: {
    clusters_reviewed: { type: "number", desc: "count of review clusters" },
    findings: { type: "number", desc: "total findings raised" },
    confirmed_regressions: { type: "number", desc: "regressions confirmed by the adversarial sweep" },
    edits_applied: { type: "number", desc: "fixes applied (0 in review-only mode)" },
    gates: { type: "object", desc: "{ doc_graph_pass, mirror_pass, node_count, edge_count }" },
    report_path: { type: "string", desc: "absolute path of the persisted governance report" },
  },
  guarantees: { idempotent: false, determinism: "control-flow-only", side_effects: "fs" },
  verification: "T2",
  models: { review: "opus", sweep: "opus", fix: "sonnet", verify: "sonnet" },
  // Inlines its review/sweep/fix/verify stages directly (no separate atomic executors exist yet).
  // composes stays [] until those stages are extracted into standalone workflows.
  composes: [],
};

const ROOT = ".";
// `args` is bound by the runtime AFTER module load - read it lazily inside the run body, never at
// top level (a top-level capture freezes it to undefined before the runtime injects it).

// ---------- schemas ----------
const FINDINGS_SCHEMA = {
  type: "object",
  required: ["cluster", "files_reviewed", "findings"],
  properties: {
    cluster: { type: "string" },
    files_reviewed: { type: "integer" },
    findings: {
      type: "array",
      items: {
        type: "object",
        required: ["file", "severity", "standard_id", "problem", "fix", "frozen"],
        properties: {
          file: { type: "string" },
          severity: { type: "string", enum: ["critical", "high", "medium", "low"] },
          standard_id: { type: "string", description: "the baseline standard ID this violates (WS-/RU-/ADR-/AP-/DG-/MOD-/FR-)" },
          problem: { type: "string" },
          fix: { type: "string" },
          frozen: { type: "boolean" },
        },
      },
    },
  },
};

const SWEEP_SCHEMA = {
  type: "object",
  required: ["cluster", "regressions"],
  properties: {
    cluster: { type: "string" },
    regressions: {
      type: "array",
      items: {
        type: "object",
        required: ["file", "class", "severity", "what", "evidence", "fix"],
        properties: {
          file: { type: "string" },
          class: { type: "string", enum: ["backwards-fix", "invented-canonical", "cross-doc-contradiction", "dropped-substance", "broken-link", "wrong-value", "other"] },
          severity: { type: "string", enum: ["critical", "high", "medium", "low"] },
          what: { type: "string" },
          evidence: { type: "string" },
          fix: { type: "string" },
        },
      },
    },
  },
};

const FIX_SCHEMA = {
  type: "object",
  required: ["applied", "files_changed", "summary"],
  properties: {
    applied: { type: "integer" },
    files_changed: { type: "array", items: { type: "string" } },
    summary: { type: "string" },
    notes: { type: "string" },
  },
};

const VERIFY_SCHEMA = {
  type: "object",
  required: ["doc_graph_pass", "mirror_pass", "node_count", "edge_count", "fixes_made"],
  properties: {
    doc_graph_pass: { type: "boolean" },
    mirror_pass: { type: "boolean" },
    node_count: { type: "integer" },
    edge_count: { type: "integer" },
    fixes_made: { type: "array", items: { type: "string" } },
  },
};

// ---------- read args lazily (now that the runtime has bound `args`) ----------
// NOTE: the runtime delivers `args` as a JSON STRING (verified via probe), not a parsed object -
// parse it here. Handle object too, for forward-compat.
function parseArgs(a) {
  if (a && typeof a === "object") return a;
  if (typeof a === "string" && a.trim()) {
    try { return JSON.parse(a); } catch { return {}; }
  }
  return {};
}
const cfg = parseArgs(typeof args !== "undefined" ? args : undefined);
const MANIFEST = cfg.manifest;
const STANDARDS = cfg.standards || `${ROOT}/ai/research/doc-review-standards.md`;
const MODE = cfg.mode || "review-and-fix";
const CLUSTER_SIZE = cfg.cluster_size || 30;

// ---------- Phase 1: Cluster (deterministic) ----------
phase("Cluster");
if (!MANIFEST) throw new Error("doc-governance: args.manifest (absolute path to a doc-list file) is required. Pass via Workflow({ args: { manifest: '/abs/path' } }).");
// Read the manifest via a reader agent (workflow runtime has no fs) and let it return the clustered file lists.
const clusterPlan = await agent(
  `Read the doc-list file at ${MANIFEST} (one absolute path per line; ignore blank lines). Group the paths into clusters of at most ${CLUSTER_SIZE}, keeping files from the same directory in the same cluster where possible. Return the clusters. Use Bash/Read only to read the manifest + confirm paths exist; do not edit anything.`,
  { label: "cluster:plan", phase: "Cluster", model: "haiku", schema: {
    type: "object",
    required: ["clusters", "total_files"],
    properties: {
      total_files: { type: "integer" },
      clusters: { type: "array", items: { type: "object", required: ["key", "files"], properties: {
        key: { type: "string" }, files: { type: "array", items: { type: "string" } } } } },
    },
  } }
);

const clusters = (clusterPlan.clusters || []).filter((c) => c.files && c.files.length);
log(`Clustered ${clusterPlan.total_files} docs into ${clusters.length} clusters (<=${CLUSTER_SIZE} each)`);
if (!clusters.length) {
  return { clusters_reviewed: 0, findings: 0, confirmed_regressions: 0, edits_applied: 0,
    gates: { doc_graph_pass: true, mirror_pass: true }, report_path: "(no docs to govern)" };
}

// ---------- Phase 2+3 pipelined: Review then adversarial Sweep per cluster ----------
const reviewed = await pipeline(
  clusters,
  (cl) => agent(
    `Review this CuraOS doc cluster against the standards baseline at ${STANDARDS} (read it first). CLUSTER ${cl.key}. Files (read EVERY one):\n${cl.files.join("\n")}\n
SCOPE: every finding's 'file' MUST be one of the cluster files listed above. You may READ other docs (parent AGENTS.md, ai/rules, an ADR) for context, but DO NOT raise findings about files outside this cluster - that is a different cluster's or a different run's job. A finding whose 'file' is not in the list above is out of scope; drop it.
For each cluster file judge: correctness (broken links - verify on disk; stale refs; contradictions), consistency with parent AGENTS.md + ai/rules (precedence #1), directness/concision, structure. Every finding MUST cite a baseline standard ID in 'standard_id'. Frozen records (grills / research artifacts / superseded ADRs): set frozen=true and propose ONLY factual/link fixes, never restructure. Do not invent findings for clean files. Verify a link is actually broken on disk before flagging.`,
    { label: `review:${cl.key}`, phase: "Review", model: CONTRACT.models.review, schema: FINDINGS_SCHEMA }
  ),
  (review, cl) => {
    if (!review || !(review.findings || []).length) return { cluster: cl.key, regressions: [] };
    return agent(
      `ADVERSARIAL verify. A reviewer proposed these edits for CuraOS doc cluster ${cl.key}. Assume each is guilty until verified. Hunt: backwards-fix (reverses a dated decision in ai/curaos/research or an ai/rules rule), invented-canonical (a non-owner doc re-declares/contradicts the real owner - ai/rules for rules, owning ADR for decisions), cross-doc-contradiction, dropped-substance, broken-link, wrong-value. For each real regression quote the before/after + name the authority it violates + give a concrete fix. VERIFY every cited ADR/rule against the actual on-disk file (Bash/Grep/Read) before flagging. Empty if clean.\n\nPROPOSED EDITS (JSON):\n${JSON.stringify(review.findings, null, 2)}`,
      { label: `sweep:${cl.key}`, phase: "Sweep", model: CONTRACT.models.sweep, schema: SWEEP_SCHEMA }
    );
  }
);

// pipeline returns the LAST stage per item = sweep results
const sweeps = reviewed.filter(Boolean);
const confirmed = sweeps.flatMap((s) => (s.regressions || []).map((r) => ({ ...r, cluster: s.cluster })));
log(`Adversarial sweep: ${confirmed.length} confirmed regressions across ${clusters.length} clusters`);

// ---------- Phase 4: Fix (skipped in review-only) ----------
let editsApplied = 0;
let fixSummaries = [];
if (MODE !== "review-only" && confirmed.length) {
  // group regressions by file so editors don't collide
  const byFile = {};
  for (const r of confirmed) (byFile[r.file] = byFile[r.file] || []).push(r);
  const groups = Object.entries(byFile).map(([file, regs]) => ({ file, regs }));
  const fixResults = await parallel(groups.map((g) => () =>
    agent(
      `Apply these confirmed corrections to ${g.file} (under ${ROOT}). Surgical Edits only; keep correct sibling edits; verify any cited ADR/rule slug exists on disk before writing it; no file create/rename/move; preserve frontmatter/code/commands/versions verbatim. If a correction is wrong on inspection, set applied lower and explain in notes.\n\nCORRECTIONS (JSON):\n${JSON.stringify(g.regs, null, 2)}`,
      { label: `fix:${g.file.split("/").pop()}`, phase: "Fix", model: CONTRACT.models.fix, schema: FIX_SCHEMA }
    )
  )).then((r) => r.filter(Boolean));
  editsApplied = fixResults.reduce((n, r) => n + (r.applied || 0), 0);
  fixSummaries = fixResults.map((r) => r.summary);
} else if (MODE === "review-only") {
  log("review-only mode: skipping fix phase; confirmed regressions reported for orchestrator action");
}

// ---------- Phase 5: Verify (programmatic gate) ----------
phase("Verify");
const verify = await agent(
  `Verify the CuraOS doc gates after doc-governance edits. From ${ROOT}, capture REAL exit codes (run each to a file then echo $?, NEVER pipe to tail):
1. bun scripts/check-doc-graph.js > /tmp/dg.txt 2>&1; echo DG_EXIT=$?   (if "stale" -> bun scripts/check-doc-graph.js --write, then re-run plain). Must end DG_EXIT=0 "doc graph ok". ANY warning (broken link / stale stack term / copied rule text) fails it. GOTCHA: the link parser strips only fenced \`\`\` blocks, not inline backticks - an example link \`[name](url)\` inside backticks parses as a broken link; rewrite as \`[name] (url)\` if a fix introduced one. Fix introduced broken links by correcting the slug/path (never invent), do not revert substance.
2. bash scripts/check-ai-mirror.sh > /tmp/m.txt 2>&1; echo MIRROR_EXIT=$?   Must be EXIT=0.
3. node scripts/check-workflow-sync.js > /tmp/s.txt 2>&1; echo SYNC_EXIT=$?   Must be EXIT=0.
Report pass booleans + node/edge counts + what you fixed + 'gate_evidence' = the literal "DG_EXIT=.. MIRROR_EXIT=.. SYNC_EXIT=.." lines you observed (verbatim, for programmatic parse).`,
  { label: "verify:gates", phase: "Verify", model: CONTRACT.models.verify, schema: {
    type: "object",
    required: ["doc_graph_pass", "mirror_pass", "node_count", "edge_count", "fixes_made", "gate_evidence"],
    properties: {
      doc_graph_pass: { type: "boolean" },
      mirror_pass: { type: "boolean" },
      node_count: { type: "integer" },
      edge_count: { type: "integer" },
      fixes_made: { type: "array", items: { type: "string" } },
      gate_evidence: { type: "string", description: "verbatim DG_EXIT=.. MIRROR_EXIT=.. SYNC_EXIT=.. lines" },
    },
  } }
);

// Programmatic gate (H2 fix): parse the raw EXIT evidence; do not trust the self-graded booleans alone.
const ev = verify.gate_evidence || "";
const dgGreen = /DG_EXIT=0\b/.test(ev) && verify.doc_graph_pass;
const mirrorGreen = /MIRROR_EXIT=0\b/.test(ev) && verify.mirror_pass;
const syncGreen = /SYNC_EXIT=0\b/.test(ev);
const gatePass = dgGreen && mirrorGreen && syncGreen;

// ---------- persist report ----------
const reportName = `doc-governance-report-${MANIFEST.split("/").pop().replace(/\W+/g, "-")}`;
const report = await agent(
  `Write a doc-governance run report to ${ROOT}/ai/curaos/docs/governance/${reportName}.md (create the dir if needed via Bash mkdir -p; use the Write tool for the file). Include: date, manifest path (${MANIFEST}), mode (${MODE}), clusters (${clusters.length}), confirmed regressions (${confirmed.length}), edits applied (${editsApplied}), gate results (doc_graph_pass=${verify.doc_graph_pass}, mirror_pass=${verify.mirror_pass}, ${verify.node_count} nodes / ${verify.edge_count} edges), and a table of the confirmed regressions (file | class | severity | what | fix). Return the absolute path written.`,
  { label: "report", phase: "Verify", model: "haiku", schema: { type: "object", required: ["report_path"], properties: { report_path: { type: "string" } } } }
);

return {
  clusters_reviewed: clusters.length,
  findings: confirmed.length,
  confirmed_regressions: confirmed.length,
  edits_applied: editsApplied,
  verdict: gatePass ? "pass" : "block",
  gates: { doc_graph_pass: dgGreen, mirror_pass: mirrorGreen, sync_pass: syncGreen, node_count: verify.node_count, edge_count: verify.edge_count, evidence: ev },
  report_path: report.report_path,
  // If verdict=block the caller (orchestrator) MUST NOT treat this run as clean - a gate is red.
};
