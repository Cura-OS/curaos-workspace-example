export const meta = {
  name: 'fe-v1-closure',
  description: 'Close every buildable v1.0 frontend gap from the DoD audit (G1-G37 minus infra I1-I5). Generator-first fold-backs (PKCE, list-hook, LocaleProvider, env-coercion into the codegen) + per-app lanes (builder-studio auth+shell rehab, hosted-login auth+i18n+500 fix, admin-app stubs+detail, glyph/em-dash/seed cleanup, i18n seam standardization). Each lane build+test verifies; then re-grill against the DoD.',
  phases: [
    { title: 'Generator fold-backs', detail: 'fold PKCE + wired-list-hook + LocaleProvider + env-coercion into the app codegen (single-writer on emitter)' },
    { title: 'App fixes', detail: 'parallel per-app lanes: builder-studio, hosted-login, admin-app, cleanup sweep, i18n' },
    { title: 'Re-grill', detail: 'adversarially re-verify each fixed app against the DoD dimension it failed' },
  ],
}

const ROOT = decodeURIComponent(new URL('../..', import.meta.url).pathname).slice(0, -1)
const CURAOS = `${ROOT}/curaos`
const EMITTER = `${CURAOS}/tools/codegen/src/ui-app-emit.ts`
const AUDIT = `${ROOT}/ai/curaos/docs/frontend-v1-dod-audit.md`

const BUILD = { type: 'object', required: ['ok', 'verifyResult', 'summary'], properties: {
  ok: { type: 'boolean' }, gapsClosed: { type: 'array', items: { type: 'string' } }, filesChanged: { type: 'array', items: { type: 'string' } },
  verifyResult: { type: 'string' }, summary: { type: 'string' }, blockers: { type: 'array', items: { type: 'string' } } } }
const VERDICT = { type: 'object', required: ['target', 'real', 'verdict'], properties: {
  target: { type: 'string' }, real: { type: 'boolean' }, verdict: { type: 'string' }, issues: { type: 'array', items: { type: 'string' } } } }

// ── Phase 1: generator fold-backs (single agent owns the web emitter) ──
phase('Generator fold-backs')
const gen = await agent(
  `Fold the recurrence-preventing fixes from the v1 DoD audit (${AUDIT}, gaps G29/G30/G31 + G13) into the gen:ui-app web emitter ${EMITTER} so no generated app can regress. Read the audit + the emitter first.
1. G29/PKCE single-source: ensure the emitter is the ONE source of the login route + callback + pkce.ts + session (it already emits app/login/route.ts with PKCE; CONFIRM it does NOT also emit app/login/page.tsx - if a page.tsx template still exists, REMOVE it so the two-parallel-routes-at-/login build break (G1/G2) cannot be generated). The emitter must emit ONLY app/login/route.ts for the login entry.
2. G30/wired-list-hook: the list-screen template must NEVER emit an empty 'const rows = []' + 'TODO (wire data)' stub. Every emitted *-list screen must be wired to a real mock-backed list hook (useQuery -> adminRequest -> mock-data). If a screen has no backing service, do not scaffold a dead list for it.
3. G31/LocaleProvider: the emitted app/layout.tsx MUST mount <LocaleProvider> (wrapping children, alongside ThemeProvider + Providers) so no generated app can 500 with 'useI18n must be used within a LocaleProvider'.
4. G13/env coercion: emitted next.config.mjs must coerce an empty-string NEXT_PUBLIC_API_BASE_URL (and other URL envs) to undefined before new URL(), so an empty env var does not crash config load.
Update the generator tests to assert: only app/login/route.ts (no page.tsx) for login, list screens emit a wired hook (no TODO-stub), layout mounts LocaleProvider, next.config coerces empty env. Keep green. NO em/en-dashes.
VERIFY (paste real tails, exit 0): \`cd ${CURAOS} && bun test tools/codegen/__tests__/ui-app-emit.test.ts\` green; \`bun run gen:ui-app admin-app\` dry-run shows app/login/route.ts (NOT page.tsx) + LocaleProvider in layout + a wired identity/workflow list. Report ok + gapsClosed + verifyResult + summary + blockers. Repo-boundary: code only under tools/codegen.`,
  { label: 'gen-foldbacks', schema: BUILD, model: 'opus' }
)
log(`generator fold-backs: ${gen?.ok ? 'OK ' + (gen.gapsClosed || []).join(',') : 'BLOCKED ' + (gen?.blockers ?? []).join('; ')}`)

// ── Phase 2: parallel per-app lanes ──
phase('App fixes')
const lanes = [
  { app: 'admin-app', branch: 'feat/admin-app-v1-fix', gaps: 'G1 G9 G14 G15 G16', prompt: `Fix admin-app v1 gaps: G1 (delete app/login/page.tsx - the parallel-route conflict with app/login/route.ts that breaks next build; keep route.ts), G9 (detail routes /audit/[id] + /tenancy/[id] hang on infinite Loading - fix mock-data.ts mockResponse so the detail-by-id record matches the detail component's expected shape; add a test that the detail query settles in mock mode), G14 (app/identity/identity-list.tsx is an empty 'const rows=[]'+TODO stub at /identity in primary nav - wire it to a real useIdentityList hook over the mock plane, like the working tenancy list; seed identities in mock-data), G15 (app/workflow/workflow-list.tsx same empty stub at /workflow - wire to a mock-backed useWorkflowList), G16 (app/audit/audit-list.tsx is a dead orphan scaffold - /audit renders audit-log.tsx instead - delete the dead file). After fixing, regen is NOT required; hand-fix. VERIFY: rm -rf .next && bun run typecheck && bun run build && bun test all exit 0; the detail + identity + workflow screens render seeded content offline (start dev, curl 200 + grep the seeded names in HTML). NO em-dashes.` },
  { app: 'builder-studio', branch: 'feat/builder-studio-v1-fix', gaps: 'G3 G4 G5 G18 G22 G23', prompt: `Rehab builder-studio to the fleet pattern. G3+G4+G5 (auth): replace app/api/auth/callback/route.ts (currently accepts raw ?jwt= -> security vuln) with the OIDC code-exchange + PKCE callback used by the other apps (validate state, require verifier, exchange code, set httpOnly cookie); add app/login/route.ts + src/auth/pkce.ts (mint verifier/challenge/state); rewrite src/auth/session.ts to decode claims directly (decodeJwtClaims + exp check + mock-session fallback when mockEnabled) - it currently calls a NONEXISTENT @curaos/auth-sdk.validateJwt masked by a FALSE ambient shim src/types/curaos-auth-sdk.d.ts which you MUST DELETE. Model these on admin-app's working versions. G18 (sidebar): migrate src/surfaces/SurfaceShell.tsx from the hand-rolled text-only <Link> aside to the @curaos/ui Sidebar/NavSection/NavItem shell with <Icon name=...> per item + the standard --accent ramp. G22+G23 (em-dash): replace every U+2014/U+2013 in PatientFormPage.tsx (h2 + error banner), app/patients/page.tsx, src/api/patient-contract-client.ts, test files with ' - '/ASCII. VERIFY: rm -rf .next && bun run typecheck && bun run build && bun test exit 0; sidebar renders ui-kit Phosphor icons; 0 em/en-dashes (perl U+2014/2013 scan clean); login is PKCE; session has mock fallback (no live-IdP bounce offline).` },
  { app: 'hosted-login', branch: 'feat/hosted-login-v1-fix', gaps: 'G6 G7 G8', prompt: `Fix hosted-login v1 gaps. G8 (CRITICAL 500): app/layout.tsx never mounts <LocaleProvider> so /home + /home/[id] crash with 'useI18n must be used within a LocaleProvider' - mount LocaleProvider in the layout (wrapping children, alongside the existing ThemeProvider + Providers), matching the other apps. G6 (split-brain auth): the wired unauthenticated entry (page.tsx -> /sign-in -> card -> /sign-in/start -> buildAuthorizeUrl in src/auth/oidc.ts) emits NO code_challenge/state/verifier, so the PKCE-enforcing /api/auth/callback dead-ends it - re-point the sign-in card + the unauthenticated redirect at the hardened /login PKCE route, and delete/rewrite src/auth/oidc.ts buildAuthorizeUrl + app/sign-in/start/route.ts so there is ONE PKCE entry. G7 (false comments): fix the 'Authorization Code + PKCE' comments in app/sign-in/page.tsx + start route that are no longer accurate. VERIFY: rm -rf .next && bun run typecheck && bun run build && bun test exit 0; start dev (NEXT_PUBLIC_USE_MOCK=true), curl /home + /account/* -> 200 (NO 500, NO LocaleProvider error in the dev log); sign-in routes through the single PKCE /login. NO em-dashes.` },
  { app: 'clinician-app', branch: 'feat/clinician-app-v1-fix', gaps: 'G17 G24 G28', rn: true, prompt: `Fix clinician-app (Expo RN) v1 gaps. G17: remove the 4 byte-identical dead generic CRUD shell screens healthstack-{scheduling,orders,clinical-docs,messaging} (84 LOC each, href:null, not linked - they duplicate the real bespoke board/orders-review/SOAP screens). Delete them + any dead route refs. G24 (i18n): the app has ~175 hardcoded EN strings + no i18n seam - add a minimal RN i18n seam (a messages map + a useMessages hook + a LocaleProvider-equivalent) and route the visible screen titles/labels through it (does not need full RTL, but establish the seam + use it for the primary nav + screen headers). G28 (a11y): add accessibilityLabel/accessibilityRole to the tab bar + primary interactive elements (currently only ~5 vs patient-app's 22). VERIFY: bunx tsc --noEmit + bunx expo export --platform web exit 0; 0 dead CRUD shells remain; i18n seam present + used; NO em-dashes/glyph-icons.` },
  { app: 'sweep', branch: null, gaps: 'G19 G20 G21 G12', prompt: `Cleanup sweep across 3 apps (each its own submodule - branch + commit + push each separately). G19: business-shop/src/ui/shop-widgets.tsx:141 uses '✓' (U+2713) glyph as a stepper indicator - replace with <Icon name="check" /> from @curaos/ui. G20: personal-automation/app/builder/builder-editor.tsx:178 uses '✓' as a done-step icon - replace with <Icon name="check" />. G21: personal-shop/src/api/shop-seed.ts uses emoji/glyph (U+2615/U+2709 + 8 U+1F000 emoji) as product thumbnail values rendered as images - replace with a Phosphor placeholder icon name or a real image ref. G12: fleet-manager mock-data seeds generic 'Fleet 1/2/3/4/5' rows - reseed with realistic fleet/vehicle/trip domain data (vehicle names, plates, drivers, routes, statuses). For EACH of the 4 apps (business-shop, personal-automation, personal-shop, fleet-manager): branch feat/<app>-v1-fix off main, fix, VERIFY rm -rf .next && bun run typecheck && bun run build && bun test exit 0, NO em/en-dashes, commit + push. Report per-app status in the summary.` },
]
const laneResults = await parallel(lanes.map((l) => () =>
  agent(
    `${l.prompt}\n\nRepo-boundary: code ONLY under the named app submodule(s). ${l.app === 'sweep' ? 'Each of the 4 apps gets its own branch/commit/push.' : `Work on ${CURAOS}/frontend/apps/${l.app}, branch ${l.branch} off main (NEVER commit to main). Commit + push: git add -A (no secrets/.next/node_modules), git commit -m "fix(${l.app}): close v1 DoD gaps ${l.gaps}", git push -u origin ${l.branch}.`} Report ok, gapsClosed (the G-numbers you actually fixed + verified), verifyResult (real build/test tails), summary, blockers. Do NOT touch the parent or other apps.`,
    { label: `fix:${l.app}`, phase: 'App fixes', schema: BUILD, model: 'opus' }
  ).then((r) => ({ lane: l.app, ...r }))
)).then((r) => r.filter(Boolean))
log(`app fixes: ${laneResults.filter((r) => r.ok).map((r) => r.lane).join(', ')}`)

// ── Phase 3: re-grill the fixed apps ──
phase('Re-grill')
const grillTargets = ['admin-app', 'builder-studio', 'hosted-login', 'clinician-app']
const grills = await parallel(grillTargets.map((app) => () =>
  agent(
    `Adversarially re-verify "${app}" at ${CURAOS}/frontend/apps/${app} against the v1 DoD gaps it failed (see ${AUDIT}). Re-run its real build + test (web: rm -rf .next && typecheck && build && test exit 0; RN: tsc + expo export exit 0). Then confirm the SPECIFIC gaps are closed: ${app === 'admin-app' ? 'no app/login/page.tsx (build passes), /identity + /workflow render seeded rows (not empty TODO), /audit/[id] + /tenancy/[id] settle (no infinite loader)' : app === 'builder-studio' ? 'callback does OIDC code-exchange (no raw ?jwt), session decodes claims (no validateJwt, false .d.ts deleted), login is PKCE, sidebar uses ui-kit+Phosphor, 0 em-dashes' : app === 'hosted-login' ? 'layout mounts LocaleProvider (/home 200 not 500), single PKCE sign-in entry' : 'no dead CRUD shells, i18n seam present+used, a11y labels added'}. Start dev with mock on + curl the relevant screens where applicable. Default real=false if the build fails or any named gap remains. Report target="${app}", real, verdict, issues.`,
    { label: `regrill:${app}`, phase: 'Re-grill', schema: VERDICT, model: 'opus' }
  )
)).then((r) => r.filter(Boolean))

return {
  generator: { ok: gen?.ok, gapsClosed: gen?.gapsClosed, blockers: gen?.blockers },
  lanes: laneResults.map((r) => ({ lane: r.lane, ok: r.ok, gapsClosed: r.gapsClosed, blockers: r.blockers })),
  grills: grills.map((g) => ({ target: g?.target, real: g?.real, verdict: g?.verdict, issues: g?.issues })),
  stillFailing: grills.filter((g) => g && !g.real).map((g) => ({ target: g.target, issues: g.issues })),
}
