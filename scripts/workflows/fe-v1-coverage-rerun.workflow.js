export const meta = {
  name: 'fe-v1-coverage-rerun',
  description: 'Re-measure the 14 frontend apps whose gap-assessment was rate-limited in the first coverage run (read-only). Same per-app Done-criteria vs implemented vs needed-services assessment. Lower concurrency to avoid the rate limit. Outputs the missing matrix rows.',
  phases: [
    { title: 'Re-measure', detail: 'the 14 previously-rate-limited apps, read-only' },
  ],
}

const ROOT = decodeURIComponent(new URL('../..', import.meta.url).pathname).slice(0, -1)
const CURAOS = `${ROOT}/curaos`
const AIDOCS = `${ROOT}/ai/curaos/frontend/apps`

// The 14 apps that failed with rate-limit in fe-v1-coverage-matrix.
const APPS = ['admin-app', 'builder-studio', 'fleet-manager', 'business-donation', 'business-site', 'business-shop', 'business-workflow', 'personal-automation', 'personal-shop', 'personal-site', 'personal-tasks', 'personal-tracking', 'personal-workflow', 'hosted-login']

const APPGAP = { type: 'object', required: ['app', 'implementedPct', 'wiredToRealBackend', 'neededServices', 'gaps'], properties: {
  app: { type: 'string' },
  kind: { type: 'string', enum: ['web', 'rn'] },
  implementedPct: { type: 'number' },
  wiredToRealBackend: { type: 'boolean' },
  emittedScreens: { type: 'array', items: { type: 'string' } },
  neededServices: { type: 'array', items: { type: 'string' } },
  depthGaps: { type: 'array', items: { type: 'string' } },
  gaps: { type: 'array', items: { type: 'string' } },
  e2ePresent: { type: 'boolean' }, i18nComplete: { type: 'boolean' },
  topGaps: { type: 'string', description: 'one-line summary of the biggest gaps' } } }

phase('Re-measure')
// Sequential-ish: chunk into pairs to stay under the rate limit.
const results = []
const CHUNK = 4
for (let i = 0; i < APPS.length; i += CHUNK) {
  const batch = APPS.slice(i, i + CHUNK)
  const r = await parallel(batch.map((app) => () =>
    agent(
      `READ-ONLY measurement (no edits). Measure the v1 Done-criteria gap for frontend app "${app}".
Sources: Requirements/Done-criteria/Integration-points at ${AIDOCS}/${app}/Requirements.md (+ CONTEXT.md); actual code at ${CURAOS}/frontend/apps/${app}/ (app/ routes, src/api/ hooks, src/api/mock-data.ts, test/, messages/).
Be HONEST + strict. A generic CRUD screen against mock-data does NOT satisfy a "works end-to-end" criterion. Known fleet pattern (verify, do not anchor): UI renders + generated src/actions/* exist, but write paths fire toast()+local state and never call the actions; reads come from seed/mock not live queries; no Playwright; i18n is en-only (no ar/RTL).
Determine: kind (web|rn); implementedPct (honest 0-100 of Done-criteria actually met); wiredToRealBackend (does it call live @curaos/api-client against real services, or only mock-data?); emittedScreens (app/ route segments); neededServices (REST-consumer slugs from Integration points); depthGaps (features beyond generic CRUD the Done-criteria imply); e2ePresent; i18nComplete; gaps (concrete work items to full Done-criteria parity); topGaps (one-line). Report the object.`,
      { label: `gap:${app}`, phase: 'Re-measure', schema: APPGAP, model: 'sonnet' }
    ).then((x) => ({ app, ...x }))
  )).then((x) => x.filter(Boolean))
  results.push(...r)
  log(`batch ${i / CHUNK + 1}: ${r.length}/${batch.length} measured`)
}

return {
  measured: results.length,
  perApp: results.map((g) => ({ app: g.app, kind: g.kind, pct: g.implementedPct, wired: g.wiredToRealBackend, e2e: g.e2ePresent, i18n: g.i18nComplete, neededServices: g.neededServices, topGaps: g.topGaps })),
  avgPct: Math.round(results.reduce((s, g) => s + (g.implementedPct || 0), 0) / Math.max(1, results.length)),
  anyWired: results.filter((g) => g.wiredToRealBackend).map((g) => g.app),
}
