export const meta = {
  name: 'fe-fanout-web-apps',
  description: 'Close the gen:ui-app mock-layer gap (emit a generic schema-seeded mock-data + mock-session bypass so EVERY generated app renders backend-free), then fan out the 16 empty Next.js web apps through the deepened generator, build-verify each, and adversarially grill. RN apps (clinician/patient) and hand-built apps (builder-studio, admin-app, hosted-login) are out of scope.',
  phases: [
    { title: 'Mock gap', detail: 'emitter emits generic mock-data + mock-session; regen admin-app to confirm parity' },
    { title: 'Fan out', detail: 'gen:ui-app --write + build-verify each of 16 web apps (parallel, mock-on render check)' },
    { title: 'Grill', detail: 'adversarially verify the mock seam + a sample of fanned apps build + render offline' },
  ],
}

const ROOT = decodeURIComponent(new URL('../..', import.meta.url).pathname).slice(0, -1)
const CURAOS = `${ROOT}/curaos`
const EMITTER = `${CURAOS}/tools/codegen/src/ui-app-emit.ts`

// 16 empty Next.js web apps to fan out (admin-app done; builder-studio +
// hosted-login hand-built; clinician-app + patient-app are React Native).
const WEB_APPS = [
  'workflow-designer', 'front-office', 'fleet-manager',
  'business-automation', 'business-donation', 'business-shop', 'business-site', 'business-workflow',
  'personal-automation', 'personal-calendar', 'personal-donation', 'personal-notes',
  'personal-shop', 'personal-site', 'personal-tasks', 'personal-tracking', 'personal-workflow',
]

const BUILD = {
  type: 'object',
  required: ['ok', 'verifyResult', 'summary'],
  properties: {
    ok: { type: 'boolean' },
    filesChanged: { type: 'array', items: { type: 'string' } },
    verifyResult: { type: 'string' },
    summary: { type: 'string' },
    blockers: { type: 'array', items: { type: 'string' } },
  },
}
const VERDICT = {
  type: 'object',
  required: ['target', 'real', 'verdict'],
  properties: {
    target: { type: 'string' },
    real: { type: 'boolean' },
    verdict: { type: 'string' },
    issues: { type: 'array', items: { type: 'string' } },
  },
}

// ─────────────────────────────────────────────────────────────────────
// Phase 1 - Close the mock-layer gap IN THE GENERATOR (single-writer on the
// emitter). admin-app proved the pattern by hand: a src/api/mock-data.ts GET
// layer + a mockEnabled()/mockSession() bypass make the app render with NO live
// backend. The generator emits 0 mock infrastructure today, so every fanned app
// would hang on "Loading…". Fold the pattern into the emitter (generator-
// evolution rule) so EVERY generated app renders offline.
// ─────────────────────────────────────────────────────────────────────
phase('Mock gap')
const mockGap = await agent(
  `Close the mock-layer gap in the gen:ui-app emitter ${EMITTER} (read it fully first; ~2184 lines). PROBLEM: the emitter emits src/api/admin-fetch.ts + src/auth/session.ts but ZERO mock infrastructure, so a freshly generated app (with no live backend) hangs forever on "Loading…". The hand-built admin-app solved this with two pieces you must now GENERALIZE into the emitter templates:
1. A GENERIC src/api/mock-data.ts: exports mockEnabled() (true when process.env.NEXT_PUBLIC_USE_MOCK==='true', or when no NEXT_PUBLIC_API_BASE_URL is set) and mockResponse(path, query). Because the generator knows each screen's service slug + route + the per-entity zod schema (renderSchema), EMIT a mock-data.ts that, for each screen, seeds a deterministic handful of rows (5-8) shaped to that screen's schema/entity (id + a name/title + createdAt + a status enum + the screen's own fields), and resolves:
   - GET <list path> (e.g. /<service-rest-prefix>/<resource>) -> { items, total, page, pageSize } with q/search filtering + page/pageSize paging (mirror admin-app's page() helper).
   - GET <detail path> ending in /<id> -> the seeded row by id.
   Use a FIXED epoch constant (no Date.now()/new Date() without args at module scope flake; admin-app uses a fixed \`now\`). structuredClone/JSON round-trip the seed so callers can't mutate it. Derive the path prefixes the SAME way admin-hooks does (look at renderAdminHooks to see exactly which paths the generated hooks request, and make mockResponse match those path shapes for every screen, not just hardcoded admin ones).
2. Wire the bypass into the EMITTED files:
   - renderAdminFetch: at the top of the request primitive, when method is GET and mockEnabled(), return mockResponse(path, query) if defined (import { mockEnabled, mockResponse } from './mock-data'). Keep admin-app's 8s AbortController timeout + network-error->status-0 behaviour.
   - renderSession: when there is no token cookie, return a seeded platform-admin mockSession() if mockEnabled() else invalidSession() (import mockEnabled from the api mock-data; mockSession seeds userId/displayName/roles:['platform-admin']/source:'jwt' so role-gated create/edit/delete controls render). A real token still verifies via jose normally.
   - Add { relPath: 'src/api/mock-data.ts', contents: renderMockData(screens) } to the emitted file list.
   - Emit a .env.local.example (NOT .env.local) documenting NEXT_PUBLIC_USE_MOCK=true + the OIDC vars, so each app has a documented offline-render switch without committing secrets.
Keep ALL existing working patterns intact (OIDC code-exchange callback, jose verify, dev CSP unsafe-eval + font-src data:, ESM api-client, detail/form/action/filter/can.ts depth). Update tools/codegen/__tests__/ui-app-emit.test.ts to assert mock-data.ts is emitted with mockEnabled + mockResponse + per-screen seeds, and that admin-fetch + session reference the bypass. Keep the test green.
VERIFY (paste real tails, trust only exit 0): \`cd ${CURAOS} && bun test tools/codegen/__tests__/ui-app-emit.test.ts\` green, AND \`bun run gen:ui-app front-office\` dry-run lists src/api/mock-data.ts + the .env.local.example in the plan. Report ok + filesChanged + verifyResult + summary + blockers.`,
  { label: 'mock-gap', schema: BUILD, model: 'opus' }
)
log(`mock gap: ${mockGap?.ok ? 'CLOSED' : 'BLOCKED ' + (mockGap?.blockers ?? []).join('; ')}`)

// Regen admin-app to confirm the GENERATED mock layer matches the hand-built one
// (so admin-app stops carrying a bespoke mock-data the generator now owns).
let parity = null
if (mockGap?.ok) {
  parity = await agent(
    `The gen:ui-app emitter now emits a generic src/api/mock-data.ts + mock-session bypass. Reconcile the admin-app (dir ${CURAOS}/frontend/apps/admin-app, submodule branch feat/admin-app-scaffold) so it uses the GENERATED mock layer instead of its bespoke hand-written one where they overlap (the generator now owns this). Run \`cd ${CURAOS} && bun run gen:ui-app admin-app --write\` (idempotent: it skips existing files), then ensure the app still builds AND still renders offline. If the generated mock-data differs from the hand-built one in a way that loses admin-app's seeded tenants/users/audit/workflows, KEEP the richer admin-app seed (hand-built wins for admin-app's curated demo data) but make sure the SHAPE matches what the generator emits so other apps are consistent. DO NOT regress: OIDC callback, jose session + mockSession bypass, dev CSP, the 5-tenant/8-audit demo seed.
VERIFY (paste real tails, exit 0 only): \`cd ${CURAOS}/frontend/apps/admin-app && bun run typecheck && bun run build\` BOTH exit 0. Report ok + filesChanged + verifyResult + summary + blockers. Never commit secrets/.env.local.`,
    { label: 'admin-parity', schema: BUILD, model: 'opus' }
  )
  log(`admin-app parity: ${parity?.ok ? 'OK' : 'BLOCKED ' + (parity?.blockers ?? []).join('; ')}`)
} else {
  log('parity SKIPPED: mock gap not closed')
}

// ─────────────────────────────────────────────────────────────────────
// Phase 2 - Fan out the 16 web apps. Each app is its own git submodule, so
// parallel emission is collision-free WITHOUT worktrees (different dirs). Each
// agent: gen --write, bun install (from curaos root), typecheck + build, and a
// mock-on render sanity check (the build proves compile; mock layer is now
// generator-emitted so render-offline is structural).
// ─────────────────────────────────────────────────────────────────────
phase('Fan out')
let fanned = []
if (mockGap?.ok) {
  fanned = await parallel(
    WEB_APPS.map((app) => () =>
      agent(
        `Fan out the Next.js web app "${app}" through the deepened gen:ui-app generator. Dir ${CURAOS}/frontend/apps/${app} (currently an EMPTY scaffold - the generator emits the FULL app). Steps:
1. \`cd ${CURAOS} && bun run gen:ui-app ${app} --write\` (emits package.json + the full deep app: per-screen list/detail/form/filter/schema/actions + the generic mock-data.ts + mock-session + can.ts + dashboard + i18n, all derived from ${ROOT}/ai/curaos/frontend/apps/${app}/Requirements.md integration points).
2. \`cd ${CURAOS} && bun install\` (from the ROOT, so workspace @curaos/* deps + react-hook-form/zod resolve).
3. Fix ANY type/build error you hit. Common ones from the admin-app build-out you should pre-empt: dynamic-route slug collisions (the generator uses [id] consistently - if a hand-stub left a differently-named [slug] sibling, rename to [id]); api-client config import name (use the namespace or the exact exported name configureRestClients); stale .next (rm -rf .next before building if chunks 404).
VERIFY (paste real tails, trust ONLY exit 0): \`cd ${CURAOS}/frontend/apps/${app} && bun run typecheck && bun run build\` BOTH exit 0. The build route table should list list + [id] detail routes per screen. Report ok + filesChanged (count is fine) + verifyResult (the real build tail) + summary + blockers. Repo-boundary: code only under frontend/apps/${app}; never write secrets. Do NOT commit - the orchestrator commits.`,
        { label: `fanout:${app}`, phase: 'Fan out', schema: BUILD, model: 'opus' }
      ).then((r) => ({ app, ...r }))
    )
  ).then((r) => r.filter(Boolean))
  const built = fanned.filter((f) => f.ok).map((f) => f.app)
  const failed = fanned.filter((f) => !f.ok).map((f) => f.app)
  log(`fan out: ${built.length}/${WEB_APPS.length} built. failed: ${failed.join(', ') || 'none'}`)
} else {
  log('fan out SKIPPED: mock gap not closed (apps would hang on Loading)')
}

// ─────────────────────────────────────────────────────────────────────
// Phase 3 - Adversarial grill. Verify the generator mock seam is real + a
// sample of fanned apps genuinely build + would render offline (not stubs).
// ─────────────────────────────────────────────────────────────────────
phase('Grill')
const builtApps = fanned.filter((f) => f.ok).map((f) => f.app)
const sample = builtApps.slice(0, 3)
const grills = await parallel([
  () => agent(
    `Adversarially verify on disk: does the gen:ui-app emitter ${EMITTER} GENUINELY emit a working generic mock layer, or did the agent fake it? Generate a throwaway app into a temp dir from one Requirements.md and inspect the emitted src/api/mock-data.ts: does mockEnabled() read the env flag, does mockResponse() actually seed per-screen rows shaped to each screen's schema and resolve BOTH the list path ({items,total,...}) and the detail-by-id path, and does the emitted admin-fetch.ts short-circuit to it on GET + the emitted session.ts seed a mockSession when mockEnabled and no token? Run the throwaway app's tsc --noEmit -> 0. Default real=false unless confirmed from actual emitted file contents + clean typecheck. Report target="mock-seam", real, verdict, issues. The user was burned repeatedly by "all loading nothing showing" - the WHOLE point of this seam is that a generated app renders without a backend.`,
    { label: 'grill:mock-seam', phase: 'Grill', schema: VERDICT, model: 'opus' }
  ),
  ...sample.map((app) => () =>
    agent(
      `Adversarially verify the fanned app ${CURAOS}/frontend/apps/${app} on disk: re-run \`cd ${CURAOS}/frontend/apps/${app} && bun run typecheck && bun run build\` (exit 0 ONLY - do not trust a prior claim). Does it have real depth (per-screen [id]/page.tsx detail, <screen>-form.tsx with zod, src/actions/<service>.ts, src/api/mock-data.ts with per-screen seeds, src/auth/can.ts) or empty stubs? Confirm the generated mock-data.ts seeds rows for THIS app's actual screens (from its Requirements.md), not leftover admin tenants. Report target="${app}", real, verdict, issues. Default real=false on any build failure or missing depth.`,
      { label: `grill:${app}`, phase: 'Grill', schema: VERDICT, model: 'opus' }
    )
  ),
]).then((r) => r.filter(Boolean))

return {
  mockGap: { ok: mockGap?.ok, summary: mockGap?.summary, blockers: mockGap?.blockers },
  adminParity: parity ? { ok: parity.ok, blockers: parity.blockers } : 'skipped',
  fanout: {
    total: WEB_APPS.length,
    built: fanned.filter((f) => f.ok).map((f) => f.app),
    failed: fanned.filter((f) => !f.ok).map((f) => ({ app: f.app, blockers: f.blockers })),
  },
  grills: grills.map((g) => ({ target: g?.target, real: g?.real, verdict: g?.verdict, issues: g?.issues })),
  confirmedReal: grills.filter((g) => g?.real).map((g) => g.target),
  needsAttention: grills.filter((g) => g && !g.real).map((g) => ({ target: g.target, issues: g.issues })),
}
