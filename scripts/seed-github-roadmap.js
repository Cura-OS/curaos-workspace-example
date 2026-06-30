#!/usr/bin/env node
// NOTE: the canonical GitHub Projects v2 + Issues helpers (idempotent add, 3-way field reconcile,
// aliased batches, sub-issues/deps, content-creation token bucket) live in scripts/lib/gh-project.js.
// This seed script reuses that lib's gh-exec (single owner; do not re-implement gh() here).
// See docs/agents/workflows/ for the gh-* workflow atomics that also build on the lib.
const fs = require("node:fs");
const path = require("node:path");
const ghLib = require("./lib/gh-project.js");

const ORG = "your-org";
const WORKSPACE_REPO = `${ORG}/curaos-ai-workspace`;
const CURAOS_REPO = `${ORG}/curaos`;
const PROJECT_TITLE = "CuraOS Roadmap";
const ROOT = path.resolve(__dirname, "..");

function milestoneRank(title) {
  const match = title.match(/^\[(M[0-9.]+)\]/);
  if (!match) return 999;
  if (match[1] === "M1.5") return 1.5;
  return Number(match[1].slice(1));
}

// Delegate gh-exec to the canonical lib (single owner). The lib always strips GITHUB_TOKEN, so the
// previous `options.project` distinction is moot - project-scope auth comes from the keyring for all calls.
function gh(args, _options = {}) {
  return ghLib.gh(args).trim();
}

function jsonGh(args, _options = {}) {
  const out = gh(args);
  return out ? JSON.parse(out) : null;
}

function ensureProject() {
  const list = jsonGh(["project", "list", "--owner", ORG, "--format", "json", "--limit", "100"], { project: true });
  const found = list.projects.find((project) => project.title === PROJECT_TITLE);
  if (found) return found.number;
  const created = jsonGh(["project", "create", "--owner", ORG, "--title", PROJECT_TITLE, "--format", "json"], { project: true });
  return created.number;
}

function fieldMap(projectNumber) {
  const fields = jsonGh(["project", "field-list", String(projectNumber), "--owner", ORG, "--format", "json", "--limit", "100"], {
    project: true,
  });
  return new Map(fields.fields.map((field) => [field.name, field]));
}

function ensureField(projectNumber, name, dataType, options = []) {
  const fields = fieldMap(projectNumber);
  if (fields.has(name)) return fields.get(name);
  const args = [
    "project",
    "field-create",
    String(projectNumber),
    "--owner",
    ORG,
    "--name",
    name,
    "--data-type",
    dataType,
    "--format",
    "json",
  ];
  if (dataType === "SINGLE_SELECT") args.push("--single-select-options", options.join(","));
  return jsonGh(args, { project: true });
}

function ensureFields(projectNumber) {
  ensureField(projectNumber, "CuraOS Milestone", "SINGLE_SELECT", [
    "M1",
    "M1.5",
    "M2",
    "M3",
    "M4",
    "M5",
    "M6",
    "M7",
    "M8",
    "M9",
    "M10",
    "M11",
    "M12",
    "M13",
    "M14",
    "M15",
  ]);
  // Field declarations MUST match the LIVE CuraOS Roadmap project schema (reconciled 2026-05-29 after the
  // seed drifted from a hand-evolved project - the drift caused the No-CuraOS-Milestone grouping bug).
  // `ensureField` is create-if-missing + idempotent (skips existing), so these are the source of truth for
  // RECONSTRUCTING the project from scratch; they must equal what the live project actually has.
  ensureField(projectNumber, "Priority", "SINGLE_SELECT", ["Critical", "High", "Medium", "Low"]);
  ensureField(projectNumber, "Effort", "SINGLE_SELECT", ["XS", "S", "M", "L", "XL"]);
  ensureField(projectNumber, "Cycle", "SINGLE_SELECT", [
    "C1-Foundation", "C2-Identity-Core", "C3-Builder-Codegen", "C4-Workflow-Engine", "C5-HealthStack-Phase-A", "C6-Production-Hardening",
  ]);
  ensureField(projectNumber, "Initiative", "SINGLE_SELECT", [
    "Self-hosted", "Generic-before-vertical", "Composable", "Builder-led", "Event-led", "Documented-seams", "Multi-tenant", "Tenant-data-isolation",
  ]);
  ensureField(projectNumber, "Domain", "SINGLE_SELECT", [
    "identity", "tenancy", "party", "org", "audit", "settings", "notify", "search", "reports", "storage", "calendar", "tasks", "documents",
    "geospatial", "fleet", "commerce", "sales", "procurement", "inventory", "hr", "crm", "accounting", "esign", "conversion", "donation",
    "event", "integrations", "site", "workflow", "builder", "automation", "codegen", "healthstack", "educationstack", "erp", "observability",
    "security", "api-gateway",
  ]);
  ensureField(projectNumber, "Estimate", "NUMBER");
  ensureField(projectNumber, "Module", "TEXT");
  ensureField(projectNumber, "Epic Link", "TEXT");
  // NOTE (2026-05-29 reconcile): the original seed also created `Issue Kind` (SINGLE_SELECT) + `Requires`
  // + `Blocked By` (TEXT). The live project still carries them WITH historical data (Issue Kind on ~39
  // items, Requires/Blocked By on ~22 each), so they are NOT deleted here (destructive - would lose that
  // data). They are intentionally NOT re-declared: Requires/Blocked-By are now native GitHub dependency
  // edges, and Issue Kind is the native GitHub Issue Type - so a fresh project won't recreate them, and
  // the live orphans persist harmlessly until a deliberate, confirmed cleanup.
}

function repoIssues(repo) {
  const issues = jsonGh([
    "issue",
    "list",
    "--repo",
    repo,
    "--state",
    "all",
    "--limit",
    "500",
    "--json",
    "number,title,url,state,labels",
  ]);
  return new Map(issues.map((issue) => [issue.title, issue]));
}

function issueBody(issue) {
  const requires = (issue.requires || []).map((item) => `  - "${item}"`).join("\n") || "  []";
  const blockedBy = (issue.blockedBy || []).map((item) => `  - "${item}"`).join("\n") || "  []";
  const sections = [
    "---",
    `module: "${issue.module}"`,
    `milestone: "${issue.milestone}"`,
    `priority: "${issue.priority}"`,
    `effort: "${issue.effort}"`,
    "requires:",
    requires,
    "blocked-by:",
    blockedBy,
    `agent-notes: "${issue.agentNotes}"`,
    "---",
    "",
    "## Scope",
    issue.scope,
    "",
    "## Do not touch",
    issue.doNotTouch,
    "",
    "## Acceptance",
    ...issue.acceptance.map((item) => `- ${item}`),
    "",
    "## Verification",
    ...issue.verification.map((item) => `- \`${item}\``),
    "",
    "## Docs",
    ...issue.docs.map((item) => `- ${item}`),
    "",
    "## Dependencies",
    ...[...(issue.requires || []), ...(issue.blockedBy || [])].map((item) => `- ${item}`),
    "",
  ];
  return sections.join("\n");
}

function ensureIssue(issue, existingByRepo) {
  const existing = existingByRepo.get(issue.repo).get(issue.title);
  if (existing) return existing;
  const body = issueBody(issue);
  const createdUrl = gh([
    "issue",
    "create",
    "--repo",
    issue.repo,
    "--title",
    issue.title,
    "--body",
    body,
    "--label",
    issue.labels.join(","),
  ]);
  const created = jsonGh(["issue", "view", createdUrl, "--repo", issue.repo, "--json", "number,title,url,state,labels"]);
  existingByRepo.get(issue.repo).set(issue.title, created);
  if (issue.closeAfterCreate) {
    gh(["issue", "close", String(created.number), "--repo", issue.repo, "--comment", issue.closeComment || "Completed before roadmap seed."]);
    const closed = jsonGh(["issue", "view", String(created.number), "--repo", issue.repo, "--json", "number,title,url,state,labels"]);
    existingByRepo.get(issue.repo).set(issue.title, closed);
    return closed;
  }
  return created;
}

function addToProject(projectNumber, issueUrl) {
  try {
    return jsonGh(["project", "item-add", String(projectNumber), "--owner", ORG, "--url", issueUrl, "--format", "json"], {
      project: true,
    });
  } catch (error) {
    const message = String(error.stderr || error.message || "");
    if (message.includes("already exists") || message.includes("already added")) return null;
    throw error;
  }
}

function optionId(field, name) {
  return field.options?.find((option) => option.name === name)?.id;
}

// Map the issue-data P0..P3 priority shorthand to the live Priority single-select tiers. Pass-through if
// already a named tier. Keeps the seed's terse issue rows (P0..P3) working against the named-tier field.
function priorityLabel(p) {
  const m = { P0: "Critical", P1: "High", P2: "Medium", P3: "Low" };
  return m[p] || p;
}

function markdownLinkText(text) {
  return String(text).replace(/\\/g, "\\\\").replace(/\[/g, "\\[").replace(/\]/g, "\\]");
}

function setField(projectNumber, projectId, itemId, field, value) {
  if (!field || value === undefined || value === null || value === "") return;
  const args = [
    "project",
    "item-edit",
    "--id",
    itemId,
    "--project-id",
    projectId,
    "--field-id",
    field.id,
    "--format",
    "json",
  ];
  if (field.type === "ProjectV2SingleSelectField") {
    const id = optionId(field, value);
    if (!id) return;
    args.push("--single-select-option-id", id);
  } else {
    args.push("--text", String(value));
  }
  try {
    jsonGh(args, { project: true });
  } catch (error) {
    const message = String(error.stderr || error.message || "");
    if (error.code === "ETIMEDOUT" || error.signal === "SIGTERM") {
      console.warn(`warning: timed out setting project field ${field.name}`);
      return;
    }
    if (!message.includes("Could not resolve to a node")) throw error;
  }
}

const roadmapIssues = [
  ["M1", "Bun workspace + Turborepo scaffold", "COMPLETE", "M1 scaffold verified by scripts/m1-verify.sh."],
  ["M1.5", "GitHub roadmap/project issue seeding gate", "PENDING", "Current gate before M2 implementation."],
  ["M2", "Shared @curaos/* NestJS runtime libraries", "PENDING", "Tenancy, audit, providers, event-interceptors, verification."],
  ["M3", "Auth v0", "PENDING", "NestJS shell + Better Auth + tenant routing."],
  ["M4", "Builder v0", "PENDING", "NestJS shell + GrapesJS canvas + Payload CMS + Next builder UI."],
  ["M5", "Workflow v0", "PENDING", "Temporal TS SDK + Activepieces + workflow canvas."],
  ["M6", "Codegen v0", "PENDING", "NestJS engine + cookbook + critical recipes."],
  ["M7", "First mold output", "PENDING", "Generate one downstream service and prove the mold."],
  ["M8", "Core air-gap bundle", "PENDING", "Foundation products + sidecars packaged for offline install."],
  ["M9", "Identity/Party/Org/Audit generated cluster", "PENDING", "ADR-0200 cluster generated and stabilized."],
  ["M10", "Platform shared services + horizontal packages", "PENDING", "ADR-0201 + ADR-0209 shared service/package wave."],
  ["M11", "Remaining neutral capability clusters", "PENDING", "ADR-0202 through ADR-0206 neutral services."],
  ["M12", "HealthStack clinical overlay foundation", "PENDING", "ADR-0208 patient-centric clinical services with PHI controls."],
  ["M13", "EducationStack and ERP overlay wave", "PENDING", "ADR-0207 plus ERP/commerce extension wave."],
  ["M14", "Production hardening and compliance gates", "PENDING", "HIPAA/GDPR, SLO, security, perf, observability, air-gap hardening."],
  ["M15", "v1 GA packaging and launch readiness", "PENDING", "Sellable product bundles, pricing, docs, support, release readiness."],
].map(([milestone, name, status, notes]) => ({
  repo: WORKSPACE_REPO,
  title: `[${milestone}] ${name}`,
  module: "roadmap",
  milestone,
  priority: milestone === "M1.5" || milestone === "M2" ? "P0" : "P1",
  effort: "L",
  kind: milestone === "M1.5" ? "Gate" : "Roadmap",
  agentNotes: notes,
  scope: `Track ${milestone}: ${name}.`,
  doNotTouch: "Do not use this parent roadmap issue for code changes; create/claim atomic child issues.",
  acceptance: [
    "Atomic child issues exist for implementation work before code starts.",
    "Dependencies and blockers are reflected in issue frontmatter and Project fields.",
    "Issue status reflects current milestone truth.",
  ],
  verification: ["gh issue view <number> --repo your-org/curaos-ai-workspace --comments"],
  docs: ["Update ai/curaos/docs/HANDOVER.md and ai/curaos/docs/ISSUE-ROADMAP.md when status changes."],
  labels: ["enhancement", milestone === "M1.5" ? "ready-for-agent" : "needs-triage"],
  closeAfterCreate: milestone === "M1",
  closeComment: "M1 was completed before GitHub roadmap seed; see ai/curaos/docs/HANDOVER.md and scripts/m1-verify.sh.",
}));

function m2Issues(refs) {
  const m15 = refs.get("[M1.5] GitHub roadmap/project issue seeding gate")?.url || "M1.5 issue-seeding gate";
  const m2 = refs.get("[M2] Shared @curaos/* NestJS runtime libraries")?.url || "M2 roadmap issue";
  return [
    ["[M2] Run Drizzle/Citus PoC against live Citus", "backend/packages/drizzle-citus-poc", "S", "P0", "Verify Drizzle distributed-table workaround before M2 DB/session helpers.", ["bun run --filter @curaos/drizzle-citus-poc test:poc"]],
    ["[M2] Implement @curaos/tenancy runtime primitives", "backend/packages/tenancy", "L", "P0", "TenantModule, TenantInterceptor, CLS context, skip decorator, Drizzle search_path/session helper.", ["bun run --filter @curaos/tenancy test", "bun run --filter @curaos/tenancy typecheck"]],
    ["[M2] Implement @curaos/audit-sdk runtime primitives", "backend/packages/audit-sdk", "M", "P0", "Audit event schema, hash chain helper, Kafka publisher interface, Nest interceptor.", ["bun run --filter @curaos/audit-sdk test", "bun run --filter @curaos/audit-sdk typecheck"]],
    ["[M2] Implement @curaos/providers registry and local adapters", "backend/packages/providers", "M", "P1", "Provider registry, Zod config validation, local email/storage/secrets skeletons, third-party stubs.", ["bun run --filter @curaos/providers test", "bun run --filter @curaos/providers typecheck"]],
    ["[M2] Implement @curaos/event-interceptors lifecycle hooks", "backend/packages/event-interceptors", "M", "P1", "Manifest schema and before/after publish/consume/error lifecycle; defer WASM loader.", ["bun run --filter @curaos/event-interceptors test", "bun run --filter @curaos/event-interceptors typecheck"]],
    ["[M2] Publish M2 packages to Verdaccio", "ops/dev/verdaccio", "S", "P1", "Start local Verdaccio and publish/verify package resolution for M2 shared packages.", ["docker compose -f ops/dev/verdaccio/docker-compose.yml up -d", "bun install --frozen-lockfile"]],
    ["[M2] Verify and close M2 shared library gate", "curaos", "M", "P0", "Run full workspace verification and update handover/doc graph.", ["bun run typecheck", "bun run test", "bun run build", "bun run lint", "scripts/m1-verify.sh", "scripts/check-ai-mirror.sh", "bun scripts/check-doc-graph.js"]],
  ].map(([title, module, effort, priority, scope, verification]) => ({
    repo: CURAOS_REPO,
    title,
    module,
    milestone: "M2",
    priority,
    effort,
    kind: title.includes("Verify") ? "Verification" : "Implementation",
    requires: [m2],
    blockedBy: [m15],
    agentNotes: "Claim this issue before opening an implementation branch.",
    scope,
    doNotTouch: "Do not modify unrelated services, frontend apps, HealthStack overlays, or downstream cluster services.",
    acceptance: [
      "Implementation stays inside the module scope.",
      "Tests cover success and failure behavior relevant to the module.",
      "Package APIs stay compatible with M3 Auth v0 requirements.",
    ],
    verification,
    docs: ["Update ai/curaos/docs/HANDOVER.md if this changes milestone state.", "Regenerate ai/curaos/docs/ISSUE-ROADMAP.md after issue status changes."],
    labels: ["enhancement", "ready-for-agent"],
  }));
}

function writeRoadmap(created, projectNumber) {
  const lines = [
    "# CuraOS Issue Roadmap",
    "",
    "Generated by `scripts/seed-github-roadmap.js`. Do not edit issue tables by hand.",
    "",
    `Project: https://github.com/orgs/${ORG}/projects/${projectNumber}`,
    "",
    "## Issues",
    "",
    "| Milestone | Repo | Issue | State | Labels |",
    "|---|---|---|---|---|",
  ];
  for (const issue of created) {
    const labels = issue.labels?.map((label) => label.name).join(", ") || "";
    const milestone = issue.title.match(/^\[(M[0-9.]+)\]/)?.[1] || "";
    lines.push(`| ${milestone} | ${issue.repo} | [#${issue.number} ${markdownLinkText(issue.title)}](${issue.url}) | ${issue.state} | ${labels} |`);
  }
  fs.writeFileSync(path.join(ROOT, "ai/curaos/docs/ISSUE-ROADMAP.md"), `${lines.join("\n")}\n`);
}

function main() {
  const projectNumber = ensureProject();
  if (process.argv.includes("--index-only")) {
    const issues = [
      ...repoIssues(WORKSPACE_REPO).values(),
      ...repoIssues(CURAOS_REPO).values(),
    ]
      .filter((issue) => /^\[M[0-9.]+\]/.test(issue.title))
      .map((issue) => ({
        ...issue,
        repo: issue.url.includes("/curaos-ai-workspace/") ? WORKSPACE_REPO : CURAOS_REPO,
      }))
      .sort((a, b) => milestoneRank(a.title) - milestoneRank(b.title) || a.title.localeCompare(b.title));
    writeRoadmap(issues, projectNumber);
    console.log(`Wrote ai/curaos/docs/ISSUE-ROADMAP.md from ${issues.length} issues.`);
    return;
  }
  ensureFields(projectNumber);
  const project = jsonGh(["project", "view", String(projectNumber), "--owner", ORG, "--format", "json"], { project: true });
  const fields = fieldMap(projectNumber);

  const existingByRepo = new Map([
    [WORKSPACE_REPO, repoIssues(WORKSPACE_REPO)],
    [CURAOS_REPO, repoIssues(CURAOS_REPO)],
  ]);

  const created = [];
  const refs = new Map();
  for (const issue of roadmapIssues) {
    const item = ensureIssue(issue, existingByRepo);
    console.log(`issue: ${item.url}`);
    item.repo = issue.repo;
    refs.set(issue.title, item);
    created.push(item);
  }

  for (const issue of m2Issues(refs)) {
    const item = ensureIssue(issue, existingByRepo);
    console.log(`issue: ${item.url}`);
    item.repo = issue.repo;
    refs.set(issue.title, item);
    created.push(item);
  }

  const issueByTitle = new Map([...roadmapIssues, ...m2Issues(refs)].map((issue) => [issue.title, issue]));
  for (const item of created) {
    const issue = issueByTitle.get(item.title);
    const projectItem = addToProject(projectNumber, item.url);
    if (!projectItem?.id) continue;
    console.log(`project item: ${item.title}`);
    setField(projectNumber, project.id, projectItem.id, fields.get("CuraOS Milestone"), issue.milestone);
    // Priority field is the named tier (Critical/High/Medium/Low) on the live project; map the issue
    // data's P0..P3 shorthand to it (reconciled 2026-05-29 - the field is no longer P0..P3).
    setField(projectNumber, project.id, projectItem.id, fields.get("Priority"), priorityLabel(issue.priority));
    setField(projectNumber, project.id, projectItem.id, fields.get("Effort"), issue.effort);
    setField(projectNumber, project.id, projectItem.id, fields.get("Module"), issue.module);
    // Issue Kind / Requires / Blocked By were removed from the live project (Requires/Blocked-By are now
    // native GitHub dependency edges, not TEXT fields). No setField for them.
  }

  writeRoadmap(created);
  console.log(`Seeded ${created.length} issues into ${PROJECT_TITLE}: https://github.com/orgs/${ORG}/projects/${projectNumber}`);
}

main();
