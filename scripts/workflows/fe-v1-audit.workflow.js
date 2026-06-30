export const meta = {
  name: 'fe-v1-audit',
  description: 'Comprehensive v1.0 frontend definition-of-done audit + gap analysis. Verify every one of the 22 apps + foundation against each v1 dimension (build/test green, render offline, design+icon consistency, auth/PKCE, a11y, i18n, per-app product depth real, no stubs/TODO), produce a grill verdict on "v1 fully functional", and synthesize a comprehensive v1.0 plan doc + enumerated gap list. Adversarial: default to NOT-done unless proven.',
  phases: [
    { title: 'Dimension audits', detail: 'parallel adversarial audits, one per v1 DoD dimension across all 22 apps' },
    { title: 'Synthesize', detail: 'merge into a v1.0 frontend DoD + gap list + ship verdict' },
  ],
}

const ROOT = decodeURIComponent(new URL('../..', import.meta.url).pathname).slice(0, -1)
const CURAOS = `${ROOT}/curaos`

const WEB = 'admin-app workflow-designer front-office fleet-manager business-automation business-donation business-shop business-site business-workflow personal-automation personal-calendar personal-donation personal-notes personal-shop personal-site personal-tasks personal-tracking personal-workflow hosted-login'.split(' ')
const RN = ['clinician-app', 'patient-app']
const HAND = ['builder-studio']

const FINDINGS = {
  type: 'object',
  required: ['dimension', 'pass', 'summary', 'gaps'],
  properties: {
    dimension: { type: 'string' },
    pass: { type: 'boolean' },
    summary: { type: 'string' },
    perApp: { type: 'array', items: { type: 'object', properties: { app: { type: 'string' }, ok: { type: 'boolean' }, note: { type: 'string' } } } },
    gaps: { type: 'array', items: { type: 'string' } },
  },
}

phase('Dimension audits')
const DIMENSIONS = [
  { key: 'build-test', prompt: `Adversarially verify the BUILD + TEST gate for ALL 22 CuraOS frontend apps from main. Web (${WEB.join(' ')} + ${HAND.join(' ')}): run \`bun run typecheck && bun run build\` exit 0 each. RN (${RN.join(' ')}): \`bunx tsc --noEmit\` + \`bunx expo export --platform web\` exit 0. ALSO \`bun test\` per app where a test script exists. Report which apps PASS all gates and which FAIL with the exact error. This is the hard functional gate. Be exhaustive - actually run them (batch sensibly); do not infer. dimension="build-test".` },
  { key: 'render-offline', prompt: `Adversarially verify every web app RENDERS its real screens OFFLINE (mock-first). For a representative spread across families (admin, 2-3 personal, 2-3 business, front-office, fleet, workflow-designer, hosted-login), start dev with NEXT_PUBLIC_USE_MOCK=true on distinct ports, curl the main screens (list/dashboard/detail), confirm HTTP 200 with real seeded content in the HTML (not a redirect to IdP, not a 500, not empty "Loading"). Report per-app what rendered. dimension="render-offline".` },
  { key: 'design-icons', prompt: `Adversarially verify DESIGN + ICON consistency across all 22 apps. (1) Each web app has its own distinct per-app accent (sample globals.css --accent across 8 apps; confirm spread, no clustering). (2) Grouped iconed sidebar (NavSection + Icon per item) using Phosphor (web) / phosphor-react-native (RN) - ZERO lucide refs, ZERO Unicode-glyph icons (scan U+25A0-25FF + U+2300-27BF). (3) Icon sizing is fixed-px (~18px), not font-relative em (no oversizing). Report any app off-pattern. dimension="design-icons".` },
  { key: 'auth-pkce', prompt: `Adversarially verify AUTH across the web apps + hosted-login. (1) OIDC sign-in uses real PKCE (app/login route mints code_verifier + S256 code_challenge + state; callback validates state + sends code_verifier + clears cookies). (2) session resolver seeds a mock platform-admin when mockEnabled + no/invalid token (so stale cookies do not bounce to live IdP). (3) no client-side credential processing in hosted-login. Sample 3-4 apps + hosted-login from main. dimension="auth-pkce".` },
  { key: 'depth-real', prompt: `Adversarially verify PER-APP PRODUCT DEPTH is real, not generic CRUD or stubs, for all 21 generated apps. For a spread (admin, workflow-designer, front-office, fleet-manager, business-shop, business-donation, personal-tasks, personal-calendar, personal-notes, clinician-app, patient-app): inspect the actual screens - are there genuine domain workflows (boards/kanban, calendar, canvas editor, booking flow, cart, note editor, scheduling queue, charts, dispatch) with real interactive state + rich mock data, or thin placeholders/TODO? grep for TODO/FIXME/"coming soon"/empty-return stubs. Report apps that are still shallow. dimension="depth-real".` },
  { key: 'a11y-i18n-quality', prompt: `Adversarially verify QUALITY dimensions across the generated apps. (1) i18n seam present (LocaleProvider + messages) + used, not hardcoded strings everywhere. (2) Basic a11y: nav has aria, buttons labeled, images alt, focus states. (3) No em/en-dashes anywhere (binding rule). (4) No committed secrets (.env.local gitignored; only .env.local.example). (5) loading/error/empty states on data screens. Sample 5-6 apps. Report gaps. dimension="a11y-i18n-quality".` },
  { key: 'live-wiring-readiness', prompt: `Assess LIVE API WIRING readiness (the known infra-blocked dimension). Confirm the frontend code path to a real backend EXISTS + is correct: setting NEXT_PUBLIC_API_BASE_URL flips mockEnabled off and routes admin-fetch/hooks to the real gateway; the SDKs + api-client are wired; the only missing piece is a running backend (M16 cluster). Verify the code-side is complete (so when infra lands, it works) and precisely state what infra is required. Is there ANY frontend-code gap preventing live wiring, or is it purely infra? dimension="live-wiring-readiness".` },
]

const results = await parallel(DIMENSIONS.map((d) => () =>
  agent(
    `${d.prompt}\n\nAll apps under ${CURAOS}/frontend/apps on branch main. Be adversarial + exhaustive: default a finding to pass=false unless you PROVE it with real commands / file inspection (paste evidence). Report dimension, pass (true only if the whole dimension holds across all apps), summary, perApp (per-app ok+note where relevant), gaps (specific, actionable). The goal is an honest v1.0 readiness picture, not optimism.`,
    { label: `audit:${d.key}`, phase: 'Dimension audits', schema: FINDINGS, model: 'opus' }
  )
)).then((r) => r.filter(Boolean))

phase('Synthesize')
const synth = await agent(
  `Synthesize a comprehensive v1.0 FRONTEND definition-of-done + gap report from these dimension audits:\n${JSON.stringify(results, null, 2)}\n\nProduce a single structured markdown report covering: (1) the v1.0 frontend DoD (the dimensions every app must satisfy), (2) per-dimension PASS/FAIL with evidence, (3) a precise enumerated gap list (what is NOT done, per app where relevant, actionable), (4) which gaps are buildable-now vs infra-blocked (M16 deploy), (5) a clear verdict: is v1.0 frontend "fully functional" (mock-first, code-complete) yes/no, and what exactly remains for "fully shipped". Write it to ${ROOT}/ai/curaos/docs/frontend-v1-dod-audit.md (use the Write tool). Return a concise summary: verdict + the top buildable gaps + the infra-blocked items.`,
  { label: 'synthesize-dod', schema: { type: 'object', required: ['verdict', 'buildableGaps', 'infraBlocked', 'reportPath'], properties: { verdict: { type: 'string' }, fullyFunctional: { type: 'boolean' }, buildableGaps: { type: 'array', items: { type: 'string' } }, infraBlocked: { type: 'array', items: { type: 'string' } }, reportPath: { type: 'string' } } }, model: 'opus' }
)

return {
  dimensions: results.map((r) => ({ dimension: r.dimension, pass: r.pass, gaps: r.gaps })),
  verdict: synth?.verdict,
  fullyFunctional: synth?.fullyFunctional,
  buildableGaps: synth?.buildableGaps,
  infraBlocked: synth?.infraBlocked,
  reportPath: synth?.reportPath,
}
