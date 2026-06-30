export const meta = {
  name: 'fe-helm-charts',
  description: 'Close the "fully shipped" frontend gap (#730): extend the codegen so every Next.js web app emits a Helm chart (mirroring the backend service chart mold) - Next standalone container Deployment + Service + APISIX/ingress route + ConfigMap for NEXT_PUBLIC_*/OIDC env + serviceaccount + _helpers + NOTES. Emit charts for all 19 web apps, verify with helm lint + helm template (helm v4 is installed locally), and grill. RN apps (Expo) ship via app stores, not Helm - documented as out of scope. Produces ADR-0218.',
  phases: [
    { title: 'Chart emitter + ADR', detail: 'add a web-app Helm chart template to gen:ui-app (model on backend service chart); write ADR-0218' },
    { title: 'Emit + verify', detail: 'emit chart/ into each of 19 web apps, helm lint + helm template each (parallel)' },
    { title: 'Grill', detail: 'adversarially verify charts are real + lint/template clean + deploy-correct' },
  ],
}

const ROOT = decodeURIComponent(new URL('../..', import.meta.url).pathname).slice(0, -1)
const CURAOS = `${ROOT}/curaos`
const EMITTER = `${CURAOS}/tools/codegen/src/ui-app-emit.ts`
const BACKEND_CHART = `${CURAOS}/backend/services/party-service/chart`

const WEB_APPS = ['admin-app', 'workflow-designer', 'front-office', 'fleet-manager', 'business-automation', 'business-donation', 'business-shop', 'business-site', 'business-workflow', 'personal-automation', 'personal-calendar', 'personal-donation', 'personal-notes', 'personal-shop', 'personal-site', 'personal-tasks', 'personal-tracking', 'personal-workflow', 'hosted-login']

const BUILD = { type: 'object', required: ['ok', 'verifyResult', 'summary'], properties: {
  ok: { type: 'boolean' }, filesChanged: { type: 'array', items: { type: 'string' } },
  verifyResult: { type: 'string' }, summary: { type: 'string' }, blockers: { type: 'array', items: { type: 'string' } } } }
const APPRES = { type: 'object', required: ['app', 'ok', 'detail'], properties: {
  app: { type: 'string' }, ok: { type: 'boolean' }, linted: { type: 'boolean' }, templated: { type: 'boolean' }, pushed: { type: 'boolean' }, detail: { type: 'string' }, blockers: { type: 'array', items: { type: 'string' } } } }
const VERDICT = { type: 'object', required: ['target', 'real', 'verdict'], properties: {
  target: { type: 'string' }, real: { type: 'boolean' }, verdict: { type: 'string' }, issues: { type: 'array', items: { type: 'string' } } } }

phase('Chart emitter + ADR')
const emitter = await agent(
  `Close #730 (frontend "fully shipped" gap): extend the gen:ui-app web emitter ${EMITTER} so every generated Next.js web app emits a Helm chart, mirroring the backend service chart mold. Study the backend reference chart ${BACKEND_CHART} (Chart.yaml, values.yaml, templates/{deployment,service,serviceaccount,configmap,_helpers.tpl,NOTES.txt}, .helmignore) + the backend chart emitter ${CURAOS}/tools/codegen/src/charts-all-emit.ts to match the established conventions (labels, helpers, image/tag/digest values, naming).
Emit a chart/ subtree into the web app (add to the emitted file list) tailored to a Next.js standalone web app:
- Chart.yaml (name @curaos/<app> chart, version, appVersion).
- values.yaml: image.repository (the app's GHCR image, mirror backend naming) + tag/digest, replicaCount, resources, a containerPort 3000 (Next standalone default), the runtime env block for the app's public config (NEXT_PUBLIC_API_BASE_URL, NEXT_PUBLIC_OIDC_ISSUER/CLIENT_ID, NEXT_PUBLIC_APP_URL, CURAOS_IDENTITY_SERVICE_URL - and OIDC_CLIENT_SECRET sourced from a Secret ref, NEVER a literal), service.port, ingress/APISIX route host + path, NODE_ENV=production.
- templates/: deployment.yaml (Next standalone container, the env from values, a liveness/readiness probe on / or a health path, the prod NODE_ENV), service.yaml (ClusterIP -> containerPort), an APISIX route OR Ingress template gated by values (mirror how backend services expose via APISIX), configmap.yaml (the non-secret NEXT_PUBLIC_* env), serviceaccount.yaml, _helpers.tpl (reuse the backend naming/label helpers), NOTES.txt. .helmignore.
- The OIDC client secret must come from a referenced K8s Secret (values.oidc.existingSecret), never inlined.
Update the generator test to assert the chart/ subtree is emitted with Chart.yaml + the templates + a values.yaml that sources the secret from a Secret ref (no literal secret). Keep green. NO em/en-dashes.
ALSO write ADR-0218 at ${ROOT}/ai/curaos/docs/adr/0218-frontend-helm-chart-deploy.md: the decision to ship web apps via per-app Helm charts on the same k3d/APISIX/zarf path as backend services (#730); RN apps (Expo) ship via app stores / EAS, NOT Helm (out of scope); the OIDC secret is a Secret ref; link ADR-0216/0217 + [[curaos-orchestration-rule]].
VERIFY (paste real tails, exit 0): \`cd ${CURAOS} && bun test tools/codegen/__tests__/ui-app-emit.test.ts\` green; \`bun run gen:ui-app admin-app\` dry-run lists the chart/ files; emit admin-app's chart to a temp/real dir and run \`helm lint <chart>\` + \`helm template <chart>\` exit 0 (helm v4 is installed). Report ok + filesChanged + verifyResult + summary + blockers. Repo-boundary: tools/codegen + the workspace ADR only (do NOT write app code here; the per-app emit happens in phase 2).`,
  { label: 'chart-emitter', schema: BUILD, model: 'opus' }
)
log(`chart emitter: ${emitter?.ok ? 'BUILT' : 'BLOCKED ' + (emitter?.blockers ?? []).join('; ')}`)

phase('Emit + verify')
let charts = []
if (emitter?.ok) {
  charts = await parallel(WEB_APPS.map((app) => () =>
    agent(
      `Emit + verify the Helm chart for web app "${app}" at ${CURAOS}/frontend/apps/${app} (Next.js, branch main; the gen:ui-app emitter now emits a chart/ subtree). Steps:
1. branch feat/${app}-helm-chart off main (NEVER main).
2. \`cd ${CURAOS} && bun run gen:ui-app ${app} --write\` to emit the chart/ subtree (idempotent for the rest of the app).
3. VERIFY (paste real tails, exit 0): \`helm lint ${CURAOS}/frontend/apps/${app}/chart\` exit 0, AND \`helm template ${app} ${CURAOS}/frontend/apps/${app}/chart\` exit 0 (renders valid k8s manifests). Confirm the rendered Deployment has the Next standalone container + NODE_ENV=production + a probe, the Service targets the container port, and the OIDC secret is a Secret ref (NOT a literal in the rendered output - grep the template output for the literal secret value to prove it is absent).
4. Also confirm the app still builds: \`cd ${CURAOS}/frontend/apps/${app} && bun run typecheck\` exit 0 (the chart is non-code, should not affect it).
5. NO em/en-dashes, no committed secrets. commit + push: \`git add -A && git commit -m "feat(${app}): Helm chart for k3d/APISIX deploy (#730)" && git push -u origin feat/${app}-helm-chart\`.
Report app, ok, linted (helm lint exit 0), templated (helm template exit 0), pushed, detail, blockers. Repo-boundary: this app only.`,
      { label: `chart:${app}`, phase: 'Emit + verify', schema: APPRES, model: 'sonnet' }
    ).then((r) => ({ app, ...r }))
  )).then((r) => r.filter(Boolean))
  log(`charts: ${charts.filter((c) => c.linted && c.templated).length}/${WEB_APPS.length} lint+template clean`)
} else {
  log('emit SKIPPED: chart emitter not built')
}

phase('Grill')
const sample = charts.filter((c) => c.linted).map((c) => c.app).slice(0, 3)
const grills = await parallel([
  () => agent(`Adversarially verify the gen:ui-app Helm chart emitter at ${EMITTER} GENUINELY emits a deployable Next.js web-app chart, not stubs. Generate an app's chart into a temp dir + inspect: real Chart.yaml + values.yaml + templates/{deployment,service,configmap,serviceaccount,_helpers,NOTES}; the Deployment runs the Next standalone container with NODE_ENV=production + a probe + the env wired from values; the OIDC secret is a Secret REF not a literal. Run \`helm lint\` + \`helm template\` on it (exit 0). Default real=false if templates are empty/placeholder, lint/template fails, or a secret is inlined. Report target="chart-emitter", real, verdict, issues.`, { label: 'grill:chart-emitter', phase: 'Grill', schema: VERDICT, model: 'opus' }),
  ...sample.map((app) => () => agent(`Adversarially verify ${CURAOS}/frontend/apps/${app}/chart: re-run \`helm lint\` + \`helm template ${app}\` (exit 0 only). Is the rendered Deployment deploy-correct for a Next standalone app (container port 3000, NODE_ENV=production, probe, env from values/configmap, OIDC secret via Secret ref not literal)? Report target="${app}", real, verdict, issues. Default real=false on lint/template failure or an inlined secret.`, { label: `grill:${app}`, phase: 'Grill', schema: VERDICT, model: 'opus' })),
]).then((r) => r.filter(Boolean))

return {
  emitter: { ok: emitter?.ok, blockers: emitter?.blockers },
  charts: { total: WEB_APPS.length, clean: charts.filter((c) => c.linted && c.templated).map((c) => c.app), failed: charts.filter((c) => !(c.linted && c.templated)).map((c) => ({ app: c.app, blockers: c.blockers })) },
  grills: grills.map((g) => ({ target: g?.target, real: g?.real, verdict: g?.verdict, issues: g?.issues })),
  stillFailing: grills.filter((g) => g && !g.real).map((g) => ({ target: g.target, issues: g.issues })),
}
