export const meta = {
  name: 'fe-generator-depth',
  description: 'Deepen the gen:ui-app generator from list-only stubs to production-depth apps (detail routes, create/edit forms with zod validation, server actions, pagination, filters, loading/error states, role guards, KPI dashboard), add the 4 missing @curaos/ui primitives, regenerate + verify admin-app live, adversarially grill.',
  phases: [
    { title: 'UI primitives', detail: 'add Form/FieldError/DescriptionList/Timeline to @curaos/ui' },
    { title: 'Deepen emitter', detail: 'gen:ui-app: detail + forms + actions + pagination + filters + states + roles + dashboard' },
    { title: 'Regen+verify', detail: 'regenerate admin-app at higher fidelity, build + typecheck, fix until green' },
    { title: 'Grill', detail: 'adversarially verify the emitter depth + admin-app on disk' },
  ],
}

const ROOT = decodeURIComponent(new URL('../..', import.meta.url).pathname).slice(0, -1)
const CURAOS = `${ROOT}/curaos`
const EMITTER = `${CURAOS}/tools/codegen/src/ui-app-emit.ts`
const UIKIT = `${CURAOS}/frontend/packages/ui-kit`

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

// ─────────────────────────────────────────────────────────────────────
// Phase 1 - Add the 4 missing @curaos/ui primitives richer screens need.
// (Independent of the emitter; do first so the emitter can reference them.)
// ─────────────────────────────────────────────────────────────────────
phase('UI primitives')
const uiAdd = await agent(
  `Add 4 missing primitives to the @curaos/ui design-system package at ${UIKIT} (existing exports incl. Button/Input/Select/Checkbox/Radio/Switch/FormField/DataTable/Modal/ConfirmModal/Drawer/Pagination/Breadcrumb/Tabs/KpiCard/StatCard/Badge/Pill/StatusBadge/Alert/Banner/Toast/Skeleton/Spinner/EmptyState/AppShell). Add, matching the existing token-driven + dark-mode + RTL component style (read src/components.css + an existing component first):
1. Form + useCuraForm: a thin react-hook-form + zod wrapper (FormProvider + a typed useForm helper + a <Form onSubmit> that surfaces submit/validation state). Add react-hook-form + zod + @hookform/resolvers as deps (pin latest; install from the curaos ROOT, not the package dir).
2. FieldError: field-level validation error display, paired with the existing FormField.
3. DescriptionList / DescriptionItem: the term/definition layout for detail (show) views.
4. Timeline / TimelineItem: vertical activity/audit timeline.
Export all from src/index.ts. VERIFY: \`cd ${UIKIT} && bun install && bun run build && bun run typecheck\` exit 0 (paste the real tail). Report ok + filesChanged + verifyResult + summary + blockers. Repo-boundary: code only under frontend/packages/ui-kit.`,
  { label: 'ui-primitives', schema: BUILD, model: 'opus' }
)
log(`ui primitives: ${uiAdd?.ok ? 'OK' : 'BLOCKED ' + (uiAdd?.blockers ?? []).join('; ')}`)

// ─────────────────────────────────────────────────────────────────────
// Phase 2 - Deepen the gen:ui-app emitter. ONE agent owns the emitter file
// (single-writer; the depth features are interdependent template edits).
// ─────────────────────────────────────────────────────────────────────
phase('Deepen emitter')
const deepen = await agent(
  `Deepen the gen:ui-app emitter ${EMITTER} (1225 lines; currently emits 25 base files + a LIST-ONLY screen per REST-consumer service with TODO stubs). Read it fully first, plus the reference hand-built app ${CURAOS}/frontend/apps/builder-studio/src and admin-app's Requirements (${ROOT}/ai/curaos/frontend/apps/admin-app/Requirements.md). Fold production depth INTO the emitter templates so EVERY generated app gets it (generator-evolution rule). Each screen (per REST-consumer service) must emit:
1. DETAIL route: app/<screen>/[id]/page.tsx (server, session-guarded) + <screen>-detail.tsx (client) using @curaos/ui DescriptionList + Breadcrumb back-nav + an Edit button opening the form.
2. CREATE + EDIT forms: <screen>-form.tsx using the new @curaos/ui Form + react-hook-form + zod, plus a per-entity zod schema src/schemas/<service>.ts. Create opens in the Drawer (already stubbed); edit reuses the form.
3. SERVER ACTIONS: src/actions/<service>.ts ("use server") create/update/delete calling the admin fetch/api-client; forms submit through these.
4. LIST depth: real DataTable columns from a sensible entity shape, sortable headers, Pagination wired to page state, a <screen>-filters.tsx search/filter toolbar, row click -> detail route.
5. STATES: Skeleton/Spinner while loading, Alert/Banner on error, EmptyState when empty (use a shared QueryState wrapper like admin-app's).
6. ROLE GUARDS: src/auth/can.ts (canEdit/canDelete by session.roles) + gate the create/edit/delete controls.
7. DASHBOARD: the root screen shows KpiCard/StatCard summary tiles (counts per service).
8. i18n baseline: keep it minimal but emit a messages/en.json + a LocaleProvider seam (do NOT block on full next-intl if it bloats; a thin provider is fine).
Keep the WORKING auth (OIDC code-exchange callback + jose/decoded session) + CSP (dev unsafe-eval, font-src data:) + ESM patterns already in the emitter - do NOT regress them. Update the existing generator test tools/codegen/__tests__/ui-app-emit.test.ts to assert the new emitted files/contract (detail route, form, schema, action, can.ts) and keep it green.
VERIFY (paste real tails): \`cd ${CURAOS} && bun test tools/codegen/__tests__/ui-app-emit.test.ts\` green, AND \`bun run gen:ui-app admin-app\` dry-run lists the richer file set without error. Report ok + filesChanged + verifyResult + summary + blockers.`,
  { label: 'deepen-emitter', schema: BUILD, model: 'opus' }
)
log(`emitter depth: ${deepen?.ok ? 'OK' : 'BLOCKED ' + (deepen?.blockers ?? []).join('; ')}`)

// ─────────────────────────────────────────────────────────────────────
// Phase 3 - Regenerate admin-app at the new fidelity + make it build green.
// ─────────────────────────────────────────────────────────────────────
phase('Regen+verify')
let regen = null
if (deepen?.ok) {
  regen = await agent(
    `Regenerate the admin-app at the new generator fidelity and make it fully build + typecheck. Dir ${CURAOS}/frontend/apps/admin-app (a git submodule on branch feat/admin-app-scaffold; it currently has WORKING hand-fixes: OIDC code-exchange callback, jose session, mock-data layer src/api/mock-data.ts, dev CSP, @curaos/ui font wiring - DO NOT regress these).
Steps: (1) run \`cd ${CURAOS} && bun run gen:ui-app admin-app --write\` to emit the deepened scaffold (it KEEPS existing hand-filled files where the emitter is non-destructive; reconcile any conflicts preserving the working auth + mock layer). (2) Wire the new detail/form/action/filter screens to the mock-data layer so they render real seeded content with NO live backend (extend src/api/mock-data.ts with detail-by-id + create/update/delete echo responses as needed). (3) Ensure the 4 new @curaos/ui primitives resolve. (4) Fix every type/build error.
VERIFY (paste real tails, trust only exit 0): \`cd ${CURAOS} && bun install\` (from root) resolves; \`cd frontend/apps/admin-app && bun run typecheck && bun run build\` BOTH exit 0. Report ok + filesChanged + verifyResult + summary + blockers. Repo-boundary: code only under frontend/apps/admin-app; never commit secrets/.env.local.`,
    { label: 'regen-admin-app', schema: BUILD, model: 'opus' }
  )
  log(`regen admin-app: ${regen?.ok ? 'BUILT' : 'BLOCKED ' + (regen?.blockers ?? []).join('; ')}`)
} else {
  log('regen SKIPPED: emitter depth not ok')
}

// ─────────────────────────────────────────────────────────────────────
// Phase 4 - Adversarial grill (verify on disk; trust only live exit codes).
// ─────────────────────────────────────────────────────────────────────
phase('Grill')
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
const grills = await parallel([
  () => agent(
    `Adversarially verify on disk: did gen:ui-app at ${EMITTER} GENUINELY gain production depth (detail routes, zod forms, server actions, pagination, filters, loading/error states, role guards, dashboard), or is it still TODO stubs with renamed functions? Generate admin-app into a THROWAWAY temp dir + inspect the emitted files: is there a real <screen>-form.tsx with zod + react-hook-form, a real [id]/page.tsx detail, a real src/actions/<service>.ts, a can.ts role guard? Run the throwaway app's \`tsc --noEmit\` -> must be 0. Default real=false unless confirmed from actual emitted file contents + a clean typecheck. Report target="emitter-depth", real, verdict, issues. The user explicitly burned us twice for over-claiming "done" on non-working UI.`,
    { label: 'grill:emitter', phase: 'Grill', schema: VERDICT, model: 'opus' }
  ),
  () => agent(
    `Adversarially verify ${CURAOS}/frontend/apps/admin-app on disk: does it build + typecheck green (re-run \`bun run typecheck && bun run build\`, exit 0 only), does it still have the WORKING auth (OIDC code-exchange callback reading ?code not ?jwt; jose/decoded session) + mock-data layer + dev CSP unsafe-eval (regression check - these were hard-won fixes), and do the new depth screens (detail/form/filter) actually exist as real files wired to the mock layer? Report target="admin-app", real, verdict, issues. Default real=false if any prior fix regressed or build fails.`,
    { label: 'grill:admin-app', phase: 'Grill', schema: VERDICT, model: 'opus' }
  ),
]).then((r) => r.filter(Boolean))

return {
  uiPrimitives: { ok: uiAdd?.ok, blockers: uiAdd?.blockers },
  emitterDepth: { ok: deepen?.ok, summary: deepen?.summary, blockers: deepen?.blockers },
  regenAdminApp: regen ? { ok: regen.ok, blockers: regen.blockers } : 'skipped',
  grills: grills.map((g) => ({ target: g?.target, real: g?.real, verdict: g?.verdict, issues: g?.issues })),
  confirmedReal: grills.filter((g) => g?.real).map((g) => g.target),
  needsAttention: grills.filter((g) => g && !g.real).map((g) => ({ target: g.target, issues: g.issues })),
}
