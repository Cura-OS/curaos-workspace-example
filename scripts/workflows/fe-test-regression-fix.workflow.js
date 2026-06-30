export const meta = {
  name: 'fe-test-regression-fix',
  description: 'Fix the bun test regression in 4 apps (business-site, business-workflow, personal-calendar, personal-donation) caused by closure-3 scaffold-route removal: their generated tests still query the removed legacy generic-CRUD /<app-name> mock route, so res.items is undefined and tests throw. Update each stale test to query the real domain routes (or drop the dead legacy-route assertion); fold the test-template fix into the codegen so it never re-emits a test for a route it does not seed. Verify bun test green per app.',
  phases: [
    { title: 'Fix app tests', detail: 'per app: repoint/drop stale legacy-route test assertions, bun test green, commit (parallel)' },
    { title: 'Generator + grill', detail: 'fold the test-template fix into codegen; grill all 4 green' },
  ],
}

const ROOT = decodeURIComponent(new URL('../..', import.meta.url).pathname).slice(0, -1)
const CURAOS = `${ROOT}/curaos`
const EMITTER = `${CURAOS}/tools/codegen/src/ui-app-emit.ts`

const APPRES = { type: 'object', required: ['app', 'ok', 'detail'], properties: {
  app: { type: 'string' }, ok: { type: 'boolean' }, tested: { type: 'boolean' }, pushed: { type: 'boolean' }, detail: { type: 'string' }, blockers: { type: 'array', items: { type: 'string' } } } }
const BUILD = { type: 'object', required: ['ok', 'verifyResult', 'summary'], properties: {
  ok: { type: 'boolean' }, verifyResult: { type: 'string' }, summary: { type: 'string' }, blockers: { type: 'array', items: { type: 'string' } } } }
const VERDICT = { type: 'object', required: ['target', 'real', 'verdict'], properties: {
  target: { type: 'string' }, real: { type: 'boolean' }, verdict: { type: 'string' }, issues: { type: 'array', items: { type: 'string' } } } }

const APPS = ['business-site', 'business-workflow', 'personal-calendar', 'personal-donation']

phase('Fix app tests')
const results = await parallel(APPS.map((app) => () =>
  agent(
    `Fix the failing \`bun test\` in "${app}" at ${CURAOS}/frontend/apps/${app} (Next.js, branch main). ROOT CAUSE: closure-3 removed the dead legacy generic-CRUD /<app-name> mock route + its seed, but several generated tests still call mockResponse("/${app}") (or render the removed list screen) and assert res.items / list.items, which is now undefined -> TypeError. The DOMAIN routes + their tests are fine; only the stale LEGACY-route assertions fail.
TASK: run \`bun test\` to see the exact failing tests (audit cited: smoke.test.ts:34, list-render.test.tsx:34, site-builder-data.test.ts:112 / bpm-data.test.ts:89 / calendar-mock.test.ts:47 / giving / smoke per app). For EACH failing assertion that queries the REMOVED legacy /<app-name> generic route (e.g. a "falls through for the legacy admin routes" test, or a list-render test mounting the removed scaffold list): either (a) repoint it at a REAL domain route the app actually serves + seeds (preferred if the test is meaningful, e.g. the app's primary domain list), or (b) DELETE the dead assertion/test if it only existed to cover the removed scaffold. Do NOT weaken real domain-route tests. Keep all genuine domain tests intact + passing.
VERIFY (paste the real tail, exit 0): \`cd ${CURAOS}/frontend/apps/${app} && bun test\` exit 0 (all pass), AND \`rm -rf .next && bun run typecheck && bun run build\` exit 0 (no regression). NO em-dashes. Branch feat/${app}-test-fix off main, commit + push: \`git add -A && git commit -m "fix(${app}): repoint stale tests off the removed legacy scaffold route" && git push -u origin feat/${app}-test-fix\`.
Report app, ok, tested (bun test exit 0), pushed, detail (which tests changed + why), blockers. Repo-boundary: this app only.`,
    { label: `testfix:${app}`, phase: 'Fix app tests', schema: APPRES, model: 'opus' }
  ).then((r) => ({ app, ...r }))
)).then((r) => r.filter(Boolean))
log(`test fixes: ${results.filter((r) => r.tested).map((r) => r.app).join(', ')}`)

phase('Generator + grill')
const gen = await agent(
  `Fold the test-regression fix into the gen:ui-app generator ${EMITTER} so newly generated apps never ship a test that queries a route the mock plane does not seed. Read how the emitter emits the per-app test files (smoke.test.ts, list-render.test.tsx, *-mock/*-data tests) + how renderMockData / the route seeding works. The defect: closure-3 made the emitter stop seeding the legacy /<app-name> generic-CRUD route, but the emitted TEST template still asserts mockResponse("/<app-name>") returns items. ENSURE the emitted tests only assert routes the emitted mock-data actually seeds (the real domain/screen routes), with NO leftover legacy-route assertion. Update the generator tests to assert this consistency (every route a generated test queries is one the generated mock-data seeds). Keep green. NO em-dashes. VERIFY: \`cd ${CURAOS} && bun test tools/codegen/__tests__/ui-app-emit.test.ts\` green; a dry-run/temp-gen app's emitted tests reference only seeded routes. Report ok + verifyResult + summary + blockers. Repo-boundary: tools/codegen only.`,
  { label: 'gen-test-template-fix', schema: BUILD, model: 'opus' }
)
log(`generator test-template fix: ${gen?.ok ? 'OK' : 'BLOCKED ' + (gen?.blockers ?? []).join('; ')}`)

const grill = await agent(
  `Adversarially verify all 4 apps (business-site, business-workflow, personal-calendar, personal-donation) at ${CURAOS}/frontend/apps/<app> on their feat/<app>-test-fix branches: re-run \`bun test\` (exit 0, all pass - paste the real pass/fail tail for each) AND \`rm -rf .next && bun run build\` exit 0. Confirm the fix did NOT weaken real domain tests (the suites should still have meaningful domain assertions, just not the dead legacy-route ones) and no test was hollowed to pass-with-no-tests. Default real=false if any app's bun test is not exit-0-with-real-assertions or a build fails. Report target="test-regression", real, verdict, issues.`,
  { label: 'grill:test-regression', schema: VERDICT, model: 'opus' }
)

return {
  apps: results.map((r) => ({ app: r.app, tested: r.tested, pushed: r.pushed, detail: r.detail, blockers: r.blockers })),
  generator: { ok: gen?.ok, blockers: gen?.blockers },
  grill: grill ? { real: grill.real, verdict: grill.verdict, issues: grill.issues } : null,
}
