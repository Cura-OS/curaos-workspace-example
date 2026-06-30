export const meta = {
  name: 'fe-helm-chart-land',
  description: 'Land the per-app Helm charts (#730) onto each app submodule main. The chart EMITTER is already committed in curaos (feat/fe-helm-chart-generator). Per app: regenerate the chart from the committed generator (uniform source), stage chart/ ONLY (leave any unrelated regen/app-code churn untouched), helm lint + helm template verify, commit to the app main, push. Then bump curaos submodule pointers. Verifies via grill. RN apps ship via stores, not Helm (out of scope).',
  phases: [
    { title: 'Land charts', detail: 'per app: regen chart, lint+template, commit chart/ to app main, push (parallel)' },
    { title: 'Grill', detail: 'adversarially verify a sample: chart on app main, lint+template clean, secret is a ref' },
  ],
}

const ROOT = decodeURIComponent(new URL('../..', import.meta.url).pathname).slice(0, -1)
const CURAOS = `${ROOT}/curaos`

// 17 apps still needing the chart on their main (personal-tasks + personal-workflow already have it,
// but re-landing is idempotent so include all 19 for a uniform, generator-sourced result).
const APPS = ['admin-app', 'workflow-designer', 'front-office', 'fleet-manager', 'business-automation', 'business-donation', 'business-shop', 'business-site', 'business-workflow', 'personal-automation', 'personal-calendar', 'personal-donation', 'personal-notes', 'personal-shop', 'personal-site', 'personal-tasks', 'personal-tracking', 'personal-workflow', 'hosted-login']

const APPRES = { type: 'object', required: ['app', 'ok', 'detail'], properties: {
  app: { type: 'string' }, ok: { type: 'boolean' }, linted: { type: 'boolean' }, templated: { type: 'boolean' }, committed: { type: 'boolean' }, pushed: { type: 'boolean' }, detail: { type: 'string' }, blockers: { type: 'array', items: { type: 'string' } } } }
const VERDICT = { type: 'object', required: ['target', 'real', 'verdict'], properties: {
  target: { type: 'string' }, real: { type: 'boolean' }, verdict: { type: 'string' }, issues: { type: 'array', items: { type: 'string' } } } }

phase('Land charts')
const results = await parallel(APPS.map((app) => () =>
  agent(
    `Land the Helm chart (#730) onto the MAIN branch of the app submodule "${app}" at ${CURAOS}/frontend/apps/${app}. The chart emitter is ALREADY committed in the curaos worktree (gen:ui-app emits a chart/ subtree). Do EXACTLY this, nothing more:

1. In the app submodule, get onto a clean main: \`cd ${CURAOS}/frontend/apps/${app}\`, \`git stash -u\` if dirty, \`git checkout main\`, \`git pull --ff-only 2>/dev/null || true\`.
2. Regenerate the chart from the committed generator (uniform source of truth): \`cd ${CURAOS} && bun run gen:ui-app ${app} --write\`. This re-emits chart/ (and is idempotent for already-present app files).
3. Stage ONLY the chart subtree AND the health probe route (do NOT stage unrelated regenerated app-code/screen churn - that is out of scope and may be uncommitted work-in-progress): \`cd ${CURAOS}/frontend/apps/${app} && git add chart/ app/api/health/route.ts\`. The chart probes httpGet /api/health; the generator now emits app/api/health/route.ts (GET -> 200) so the probe target exists - both must land together or the pod 404s the probe and crash-loops.
4. VERIFY before committing (paste real command tails, exit 0):
   - \`helm lint ${CURAOS}/frontend/apps/${app}/chart\` exit 0.
   - \`helm template ${app} ${CURAOS}/frontend/apps/${app}/chart > /tmp/${app}-render.yaml 2>/dev/null\` then read /tmp/${app}-render.yaml and confirm it contains kind: Deployment AND kind: Service AND containerPort AND a httpGet probe on /api/health AND a secretKeyRef for OIDC_CLIENT_SECRET. IMPORTANT: do NOT pipe helm output through grep/wc in the shell to count - shell stdout may be truncated by the harness; redirect to a file and read the file (or use python to read the file) for accurate counts.
   - Confirm the OIDC secret is a Secret REF, never an inlined literal: the rendered output must show \`secretKeyRef:\` under OIDC_CLIENT_SECRET and must NOT contain a literal secret value.
   - Confirm app/api/health/route.ts exists and exports a GET returning 200 (the probe target).
5. If neither chart/ nor app/api/health/route.ts has staged changes (already identical on main), that is fine - report committed=false, ok=true, linted/templated=true.
6. Commit (chart + health route only) + push to main: \`git commit -m "feat(${app}): Helm chart + /api/health probe route for k3d/APISIX deploy (#730)" && git push origin main\`. If push is rejected (non-fast-forward), \`git pull --rebase origin main && git push origin main\`. NEVER force-push.
7. NO em/en-dashes anywhere. NO committed secrets.

Report: app, ok (chart present + lint + template all pass + health route present), linted, templated, committed (did you make a new commit), pushed, detail, blockers. Repo-boundary: this app submodule only. Do NOT touch curaos parent pointers (the orchestrator bumps those).`,
    { label: `land:${app}`, phase: 'Land charts', schema: APPRES, model: 'sonnet' }
  ).then((r) => ({ app, ...r }))
)).then((r) => r.filter(Boolean))
const landed = results.filter((r) => r.linted && r.templated)
log(`charts landed (lint+template clean): ${landed.length}/${APPS.length}; pushed: ${results.filter((r) => r.pushed).length}`)

phase('Grill')
const sample = landed.map((r) => r.app).slice(0, 4)
const grills = await parallel(sample.map((app) => () =>
  agent(
    `Adversarially verify the Helm chart for app "${app}" is genuinely landed on its MAIN branch and deploy-correct. In ${CURAOS}/frontend/apps/${app}: (1) confirm chart/ AND app/api/health/route.ts are committed on main: \`git ls-tree main -- chart/Chart.yaml app/api/health/route.ts\` shows BOTH (not just a dirty worktree). (2) Re-run \`helm lint chart\` (exit 0). (3) \`helm template ${app} chart > /tmp/grill-${app}.yaml\` then READ the file (do not grep-count via shell - read the file content directly or via python) and confirm: kind: Deployment present, containerPort 3000, a httpGet liveness+readiness probe on path /api/health, NODE_ENV production, and OIDC_CLIENT_SECRET wired via secretKeyRef with NO inlined literal value. (4) CRITICAL probe-target check: the probe path /api/health MUST be backed by app/api/health/route.ts exporting a GET that returns 200 (else the pod 404s the probe and crash-loops). Read that route file and confirm. Default real=false if the chart OR the health route is missing from main, lint/template fails, the Deployment is absent, a secret is inlined, or the probe path has no matching route. Report target="${app}", real, verdict, issues.`,
    { label: `grill:${app}`, phase: 'Grill', schema: VERDICT, model: 'opus' }
  )
)).then((r) => r.filter(Boolean))

return {
  landed: landed.map((r) => r.app),
  pushed: results.filter((r) => r.pushed).map((r) => r.app),
  failed: results.filter((r) => !(r.linted && r.templated)).map((r) => ({ app: r.app, blockers: r.blockers, detail: r.detail })),
  grills: grills.map((g) => ({ target: g.target, real: g.real, issues: g.issues })),
  grillFails: grills.filter((g) => !g.real).map((g) => ({ target: g.target, issues: g.issues })),
}
