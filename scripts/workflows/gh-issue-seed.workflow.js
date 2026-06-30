// gh-issue-seed - create one canonical agent-consumable issue (idempotent). Contract: docs/agents/workflows/gh-issue-seed.md
export const meta = {
  name: "gh-issue-seed",
  description: "Create one issue with canonical CuraOS frontmatter + sections, in the right repo (idempotent)",
  phases: [{ title: "Seed", detail: "render body + idempotent create" }],
};

const CONTRACT = {
  name: "gh-issue-seed",
  kind: "atomic",
  version: "0.1.0",
  inputs: {
    spec: { type: "string", required: true, description: "JSON of the issue: {repo, title, module, target-version, milestone?, priority, effort, scope, acceptance, ...}" },
    dry_run: { type: "boolean", required: false, description: "render the issue body + report, create nothing" },
  },
  outputs: {
    issue: { type: "string", description: "owner/repo#N created or reused" },
    created: { type: "boolean", description: "false if an existing issue with the same title was reused" },
    body_preview: { type: "string", description: "the rendered frontmatter + sections" },
  },
  guarantees: { idempotent: true, determinism: "control-flow-only", side_effects: "github" },
  verification: "T1",
  models: { seed: "sonnet" },
  composes: [],
};

const ROOT = ".";
function parseArgs(a) {
  if (a && typeof a === "object") return a;
  if (typeof a === "string" && a.trim()) { try { return JSON.parse(a); } catch { return {}; } }
  return {};
}

phase("Seed");
const cfg = parseArgs(typeof args !== "undefined" ? args : undefined);
if (!cfg.spec) throw new Error("gh-issue-seed: args.spec (JSON issue spec) is required");

const result = await agent(
  `Seed one CuraOS agent-consumable issue from this spec (JSON): ${cfg.spec}. Work from ${ROOT} (Bash, \`env -u GITHUB_TOKEN gh\`).
Render the body per docs/agents/issue-tracker.md + docs/agents/github-roadmap-project.md:
- Frontmatter: module / target-version (required; maps to Project Target Version) / milestone (optional custom CuraOS Milestone metadata only) / priority (MUST be Critical|High|Medium|Low - never P0..P3) / effort (S|M|L) / requires / blocked-by / agent-notes.
- Sections: ## Scope, ## Do not touch, ## Acceptance, ## Verification, ## Docs, ## Blockers (fill from spec; mark TBD where the spec is silent).
- Labels: one category (enhancement|bug) + one state (default needs-triage).
Do not set GitHub's built-in issue Milestone field. CuraOS Milestone is the Project custom field only.
Repo selection per the issue-tracker repo rules (correct submodule vs workspace) - use spec.repo if given, else infer.
IDEMPOTENT: before creating, \`gh issue list --repo <repo> --search "<title> in:title"\`; if an open issue with the same title exists, REUSE it (created=false), do not duplicate.
${cfg.dry_run ? "DRY RUN: return the rendered body_preview + the repo/title, create NOTHING." : "Create (or reuse) and return the ref."}
Return: issue (owner/repo#N), created (bool), body_preview.`,
  { label: "gh-issue-seed", phase: "Seed", model: CONTRACT.models.seed, schema: {
    type: "object",
    required: ["issue", "created", "body_preview"],
    properties: { issue: { type: "string" }, created: { type: "boolean" }, body_preview: { type: "string" } },
  } }
);

return result;
