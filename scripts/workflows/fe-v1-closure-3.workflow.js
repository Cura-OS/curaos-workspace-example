export const meta = {
  name: 'fe-v1-closure-3',
  description: 'Final bounded v1.0 closure from audit round 3 (D1+D4 already PASS). Generator fold-backs: predev .next clean (G2.1), stop emitting the legacy generic-CRUD scaffold route (G5.1/G5.2), RN per-app accent token (G3.1/G3.2). Per-app: remove the dead generic-CRUD scaffold routes + orphan mock-data from the 14 apps (keeping the rich flagship nav), patient-app i18n seam (G6.1), builder-studio JSDoc char (G3.3), RN accents. Build+test verify + grill.',
  phases: [
    { title: 'Generator fold-backs', detail: 'predev clean + drop scaffold route from web emitter + RN accent into native emitter' },
    { title: 'App cleanup', detail: 'parallel: remove scaffold routes (14 apps), patient-app i18n, RN accents, builder JSDoc' },
    { title: 'Grill', detail: 'verify scaffold routes gone (nav intact, build green), patient-app i18n, RN accents distinct' },
  ],
}

const ROOT = decodeURIComponent(new URL('../..', import.meta.url).pathname).slice(0, -1)
const CURAOS = `${ROOT}/curaos`
const EMITTER = `${CURAOS}/tools/codegen/src/ui-app-emit.ts`
const RN_EMITTER = `${CURAOS}/tools/codegen/src/ui-app-native-emit.ts`
const AUDIT = `${ROOT}/ai/curaos/docs/frontend-v1-dod-audit.md`

const BUILD = { type: 'object', required: ['ok', 'verifyResult', 'summary'], properties: {
  ok: { type: 'boolean' }, gapsClosed: { type: 'array', items: { type: 'string' } }, filesChanged: { type: 'array', items: { type: 'string' } },
  verifyResult: { type: 'string' }, summary: { type: 'string' }, blockers: { type: 'array', items: { type: 'string' } } } }
const APPRES = { type: 'object', required: ['app', 'ok', 'detail'], properties: {
  app: { type: 'string' }, ok: { type: 'boolean' }, built: { type: 'boolean' }, pushed: { type: 'boolean' }, detail: { type: 'string' }, blockers: { type: 'array', items: { type: 'string' } } } }
const VERDICT = { type: 'object', required: ['target', 'real', 'verdict'], properties: {
  target: { type: 'string' }, real: { type: 'boolean' }, verdict: { type: 'string' }, issues: { type: 'array', items: { type: 'string' } } } }

// 14 apps shipping the legacy generic-CRUD scaffold route alongside flagship screens.
const SCAFFOLD_APPS = ['business-automation', 'business-donation', 'business-shop', 'business-site', 'business-workflow', 'personal-automation', 'personal-calendar', 'personal-donation', 'personal-notes', 'personal-shop', 'personal-site', 'personal-tasks', 'personal-tracking', 'personal-workflow']

phase('Generator fold-backs')
const gen = await agent(
  `Three generator fold-backs from the v1 audit (${AUDIT}). Read the emitter ${EMITTER} + RN emitter ${RN_EMITTER} first.
1. G2.1 predev clean: the emitted web app package.json must include a "predev" script that clears the stale .next cache (e.g. "predev": "rm -rf .next") so \`bun run dev\` never serves a corrupt prior build (the audit found all 20 apps 500 on stale .next until cleared). Add to renderPackageJson.
2. G5.1/G5.2 stop emitting the legacy generic-CRUD scaffold: the emitter currently emits a self-named generic list/form/filters route (app/<derived-screen>/<screen>-list.tsx etc.) that duplicates real domain screens once an app has flagship depth, AND a parallel generic mock-data feeding only it. For v1 the flagship/domain screens are the product surface; the generic scaffold is leftover. CHANGE the emitter so it does NOT scaffold a generic-CRUD route for a screen that is just the app's own name placeholder (keep emitting real per-service screens, but the audit's specific complaint is the self-named '<app-name>' scaffold route wired into nav). Concretely: ensure the emitter's nav + routes point at the domain screens, and it does not emit a dead '<app-name>-list/form/filters' + its orphan mock-data. If distinguishing 'real service screen' vs 'placeholder scaffold' is ambiguous, make the scaffold opt-OUT via a flag and default new apps to NOT emit the placeholder route. Document the decision in the emitter.
3. G3.1/G3.2 RN per-app accent: in ${RN_EMITTER}, the emitted src/ui/tokens.ts must include a DISTINCT per-app 'accent' token (derive a per-app hue like the web accentForApp, or at minimum a distinct value per RN app) and the (tabs)/_layout.tsx tabBarActiveTintColor must use tokens.color.accent (not a shared primary). So clinician-app + patient-app get distinct brand hues.
Update the generator tests accordingly; keep green. NO em/en-dashes.
VERIFY (paste real tails, exit 0): \`cd ${CURAOS} && bun test tools/codegen/__tests__/ui-app-emit.test.ts tools/codegen/__tests__/ui-app-native-emit.test.ts\` green; dry-run a web app (shows predev + no placeholder scaffold) + an RN app (shows distinct accent token). Report ok + gapsClosed + verifyResult + summary + blockers. Repo-boundary: tools/codegen only.`,
  { label: 'gen-foldbacks-3', schema: BUILD, model: 'opus' }
)
log(`generator fold-backs: ${gen?.ok ? 'OK' : 'BLOCKED ' + (gen?.blockers ?? []).join('; ')}`)

phase('App cleanup')
// Lane 1: remove the dead scaffold route from each of the 14 apps (parallel).
const scaffoldResults = await parallel(SCAFFOLD_APPS.map((app) => () =>
  agent(
    `Remove the DEAD legacy generic-CRUD scaffold route from "${app}" at ${CURAOS}/frontend/apps/${app} (Next.js, branch main). The audit (G5.1/G5.2) found a self-named generic route app/${app}/ (with ${app}-list.tsx + -form.tsx + -filters.tsx = a generic name/status/createdAt DataTable + create Drawer) shipped ALONGSIDE the app's REAL flagship domain screens, plus a parallel orphan generic mock-data feeding only it.
TASK: (1) Inspect src/surfaces/AppShell.tsx (the nav) + app/ routes. CONFIRM the real flagship domain screens are the intended nav (e.g. business-shop: catalog/orders/analytics/inventory). (2) REMOVE the dead generic scaffold: the app/${app}/ self-named route dir (and any other purely-generic <name>-list/form/filters scaffold route NOT in the flagship nav), any nav item pointing at it, and the orphan generic mock-data.ts entries/hooks that ONLY fed the scaffold (do NOT remove the rich domain mock data the flagship screens use). If the app's root redirect (page.tsx) or AppShell points at the removed scaffold route, repoint it at the app's real primary flagship screen. Be careful: do NOT break the flagship nav or remove real screens.
VERIFY (real tails, exit 0): \`cd ${CURAOS}/frontend/apps/${app} && rm -rf .next && bun run typecheck && bun run build && bun test\` all exit 0; the dead scaffold route is gone; nav still routes to the flagship screens; start dev (mock on) + curl the primary screen -> 200. NO em-dashes. Branch feat/${app}-v1-fix-3 off main, commit + push. Repo-boundary: this app only. If you cannot confidently distinguish dead-scaffold from real-screen, report ok:false with what you found rather than risk removing a real screen.`,
    { label: `scaffold:${app}`, phase: 'App cleanup', schema: APPRES, model: 'opus' }
  ).then((r) => ({ app, ...r }))
)).then((r) => r.filter(Boolean))
log(`scaffold removal: ${scaffoldResults.filter((r) => r.built).length}/${SCAFFOLD_APPS.length}`)

// Lane 2: patient-app i18n + RN accents + builder JSDoc (parallel with the above via a second parallel block would race; run after).
const misc = await parallel([
  () => agent(`Fix patient-app i18n (G6.1) + RN accent (G3.1/G3.2) at ${CURAOS}/frontend/apps/patient-app (Expo RN, branch main). G6.1: it has NO i18n seam (no src/i18n/ dir). PORT clinician-app's src/i18n (index.ts + messages.ts + provider.tsx), wrap app/_layout.tsx in the LocaleProvider, and replace the hardcoded copy ("Loading your health summary", "Book appointment", "Video visit", "Welcome", etc.) with catalog lookups via useMessages. G3.2: ensure patient-app's src/ui/tokens.ts accent is DISTINCT from clinician-app's (give patient a unique hue; both currently share primary #0d9488). VERIFY: bunx tsc --noEmit + bunx expo export --platform web exit 0; src/i18n exists + LocaleProvider mounted + used; accent distinct. NO em-dashes. Branch feat/patient-app-v1-fix-3 off main, commit + push. Repo-boundary: patient-app only.`, { label: 'fix:patient-app', phase: 'App cleanup', schema: APPRES, model: 'opus' }).then((r) => ({ app: 'patient-app', ...r })),
  () => agent(`Fix clinician-app RN accent (G3.1) at ${CURAOS}/frontend/apps/clinician-app (Expo RN, branch main): src/ui/tokens.ts has only primary:#0d9488 and NO accent key, and (tabs)/_layout.tsx uses tokens.color.primary for tabBarActiveTintColor. Add a distinct 'accent' token (a unique hue, different from patient-app) and switch the tab active tint + any brand accent to tokens.color.accent. VERIFY: bunx tsc --noEmit + bunx expo export --platform web exit 0; accent token present + used; distinct from patient-app. NO em-dashes. Branch feat/clinician-app-v1-fix-3 off main, commit + push. Repo-boundary: clinician-app only.`, { label: 'fix:clinician-app', phase: 'App cleanup', schema: APPRES, model: 'opus' }).then((r) => ({ app: 'clinician-app', ...r })),
  () => agent(`Fix builder-studio JSDoc hygiene (G3.3) at ${CURAOS}/frontend/apps/builder-studio: src/components/PatientForm/PatientFormPage.tsx:141 has a Unicode right-arrow (U+2192) in a JSDoc comment - replace with '->'. Scan the whole app for any other U+2192/fancy chars + em/en dashes and fix. VERIFY: rm -rf .next && bun run typecheck && bun run build && bun test exit 0; 0 U+2192 + 0 em/en dashes (perl scan). Branch feat/builder-studio-v1-fix-3 off main, commit + push. Repo-boundary: builder-studio only.`, { label: 'fix:builder-studio', phase: 'App cleanup', schema: APPRES, model: 'sonnet' }).then((r) => ({ app: 'builder-studio', ...r })),
]).then((r) => r.filter(Boolean))
log(`misc fixes: ${misc.filter((r) => r.built).map((r) => r.app).join(', ')}`)

phase('Grill')
const grills = await parallel([
  () => agent(`Adversarially verify the scaffold-route removal across a sample (business-shop, personal-tasks, personal-notes): is the dead generic <app-name>-list/form/filters scaffold route GONE, is the flagship nav still intact (real domain screens reachable), and does each build+test exit 0? Re-run build on 2 of them. Default real=false if a real flagship screen was removed or any nav broke. Report target="scaffold-removal", real, verdict, issues.`, { label: 'grill:scaffold', phase: 'Grill', schema: VERDICT, model: 'opus' }),
  () => agent(`Adversarially verify patient-app + clinician-app: (1) patient-app now has a real src/i18n seam mounted in _layout.tsx + used (not hardcoded copy). (2) Both RN apps have DISTINCT accent tokens (patient != clinician, neither is just shared primary). (3) bunx tsc --noEmit + expo export --platform web exit 0 each. Report target="rn-i18n-accent", real, verdict, issues. Default real=false if i18n seam missing/unused or accents not distinct.`, { label: 'grill:rn', phase: 'Grill', schema: VERDICT, model: 'opus' }),
]).then((r) => r.filter(Boolean))

return {
  generator: { ok: gen?.ok, gapsClosed: gen?.gapsClosed, blockers: gen?.blockers },
  scaffoldRemoval: { built: scaffoldResults.filter((r) => r.built).map((r) => r.app), failed: scaffoldResults.filter((r) => !r.built).map((r) => ({ app: r.app, blockers: r.blockers })) },
  misc: misc.map((r) => ({ app: r.app, ok: r.ok, built: r.built })),
  grills: grills.map((g) => ({ target: g?.target, real: g?.real, verdict: g?.verdict, issues: g?.issues })),
  stillFailing: grills.filter((g) => g && !g.real).map((g) => ({ target: g.target, issues: g.issues })),
}
