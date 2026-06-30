// breakdown - recursively decompose ANY issue into grab-able atomic units (1-level split per invocation;
// orchestrator re-invokes on non-grab-able children). Contract: docs/agents/workflows/breakdown.md
export const meta = {
  name: "breakdown",
  description: "Assess an issue's grab-ability; split into tracer-bullet leaves + wire sub-issues/deps when too large",
  phases: [
    { title: "Assess", detail: "is the issue already a grab-able atomic unit?" },
    { title: "Split", detail: "decompose + wire sub-issues/dependencies (skipped if grab-able)" },
  ],
};

const CONTRACT = {
  name: "breakdown",
  kind: "composite",
  version: "0.3.0",
  inputs: {
    issue: { type: "string", required: true, description: "owner/repo#N to assess + (if needed) decompose" },
    issue_body: { type: "string", required: false, description: "RP-39: deterministically prefetched issue body (gh-project batchIssueRead). When present it is AUTHORITATIVE and the assess prompt injects it instead of mandating a re-fetch; ONE comments spot-check stays permitted, not mandated. Absent => the assess prompt falls back to the mandated gh issue view read." },
    dry_run: { type: "boolean", required: false, description: "if true, return the proposed tree without creating issues/edges" },
    max_depth: { type: "number", required: false, description: "recursion-depth guard (default 4)" },
    depth: { type: "number", required: false, description: "current recursion depth (orchestrator passes depth+1 on re-invoke; default 0)" },
  },
  outputs: {
    grabable: { type: "boolean", description: "true if the input issue was already an atomic grab-able unit (no split)" },
    leaves: { type: "array", description: "the grab-able leaf issues (existing + created)" },
    created: { type: "array", description: "issues created this pass (empty in dry_run)" },
    needs_recursion: { type: "array", description: "child issues that are themselves not yet grab-able (orchestrator re-invokes breakdown on each)" },
    escalate: { type: "string", description: "set if a unit cannot be made atomic within max_depth (likely a design gap → §3.6)" },
  },
  guarantees: { idempotent: false, determinism: "control-flow-only", side_effects: "github" },
  verification: "T2",
    models: { assess: "sonnet", split: "opus" },
  composes: ["gh-subissue-wire"],
};

const ROOT = ".";
function parseArgs(a) {
  if (a && typeof a === "object") return a;
  if (typeof a === "string" && a.trim()) { try { return JSON.parse(a); } catch { return {}; } }
  return {};
}

phase("Assess");
const cfg = parseArgs(typeof args !== "undefined" ? args : undefined);
if (!cfg.issue) throw new Error("breakdown: args.issue (owner/repo#N) is required");
const maxDepth = cfg.max_depth || 4;
const depth = typeof cfg.depth === "number" ? cfg.depth : 0;
const dryRun = !!cfg.dry_run;

// Programmatic depth guard (H3 fix): if the orchestrator has re-invoked us to max_depth and the
// issue is STILL being split, stop + escalate - do not split further (likely a design gap → §3.6).
if (depth >= maxDepth) {
  return { grabable: false, leaves: [], created: [], needs_recursion: [],
    escalate: `breakdown: ${cfg.issue} still non-atomic at depth ${depth} (max_depth ${maxDepth}) - escalate via §3.6, likely a design gap` };
}

// 1. Assess grab-ability (read-only). RP-39: when the caller threads a deterministically
// prefetched body (issue_body), the prompt injects it marked AUTHORITATIVE instead of mandating
// a re-fetch; one comments spot-check stays permitted, not mandated. KEEP IN SYNC with the
// inlined assess prompt in milestone-wave.workflow.js (Breakdown phase).
const assess = await agent(
  `Assess whether CuraOS issue ${cfg.issue} is a single GRAB-ABLE atomic unit a worker can implement in one go. ${cfg.issue_body ? `The issue BODY below was prefetched deterministically and is AUTHORITATIVE - do NOT re-fetch it (no \`gh issue view\` for the body). You MAY run ONE spot-check read of the comments (\`env -u GITHUB_TOKEN gh issue view ${cfg.issue} --comments\`) ONLY when the body references discussion you need (permitted, not mandated).
PREFETCHED ISSUE BODY (authoritative):
"""
${cfg.issue_body}
"""` : `Read it: \`gh issue view ${cfg.issue} --comments\` (Bash; use \`env -u GITHUB_TOKEN gh\`). Read its body + scope.`}
Grab-able test (ALL must hold): one owned-path root (single submodule/module) · one acceptance-criterion cluster · effort <= L · no internal parallelism · scope does not span multiple "and"-joined deliverables.
Return: grabable (bool) + reasoning + (if not grab-able) a proposed decomposition into vertical tracer-bullet slices (each a child issue title + scope + the owned-path root + acceptance), per the to-issues skill discipline. Read-only - create nothing.`,
  { label: "assess", phase: "Assess", model: CONTRACT.models.assess, schema: {
    type: "object",
    required: ["grabable"],
    properties: {
      grabable: { type: "boolean" },
      reasoning: { type: "string" },
      proposed_children: { type: "array", items: { type: "object", required: ["title", "scope", "owned_path", "acceptance"], properties: {
        title: { type: "string" }, scope: { type: "string" }, owned_path: { type: "string" }, acceptance: { type: "string" } } } },
    },
  } }
);

if (assess.grabable) {
  return { grabable: true, leaves: [cfg.issue], created: [], needs_recursion: [], escalate: "" };
}

const children = assess.proposed_children || [];
if (!children.length) {
  return { grabable: false, leaves: [], created: [], needs_recursion: [], escalate: `breakdown: ${cfg.issue} judged non-grab-able but no decomposition proposed - design gap, escalate via §3.6` };
}

// 2. Split - create child issues + wire native sub-issues + dependencies (inline in v0.1.0; extracts to gh-subissue-wire in Phase D)
phase("Split");
// Step A: create the child issues (no wiring here - wiring is composed via gh-subissue-wire).
const split = await agent(
  `${dryRun ? "DRY RUN - propose the tree, create NOTHING." : "Create the child issues for the decomposition of " + cfg.issue + "."} Work from ${ROOT} with \`env -u GITHUB_TOKEN gh\`.
Parent: ${cfg.issue}. Proposed children (JSON):
${JSON.stringify(children, null, 2)}
${dryRun ? "" : `For each child: gh issue create in the correct repo (per docs/agents/issue-tracker.md repo-selection) with canonical CuraOS frontmatter including type, target-version, module, milestone, priority, effort, parent: "${cfg.issue}", requires, blocked-by, agent-notes. Also include a ## Parent section containing ${cfg.issue}, plus ## Scope/## Do not touch/## Acceptance/## Verification/## Docs/## Blockers. Determine child type from the roadmap hierarchy: Epic children are Stories; Story children are Tasks; Task splits stay Tasks unless the issue is a Bug or Spike. Idempotent: if a child with the same title already exists under the parent, reuse it rather than duplicating. Do NOT wire sub-issue/dependency edges here; that is done next by the gh-subissue-wire workflow.`}
For EACH child, re-apply the grab-ability test (one owned-path root, one acceptance cluster, <=L, no internal parallelism, no and-spanning).
Return: created (child issue refs owner/repo#N created or reused this pass; empty if dry_run), leaves (children that ARE grab-able), needs_recursion (children still too large - the orchestrator re-invokes breakdown on each).`,
  { label: "split", phase: "Split", model: CONTRACT.models.split, schema: {
    type: "object",
    required: ["created", "leaves", "needs_recursion"],
    properties: {
      created: { type: "array", items: { type: "string" } },
      leaves: { type: "array", items: { type: "string" } },
      needs_recursion: { type: "array", items: { type: "string" } },
    },
  } }
);

// Step B: compose gh-subissue-wire to wire native sub-issues (+ deps) for the created children.
const allChildren = [...(split.leaves || []), ...(split.needs_recursion || [])];
if (!dryRun && allChildren.length) {
  await workflow({ scriptPath: `${ROOT}/scripts/workflows/gh-subissue-wire.workflow.js` }, {
    parent: cfg.issue, children: JSON.stringify(allChildren), dry_run: false,
  });
}

return {
  grabable: false,
  leaves: split.leaves || [],
  created: split.created || [],
  needs_recursion: split.needs_recursion || [],
  escalate: "",
};
