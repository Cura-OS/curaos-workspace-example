export const meta = {
  name: 'fe-v1-closure-2',
  description: 'Second v1.0 closure round from the re-audit: builder-studio /patients 500 (rjsf/ajv import.meta -> transpilePackages), standardize JWT signature verification (jose JWKS) across all web apps + generator (was decode-only in 18 apps), tighten builder-studio typecheck, add RN web-export scripts, bump ui-kit pointer for the DataTable icon fix. Build+test verify + grill.',
  phases: [
    { title: 'Generator + auth-sdk', detail: 'fold jose-JWKS session verify into the emitter (+ @curaos/auth-sdk if needed); add RN web export' },
    { title: 'App fixes', detail: 'builder-studio rjsf-500 + typecheck; regen all web apps for jose-verify; bump ui-kit pointer' },
    { title: 'Grill', detail: 'verify /patients renders, all apps jwt-verify, builds green' },
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

const WEB = 'admin-app workflow-designer front-office fleet-manager business-automation business-donation business-shop business-site business-workflow personal-automation personal-calendar personal-donation personal-notes personal-shop personal-site personal-tasks personal-tracking personal-workflow hosted-login'.split(' ')

phase('Generator + auth-sdk')
const gen = await agent(
  `Standardize JWT SIGNATURE VERIFICATION across the generated web apps, folded into the gen:ui-app emitter ${EMITTER}, per the re-audit (${AUDIT}). PROBLEM: only admin-app + hosted-login verify the session JWT signature (jose createRemoteJWKSet + jwtVerify against the IdP JWKS); the other 18 apps use decodeJwtClaims() which base64-decodes the payload + checks exp ONLY, no signature check - so in a live (non-mock) deployment a forged JWT with a future exp would be accepted unless a verifying gateway sits in front. Make ALL apps verify in-process (defense in depth).
1. Read admin-app/src/auth/session.ts (the jose JWKS-verify reference) + the emitter's renderSession. Rewrite renderSession so the EMITTED src/auth/session.ts uses jose createRemoteJWKSet(ISSUER/.well-known/jwks.json) + jwtVerify(token, jwks, {issuer}) to verify the signature, then builds the session from verified claims - replacing the decodeJwtClaims-only path. KEEP the mock-session fallback (mockEnabled + no/invalid token -> seeded platform-admin) so offline render is unaffected, and keep failing closed to invalidSession on verify error. Add jose to the emitted package.json deps.
2. Confirm the emitter still emits ONLY app/login/route.ts (PKCE) and the LocaleProvider-in-layout + wired-list-hook fold-backs from round 1 remain.
3. RN web export (re-audit gap): in ${RN_EMITTER}, add an "export:web" script (\`expo export --platform web --output-dir dist/web\`) to the emitted RN package.json so CI can gate the web bundle (the current export script targets ios only).
Update the generator tests: emitted session.ts imports jose + calls jwtVerify against a JWKS (not decode-only), keeps the mock fallback; RN package.json has an export:web script. Keep green. NO em/en-dashes.
VERIFY (paste real tails, exit 0): \`cd ${CURAOS} && bun test tools/codegen/__tests__/ui-app-emit.test.ts tools/codegen/__tests__/ui-app-native-emit.test.ts\` green; \`bun run gen:ui-app personal-tasks\` dry-run shows a jose-verifying session.ts. Report ok + gapsClosed + verifyResult + summary + blockers. Repo-boundary: tools/codegen only.`,
  { label: 'gen-jwt-verify', schema: BUILD, model: 'opus' }
)
log(`generator jwt-verify: ${gen?.ok ? 'OK' : 'BLOCKED ' + (gen?.blockers ?? []).join('; ')}`)

phase('App fixes')
// builder-studio is the special case (rjsf 500 + typecheck), not a gen:ui-app app.
const builder = await agent(
  `Fix builder-studio's two re-audit gaps. (1) /patients HARD 500: \`@rjsf/validator-ajv8\` (AJV ESM) imported via src/components/PatientForm/PatientFormPage.tsx -> @rjsf/core throws "Cannot use import.meta outside a module" under Next's webpack. FIX: add the rjsf + ajv ESM packages to transpilePackages in next.config.mjs (e.g. @rjsf/core, @rjsf/utils, @rjsf/validator-ajv8, ajv, ajv-formats - whichever the trace needs), or a webpack module rule, so /patients renders. (2) typecheck weakened: package.json typecheck runs \`tsc --noEmit --noImplicitAny false\` (suppresses implicit-any vs peers' plain \`tsc --noEmit\`) - change it to plain \`tsc --noEmit\` and FIX any resulting implicit-any errors. VERIFY (real tails, exit 0): rm -rf .next && bun run typecheck (now strict) && bun run build && bun test exit 0; start dev (NEXT_PUBLIC_USE_MOCK=true), curl /patients -> 200 (NOT 500, no import.meta error in the dev log). NO em-dashes. Branch feat/builder-studio-v1-fix-2 off main, commit + push. Repo-boundary: builder-studio only.`,
  { label: 'fix:builder-studio', schema: BUILD, model: 'opus' }
)
log(`builder-studio: ${builder?.ok ? 'OK' : 'BLOCKED ' + (builder?.blockers ?? []).join('; ')}`)

// Regen the 18 decode-only web apps for jose-verify (admin-app + hosted-login already verify).
let regen = []
if (gen?.ok) {
  const REGEN = WEB.filter((a) => a !== 'admin-app' && a !== 'hosted-login')
  // rebuild ui-kit first so the DataTable icon fix + any exports propagate
  await agent(`Rebuild @curaos/ui so consumers get the DataTable Phosphor-icon fix: \`cd ${CURAOS}/frontend/packages/ui-kit && bun run build\` exit 0, then \`cd ${CURAOS} && bun install\`. Report ok + verifyResult.`, { label: 'rebuild-uikit', phase: 'App fixes', schema: BUILD, model: 'sonnet' })
  regen = await parallel(REGEN.map((app) => () =>
    agent(
      `Regenerate "${app}" so its src/auth/session.ts uses the new jose JWKS signature-verification (the emitter was updated). Dir ${CURAOS}/frontend/apps/${app} (Next.js, branch main). Steps: (1) branch feat/${app}-jwt-verify off main (NEVER main). (2) \`rm -f src/auth/session.ts\` then \`cd ${CURAOS} && bun run gen:ui-app ${app} --write\` to re-emit the jose-verifying session (+ jose dep). (3) \`bun install\` from ${CURAOS}. (4) VERIFY (real tails, exit 0): \`cd ${CURAOS}/frontend/apps/${app} && rm -rf .next && bun run typecheck && bun run build && bun test\` all exit 0; session.ts imports jose + calls jwtVerify; mock fallback still seeds a session offline (start dev mock-on, curl a screen -> 200, no live-IdP bounce). NO em-dashes. (5) commit + push: \`git add -A && git commit -m "fix(${app}): verify JWT signature via jose JWKS (defense in depth)" && git push -u origin feat/${app}-jwt-verify\`. Report app, ok, built, pushed, detail, blockers. Repo-boundary: this app only.`,
      { label: `regen:${app}`, phase: 'App fixes', schema: APPRES, model: 'sonnet' }
    ).then((r) => ({ app, ...r }))
  )).then((r) => r.filter(Boolean))
  log(`jwt-verify regen: ${regen.filter((r) => r.built).length}/${REGEN.length} built`)
}

phase('Grill')
const grills = await parallel([
  () => agent(`Adversarially verify builder-studio at ${CURAOS}/frontend/apps/builder-studio: /patients now renders (start dev mock-on, curl /patients -> 200, NO import.meta 500 in the dev log), typecheck is strict (plain tsc --noEmit, no --noImplicitAny false) and exit 0, build + test exit 0, 0 em-dashes. Report target="builder-studio", real, verdict, issues.`, { label: 'grill:builder-studio', phase: 'Grill', schema: VERDICT, model: 'opus' }),
  () => agent(`Adversarially verify JWT signature verification is now standard: sample 5 of the regenerated apps (business-shop, front-office, personal-tasks, fleet-manager, workflow-designer) - does each src/auth/session.ts import jose + call jwtVerify against a JWKS (NOT decodeJwtClaims-only)? Does the mock fallback still work (build + a mock-on render)? Re-run build+test on 2 of them (exit 0). Report target="jwt-verify", real, verdict, issues. Default real=false if any sampled app is still decode-only or a build fails.`, { label: 'grill:jwt-verify', phase: 'Grill', schema: VERDICT, model: 'opus' }),
]).then((r) => r.filter(Boolean))

return {
  generator: { ok: gen?.ok, gapsClosed: gen?.gapsClosed, blockers: gen?.blockers },
  builderStudio: { ok: builder?.ok, blockers: builder?.blockers },
  jwtRegen: { built: regen.filter((r) => r.built).map((r) => r.app), failed: regen.filter((r) => !r.built).map((r) => ({ app: r.app, blockers: r.blockers })) },
  grills: grills.map((g) => ({ target: g?.target, real: g?.real, verdict: g?.verdict, issues: g?.issues })),
  stillFailing: grills.filter((g) => g && !g.real).map((g) => ({ target: g.target, issues: g.issues })),
}
