export const meta = {
  name: 'fe-flagship-depth',
  description: 'Build every one of the 22 CuraOS frontend apps to flagship product depth in parallel: real domain workflows beyond generic CRUD (clinician orders/results/notes, patient booking/care-plan, business commerce/donation, personal task/calendar/notes UX, admin platform ops, etc.), derived from each app Requirements mission + features. Reuses the @curaos/ui design system + mock-first data plane so each ships functional offline. Build + test verify + adversarial grill per app.',
  phases: [
    { title: 'Depth wave A', detail: 'flagship product workflows for the first app cohort (parallel)' },
    { title: 'Depth wave B', detail: 'second cohort (parallel)' },
    { title: 'Grill', detail: 'adversarially verify depth is real + apps build/test green' },
  ],
}

const ROOT = decodeURIComponent(new URL('../..', import.meta.url).pathname).slice(0, -1)
const CURAOS = `${ROOT}/curaos`

// All 22 apps with their kind + a one-line flagship-depth brief (the agent reads
// the full Requirements for specifics; this anchors the domain workflows).
const APPS = [
  { app: 'admin-app', rn: false, brief: 'platform operations console: tenant lifecycle (provision/suspend/health), user+role administration, audit investigation with filters/timeline, platform settings, a real ops dashboard with KPIs + incident feed.' },
  { app: 'workflow-designer', rn: false, brief: 'BPM/flow authoring: a workflow list + a node-graph canvas editor (drag palette -> canvas, connect nodes, inspector panel) for designing automation flows, versioning, and a run-history view. Model the builder-studio canvas pattern.' },
  { app: 'front-office', rn: false, brief: 'healthcare front desk: patient scheduling board (queue + appointment status), billing/claims work, consent capture, secure messaging - the receptionist/coordinator surface.' },
  { app: 'fleet-manager', rn: false, brief: 'fleet operations: vehicle/asset roster, assignment + dispatch board, maintenance schedule, telemetry/status dashboard, trip history.' },
  { app: 'business-automation', rn: false, brief: 'low-code business automation: automation recipe list + a trigger->action builder, connector catalog, run logs, scheduling.' },
  { app: 'business-donation', rn: false, brief: 'donation/fundraising ops: campaign management, donor CRM, donation ledger + receipts, recurring-gift management, a fundraising dashboard.' },
  { app: 'business-shop', rn: false, brief: 'commerce admin: product catalog management, order management (cart->checkout->fulfillment states), inventory, a sales dashboard with revenue KPIs.' },
  { app: 'business-site', rn: false, brief: 'site/CMS builder for business web presence: page list + a content/section editor, theme settings, publish flow, a site-analytics overview.' },
  { app: 'business-workflow', rn: false, brief: 'business process management: case/work-item queues, SLA tracking, task assignment, a process dashboard.' },
  { app: 'personal-automation', rn: false, brief: 'personal automation: simple if-this-then-that rule builder, connected services, run history, schedules.' },
  { app: 'personal-calendar', rn: false, brief: 'personal calendar: month/week/day calendar views, event create/edit with reminders, agenda list, multi-calendar overlay.' },
  { app: 'personal-donation', rn: false, brief: 'personal giving: giving history, recurring donations management, causes/campaigns browse, tax-receipt export.' },
  { app: 'personal-notes', rn: false, brief: 'personal notes: a notes list + a rich note editor (title/body/tags), folders/notebooks, search, pin/archive.' },
  { app: 'personal-shop', rn: false, brief: 'personal shopping: product browse + cart + order history + wishlist; a clean consumer storefront UX.' },
  { app: 'personal-site', rn: false, brief: 'personal site builder: page editor, theme picker, publish, simple analytics - a lightweight personal web presence tool.' },
  { app: 'personal-tasks', rn: false, brief: 'personal task manager: task lists/projects, a board (todo/doing/done) + list view, due dates + reminders, quick-add, today/upcoming filters.' },
  { app: 'personal-tracking', rn: false, brief: 'personal habit/metric tracking: trackers list, log entries, trend charts (streaks, weekly/monthly), goals.' },
  { app: 'personal-workflow', rn: false, brief: 'personal workflow automation: a simple visual flow for personal routines, triggers, run history.' },
  { app: 'hosted-login', rn: false, brief: 'ALREADY DEEP (account portal). Only fill any thin screen: ensure profile edit, MFA enrollment states, sessions/devices, consent + GDPR export are fully fleshed; do not regress.' },
  { app: 'clinician-app', rn: true, brief: 'clinician mobile: patient scheduling board (queue + appt status), clinical task queue (orders/results review/sign-off), clinical note authoring (SOAP), orders/results review, secure team messaging.' },
  { app: 'patient-app', rn: true, brief: 'patient mobile: onboarding/profile (demographics/insurance/consent), appointment booking + calendar, care-plan progress tracking, secure provider messaging, billing/statement view.' },
]

const APPRES = {
  type: 'object',
  required: ['app', 'ok', 'detail'],
  properties: {
    app: { type: 'string' }, ok: { type: 'boolean' }, built: { type: 'boolean' }, tested: { type: 'boolean' },
    pushed: { type: 'boolean' }, screensAdded: { type: 'array', items: { type: 'string' } },
    detail: { type: 'string' }, blockers: { type: 'array', items: { type: 'string' } },
  },
}
const VERDICT = {
  type: 'object',
  required: ['target', 'real', 'verdict'],
  properties: { target: { type: 'string' }, real: { type: 'boolean' }, verdict: { type: 'string' }, issues: { type: 'array', items: { type: 'string' } } },
}

function depthAgent(entry, phaseTitle) {
  const { app, rn, brief } = entry
  const verifyCmd = rn
    ? `cd ${CURAOS}/frontend/apps/${app} && bunx tsc --noEmit && bunx expo export --platform web --output-dir /tmp/${app}-depth`
    : `cd ${CURAOS}/frontend/apps/${app} && rm -rf .next && bun run typecheck && bun run build`
  return () =>
    agent(
      `Build the "${app}" app to FLAGSHIP PRODUCT DEPTH - real domain workflows, not the generic CRUD scaffold it has now. Dir ${CURAOS}/frontend/apps/${app} (${rn ? 'Expo React Native' : 'Next.js'}, on branch main; it already builds + renders offline via the mock-first data plane + the @curaos/ui design system with its own per-app accent + grouped iconed nav).

FLAGSHIP BRIEF: ${brief}
First READ ${ROOT}/ai/curaos/frontend/apps/${app}/Requirements.md (its Mission + Features/Scope sections are the source of truth for the real workflows) and the existing app code to see what scaffold screens exist.

Build the REAL product surfaces this app needs - go well beyond a list+detail+form table:
- A purposeful landing/dashboard for the app's domain (relevant KPIs/widgets/feed, not generic tiles).
- The app's signature workflow screens (e.g. a board/kanban, a calendar, a canvas editor, a booking flow, a cart->checkout, a note editor, a scheduling queue, a chart/trends view) as the brief + Requirements dictate. Build genuine interactive UI (state, multi-step where needed), not stubs.
- Reuse @curaos/ui components + the per-app accent + the grouped iconed shell; add domain widgets where the kit lacks them (build them in the app's src/ui or components).
- ALL data through the existing mock-first layer: extend src/api/mock-data.ts (or the RN equivalent) with rich, realistic seeded data for the new workflows so everything RENDERS OFFLINE with no backend (mock on). Keep the live-fetch path intact (flips on when an API base URL is set).
- Keep working auth/session/PKCE/CSP/ESM patterns. Wire useQuery from @tanstack/react-query directly. NO em/en-dashes.

This is real product work: make ${app} feel like a polished, purpose-built app, not a generated template. Add per-screen tests where reasonable (the app already has emitted smoke tests).

VERIFY (paste real tails, exit 0 only): \`${verifyCmd}\` exit 0, AND \`cd ${CURAOS}/frontend/apps/${app} && bun test\` exit 0. COMMIT + PUSH on a branch (NEVER main): \`git checkout -b feat/${app}-flagship-depth main 2>/dev/null || git checkout feat/${app}-flagship-depth; git add -A; \` (verify no secrets/.next/node_modules staged) \` git commit -m "feat(${app}): flagship product depth - real domain workflows" && git push -u origin feat/${app}-flagship-depth\`.
Report app, ok, built, tested, pushed, screensAdded (the real new screens), detail, blockers. Repo-boundary: code ONLY under frontend/apps/${app}. Do NOT touch other apps, packages, or the parent.`,
      { label: `depth:${app}`, phase: phaseTitle, schema: APPRES, model: 'opus' }
    ).then((r) => ({ app, ...r }))
}

// Two waves to bound concurrency (the runtime caps at ~16 concurrent anyway, but
// waves keep the integration queue + grill sane). ~11 apps each.
phase('Depth wave A')
const waveA = await parallel(APPS.slice(0, 11).map((e) => depthAgent(e, 'Depth wave A'))).then((r) => r.filter(Boolean))
log(`wave A: ${waveA.filter((r) => r.built).length}/${waveA.length} built`)

phase('Depth wave B')
const waveB = await parallel(APPS.slice(11).map((e) => depthAgent(e, 'Depth wave B'))).then((r) => r.filter(Boolean))
log(`wave B: ${waveB.filter((r) => r.built).length}/${waveB.length} built`)

const all = [...waveA, ...waveB]

phase('Grill')
const sample = all.filter((r) => r.built).map((r) => r.app)
// Grill a spread: pick a few across families + kinds.
const grillSet = ['clinician-app', 'patient-app', 'business-shop', 'personal-tasks', 'workflow-designer', 'admin-app'].filter((a) => sample.includes(a)).slice(0, 6)
const grills = await parallel(
  grillSet.map((app) => () =>
    agent(
      `Adversarially verify "${app}" at ${CURAOS}/frontend/apps/${app} GENUINELY gained flagship product depth, or just got renamed stubs. (1) Re-run its build + \`bun test\` (exit 0 only - paste tails; for RN apps use tsc + expo export web). (2) Inspect the new screens: are they REAL purpose-built domain workflows (a board, calendar, canvas, booking flow, cart, note editor, scheduling queue, charts - whatever the app's domain needs) with genuine interactive state + rich mock-seeded data that renders offline, or thin placeholders? (3) Does it preserve the design system (per-app accent + grouped iconed shell), mock-first render, auth/PKCE? (4) NO em/en-dashes, no committed secrets. Default real=false if the screens are still generic CRUD, are stubs, or the build/test fails. Report target="${app}", real, verdict, issues.`,
      { label: `grill:${app}`, phase: 'Grill', schema: VERDICT, model: 'opus' }
    )
  )
).then((r) => r.filter(Boolean))

return {
  total: APPS.length,
  built: all.filter((r) => r.built).map((r) => r.app),
  tested: all.filter((r) => r.tested).map((r) => r.app),
  pushed: all.filter((r) => r.pushed).map((r) => r.app),
  failed: all.filter((r) => !r.built).map((r) => ({ app: r.app, blockers: r.blockers })),
  screens: all.filter((r) => r.built).map((r) => ({ app: r.app, screensAdded: r.screensAdded })),
  grills: grills.map((g) => ({ target: g?.target, real: g?.real, verdict: g?.verdict, issues: g?.issues })),
  needsAttention: grills.filter((g) => g && !g.real).map((g) => ({ target: g.target, issues: g.issues })),
}
