export const meta = {
  name: 'fe-v1-coverage-matrix',
  description: 'Measure the REAL v1 gap (read-only, no building): for each of the 22 frontend apps, extract its Requirements.md Done-criteria + integration points, inspect what is actually implemented in the app (screens, real-service wiring vs mock, depth, i18n, E2E presence), and probe whether each backend service it depends on is runnable (has package.json + start script + real controllers + a spec). Output a per-app coverage matrix + a backend-runnability table so we can plan full Done-criteria parity from real data, not guesses.',
  phases: [
    { title: 'Per-app gap', detail: 'read Requirements Done-criteria vs implemented + needed services (parallel, 22 apps)' },
    { title: 'Backend runnability', detail: 'probe each referenced backend service: runnable? has spec? has data?' },
    { title: 'Synthesize', detail: 'coverage matrix + phased plan to full Done-criteria parity' },
  ],
}

const ROOT = decodeURIComponent(new URL('../..', import.meta.url).pathname).slice(0, -1)
const CURAOS = `${ROOT}/curaos`
const AIDOCS = `${ROOT}/ai/curaos/frontend/apps`

// 22 apps: 20 web + 2 RN (clinician-app, patient-app).
const APPS = ['admin-app', 'builder-studio', 'workflow-designer', 'front-office', 'fleet-manager', 'business-automation', 'business-donation', 'business-shop', 'business-site', 'business-workflow', 'personal-automation', 'personal-calendar', 'personal-donation', 'personal-notes', 'personal-shop', 'personal-site', 'personal-tasks', 'personal-tracking', 'personal-workflow', 'hosted-login', 'clinician-app', 'patient-app']

const APPGAP = { type: 'object', required: ['app', 'doneCriteria', 'implementedPct', 'wiredToRealBackend', 'neededServices', 'gaps'], properties: {
  app: { type: 'string' },
  kind: { type: 'string', enum: ['web', 'rn'] },
  doneCriteria: { type: 'array', items: { type: 'object', properties: { item: { type: 'string' }, status: { type: 'string', enum: ['done', 'partial', 'missing'] }, evidence: { type: 'string' } } } },
  implementedPct: { type: 'number', description: '0-100 estimate of Done-criteria actually met' },
  wiredToRealBackend: { type: 'boolean', description: 'does the app call live @curaos/api-client against real services, or only mock-data?' },
  emittedScreens: { type: 'array', items: { type: 'string' } },
  neededServices: { type: 'array', items: { type: 'string' }, description: 'backend service slugs this app depends on (from Integration points)' },
  depthGaps: { type: 'array', items: { type: 'string' }, description: 'feature depth missing beyond generic CRUD: relational flows, pagination/filters, workflows, embeds, e2e' },
  gaps: { type: 'array', items: { type: 'string' }, description: 'concrete work items to reach full Done-criteria parity' },
  e2ePresent: { type: 'boolean' }, i18nComplete: { type: 'boolean' } } }

const SVC = { type: 'object', required: ['service', 'exists', 'runnable'], properties: {
  service: { type: 'string' }, exists: { type: 'boolean' }, runnable: { type: 'boolean', description: 'has package.json + start/dev script + real controllers (not empty scaffold)' },
  hasSpec: { type: 'boolean', description: 'has an OpenAPI/AsyncAPI spec under specs/' }, hasMigrations: { type: 'boolean' }, srcLoc: { type: 'number' }, actualDir: { type: 'string', description: 'real dir name if it differs from the referenced slug' }, notes: { type: 'string' } } }

phase('Per-app gap')
const gaps = await parallel(APPS.map((app) => () =>
  agent(
    `READ-ONLY measurement (do NOT modify anything). Measure the v1 Done-criteria gap for frontend app "${app}".
Sources:
- Requirements + integration points + Done criteria: ${AIDOCS}/${app}/Requirements.md (also CONTEXT.md, AGENTS.md if present).
- Actual implementation: ${CURAOS}/frontend/apps/${app}/ (app/ routes, src/api/ hooks, src/api/mock-data.ts, test/, messages/).
Determine:
1. The app kind: web (Next.js) or rn (React Native: clinician-app, patient-app).
2. Every Done-criteria checkbox in Requirements.md, and for each: is it done / partial / missing in the actual code? Cite evidence (file or its absence). Be HONEST + strict - a generic CRUD screen against mock-data does NOT satisfy a "works end-to-end" criterion.
3. implementedPct: your honest 0-100 estimate of how much of the Done-criteria is actually met (the user believes it is ~35% - verify, do not anchor).
4. wiredToRealBackend: does the app actually call live services via @curaos/api-client, or does it only read src/api/mock-data.ts? (grep the hooks: do they hit real fetch/api-client, and is mock the only path?)
5. emittedScreens: the app/ route segments (the CRUD screens).
6. neededServices: the backend service slugs from the Integration points table (REST consumer rows).
7. depthGaps: features the Done-criteria / Requirements imply that go BEYOND the generic list/form/detail CRUD floor - relational flows (e.g. user/role ASSIGNMENT), pagination + filters on real queries, workflow instances, builder/RSC embeds, dashboards with real metrics, etc.
8. e2ePresent: is there a real Playwright (or any) E2E suite? i18nComplete: are en + ar (RTL) bundles present + wired?
9. gaps: the concrete work items to reach FULL Done-criteria parity.
Report the structured object. NO building, NO edits - measurement only.`,
    { label: `gap:${app}`, phase: 'Per-app gap', schema: APPGAP, model: 'sonnet' }
  ).then((r) => ({ app, ...r }))
)).then((r) => r.filter(Boolean))
log(`measured ${gaps.length}/22 apps; avg implementedPct = ${Math.round(gaps.reduce((s, g) => s + (g.implementedPct || 0), 0) / Math.max(1, gaps.length))}%`)

phase('Backend runnability')
// Union of all needed services across apps.
const services = [...new Set(gaps.flatMap((g) => g.neededServices || []).filter(Boolean))]
const svcResults = await parallel(services.map((svc) => () =>
  agent(
    `READ-ONLY: probe whether backend service "${svc}" is runnable. The referenced slug may not match the real dir (e.g. "identity-core-service" referenced but the real dir is "identity-service"). Look under ${CURAOS}/backend/services/ for the closest real match.
Determine: exists (a non-empty dir), actualDir (the real dir name), runnable (has package.json with a start/dev script AND real *.controller.ts with handlers, not an empty scaffold), hasSpec (an OpenAPI/AsyncAPI file under specs/), hasMigrations (drizzle/ or migrations present), srcLoc (total LOC under src). notes: anything blocking a local boot (needs Postgres, env, etc). Report the structured object.`,
    { label: `svc:${svc}`, phase: 'Backend runnability', schema: SVC, model: 'sonnet' }
  ).then((r) => ({ service: svc, ...r }))
)).then((r) => r.filter(Boolean))
log(`probed ${svcResults.length} backend services; runnable = ${svcResults.filter((s) => s.runnable).length}`)

phase('Synthesize')
const synthesis = await agent(
  `Synthesize a v1 frontend coverage matrix + phased build plan to FULL Done-criteria parity, from this real data.
PER-APP GAP DATA: ${JSON.stringify(gaps).slice(0, 16000)}
BACKEND RUNNABILITY: ${JSON.stringify(svcResults).slice(0, 6000)}
Produce a markdown report: (1) a per-app coverage table (app | kind | implementedPct | wiredToRealBackend | e2e | i18n | top gaps). (2) the backend-runnability table (service | runnable | hasSpec | actualDir). (3) the cross-cutting gaps (real-service wiring missing fleet-wide? service-name drift in Requirements? no E2E anywhere? i18n partial?). (4) a phased plan to full parity: which gaps are GENERATOR-level (fix once, applies to all apps - e.g. real api-client wiring in the emitter, E2E scaffold in the emitter) vs per-app depth (relational flows, app-specific screens). Order phases by leverage (generator-level first). (5) the backend-runtime recommendation: given which services are runnable, can we wire to live local services (compose) or must we contract-mock from specs? Be concrete + honest. Return the full markdown.`,
  { label: 'synthesize', phase: 'Synthesize', model: 'opus' }
)

return {
  avgImplementedPct: Math.round(gaps.reduce((s, g) => s + (g.implementedPct || 0), 0) / Math.max(1, gaps.length)),
  appsWiredToRealBackend: gaps.filter((g) => g.wiredToRealBackend).map((g) => g.app),
  appsMockOnly: gaps.filter((g) => !g.wiredToRealBackend).map((g) => g.app),
  e2eAnywhere: gaps.filter((g) => g.e2ePresent).map((g) => g.app),
  runnableServices: svcResults.filter((s) => s.runnable).map((s) => s.actualDir || s.service),
  serviceNameDrift: svcResults.filter((s) => s.actualDir && s.actualDir !== s.service).map((s) => ({ referenced: s.service, actual: s.actualDir })),
  perApp: gaps.map((g) => ({ app: g.app, pct: g.implementedPct, wired: g.wiredToRealBackend, e2e: g.e2ePresent, gaps: (g.gaps || []).length })),
  reportMarkdown: synthesis,
}
