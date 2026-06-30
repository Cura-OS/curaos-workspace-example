export const meta = {
  name: 'fe-rn-recipe',
  description: 'Build the gen:ui-app-native (React Native + Expo) generator recipe per ADR-0217, then generate clinician-app + patient-app, verify expo export (Metro bundle) + tsc exit 0, and adversarially grill. Mirrors the web gen:ui-app depth + mock-first render on the RN substrate (Expo Router, RN primitives, SecureStore, mock-session). Simulator render is an operator follow-up (no simulator in this env).',
  phases: [
    { title: 'RN emitter', detail: 'build gen:ui-app-native emitter + RN primitives, sharing screen derivation with the web recipe' },
    { title: 'Generate', detail: 'generate clinician-app + patient-app, verify tsc + expo export bundle (parallel)' },
    { title: 'Grill', detail: 'adversarially verify the RN recipe depth + both apps bundle clean' },
  ],
}

const ROOT = decodeURIComponent(new URL('../..', import.meta.url).pathname).slice(0, -1)
const CURAOS = `${ROOT}/curaos`
const WEB_EMITTER = `${CURAOS}/tools/codegen/src/ui-app-emit.ts`

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
// Phase 1 - Build the gen:ui-app-native emitter. Single-writer on the new
// emitter file. Model on the web emitter's screen derivation + mock seam.
// ─────────────────────────────────────────────────────────────────────
phase('RN emitter')
const emitter = await agent(
  `Build a new React Native (Expo) app generator recipe \`gen:ui-app-native\` per ADR-0217 (${ROOT}/ai/curaos/docs/adr/0217-rn-ui-app-native-recipe.md - read it first). Study the existing WEB emitter ${WEB_EMITTER} fully to REUSE its screen-derivation (parseRestScreens over the app's ai-docs Requirements.md "## Integration points" table) and its mock-first contract, then emit an Expo app instead of a Next.js one.

Create ${CURAOS}/tools/codegen/src/ui-app-native-emit.ts exporting planUiAppNative / emitUiAppNative / formatUiAppNativePlan (mirror the web emitter's plan/emit/format shape + its idempotent non-clobbering writer + a dry-run plan). Wire a new subcommand in ${CURAOS}/tools/codegen/src/index.ts ("ui-app-native") and add \`"gen:ui-app-native": "bun tools/codegen/src/index.ts ui-app-native"\` to ${CURAOS}/package.json scripts.

The emitted Expo app (per ADR-0217) must include:
- Expo SDK 52+ managed workflow: package.json (expo, expo-router, react-native, react, expo-secure-store, @tanstack/react-query, react-hook-form, zod, typescript pinned to current stable), app.json (expo config: name, slug, scheme, plugins incl. expo-router), tsconfig.json (expo/tsconfig.base), babel.config.js, metro.config.js, .gitignore (node_modules, .expo, dist, ios, android, *.local), a .env.local.example documenting EXPO_PUBLIC_USE_MOCK + EXPO_PUBLIC_API_BASE_URL.
- Expo Router: app/_layout.tsx (root: QueryClientProvider + theme + Stack), app/(tabs)/_layout.tsx (Tabs, one tab per screen), app/(tabs)/index.tsx (dashboard with KPI tiles per service), app/(tabs)/<screen>.tsx (list), app/<screen>/[id].tsx (detail). Mirror the web's screen set 1:1.
- Per screen: a list (FlatList + RefreshControl pull-to-refresh + a search TextInput filter + row Pressable -> detail), a detail screen (field rows), a create/edit form screen (react-hook-form + zod + RN TextInput/controls). Loading/error/empty via RN components. Role guards src/auth/can.ts (reused logic).
- src/ui/ RN primitives (View/Text/Pressable based): Screen, Button, Card, ListRow, StatusBadge, Field, EmptyState, Spinner, plus a tokens.ts mirroring the Aqua palette/spacing values so mobile matches web visually. NOT shadcn/Radix.
- Data layer: src/api/client.ts (configure @curaos/api-client REST base + token from Expo SecureStore), src/api/admin-fetch.ts (typed fetch + mock short-circuit on GET), src/api/hooks.ts (TanStack Query list/detail/count, useQuery imported DIRECTLY from "@tanstack/react-query"), src/api/mock-data.ts (the SAME generic schema-seeded mock-first seam as the web emitter: mockEnabled() gated by EXPO_PUBLIC_USE_MOCK / no EXPO_PUBLIC_API_BASE_URL, per-screen deterministic seeds, mockResponse list + detail), so the app renders offline.
- Auth: src/auth/session.ts resolving an OIDC token from Expo SecureStore with a mock-session bypass (seed platform-admin when mockEnabled and no/invalid token), mirroring the web fix.

Add a generator test ${CURAOS}/tools/codegen/__tests__/ui-app-native-emit.test.ts asserting the emitted file set + per-screen list/detail/form + mock-data + RN primitives + Expo Router layout + the @tanstack-direct hook import + that it derives screens from a Requirements.md.

VERIFY (paste real tails, exit 0 only): \`cd ${CURAOS} && bun test tools/codegen/__tests__/ui-app-native-emit.test.ts\` green, AND \`bun run gen:ui-app-native clinician-app\` dry-run lists the Expo file set (app/_layout.tsx, (tabs), per-screen list/detail/form, src/ui primitives, mock-data) without error. Report ok + filesChanged + verifyResult + summary + blockers.`,
  { label: 'rn-emitter', schema: BUILD, model: 'opus' }
)
log(`RN emitter: ${emitter?.ok ? 'BUILT' : 'BLOCKED ' + (emitter?.blockers ?? []).join('; ')}`)

// ─────────────────────────────────────────────────────────────────────
// Phase 2 - Generate clinician-app + patient-app, verify bundle (parallel).
// ─────────────────────────────────────────────────────────────────────
phase('Generate')
let apps = []
if (emitter?.ok) {
  apps = await parallel(
    ['clinician-app', 'patient-app'].map((app) => () =>
      agent(
        `Generate the React Native (Expo) app "${app}" via the new gen:ui-app-native recipe and verify it bundles. Dir ${CURAOS}/frontend/apps/${app} (empty scaffold). Steps:
1. \`cd ${CURAOS} && bun run gen:ui-app-native ${app} --write\` (emits the full Expo app from ${ROOT}/ai/curaos/frontend/apps/${app}/Requirements.md integration points).
2. \`cd ${CURAOS} && bun install\` (root) so expo/react-native/@curaos workspace deps resolve.
3. Fix any type/bundle error. VERIFY (paste real tails, exit 0 only):
   - \`cd ${CURAOS}/frontend/apps/${app} && bunx tsc --noEmit\` exit 0.
   - \`cd ${CURAOS}/frontend/apps/${app} && bunx expo export --platform web --output-dir /tmp/${app}-export\` exit 0 (Metro bundles the app; web platform is the headless-friendly target since no simulator exists here). If \`expo export\` needs a one-time \`bunx expo install\` to align native dep versions, run it.
NOTE: no iOS simulator / Android emulator exists in this environment, so a device render is NOT expected; the tsc + expo export (Metro bundle) is the gate. Report ok + filesChanged + verifyResult (the real bundle tail) + summary + blockers. Repo-boundary: code only under frontend/apps/${app}; do NOT commit (orchestrator commits).`,
        { label: `gen:${app}`, phase: 'Generate', schema: BUILD, model: 'opus' }
      ).then((r) => ({ app, ...r }))
    )
  ).then((r) => r.filter(Boolean))
  log(`generated: ${apps.filter((a) => a.ok).map((a) => a.app).join(', ') || 'none'}`)
} else {
  log('generate SKIPPED: RN emitter not built')
}

// ─────────────────────────────────────────────────────────────────────
// Phase 3 - Adversarial grill.
// ─────────────────────────────────────────────────────────────────────
phase('Grill')
const grills = await parallel([
  () => agent(
    `Adversarially verify the new gen:ui-app-native emitter ${CURAOS}/tools/codegen/src/ui-app-native-emit.ts on disk: does it GENUINELY emit a deep Expo app (Expo Router app/_layout + (tabs) + per-screen list with FlatList + detail [id] + create/edit form with zod + RN primitives + the mock-first mock-data seam + SecureStore session), or stubs? Generate a throwaway app from one Requirements.md into a temp dir + inspect the emitted files; confirm useQuery is imported from "@tanstack/react-query" (not the api-client barrel) and mock-data seeds per-screen rows. Run the throwaway's tsc --noEmit -> 0. Default real=false unless confirmed from actual file contents + clean tsc. Report target="rn-emitter", real, verdict, issues.`,
    { label: 'grill:rn-emitter', phase: 'Grill', schema: VERDICT, model: 'opus' }
  ),
  ...['clinician-app', 'patient-app'].map((app) => () =>
    agent(
      `Adversarially verify the RN app ${CURAOS}/frontend/apps/${app} on disk: re-run \`cd ${CURAOS}/frontend/apps/${app} && bunx tsc --noEmit\` (exit 0 only) and \`bunx expo export --platform web --output-dir /tmp/${app}-grill\` (exit 0 only - do NOT trust a prior claim). Does it have real depth (Expo Router screens per service, list FlatList, [id] detail, zod form, mock-data with per-screen seeds, RN primitives) or empty stubs? Report target="${app}", real, verdict, issues. Default real=false on any bundle failure or missing depth. No simulator render is expected in this env - the Metro bundle is the gate.`,
      { label: `grill:${app}`, phase: 'Grill', schema: VERDICT, model: 'opus' }
    )
  ),
]).then((r) => r.filter(Boolean))

return {
  rnEmitter: { ok: emitter?.ok, summary: emitter?.summary, blockers: emitter?.blockers },
  generated: apps.map((a) => ({ app: a.app, ok: a.ok, blockers: a.blockers })),
  grills: grills.map((g) => ({ target: g?.target, real: g?.real, verdict: g?.verdict, issues: g?.issues })),
  confirmedReal: grills.filter((g) => g?.real).map((g) => g.target),
  needsAttention: grills.filter((g) => g && !g.real).map((g) => ({ target: g.target, issues: g.issues })),
}
