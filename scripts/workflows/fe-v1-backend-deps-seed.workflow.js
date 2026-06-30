export const meta = {
  name: 'fe-v1-backend-deps-seed',
  description: 'Seed the GitHub dependency issues needed to make all v1 frontend apps fully functional. For each of the 21 v1 apps, read its Requirements integration points, resolve each needed backend service to its REAL dir, and classify it (runnable / empty-scaffold / nonexistent / spec-less). Dedupe into a backend-dependency set, then create tracked issues (per the roadmap rules: Target Version v1, canonical labels, parent epics, dependency links) for: (a) each backend service that must be built/filled or have a TypeSpec contract authored, and (b) the per-app frontend wiring work blocked on those backends. Idempotent: search-before-create. Read-only classification first; issue creation gated behind it.',
  phases: [
    { title: 'Classify deps', detail: 'per app: resolve needed services to real dirs + classify (parallel)' },
    { title: 'Dedupe + plan', detail: 'union the backend gaps, group, decide issue set' },
    { title: 'Seed issues', detail: 'create backend-gap + frontend-wiring issues with dep links, add to Project #2' },
  ],
}

const ROOT = decodeURIComponent(new URL('../..', import.meta.url).pathname).slice(0, -1)
const CURAOS = `${ROOT}/curaos`
const AIDOCS = `${ROOT}/ai/curaos/frontend/apps`
const REPO = 'your-org/curaos-ai-workspace'
const PROJECT = 'PVT_kwDODhOBDc4BYvCn' // CuraOS Roadmap (Project #2)

// 21 v1 apps (hosted-login DROPPED per ADR-0219; personal-tracking rebuilt).
const APPS = ['admin-app', 'builder-studio', 'workflow-designer', 'front-office', 'fleet-manager', 'business-automation', 'business-donation', 'business-shop', 'business-site', 'business-workflow', 'personal-automation', 'personal-calendar', 'personal-donation', 'personal-notes', 'personal-shop', 'personal-site', 'personal-tasks', 'personal-tracking', 'personal-workflow', 'clinician-app', 'patient-app']

const DEPCLASS = { type: 'object', required: ['app', 'services'], properties: {
  app: { type: 'string' },
  services: { type: 'array', items: { type: 'object', required: ['referenced', 'actualDir', 'status'], properties: {
    referenced: { type: 'string', description: 'slug as named in Requirements' },
    actualDir: { type: 'string', description: 'real backend/services/<dir> it resolves to, or "" if none exists' },
    status: { type: 'string', enum: ['runnable', 'empty-scaffold', 'nonexistent', 'spec-only', 'unknown'] },
    hasSpec: { type: 'boolean' },
    nameDrift: { type: 'boolean' } } } },
  frontendWiringGap: { type: 'string', description: 'one-line: the wiring/depth work this app needs once its backends exist' } } }

phase('Classify deps')
const classified = await parallel(APPS.map((app) => () =>
  agent(
    `READ-ONLY. For v1 frontend app "${app}", determine its backend dependencies + their real status.
1. Read ${AIDOCS}/${app}/Requirements.md (+ CONTEXT.md) Integration points table - list every backend service it consumes (REST consumer / embeds rows; skip @curaos/* library packages EXCEPT note if @curaos/forms / @curaos/fhir-client / @curaos/canvas / a *-sdk is required).
2. For each needed service slug, resolve it to a REAL directory under ${CURAOS}/backend/services/ (the slug may drift, e.g. "healthstack-scheduling-service" -> "scheduling-service", "consent-core-service" -> "healthstack-consent-service"). Set actualDir="" if NO real dir exists.
3. Classify each: runnable (package.json + start script + real *.controller.ts), empty-scaffold (dir exists but ~0 LOC / no package.json / no src), nonexistent (no dir), spec-only (has a specs/ contract but no impl). Note hasSpec (any OpenAPI/AsyncAPI/TypeSpec under specs/) and nameDrift (referenced != actualDir).
4. frontendWiringGap: one line on what THIS app needs to become functional once its backends exist (e.g. "wire flagship publish/save screens to actions; deepen schema; add e2e").
Report the structured object. NO writes.`,
    { label: `dep:${app}`, phase: 'Classify deps', schema: DEPCLASS, model: 'sonnet' }
  ).then((r) => ({ app, ...r }))
)).then((r) => r.filter(Boolean))
log(`classified ${classified.length}/${APPS.length} apps`)

phase('Dedupe + plan')
// Build the union backend-dependency set (keyed by actualDir||referenced) with the worst status.
const planAgent = await agent(
  `Plan the dependency-issue set from this per-app backend classification. DATA: ${JSON.stringify(classified).slice(0, 14000)}
Produce a JSON plan:
1. backendIssues: one entry PER UNIQUE backend service that is NOT runnable (empty-scaffold / nonexistent / spec-only). Each: { service (actualDir or the canonical kebab name to create), action ("author-spec+build" if no spec, "build-impl" if spec exists, "fill-scaffold" if empty dir), neededByApps (the app list), title, body (what to build: domain, key REST resources from the consuming apps, events if any, that it must satisfy the consuming apps' Done-criteria), blocks (the apps it blocks) }. Order so spec-less services (author TypeSpec first) are flagged as the critical path.
2. nameDriftFixes: the Requirements slug -> actualDir reconciliations needed (one doc-fix issue covering all).
3. frontendIssues: one PER app: { app, title, body (the wiring/depth work: flagship action wiring, schema depth, e2e, i18n - reference its frontendWiringGap), blockedByServices (the backend service names it needs) }.
Return ONLY the JSON object { backendIssues:[], nameDriftFixes:{title,body}, frontendIssues:[] }. Be concrete; bodies must be specific enough for an AFK agent to act (ready-for-agent quality).`,
  { label: 'dedupe-plan', phase: 'Dedupe + plan', model: 'opus', schema: { type: 'object', required: ['backendIssues', 'frontendIssues'], properties: {
    backendIssues: { type: 'array', items: { type: 'object', required: ['service', 'action', 'title', 'body', 'neededByApps'], properties: { service: { type: 'string' }, action: { type: 'string' }, title: { type: 'string' }, body: { type: 'string' }, neededByApps: { type: 'array', items: { type: 'string' } }, blocks: { type: 'array', items: { type: 'string' } } } } },
    nameDriftFixes: { type: 'object', properties: { title: { type: 'string' }, body: { type: 'string' } } },
    frontendIssues: { type: 'array', items: { type: 'object', required: ['app', 'title', 'body'], properties: { app: { type: 'string' }, title: { type: 'string' }, body: { type: 'string' }, blockedByServices: { type: 'array', items: { type: 'string' } } } } } } } }
)
log(`plan: ${planAgent.backendIssues.length} backend issues, ${planAgent.frontendIssues.length} frontend issues`)

phase('Seed issues')
// Create a parent epic for backend deps, then backend issues, then frontend issues blocked-by them.
// Single creator agent to keep issue-number bookkeeping + dependency links coherent + idempotent.
const seedResult = await agent(
  `Create the dependency issues on GitHub to make all v1 frontend apps functional. Repo: ${REPO}. Roadmap Project: ${PROJECT} (CuraOS Roadmap, #2). Use \`env -u GITHUB_TOKEN gh\` for every gh call (narrow-token workaround). Follow the roadmap rules: frontmatter \`target-version: v1\`, Project Target Version = v1, canonical labels only (enhancement, ready-for-agent, blocked, foresight), parent-epic linkage, add every created issue to the Project, and do not set GitHub's built-in issue Milestone field.

IDEMPOTENT: before creating any issue, \`gh issue list --repo ${REPO} --search "<key phrase>" --state open\` - if a matching issue already exists, REUSE its number, do NOT duplicate.

PLAN TO SEED:
BACKEND ISSUES: ${JSON.stringify(planAgent.backendIssues).slice(0, 9000)}
NAME-DRIFT FIX: ${JSON.stringify(planAgent.nameDriftFixes || {}).slice(0, 1500)}
FRONTEND ISSUES: ${JSON.stringify(planAgent.frontendIssues).slice(0, 9000)}

STEPS:
1. Create (or reuse) a parent epic: title "[v1][epic] Backend dependencies for full frontend functional parity", body linking ADR-0219 + the coverage matrix, labels enhancement. Body MUST start with canonical YAML frontmatter including \`target-version: v1\`. Record its number EPIC.
2. For each BACKEND ISSUE: create with title prefixed "[v1][backend] ", body = canonical YAML frontmatter (\`target-version: v1\`, module, priority, effort, requires, blocked-by, agent-notes; milestone only if derivable as custom CuraOS Milestone metadata) + the plan body + "Needed by: <apps>" + "Parent: #EPIC", labels: enhancement + ready-for-agent (or blocked if action=author-spec+build AND it gates others - spec-less is the critical path, but still ready-for-agent since authoring the spec is the first actionable step; use ready-for-agent). Link to parent EPIC as a sub-issue if the gh/GraphQL sub-issue API is available, else reference in body.
3. Create the NAME-DRIFT FIX issue: "[v1][docs] Reconcile frontend Requirements service-name drift", with canonical YAML frontmatter including \`target-version: v1\`, labels enhancement + ready-for-agent.
4. For each FRONTEND ISSUE: create title "[v1][fe] <app>: wire + deepen to Done-criteria parity", body = canonical YAML frontmatter including \`target-version: v1\` + plan body + "Blocked by: <the backend issue numbers for blockedByServices>" + "Parent: #726 (frontend epic)", labels: enhancement + (blocked if it has blockedByServices, else ready-for-agent). Reference the blocking backend issue NUMBERS you just created.
5. Add EVERY created issue to Project ${PROJECT}: \`gh project item-add 2 --owner your-org --url <issue-url>\`. Reconcile Project Target Version = v1 via \`scripts/roadmap-project-item-sync.js\`, \`gh-project-sync\`, or a direct Project field edit. A plain body note like "Target Version: v1" is not a substitute. If the field write fails, report the failure and do not claim the row is tracker-clean.
6. NO em/en-dashes in any title/body.

Report: created (list of {number, title}), reused (existing matches), epicNumber, and any failures. Paste the gh output tails as evidence.`,
  { label: 'seed-issues', phase: 'Seed issues', model: 'opus' }
)

return {
  classified: classified.length,
  backendIssuesPlanned: planAgent.backendIssues.map((b) => ({ service: b.service, action: b.action, blocks: (b.blocks || []).length })),
  frontendIssuesPlanned: planAgent.frontendIssues.length,
  seedReport: seedResult,
}
