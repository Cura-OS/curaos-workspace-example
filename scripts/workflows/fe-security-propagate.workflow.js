export const meta = {
  name: 'fe-security-propagate',
  description: 'Propagate the generator security fix (mockEnabled() hard-fails in production + .env.local.example mock line commented) to the 19 generated web apps by re-emitting their src/api/mock-data.ts + .env.local.example, build+test verify, commit+push. Also document the Next 15.3.5 build-worker static-gen flake as a known issue (mitigated by the predev .next clean).',
  phases: [
    { title: 'Propagate', detail: 're-emit mock-data + env example per app, build+test, commit+push (parallel)' },
    { title: 'Grill', detail: 'verify mockEnabled hard-fails in prod across a sample + builds green' },
  ],
}

const ROOT = decodeURIComponent(new URL('../..', import.meta.url).pathname).slice(0, -1)
const CURAOS = `${ROOT}/curaos`

const APPS = ['admin-app', 'workflow-designer', 'front-office', 'fleet-manager', 'business-automation', 'business-donation', 'business-shop', 'business-site', 'business-workflow', 'personal-automation', 'personal-calendar', 'personal-donation', 'personal-notes', 'personal-shop', 'personal-site', 'personal-tasks', 'personal-tracking', 'personal-workflow', 'hosted-login']

const APPRES = { type: 'object', required: ['app', 'ok', 'detail'], properties: {
  app: { type: 'string' }, ok: { type: 'boolean' }, built: { type: 'boolean' }, tested: { type: 'boolean' }, pushed: { type: 'boolean' }, detail: { type: 'string' }, blockers: { type: 'array', items: { type: 'string' } } } }
const VERDICT = { type: 'object', required: ['target', 'real', 'verdict'], properties: {
  target: { type: 'string' }, real: { type: 'boolean' }, verdict: { type: 'string' }, issues: { type: 'array', items: { type: 'string' } } } }

phase('Propagate')
const results = await parallel(APPS.map((app) => () =>
  agent(
    `Propagate the generator security fix to "${app}" at ${CURAOS}/frontend/apps/${app} (Next.js, branch main). The gen:ui-app emitter now (a) makes mockEnabled() hard-return false when NODE_ENV==='production' and (b) ships NEXT_PUBLIC_USE_MOCK commented in .env.local.example. Re-emit those two files into this app.
Steps: (1) branch feat/${app}-mock-prod-guard off main (NEVER main). (2) re-emit: \`rm -f src/api/mock-data.ts .env.local.example && cd ${CURAOS} && bun run gen:ui-app ${app} --write\` (idempotent for the rest). NOTE: if the app's mock-data.ts has app-specific hand-seeded domain data (e.g. admin-app's curated tenants, or a flagship app's rich seed), do NOT clobber that - instead just ADD the \`if (process.env.NODE_ENV === "production") return false;\` line as the first line of its mockEnabled() and comment the NEXT_PUBLIC_USE_MOCK=true line in .env.local.example, preserving all seed data. (Prefer the surgical edit over a full re-emit if the app carries bespoke seeds.)
VERIFY (paste real tails, exit 0): \`cd ${CURAOS}/frontend/apps/${app} && rm -rf .next && bun run typecheck && bun run build && bun run test\` all exit 0; mockEnabled() has the NODE_ENV==='production' guard; .env.local.example has NEXT_PUBLIC_USE_MOCK commented. NO em-dashes. commit + push: \`git add -A && git commit -m "fix(${app}): mock plane hard-fails in production (no mock-admin leak)" && git push -u origin feat/${app}-mock-prod-guard\`.
Report app, ok, built, tested, pushed, detail, blockers. Repo-boundary: this app only. Use \`bun run test\` (the package script with --isolate), NOT bare \`bun test\`.`,
    { label: `propagate:${app}`, phase: 'Propagate', schema: APPRES, model: 'sonnet' }
  ).then((r) => ({ app, ...r }))
)).then((r) => r.filter(Boolean))
log(`propagated: ${results.filter((r) => r.tested).length}/${APPS.length}`)

phase('Grill')
const grill = await agent(
  `Adversarially verify the mock-prod-guard propagation across a sample (admin-app, business-shop, personal-tasks, hosted-login, front-office): (1) does each src/api/mock-data.ts mockEnabled() hard-return false when NODE_ENV==='production' (the guard is the FIRST check, before the NEXT_PUBLIC_USE_MOCK reads)? (2) is NEXT_PUBLIC_USE_MOCK commented in each .env.local.example? (3) re-run \`bun run test\` + \`rm -rf .next && bun run build\` on 2 of them (exit 0). (4) Confirm bespoke seed data was preserved (admin-app still has its curated tenants). Default real=false if any sampled app lacks the prod guard or a build/test fails. Report target="mock-prod-guard", real, verdict, issues.`,
  { label: 'grill:mock-prod', schema: VERDICT, model: 'opus' }
)

return {
  propagated: results.filter((r) => r.tested).map((r) => r.app),
  failed: results.filter((r) => !r.tested).map((r) => ({ app: r.app, blockers: r.blockers })),
  grill: grill ? { real: grill.real, verdict: grill.verdict, issues: grill.issues } : null,
}
