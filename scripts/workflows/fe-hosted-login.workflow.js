export const meta = {
  name: 'fe-hosted-login',
  description: 'Build hosted-login: the CuraOS OIDC self-service account portal (ADR-0120 sec6) - sign-in entry, MFA setup, password reset, active sessions, trusted devices, consent management, GDPR data export. Next.js 15 + React 19 reusing @curaos/ui design system + api-client + the per-app design (its own accent + grouped iconed nav), mock-first render so it works offline. Build-verify + grill. The last app in the v1 frontend fleet.',
  phases: [
    { title: 'Build', detail: 'scaffold the hosted-login account portal (account screens + auth-centered layout), wire to ui-kit + api-client, mock-first' },
    { title: 'Verify', detail: 'typecheck + build + render-check the account screens offline' },
    { title: 'Grill', detail: 'adversarially verify the screens are real + build green + no credential mishandling' },
  ],
}

const ROOT = decodeURIComponent(new URL('../..', import.meta.url).pathname).slice(0, -1)
const CURAOS = `${ROOT}/curaos`
const APP = `${CURAOS}/frontend/apps/hosted-login`
const UIKIT = `${CURAOS}/frontend/packages/ui-kit`
const DESIGN = `${ROOT}/ai/curaos/frontend/design-system`

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
    target: { type: 'string' }, real: { type: 'boolean' }, verdict: { type: 'string' },
    issues: { type: 'array', items: { type: 'string' } },
  },
}

phase('Build')
const build = await agent(
  `Build hosted-login, the CuraOS self-service account portal (ADR-0120 sec6), as a Next.js 15 + React 19 App Router app at ${APP} (currently EMPTY). Read first: ${ROOT}/ai/curaos/frontend/apps/hosted-login/Requirements.md, the design reference ${DESIGN}/app-shell.html + ${DESIGN}/tokens.json, and a sibling generated app for the working patterns to REUSE - ${CURAOS}/frontend/apps/admin-app (its package.json, next.config.mjs with dev CSP, src/api/{config,client,admin-fetch,mock-data}.ts, src/auth/session.ts, src/theme, @curaos/ui usage, .gitignore, .env.local.example). Match its toolchain exactly (Bun, Turborepo scripts, @curaos/ui + @curaos/api-client deps, transpilePackages, the @tanstack-direct hooks pattern, mock-first render, the per-app accent token approach).

This app is an ACCOUNT PORTAL, not a CRUD table app, so it has bespoke screens (NOT the gen:ui-app list/detail). Build these routes:
- / -> redirect to /account (or /sign-in if unauth).
- /sign-in : an OIDC sign-in ENTRY screen - a branded card with "Continue with CuraOS" that kicks off the Authorization Code + PKCE redirect to the identity portal (reuse admin-app's /login redirect pattern). Do NOT build a username/password form that this app itself processes - auth happens at the IdP; this is the entry + post-callback landing. Include the /api/auth/callback route (reuse admin-app's code-exchange callback).
- /account : profile overview - display name, email, roles, tenant (from the session), with an Edit profile affordance. Uses the @curaos/ui shell (grouped iconed sidebar: ACCOUNT section = Profile/Security/Sessions/Privacy).
- /account/security : MFA setup (show enrolled factors + an "Add authenticator" / "Add passkey" affordance as UI states; the actual enrollment posts to the identity service), password reset (a "Send reset link" action), recovery codes.
- /account/sessions : active sessions list (device, location, last active, "Revoke" per row + "Revoke all others") + trusted devices.
- /account/privacy : consent management (toggle per consent scope) + GDPR data export ("Request my data" -> shows export job status) + account deletion request (a guarded, clearly-labeled action that opens a confirm - does NOT hard-delete client-side).
All data via a mock-first layer (mock-data.ts seeding profile/factors/sessions/devices/consents/export-jobs) so it renders offline with no backend, gated by NEXT_PUBLIC_USE_MOCK; the session resolver seeds a mock platform-admin when mockEnabled + no/invalid token (reuse admin-app's fixed session). Give hosted-login its OWN per-app accent (distinct from the other apps). Theme + Inter via @curaos/ui.

SECURITY: this is UI scaffolding. Do NOT implement password hashing/storage or process raw credentials in this app - sign-in delegates to the OIDC IdP. Forms that collect a current password for a sensitive action submit to the identity service over the api-client, never store it. No secrets committed (.env.local gitignored; emit .env.local.example only). NO em/en-dashes anywhere.

VERIFY (paste real tails, exit 0 only): \`cd ${CURAOS} && bun install\`, then \`cd ${APP} && bun run typecheck && bun run build\` BOTH exit 0; the build route table lists /sign-in, /account, /account/security, /account/sessions, /account/privacy. Report ok + filesChanged + verifyResult + summary + blockers. Repo-boundary: code only under frontend/apps/hosted-login.`,
  { label: 'build-hosted-login', schema: BUILD, model: 'opus' }
)
log(`hosted-login build: ${build?.ok ? 'BUILT' : 'BLOCKED ' + (build?.blockers ?? []).join('; ')}`)

phase('Verify')
let verify = null
if (build?.ok) {
  verify = await agent(
    `Verify hosted-login at ${APP} renders its account screens offline. Start it on an unused port with the mock layer on (NEXT_PUBLIC_USE_MOCK=true), e.g. \`cd ${APP} && rm -rf .next && PORT=3007 NEXT_PUBLIC_USE_MOCK=true bun run dev\` (background), wait for Ready, then for EACH route (/account, /account/security, /account/sessions, /account/privacy) curl it and confirm HTTP 200 (NOT a 307 to the live IdP, NOT a 500). Read the dev log for any compile/runtime error (import.meta, useState-in-server, module-not-found, CSP eval) and report it verbatim. If a route 500s or redirects, report the exact cause in blockers. Do NOT trust a 200 from curl alone for the auth-gated routes - confirm the mock session seeds (the page returns account content, not a redirect Location header). Stop the dev server when done. Report ok + verifyResult (the per-route status + any errors) + summary + blockers.`,
    { label: 'verify-render', schema: BUILD, model: 'opus' }
  )
  log(`hosted-login verify: ${verify?.ok ? 'RENDERS' : 'ISSUES ' + (verify?.blockers ?? []).join('; ')}`)
} else {
  log('verify SKIPPED: build not ok')
}

phase('Grill')
const grill = await agent(
  `Adversarially verify hosted-login at ${APP} on disk. (1) Re-run \`cd ${APP} && bun run typecheck && bun run build\` - exit 0 ONLY, paste the real tail. (2) Are the account screens REAL (sign-in OIDC entry + callback, /account profile, /account/security MFA+password, /account/sessions, /account/privacy consent+GDPR export) or empty stubs? Inspect the actual route files. (3) SECURITY check: does the app avoid processing/storing raw credentials itself (sign-in delegates to the OIDC IdP via PKCE redirect; no client-side password hashing/storage; no hard client-side account deletion)? (4) Does it reuse the @curaos/ui shell with a grouped iconed sidebar + its own per-app accent, mock-first render, dev CSP? (5) NO em/en-dashes, no committed secrets. Default real=false on any build failure, stub screens, or credential mishandling. Report target="hosted-login", real, verdict, issues.`,
  { label: 'grill:hosted-login', schema: VERDICT, model: 'opus' }
)

return {
  build: { ok: build?.ok, summary: build?.summary, blockers: build?.blockers },
  verify: verify ? { ok: verify.ok, verifyResult: verify.verifyResult, blockers: verify.blockers } : 'skipped',
  grill: grill ? { real: grill.real, verdict: grill.verdict, issues: grill.issues } : null,
}
