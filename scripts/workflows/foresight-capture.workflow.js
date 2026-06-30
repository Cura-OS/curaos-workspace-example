// foresight-capture - turn raw foresight observations into properly-specced, staged tracker issues.
// Per observation: generate a FOCUSED handoff (handoff-skill discipline) -> dispatch a focused subagent to
// research/spec it in a clean context -> seed a GitHub issue (needs-triage + foresight, Target Version,
// Backlog at birth) + stamp the Roadmap Project fields INLINE (the same scripts/lib/gh-project.js
// logic gh-project-sync runs, as a direct agent() step - kept inline so capture stays workflow()-free and
// composes at any nesting depth). Contract: docs/agents/workflows/foresight-capture.md
//
// WHY handoff-then-subagent (user directive 2026-05-29): a foresight observation noticed mid-task is a
// one-line hunch, not a spec. Filing it inline either pollutes the capturing agent's context with a
// tangent or produces a thin stub. Instead we compact the observation into a focused handoff and hand it
// to a FRESH subagent whose whole context is that one future item - it researches + specs it properly,
// then we seed a real issue. The capturing wave stays focused; the future work gets a proper pass.
export const meta = {
  name: "foresight-capture",
  description: "Per foresight observation: focused handoff -> focused subagent specs it -> seed staged triaged issue",
  phases: [
    { title: "Handoff", detail: "compact each observation into a focused handoff doc (OS tmp)" },
    { title: "Spec", detail: "focused subagent researches/specs each item in a clean context" },
    { title: "Seed", detail: "create staged needs-triage + foresight issue with Target Version and Backlog at birth" },
  ],
};

const CONTRACT = {
  name: "foresight-capture",
  // atomic (was composite/composes=[gh-project-sync]): the executor now makes ZERO workflow() calls - it
  // runs handoff + spec + seed + project-sync + drain all as direct agent() steps. This is REQUIRED for
  // composability: foresight-capture is itself called as a child by milestone-wave / foresight-sweep, and
  // the runtime caps workflow() nesting at one level, so any workflow() inside capture (e.g. the old
  // gh-project-sync call) would throw when capture runs nested. Keeping it agent()-only keeps it flat.
  kind: "atomic",
  version: "0.1.0",
  inputs: {
    observations: { type: "string", required: true, description: "JSON array of foresight items: {kind: debt|idea|context|risk|prereq, target-version?, milestone?, scope (repo/module), what, why, suggested_handoff?}" },
    dry_run: { type: "boolean", required: false, description: "produce handoffs + specs + the issue plan WITHOUT creating issues or mutating the Project" },
  },
  outputs: {
    seeded: { type: "array", description: "issues created/reused, each {issue, kind, targetVersion, milestone, deduped}" },
    skipped: { type: "array", description: "observations skipped (duplicate of an existing foresight issue, or insufficient signal), with reason" },
    handoffs: { type: "array", description: "the focused handoff doc paths written (one per non-skipped observation)" },
  },
  guarantees: { idempotent: true, determinism: "control-flow-only", side_effects: "github+fs" },
  verification: "T1",
  composes: [],
};

const ROOT = ".";
function parseArgs(a) {
  if (a && typeof a === "object") return a;
  if (typeof a === "string" && a.trim()) { try { return JSON.parse(a); } catch { return {}; } }
  return {};
}

const cfg = parseArgs(typeof args !== "undefined" ? args : undefined);
let observations;
try { observations = JSON.parse(cfg.observations || "[]"); } catch { observations = []; }
if (!Array.isArray(observations) || !observations.length) {
  throw new Error("foresight-capture: args.observations (JSON array of foresight items) is required + non-empty");
}
const dryRun = !!cfg.dry_run;

const VALID_KINDS = ["debt", "idea", "context", "risk", "prereq"];

  // Pipeline per observation - each flows independently (handoff -> spec -> seed), no barrier.
const results = await pipeline(
  observations,
  // Phase 1: DEDUPE + focused HANDOFF. Skip if an existing foresight issue already covers this what/scope
  // (idempotent - re-running a sweep must not duplicate). Otherwise compact the observation into a focused
  // handoff doc in the OS tmp dir (handoff-skill discipline: reference existing artifacts by path, don't
  // duplicate; include a "suggested skills" section; redact secrets).
  (obs, _orig, i) => agent(
    `Foresight item (raw observation): ${JSON.stringify(obs)}.

STEP A - DEDUPE: search existing foresight issues for a duplicate before doing any work. From ${ROOT} (Bash, \`env -u GITHUB_TOKEN gh\`): \`gh search issues --owner your-org --label foresight --state open --json repository,number,title,body\` and judge whether any existing issue already captures THIS item (same scope + same "what", semantically - not just string match). If a duplicate exists, return deduped=true with the existing issue ref + STOP (no handoff).

STEP B - FOCUSED HANDOFF (only if not deduped): write a focused handoff document to the OS temp dir (NOT the workspace) at \`$(node -e 'process.stdout.write(require("os").tmpdir())')/foresight-${(obs.kind || "item")}-${i}.md\`, following the handoff skill discipline:
  - title + the foresight kind (${VALID_KINDS.join("|")}) + target version (${obs["target-version"] || obs.targetVersion || "unset - infer from scope or leave for triage"}) + scope (${obs.scope || "infer"})
  - the observation (what + why) and what the focused subagent must produce: a properly-specced issue body with ## Scope / ## Do not touch / ## Acceptance / ## Verification / ## Docs / ## Blockers + curaos frontmatter (module, target-version, milestone if derivable, priority, effort, requires, blocked-by, agent-notes)
  - reference existing artifacts by PATH/URL (ADRs, rules, prior issues, code) - do NOT duplicate their content
  - a "Suggested skills" section (e.g. to-issues, deep-research, ce-ideate) the spec subagent should invoke
  - redact any secrets/PII
Return: deduped (bool), existing_ref (if deduped), handoff_path (the doc you wrote, if not deduped), title (a concise issue title).`,
    { label: `handoff:${obs.kind || "item"}-${i}`, phase: "Handoff", model: "sonnet", schema: {
      type: "object", required: ["deduped"], properties: {
        deduped: { type: "boolean" }, existing_ref: { type: "string" }, handoff_path: { type: "string" }, title: { type: "string" },
      } } }
  ).then((h) => ({ obs, handoff: h, index: i })),

  // Phase 2: FOCUSED SPEC. A fresh subagent whose entire context is the handoff doc researches + specs the
  // item properly (the "more focused manner" the user asked for). It does NOT implement - it produces the
  // issue body + frontmatter. Skipped for deduped items.
  (prev) => {
    if (!prev || prev.handoff.deduped) return prev;
    return agent(
      `Read the focused handoff at ${prev.handoff.handoff_path} and produce a PROPERLY-SPECCED issue for this single future-work item - nothing else is in your scope. From ${ROOT}.
Follow the handoff's "Suggested skills" (invoke to-issues / deep-research as warranted; persist any research to ai/curaos/docs/research/ per the research-persist rule). Read the referenced ADRs/rules/code to ground the spec - align it with specs + ADRs (do NOT contradict a resolved ADR; if the item REQUIRES an unresolved decision, say so in ## Blockers and set blocked-by).
Produce: a complete issue body with the 6 canonical sections (## Scope, ## Do not touch, ## Acceptance, ## Verification, ## Docs, ## Blockers) + the curaos YAML frontmatter (module, target-version=${prev.obs["target-version"] || prev.obs.targetVersion || "<infer>"}, milestone=${prev.obs.milestone || "<omit if not derivable>"}, priority, effort, requires, blocked-by, agent-notes). The issue is staged foresight: it is not filed ready-for-agent at birth, but later §3.4 triage MUST promote it if it becomes relevant, complete, and unblocked. Use ## Blockers only for actual blockers such as "Target Version not active yet", missing context, a named dependency, or user/operator action.
Choose the target repo per docs/agents/issue-tracker.md (roadmap-tracker curaos-ai-workspace for cross-cutting/planning; the specific code repo for code-local work).
Return: repo (owner/repo), title, body (full issue body incl. frontmatter), targetVersion (v1/v1.1/v2/Unversioned or ""), milestone (M-tag or ""), parent_ref (owner/repo#N parent story/epic or ""), priority, effort.`,
      { label: `spec:${prev.obs.kind || "item"}-${prev.index}`, phase: "Spec", model: "opus", schema: {
        type: "object", required: ["repo", "title", "body"], properties: {
          repo: { type: "string" }, title: { type: "string" }, body: { type: "string" }, targetVersion: { type: "string" }, milestone: { type: "string" }, parent_ref: { type: "string" }, priority: { type: "string" }, effort: { type: "string" },
        } } }
    ).then((spec) => ({ ...prev, spec }));
  },

  // Phase 3: SEED the staged issue. Create with needs-triage + foresight labels (no ready-for-agent at birth),
  // then gh-project-sync stamps Target Version + CuraOS Milestone metadata + Status=Backlog so it appears in tracker
  // view. Skipped for deduped / dry_run. Later §3.4 triage can promote relevant complete work.
  (prev) => {
    if (!prev || prev.handoff.deduped) {
      return { obs: prev && prev.obs, deduped: true, existing_ref: prev && prev.handoff.existing_ref, handoff_path: null };
    }
    if (dryRun) {
      return { obs: prev.obs, dry_run: true, plan: { repo: prev.spec.repo, title: prev.spec.title, targetVersion: prev.spec.targetVersion || prev.spec["target-version"] || prev.spec.target_version || prev.obs["target-version"] || prev.obs.targetVersion || "", milestone: prev.spec.milestone }, handoff_path: prev.handoff.handoff_path };
    }
    return agent(
      `Seed a staged foresight issue from this spec. From ${ROOT} (Bash, \`env -u GITHUB_TOKEN gh\`).
repo=${prev.spec.repo} | title=${JSON.stringify(prev.spec.title)} | targetVersion=${prev.spec.targetVersion || prev.spec["target-version"] || prev.spec.target_version || prev.obs["target-version"] || prev.obs.targetVersion || "unset"} | milestone=${prev.spec.milestone || "unset"} | parent=${prev.spec.parent_ref || "none"}
1. Idempotent create: if an open issue with this exact title already exists under this repo, reuse it; else \`gh issue create -R ${prev.spec.repo} --title <title> --body <body-from-spec> --label "needs-triage,foresight"\`. The body is the spec's full body (frontmatter + 6 sections) - paste it verbatim. Do not add ready-for-agent at creation; this capture step stages the work and §3.4 triage later decides readiness.
   (the body to use):\n${prev.spec.body}
2. If parent is set, wire the new issue UNDER it as a native sub-issue (addSubIssue via the GH API / gh-subissue-wire semantics) so it groups under its story/epic.
Return: issue (owner/repo#N created or reused).`,
      { label: `seed:${prev.obs.kind || "item"}-${prev.index}`, phase: "Seed", model: "sonnet", schema: {
        type: "object", required: ["issue"], properties: { issue: { type: "string" } } } }
    ).then(async (created) => {
      // Stamp Target Version + Backlog status onto the Project item at birth.
      // INLINED (not workflow(gh-project-sync)): foresight-capture is a COMPOSED workflow - milestone-wave /
      // foresight-sweep call it as a child. The runtime caps workflow() nesting at ONE level, so a nested
      // workflow() call from inside foresight-capture (sweep[0] -> capture[1] -> gh-project-sync[2]) throws
      // "workflow() cannot be called from within a child workflow". gh-project-sync is itself a single Bash
      // agent over scripts/lib/gh-project.js, so we run that same logic as a direct agent() here - keeping
      // foresight-capture FLAT (agent()-only, zero workflow() calls) so it composes at any nesting depth.
      const targetVersion = prev.spec.targetVersion || prev.spec["target-version"] || prev.spec.target_version || prev.obs["target-version"] || prev.obs.targetVersion || "";
      const desiredFields = { ...(targetVersion ? { "Target Version": targetVersion } : {}), "CuraOS Milestone": prev.spec.milestone || "", Status: "Backlog" };
      const sync = await agent(
        `Sync issue ${created.issue} onto the CuraOS Roadmap project, idempotently, using the canonical lib. Work from ${ROOT} (Bash, \`env -u GITHUB_TOKEN gh\`).
Use a small Node one-liner that requires scripts/lib/gh-project.js: ensureProject() -> fieldMap(projectNumber) -> resolve the issue's content node id (gh api repos/<owner>/<repo>/issues/<n> --jq .node_id) + the project id -> addItem(projectId, contentId) (returns existing id if already added) -> read the item's current field values -> reconcileFields(projectId, itemId, fields, desired, current).
The roadmap fields are Project custom fields. "Target Version" is the release gate. "CuraOS Milestone" is optional grouping metadata. Do NOT write GitHub's built-in issue Milestone field. Desired fields = ${JSON.stringify(desiredFields)}. If "Target Version" is empty/missing, read issue body frontmatter \`target-version:\` as the source of truth. If "CuraOS Milestone" is empty/missing, read issue body frontmatter \`milestone:\` as the source of truth; NEVER invent a milestone. Execute the add + reconcile. After reconcile, read back "Target Version" and "CuraOS Milestone" and report them.
Return: item_id, field_writes (deltas), added (bool), targetVersion (read back, or "NONE"), milestone (read back, or "NONE").`,
        { label: `proj-sync:${prev.obs.kind || "item"}-${prev.index}`, phase: "Seed", model: "sonnet", schema: {
          type: "object", required: ["milestone"], properties: {
            item_id: { type: "string" }, field_writes: { type: "array", items: { type: "object" } },
            added: { type: "boolean" }, targetVersion: { type: "string" }, milestone: { type: "string" },
          } } }
      ).catch(() => ({ targetVersion, milestone: prev.spec.milestone }));
      // DRAIN: staging is now complete (Project + CuraOS Milestone + Backlog + parent wired above). The
      // `needs-triage` label was only correct at birth, before research/staging finished. Remove it as
      // the final step so a staged foresight issue is not mistaken for a raw triage strand. Later all-open
      // §3.4 triage can still promote relevant complete work because it scans all open issues, not only
      // issues carrying state labels. If staging failed, keep needs-triage so the strand stays visible.
      await agent(
        `From ${ROOT} (Bash, \`env -u GITHUB_TOKEN gh\`). Staging of foresight issue ${created.issue} is complete (on Project + Target Version when known + CuraOS Milestone metadata + Status=Backlog + parent wired). Remove its \`needs-triage\` label so it reads as staged foresight, not an undrained raw triage strand. The issue ref is in \`owner/repo#N\` form - split it on \`#\` and run \`env -u GITHUB_TOKEN gh issue edit <N> -R <owner/repo> --remove-label needs-triage\`. The issue must retain \`foresight\` (and any kind label like enhancement). Return: { drained: true } on success.`,
        { label: `drain:${prev.obs.kind || "item"}-${prev.index}`, phase: "Seed", model: "sonnet", schema: {
          type: "object", required: ["drained"], properties: { drained: { type: "boolean" } } } }
      );
      return { obs: prev.obs, issue: created.issue, kind: prev.obs.kind, targetVersion: sync.targetVersion || targetVersion, milestone: sync.milestone || prev.spec.milestone, deduped: false, handoff_path: prev.handoff.handoff_path };
    });
  },
);

const done = results.filter(Boolean);
const seeded = done.filter((r) => r.issue && !r.deduped).map((r) => ({ issue: r.issue, kind: r.kind, targetVersion: r.targetVersion, milestone: r.milestone, deduped: false }));
const skipped = done.filter((r) => r.deduped || r.dry_run).map((r) => ({
  observation: r.obs && (r.obs.what || r.obs.title),
  reason: r.deduped ? `duplicate of ${r.existing_ref || "existing foresight issue"}` : "dry_run (not created)",
}));
const handoffs = done.map((r) => r.handoff_path).filter(Boolean);

return { seeded, skipped, handoffs };
