export const meta = {
  name: 'fe-foundation',
  description: 'CuraOS frontend foundation tier: wire OD design tokens into @curaos/ui, build gen:ui-app generator, finish api-client (REST+GraphQL), author builder/auth SDK contracts, then generate+build admin-app as the proof slice. Each phase adversarially grilled.',
  phases: [
    { title: 'Design-intake', detail: 'parse OD tokens.json + 8 component groups into a wiring spec' },
    { title: 'Foundation', detail: 'ui-kit (@curaos/ui) + api-client (REST+GraphQL) + SDK contracts, parallel' },
    { title: 'Generator', detail: 'author gen:ui-app emitter (ui.react-next) from builder-studio + design' },
    { title: 'Proof-slice', detail: 'generate + build admin-app end-to-end against the design + live APIs' },
    { title: 'Grill', detail: 'adversarial verify each foundation deliverable' },
  ],
}

const ROOT = decodeURIComponent(new URL('../..', import.meta.url).pathname).slice(0, -1)
const CURAOS = `${ROOT}/curaos`
const DESIGN = `${ROOT}/ai/curaos/frontend/design/artifacts/core-design-language`

// ─────────────────────────────────────────────────────────────────────
// Phase 1 - Design intake: turn the OD output into a concrete wiring spec.
// (Single focused agent: reads tokens.json + the 8 component HTML groups,
//  emits a structured spec the foundation agents consume. Read-only.)
// ─────────────────────────────────────────────────────────────────────
phase('Design-intake')
const SPEC_SCHEMA = {
  type: 'object',
  required: ['tokenGroups', 'components', 'tailwindMapping', 'notes'],
  properties: {
    tokenGroups: { type: 'array', items: { type: 'string' } },
    components: { type: 'array', items: { type: 'object', additionalProperties: true } },
    tailwindMapping: { type: 'object', additionalProperties: true },
    cssVarStrategy: { type: 'string' },
    darkModeStrategy: { type: 'string' },
    tenantOverrideStrategy: { type: 'string' },
    notes: { type: 'array', items: { type: 'string' } },
  },
}
const spec = await agent(
  `Read the COMPLETE OpenDesign-generated CuraOS core design language at ${DESIGN}/ (tokens.json + foundations.html buttons.html forms.html data.html navigation.html feedback.html overlays.html app-shell.html). Produce a WIRING SPEC for turning it into the @curaos/ui package (curaos/frontend/packages/ui-kit) per ADR-0106 (shadcn/Radix + Ant Design 5 + Style Dictionary + Tailwind toggleable, light/dark + RTL + tenant token-swap override).
Report: tokenGroups (the token categories present), components (per @dsCard group: name + the component variants/states it shows + the CSS classes/vars it uses), tailwindMapping (how the W3C tokens map to a tailwind theme config), cssVarStrategy + darkModeStrategy + tenantOverrideStrategy (how a tenant re-skins via token swap), notes (anything a wiring agent must know). Read-only; do not write files.`,
  { label: 'design-intake', schema: SPEC_SCHEMA }
)
log(`design spec: ${spec?.tokenGroups?.length ?? 0} token groups, ${spec?.components?.length ?? 0} component groups`)

// ─────────────────────────────────────────────────────────────────────
// Phase 2 - Foundation: 3 INDEPENDENT builds in parallel (barrier).
//   A) @curaos/ui   B) @curaos/api-client (REST+GraphQL)   C) SDK contracts
// They touch disjoint dirs (frontend/packages/ui-kit, frontend/packages/api-client,
// backend/services/{builder,auth}*/specs) so a barrier is safe + fast.
// ─────────────────────────────────────────────────────────────────────
phase('Foundation')
const BUILD_SCHEMA = {
  type: 'object',
  required: ['ok', 'filesWritten', 'verifyCmd', 'verifyResult', 'summary'],
  properties: {
    ok: { type: 'boolean' },
    filesWritten: { type: 'array', items: { type: 'string' } },
    verifyCmd: { type: 'string' },
    verifyResult: { type: 'string' },
    summary: { type: 'string' },
    blockers: { type: 'array', items: { type: 'string' } },
  },
}

const designJson = JSON.stringify(spec ?? {}).slice(0, 6000)

const foundation = await parallel([
  // A) @curaos/ui
  () => agent(
    `Build the @curaos/ui design-system package at ${CURAOS}/frontend/packages/ui-kit (currently EMPTY, 0 files). Source of truth = the OpenDesign core design language at ${DESIGN}/ (tokens.json + 8 component HTML groups) and this wiring spec: ${designJson}.
Deliver: (1) package.json (@curaos/ui, React 19 peer, Tailwind + Style Dictionary + Radix + class-variance-authority deps); (2) tokens -> Style Dictionary build emitting CSS vars (light+dark) + a tailwind preset; (3) the core React components the spec lists (Button, Input/Select/Checkbox/Radio/Switch, FormField, Table, Card, Modal/Dialog, Drawer, Tabs, Sidebar+Topbar app-shell, Breadcrumb, Toast/Alert, Badge/Pill, Avatar, Tooltip, DropdownMenu, Pagination, EmptyState, Skeleton) as typed, shadcn/Radix-based, token-driven, RTL-aware, dark-mode components, faithful to the OD HTML; (4) a barrel src/index.ts. Match the Aqua palette + scales exactly. Per [[curaos-bun-primary-rule]] use Bun. VERIFY: from ${CURAOS} run \`cd frontend/packages/ui-kit && bun install && bun run build && bun run typecheck\` (add those scripts) and paste the real tail. Report ok + filesWritten + verifyCmd + verifyResult + summary + blockers. Repo-boundary: code only under frontend/packages/ui-kit.`,
    { label: 'ui-kit', phase: 'Foundation', schema: BUILD_SCHEMA, model: 'opus' }
  ),
  // B) @curaos/api-client (REST + GraphQL)
  () => agent(
    `Build the @curaos/api-client package at ${CURAOS}/frontend/packages/api-client (currently EMPTY). Per ADR-0106 + ADR-0103, user directive = BOTH REST and GraphQL.
REST: a TanStack Query layer that consumes the per-service typed SDKs already in ${CURAOS}/backend/packages/*-sdk (13 exist: audit, auth(stub), calendar, clinical-doc, encounter, notify, orders, reports, scheduling, search, settings, storage, tasks, terminology). Re-export typed query/mutation hooks per service, with a shared QueryClient + auth-token injection (from @curaos/auth-sdk when present). GraphQL: an Apollo Client configured for the Cosmo Router federated supergraph endpoint (ADR-0163) - wire the client + a typed-doc setup; the supergraph itself is a later phase, so target a configurable endpoint env CURAOS_GRAPHQL_URL and ship the client + a smoke query, not the full federated schema. package.json (@curaos/api-client, React 19 peer, @tanstack/react-query + @apollo/client + graphql deps). Barrel src/index.ts. Use Bun. VERIFY: \`cd ${CURAOS}/frontend/packages/api-client && bun install && bun run build && bun run typecheck\`; paste the real tail. Report the schema fields. Repo-boundary: code only under frontend/packages/api-client.`,
    { label: 'api-client', phase: 'Foundation', schema: BUILD_SCHEMA, model: 'opus' }
  ),
  // C) builder + auth SDK contracts (the P0 tail blocking builder-studio install)
  () => agent(
    `Two SDKs are stubs (no package.json) that builder-studio imports, blocking its bun install: @curaos/builder-sdk and @curaos/auth-sdk.
TASK 1 - builder-sdk: ${CURAOS}/backend/services/builder-core-service has specs/builder.tsp (OpenAPI contract) but is MISSING specs/builder.asyncapi.yaml (the event contract gen:sdk needs). Author a faithful builder.asyncapi.yaml (AsyncAPI 3.0.0) derived from builder-core-service's actual domain events (read its src/ event/outbox constants + the .tsp to learn the real channels/messages; do NOT invent). Then from ${CURAOS} run \`bun run gen:sdk builder --serviceLayer=core --write\` then \`cd backend/packages/builder-sdk && bun install && bun run generate && bun run build\`.
TASK 2 - auth-sdk: investigate where auth contracts should live. identity-service IS the auth provider (has specs). Determine whether auth-sdk should wrap identity-service's auth endpoints (likely) - if so, generate it from identity-service's contracts via the appropriate gen:sdk invocation; if auth genuinely needs its own service contracts that do not exist, report that as a blocker with the exact missing input (do NOT fabricate a service).
VERIFY each built SDK produces dist/. Report ok + filesWritten + verifyResult + blockers. Repo-boundary: builder-core-service is a submodule (specs live in it / code only); SDKs land in backend/packages/. Author the asyncapi from REAL events only.`,
    { label: 'sdk-contracts', phase: 'Foundation', schema: BUILD_SCHEMA, model: 'opus' }
  ),
]).then((r) => r.filter(Boolean))

log(`foundation: ${foundation.filter((f) => f?.ok).length}/${foundation.length} ok`)
for (const f of foundation) if (f && !f.ok) log(`  BLOCKED: ${f.label ?? '?'} -> ${(f.blockers ?? []).join('; ')}`)

// ─────────────────────────────────────────────────────────────────────
// Phase 3 - Generator: author gen:ui-app (depends on ui-kit + api-client existing).
// ─────────────────────────────────────────────────────────────────────
phase('Generator')
const generator = await agent(
  `Author the MISSING frontend-app generator subcommand \`gen:ui-app\` (the ADR-0153 \`ui.react-next\` recipe) in ${CURAOS}/tools/codegen. There is NO frontend app generator today; 21 of 22 apps are empty stubs. Model the emitter on the ONE coded app ${CURAOS}/frontend/apps/builder-studio (Next.js 15 + React 19 app shell: src/api, src/auth/session, src/state/store, src/theme/ThemeProvider, src/surfaces, src/tenant) AND the just-built @curaos/ui + @curaos/api-client.
The generator must emit, from a target app's ai/curaos/frontend/apps/<app>/Requirements.md + AGENTS.md, a REAL working baseline Next.js 15 app (NOT an empty stub): app-router shell importing @curaos/ui (sidebar+topbar+theme), @curaos/api-client wiring, @curaos/auth-sdk OIDC session/route-guard, Zustand store, a few real CRUD screens scaffolded from the app's integration-points table, next.config + tsconfig + package.json + Dockerfile. Add it as a codegen subcommand + a \`gen:ui-app\` package.json script, dry-run-default + --write (match the existing gen:service / gen:sdk pattern). Per [[curaos-generator-evolution-rule]] every per-app edge case must fold back here later.
VERIFY: \`cd ${CURAOS} && bun run gen:ui-app admin-app\` (dry-run) lists the files it would emit without error; paste the tail. Report ok + filesWritten (the emitter + templates) + verifyResult + summary + blockers.`,
  { label: 'gen-ui-app', schema: BUILD_SCHEMA, model: 'opus' }
)
log(`generator: ${generator?.ok ? 'OK' : 'BLOCKED ' + (generator?.blockers ?? []).join('; ')}`)

// ─────────────────────────────────────────────────────────────────────
// Phase 4 - Proof slice: generate + build admin-app end-to-end.
// ─────────────────────────────────────────────────────────────────────
phase('Proof-slice')
let proof = null
if (generator?.ok) {
  proof = await agent(
    `Generate and FULLY build the admin-app as the proof slice that the whole frontend pipeline works end-to-end. Target dir ${CURAOS}/frontend/apps/admin-app (currently an empty stub: only .git + README). Spec: ${ROOT}/ai/curaos/frontend/apps/admin-app/Requirements.md (read it - tenancy mgmt, user/role/org, audit-log viewer, settings; consumes @curaos/auth-sdk + @curaos/api-client + @curaos/ui; REST consumers identity-service/audit-core-service/etc).
Steps: (1) run \`bun run gen:ui-app admin-app --write\` to scaffold the real shell; (2) fill the REAL screens the Requirements list (tenancy list+detail+create, user/role assignment, audit-log viewer with pagination) wired to @curaos/api-client hooks against the live services; (3) auth via @curaos/auth-sdk OIDC (the live IdP is auth.example.com / Pocket-ID); (4) @curaos/ui components + the Aqua design tokens; (5) RTL + dark-mode.
VERIFY (paste real tails): from ${CURAOS}: root \`bun install\` resolves; \`cd frontend/apps/admin-app && bun run build && bun run typecheck\` green. Report ok + filesWritten + verifyResult + summary + blockers. Repo-boundary: code only under frontend/apps/admin-app (it is a submodule).`,
    { label: 'admin-app', schema: BUILD_SCHEMA, model: 'opus' }
  )
  log(`proof-slice admin-app: ${proof?.ok ? 'BUILT' : 'BLOCKED ' + (proof?.blockers ?? []).join('; ')}`)
} else {
  log('proof-slice SKIPPED: generator not ok')
}

// ─────────────────────────────────────────────────────────────────────
// Phase 5 - Adversarial grill: independently verify each deliverable on disk.
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
const grillTargets = [
  { t: 'ui-kit', path: 'frontend/packages/ui-kit', claim: 'is a real @curaos/ui design system faithful to the Aqua OD design, builds + typechecks, components are token-driven + dark-mode + RTL (not stubs)' },
  { t: 'api-client', path: 'frontend/packages/api-client', claim: 'has a real TanStack REST layer over the *-sdk packages AND an Apollo GraphQL client, builds + typechecks' },
  { t: 'gen-ui-app', path: 'tools/codegen', claim: 'gen:ui-app emits a REAL working Next.js app (not an empty stub) and dry-run lists files without error' },
  { t: 'admin-app', path: 'frontend/apps/admin-app', claim: 'is a real built admin shell with tenancy/user/audit screens wired to @curaos/api-client + @curaos/ui, builds + typechecks' },
]
const grills = await parallel(
  grillTargets.map((g) => () =>
    agent(
      `Adversarially verify on disk at ${CURAOS}/${g.path}: claim = "${g.claim}". Default to real=false unless you can confirm from the ACTUAL files + a real build/typecheck tail. Check the files exist + are non-stub + the verify command actually passed (re-run it if cheap). Report target="${g.t}", real (boolean), verdict (one line), issues (specific gaps). Be a skeptic; over-claiming here is the failure mode the user explicitly burned us on before.`,
      { label: `grill:${g.t}`, phase: 'Grill', schema: VERDICT, model: 'opus' }
    )
  )
).then((r) => r.filter(Boolean))

const confirmed = grills.filter((v) => v?.real)
const failed = grills.filter((v) => v && !v.real)
log(`grill: ${confirmed.length}/${grills.length} confirmed real`)

return {
  designSpec: { tokenGroups: spec?.tokenGroups, components: (spec?.components ?? []).length },
  foundation: foundation.map((f) => ({ ok: f?.ok, summary: f?.summary, blockers: f?.blockers })),
  generator: { ok: generator?.ok, blockers: generator?.blockers },
  proofSlice: proof ? { ok: proof.ok, blockers: proof.blockers } : 'skipped',
  grills: grills.map((g) => ({ target: g?.target, real: g?.real, verdict: g?.verdict, issues: g?.issues })),
  confirmedReal: confirmed.map((g) => g.target),
  needsAttention: failed.map((g) => ({ target: g.target, issues: g.issues })),
}
