// foresight-sweep - proactively DISCOVER future work across milestones, then hand each finding to
// foresight-capture (focused handoff -> focused subagent -> staged triaged issue).
// Contract: docs/agents/workflows/foresight-sweep.md
//
// Two modes:
//   wave            - post-merge, milestone-scoped: debt this wave introduced, decisions punted, the
//                     active milestone's not-yet-seeded prereqs. Runs inside milestone-wave's Foresight phase.
//   cross-milestone - deep scan across OLD + CURRENT + FUTURE milestones: stale closed-milestone debt worth
//                     re-surfacing, ADR RESOLUTION-MAP STILL-OPEN questions, milestones with no seeded
//                     stories, research gaps. Run on demand / scheduled (the periodic foresight horizon).
//
// Discovery is READ-ONLY; the only mutations happen in the composed foresight-capture. Capture starts
// no implementation work; later all-open triage decides whether staged foresight is ready, blocked,
// future-version-only, or user/operator gated.
export const meta = {
  name: "foresight-sweep",
  description: "Discover future work (debt/ideas/risks/prereqs) across milestones + seed it staged via foresight-capture",
  phases: [
    { title: "Discover", detail: "scan merged work / milestone graph / ADRs / research gaps for future work" },
    { title: "Capture", detail: "hand each finding to foresight-capture (handoff -> focused subagent -> staged issue)" },
  ],
};

const CONTRACT = {
  name: "foresight-sweep",
  kind: "composite",
  version: "0.1.0",
  inputs: {
    mode: { type: "string", required: false, description: "wave (post-merge, milestone-scoped - default) | cross-milestone (deep all-milestone scan)" },
    milestone: { type: "string", required: false, description: "milestone scope for wave mode (e.g. M9); ignored in cross-milestone mode" },
    max_items: { type: "number", required: false, description: "cap on findings handed to capture this run (default 12; keeps the backlog growth bounded + logs what was dropped)" },
    dry_run: { type: "boolean", required: false, description: "discover + report findings WITHOUT seeding any issue" },
  },
  outputs: {
    findings: { type: "array", description: "the future-work observations discovered, each {kind, milestone, scope, what, why}" },
    captured: { type: "array", description: "foresight-capture result: issues seeded/reused for the findings" },
    dropped: { type: "number", description: "findings beyond max_items not handed to capture this run (NO silent truncation - surfaced for the next run)" },
  },
  guarantees: { idempotent: true, determinism: "control-flow-only", side_effects: "github+fs" },
  verification: "T1",
  composes: ["foresight-capture"],
};

const ROOT = ".";
const WF = "scripts/workflows";
function parseArgs(a) {
  if (a && typeof a === "object") return a;
  if (typeof a === "string" && a.trim()) { try { return JSON.parse(a); } catch (_e) { return {}; } }
  return {};
}

const cfg = parseArgs(typeof args !== "undefined" ? args : undefined);
const mode = cfg.mode === "cross-milestone" ? "cross-milestone" : "wave";
const maxItems = Number.isFinite(cfg.max_items) ? cfg.max_items : 12;
const dryRun = !!cfg.dry_run;

phase("Discover");
// The discovery prompt differs by mode. Both are READ-ONLY + must NOT duplicate work already tracked
// (the capture step dedupes too, but cheap pre-filtering keeps the run tight).
const scopeLine = mode === "wave"
  ? `WAVE mode, milestone scope ${cfg.milestone || "the active milestone (resolve from the CuraOS Roadmap Project)"}. Scan ONLY this milestone's just-merged work + its near-term horizon.`
  : `CROSS-MILESTONE mode. Scan OLD + CURRENT + FUTURE milestones broadly (resolve the milestone set from the CuraOS Roadmap Project - do not hardcode).`;

const discovery = await agent(
  `Discover FUTURE WORK for CuraOS proactively - debt, improvements, ideas, missing context, risks, and next-milestone prerequisites that are NOT yet tracked. Work from ${ROOT}, READ-ONLY (Bash, \`env -u GITHUB_TOKEN gh\`; codegraph for structural questions). ${scopeLine}

Discovery sources (run the ones relevant to the mode):
1. DEBT INTRODUCED - recent merged PRs / commits whose changes left a known-incomplete edge (search commit bodies + closeout comments for "follow-up", "TODO", "stale", "n/a reason", "skipped", "--no-verify", "unmapped", "out of scope", "separate task"). Each is a debt finding.
2. DEFERRED DECISIONS - \`ai/curaos/docs/adr/RESOLUTION-MAP.md\` rows marked STILL-OPEN / needs-user, and ADRs whose Open Questions section is non-empty. Each unresolved decision a future milestone depends on is a prereq finding.
3. MISSING SCAFFOLDS / STORIES - milestones in the Project that have an Epic but NO seeded Stories/Tasks yet (query the Project, group by CuraOS Milestone, find milestones whose only item is the Epic). Each is a prereq finding for that milestone.
4. RESEARCH GAPS - issue Acceptance criteria that name an undecided library/pattern/schema with no matching \`ai/curaos/docs/research/*.md\`. Each is a context/research finding.
5. CROSS-MILESTONE ONLY - closed-milestone debt worth re-surfacing (search closed issues + grills for P2/P3 that were deferred and still apply); cumulative patterns (a fix applied ad-hoc ≥2x that should become a generator/rule change).

For each finding produce: kind (debt|idea|context|risk|prereq), milestone (the milestone it BELONGS to - its target, which may be future), scope (repo/module), what (one line), why (the consequence if not done). DO NOT propose anything already covered by an open issue (cheap title/label scan first). Ground every finding in a real artifact (commit, ADR row, Project gap, missing research file) - no speculative make-work. Return findings (array) ranked by consequence severity desc.`,
  { label: `discover:${mode}`, phase: "Discover", model: "opus", schema: {
    type: "object", required: ["findings"], properties: {
      findings: { type: "array", items: { type: "object", required: ["kind", "what", "why"], properties: {
        kind: { type: "string", enum: ["debt", "idea", "context", "risk", "prereq"] },
        milestone: { type: "string" }, scope: { type: "string" }, what: { type: "string" }, why: { type: "string" },
      } } },
    } },
  }
);

const allFindings = Array.isArray(discovery.findings) ? discovery.findings : [];
const take = allFindings.slice(0, maxItems);
const dropped = Math.max(0, allFindings.length - take.length);
if (dropped > 0) log(`foresight-sweep(${mode}): ${allFindings.length} findings, capturing top ${take.length} this run, ${dropped} deferred to next run (NOT silently dropped)`);
else log(`foresight-sweep(${mode}): ${take.length} findings -> capture`);

phase("Capture");
let captured = { seeded: [], skipped: [], handoffs: [] };
if (take.length) {
  captured = await workflow({ scriptPath: `${WF}/foresight-capture.workflow.js` }, {
    observations: JSON.stringify(take),
    dry_run: dryRun,
  });
}

return { findings: allFindings, captured, dropped };
