export const meta = {
  name: 'fe-pkce-tests-palette',
  description: 'Three generator hardening changes folded into gen:ui-app + gen:ui-app-native, then regen all apps + verify: (1) real PKCE in the OIDC sign-in flow (#732) - code_verifier/S256 challenge/state, (2) per-app smoke/render tests emitted per app (apps have 0 tests today), (3) wider per-app accent spread (apps currently cluster in similar hues). Build-verify + grill.',
  phases: [
    { title: 'Generator changes', detail: 'fold PKCE + test emission + wider accent spread into the emitters' },
    { title: 'Regen + verify', detail: 'regen all 22 apps, build + run emitted tests, commit + push per app (parallel)' },
    { title: 'Grill', detail: 'adversarially verify PKCE real + tests run + accents distinct' },
  ],
}

const ROOT = decodeURIComponent(new URL('../..', import.meta.url).pathname).slice(0, -1)
const CURAOS = `${ROOT}/curaos`
const WEB_EMITTER = `${CURAOS}/tools/codegen/src/ui-app-emit.ts`
const RN_EMITTER = `${CURAOS}/tools/codegen/src/ui-app-native-emit.ts`

const WEB_APPS = [
  'admin-app', 'workflow-designer', 'front-office', 'fleet-manager',
  'business-automation', 'business-donation', 'business-shop', 'business-site', 'business-workflow',
  'personal-automation', 'personal-calendar', 'personal-donation', 'personal-notes',
  'personal-shop', 'personal-site', 'personal-tasks', 'personal-tracking', 'personal-workflow',
  'hosted-login',
]
const RN_APPS = ['clinician-app', 'patient-app']

const BUILD = { type: 'object', required: ['ok', 'verifyResult', 'summary'], properties: {
  ok: { type: 'boolean' }, filesChanged: { type: 'array', items: { type: 'string' } },
  verifyResult: { type: 'string' }, summary: { type: 'string' }, blockers: { type: 'array', items: { type: 'string' } } } }
const APPRES = { type: 'object', required: ['app', 'ok', 'detail'], properties: {
  app: { type: 'string' }, ok: { type: 'boolean' }, built: { type: 'boolean' }, tested: { type: 'boolean' },
  pushed: { type: 'boolean' }, detail: { type: 'string' }, blockers: { type: 'array', items: { type: 'string' } } } }
const VERDICT = { type: 'object', required: ['target', 'real', 'verdict'], properties: {
  target: { type: 'string' }, real: { type: 'boolean' }, verdict: { type: 'string' }, issues: { type: 'array', items: { type: 'string' } } } }

phase('Generator changes')
// Three independent generator edits. PKCE + accent touch the WEB emitter; tests
// touch BOTH emitters. Run as parallel single-writers on distinct concerns, but
// PKCE + accent + web-tests all edit ui-app-emit.ts, so SERIALIZE the web-emitter
// edits in one agent; the RN-test edit is a separate file.
const webChanges = await agent(
  `Make THREE changes to the web app generator emitter ${WEB_EMITTER} (read it fully first; it is on branch feat/fe-v1-hardening off main). All fold into the templates so every generated app inherits them (generator-evolution).

1. REAL PKCE in the OIDC sign-in flow (#732). Today renderLoginPage is a bare server-component redirect with no PKCE and renderCallbackRoute exchanges the code with only client_secret_post. Implement Authorization Code + PKCE S256:
   - Add a new emitted file src/auth/pkce.ts: exports PKCE_VERIFIER_COOKIE + OIDC_STATE_COOKIE constants, async createPkcePair() -> { verifier, challenge } (verifier = base64url of 32 random bytes via crypto.getRandomValues; challenge = base64url(SHA-256(verifier)) via crypto.subtle.digest), and randomState() (base64url random). Pure Web Crypto (works in the Next runtime).
   - Rewrite renderLoginPage as a ROUTE HANDLER app/login/route.ts (export GET) that mints the verifier+challenge+state, sets PKCE_VERIFIER_COOKIE + OIDC_STATE_COOKIE as short-lived httpOnly+lax cookies (maxAge ~600, secure in prod), and redirects to ISSUER/authorize with client_id, redirect_uri, response_type=code, scope, code_challenge, code_challenge_method=S256, state. (Change the emitted file path from app/login/page.tsx to app/login/route.ts in the file list.)
   - Update renderCallbackRoute: read the verifier + state cookies, reject if the returned state != stored state, send code_verifier in the token-exchange body, and CLEAR the PKCE cookies on the response. Keep the existing client_secret_post + httpOnly id_token cookie + redirect-to-/ behavior.
   - Keep the mock-first / mock-session path intact (PKCE only matters on a real IdP round-trip).
2. EMIT PER-APP TESTS. Add a renderTests step emitting test files under test/ (or __tests__/) for each app, using bun:test + @testing-library/react (add the dev deps to the generated package.json): at minimum (a) a smoke test that the emitted accent token + mock-data seed are well-formed, (b) a render test that the list screen renders rows from the mock-data layer (mock on) without throwing, (c) a session test that resolveSession returns a mock session when mockEnabled + no token. Wire a \`"test": "bun test"\` script (it likely exists). Make the emitted tests actually PASS for a freshly generated app.
3. WIDER ACCENT SPREAD. The current accentForApp concentrates same-domain apps into a narrow hue band (many apps came out near-identical purple). Widen it: spread the 22 apps across the FULL hue wheel (e.g. golden-angle / index-based hue distribution, or a wider per-domain band) so adjacent apps are visibly distinct, while keeping a fixed pleasing S/L ramp + WCAG-reasonable contrast. Verify by listing the resulting --accent for all 22 apps and confirming good visual separation (no two within ~15 degrees).

Update tools/codegen/__tests__/ui-app-emit.test.ts: assert pkce.ts emitted (createPkcePair/code_challenge), login is a route handler with code_challenge_method=S256, callback sends code_verifier + validates state, per-app test files emitted, and the wider accent spread (sample several apps -> hues spread > some threshold). Keep green. NO em/en-dashes.
VERIFY (paste real tails, exit 0): \`cd ${CURAOS} && bun test tools/codegen/__tests__/ui-app-emit.test.ts\` green; \`bun run gen:ui-app admin-app\` dry-run shows app/login/route.ts + src/auth/pkce.ts + test files + an accent; print the --accent for 6 varied apps to show spread. Report ok + filesChanged + verifyResult + summary + blockers.`,
  { label: 'web-emitter-changes', schema: BUILD, model: 'opus' }
)
log(`web emitter: ${webChanges?.ok ? 'OK' : 'BLOCKED ' + (webChanges?.blockers ?? []).join('; ')}`)

const rnTests = await agent(
  `Add per-app TEST emission to the React Native app generator emitter ${RN_EMITTER} (read it + how the web emitter emits tests if that landed). Emit bun:test test files for each RN app: (a) mock-data seed well-formed, (b) the hooks/mock layer resolves a list offline, (c) session mock-fallback. Add the test dev deps + a test script to the generated package.json. Update tools/codegen/__tests__/ui-app-native-emit.test.ts to assert the test files are emitted. Keep it green. NO em/en-dashes. VERIFY: \`cd ${CURAOS} && bun test tools/codegen/__tests__/ui-app-native-emit.test.ts\` green + \`bun run gen:ui-app-native clinician-app\` dry-run lists the test files. Report ok + filesChanged + verifyResult + summary + blockers.`,
  { label: 'rn-emitter-tests', schema: BUILD, model: 'opus' }
)
log(`rn emitter tests: ${rnTests?.ok ? 'OK' : 'BLOCKED ' + (rnTests?.blockers ?? []).join('; ')}`)

phase('Regen + verify')
let regen = []
if (webChanges?.ok) {
  regen = await parallel([
    ...WEB_APPS.map((app) => ({ app, rn: false })),
    ...(rnTests?.ok ? RN_APPS.map((app) => ({ app, rn: true })) : []),
  ].map(({ app, rn }) => () =>
    agent(
      `Regenerate "${app}" from the updated ${rn ? 'gen:ui-app-native' : 'gen:ui-app'} (PKCE${rn ? '' : ' login route + callback'}, per-app tests${rn ? '' : ', wider accent'}) and verify, then commit. Dir ${CURAOS}/frontend/apps/${app} (submodule on branch main). Steps:
1. Branch: \`git checkout -b feat/${app}-v1-hardening main\` (or check it out). NEVER commit to main directly.
2. Delete the files the changes re-emit so idempotent --write regenerates them: ${rn ? '`rm -f src/api/mock-data.ts test/* __tests__/* 2>/dev/null`' : '`rm -f app/login/page.tsx app/login/route.ts app/api/auth/callback/route.ts app/globals.css test/* __tests__/* src/auth/pkce.ts 2>/dev/null`'}. (Keep working auth/session/api files except the ones listed.)
3. \`cd ${CURAOS} && bun run ${rn ? 'gen:ui-app-native' : 'gen:ui-app'} ${app} --write\`; \`bun install\` from ${CURAOS}.
4. VERIFY (real tails, exit 0): ${rn ? '`cd ' + CURAOS + '/frontend/apps/' + app + ' && bunx tsc --noEmit`' : '`cd ' + CURAOS + '/frontend/apps/' + app + ' && rm -rf .next && bun run typecheck && bun run build`'} exit 0, AND \`bun test\` (the emitted tests) exit 0. ${rn ? '' : 'Sanity: app/login/route.ts has code_challenge_method=S256; callback sends code_verifier.'}
5. NO em/en-dashes. COMMIT + PUSH on the feat branch (no secrets/artifacts): \`git add -A && git commit -m "feat(${app}): v1 hardening - real PKCE + emitted tests${rn ? '' : ' + distinct accent'}" && git push -u origin feat/${app}-v1-hardening\`.
Report app, ok, built, tested (bun test exit 0), pushed, detail, blockers. Repo-boundary: this app only.`,
      { label: `regen:${app}`, phase: 'Regen + verify', schema: APPRES, model: 'sonnet' }
    ).then((r) => ({ app, ...r }))
  )).then((r) => r.filter(Boolean))
  const built = regen.filter((r) => r.built).length
  const tested = regen.filter((r) => r.tested).length
  log(`regen: ${built} built, ${tested} with passing tests`)
} else {
  log('regen SKIPPED: web emitter changes not ok')
}

phase('Grill')
const sample = regen.filter((r) => r.built).map((r) => r.app).slice(0, 3)
const grills = await parallel([
  () => agent(
    `Adversarially verify the PKCE implementation in ${WEB_EMITTER} is REAL, not cosmetic. Generate an app into a temp dir + inspect: does src/auth/pkce.ts actually compute an S256 challenge (crypto.subtle.digest SHA-256 + base64url), does app/login/route.ts set the verifier cookie + send code_challenge + code_challenge_method=S256 + state, does the callback READ the verifier cookie + send code_verifier in the token body + validate state + clear the cookies? A fake (challenge==verifier, or no digest, or callback ignores the cookie) = real:false. Run the temp app tsc -> 0. Report target="pkce", real, verdict, issues.`,
    { label: 'grill:pkce', phase: 'Grill', schema: VERDICT, model: 'opus' }
  ),
  () => agent(
    `Adversarially verify per-app tests are REAL + the accent spread widened. (1) Generate 6 different apps into temp dirs, extract each --accent hue, confirm they are well-spread across the hue wheel (not clustered within ~15deg). (2) For one generated app, actually RUN \`bun test\` in it - do the emitted tests EXECUTE and PASS (not empty/skipped)? A test file with no real assertions, or that does not run, = real:false. Report target="tests-accent", real, verdict, issues.`,
    { label: 'grill:tests-accent', phase: 'Grill', schema: VERDICT, model: 'opus' }
  ),
  ...sample.map((app) => () =>
    agent(
      `Adversarially verify ${CURAOS}/frontend/apps/${app}: re-run typecheck + build + \`bun test\` (exit 0 only). Is PKCE present (app/login/route.ts code_challenge_method=S256 + callback code_verifier) and do the emitted tests actually pass? NO em/en-dashes. Report target="${app}", real, verdict, issues. Default real=false on any failure.`,
      { label: `grill:${app}`, phase: 'Grill', schema: VERDICT, model: 'opus' }
    )
  ),
]).then((r) => r.filter(Boolean))

return {
  webChanges: { ok: webChanges?.ok, blockers: webChanges?.blockers },
  rnTests: { ok: rnTests?.ok, blockers: rnTests?.blockers },
  regen: { total: WEB_APPS.length + RN_APPS.length, built: regen.filter((r) => r.built).map((r) => r.app), tested: regen.filter((r) => r.tested).map((r) => r.app), failed: regen.filter((r) => !r.built).map((r) => ({ app: r.app, blockers: r.blockers })) },
  grills: grills.map((g) => ({ target: g?.target, real: g?.real, verdict: g?.verdict, issues: g?.issues })),
  needsAttention: grills.filter((g) => g && !g.real).map((g) => ({ target: g.target, issues: g.issues })),
}
