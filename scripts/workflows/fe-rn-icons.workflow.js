export const meta = {
  name: 'fe-rn-icons',
  description: 'Fix icons in the React Native apps (clinician-app, patient-app): they use ugly Unicode glyph chars (◫ ▦ ✓) as tab/nav icons instead of a real icon set, while the web apps use Phosphor. Add @phosphor-icons/react-native + an RN Icon primitive + replace the glyph chars across tabs + screens, folded into the gen:ui-app-native emitter so future RN apps inherit it. Verify tsc + expo export + grill.',
  phases: [
    { title: 'RN icon emitter', detail: 'fold a Phosphor RN Icon primitive + name map into gen:ui-app-native; replace glyph chars in templates' },
    { title: 'Regen + verify', detail: 'regen clinician + patient, replace glyph icons with Phosphor, tsc + expo export green, commit' },
    { title: 'Grill', detail: 'verify no glyph-char icons remain + Phosphor RN icons resolve + apps bundle' },
  ],
}

const ROOT = decodeURIComponent(new URL('../..', import.meta.url).pathname).slice(0, -1)
const CURAOS = `${ROOT}/curaos`
const RN_EMITTER = `${CURAOS}/tools/codegen/src/ui-app-native-emit.ts`
const DESIGN = `${ROOT}/ai/curaos/frontend/design-system`

const BUILD = { type: 'object', required: ['ok', 'verifyResult', 'summary'], properties: {
  ok: { type: 'boolean' }, filesChanged: { type: 'array', items: { type: 'string' } },
  verifyResult: { type: 'string' }, summary: { type: 'string' }, blockers: { type: 'array', items: { type: 'string' } } } }
const APPRES = { type: 'object', required: ['app', 'ok', 'detail'], properties: {
  app: { type: 'string' }, ok: { type: 'boolean' }, built: { type: 'boolean' }, pushed: { type: 'boolean' },
  detail: { type: 'string' }, blockers: { type: 'array', items: { type: 'string' } } } }
const VERDICT = { type: 'object', required: ['target', 'real', 'verdict'], properties: {
  target: { type: 'string' }, real: { type: 'boolean' }, verdict: { type: 'string' }, issues: { type: 'array', items: { type: 'string' } } } }

phase('RN icon emitter')
const emitter = await agent(
  `Fix icons in the gen:ui-app-native (Expo React Native) emitter ${RN_EMITTER}. PROBLEM: generated RN apps use ugly Unicode glyph characters as tab/nav icons (e.g. \`<TabGlyph glyph="◫" />\`, "▦", "✓", "⚙") instead of a real icon set - while the web apps now use Phosphor Icons at a fixed 18px. Make RN consistent.

Read the emitter fully + how it currently emits the (tabs)/_layout.tsx tabBarIcon + any glyph usage + the src/ui primitives. Then:
1. Add @phosphor-icons/react-native (pin latest stable; it is the RN-native Phosphor package - SVG-based, works in Expo) to the GENERATED app's package.json deps. (Note: it needs react-native-svg, which Expo provides; add it if not present.)
2. Emit an RN Icon primitive src/ui/Icon.tsx: a name-addressable wrapper over @phosphor-icons/react-native (regular weight) with a fixed default size (~22px for tabs, ~18px inline; take a size prop), currentColor/token color, mirroring the web @curaos/ui <Icon name=...> name keys so the SAME semantic names work (identity, tenant, audit, patient, calendar, tasks, workflow, clinical, lab, meds, schedule, messaging, billing, care-plan, settings, home, etc. - cover what the RN apps' screens + tabs need).
3. Replace EVERY Unicode-glyph icon in the emitted templates ((tabs)/_layout.tsx tabBarIcon, any SectionHeader/MetricCard/ListRow/screen glyphs) with <Icon name="..." /> using the new primitive. Remove the TabGlyph glyph-char approach entirely.
4. Keep the OD/Aqua look (the RN tokens already mirror the palette). NO em/en-dashes.
Update the generator test ui-app-native-emit.test.ts: assert the RN Icon primitive is emitted, tabs use <Icon name=...> (not glyph chars), @phosphor-icons/react-native is a dep, and no Unicode box-drawing/glyph icon chars remain in the emitted layout. Keep green.
VERIFY (paste real tails, exit 0): \`cd ${CURAOS} && bun test tools/codegen/__tests__/ui-app-native-emit.test.ts\` green; \`bun run gen:ui-app-native clinician-app\` dry-run shows src/ui/Icon.tsx + Phosphor tabs. Report ok + filesChanged + verifyResult + summary + blockers. Repo-boundary: code only under tools/codegen.`,
  { label: 'rn-icon-emitter', schema: BUILD, model: 'opus' }
)
log(`RN icon emitter: ${emitter?.ok ? 'OK' : 'BLOCKED ' + (emitter?.blockers ?? []).join('; ')}`)

phase('Regen + verify')
let apps = []
if (emitter?.ok) {
  apps = await parallel(['clinician-app', 'patient-app'].map((app) => () =>
    agent(
      `Regenerate the RN app "${app}" so its icons use the new Phosphor RN Icon primitive instead of Unicode glyph chars, and verify. Dir ${CURAOS}/frontend/apps/${app} (Expo, on branch main; it has flagship-depth screens that use the old glyph icons + the new emitter emits a Phosphor src/ui/Icon.tsx).
Steps:
1. Branch: \`git checkout -b feat/${app}-rn-icons main\`. NEVER main.
2. \`cd ${CURAOS} && bun run gen:ui-app-native ${app} --write\` (emits src/ui/Icon.tsx + Phosphor tabs; idempotent for existing files). Then go through the app's screens + (tabs)/_layout.tsx + src/ui and REPLACE every remaining Unicode-glyph icon (◫ ▦ ✓ ⚙ ◷ ☰ etc. and any TabGlyph) with <Icon name="..." /> from the new primitive, choosing a semantically right icon per tab/screen (Today/board=grid, tasks=check-square, calendar=calendar, messages=chat, orders=clipboard, etc.). Remove any TabGlyph component.
3. \`cd ${CURAOS} && bun install\`. Fix any error.
VERIFY (real tails, exit 0): \`cd ${CURAOS}/frontend/apps/${app} && bunx tsc --noEmit\` exit 0, AND \`bunx expo export --platform web --output-dir /tmp/${app}-icons\` exit 0. Confirm \`grep -rE "[\\x{25A0}-\\x{25FF}\\x{2300}-\\x{27BF}]" app src | grep -v node_modules\` finds NO glyph-char icons left (box-drawing/misc-symbol ranges). NO em/en-dashes.
COMMIT + PUSH: \`git add -A && git commit -m "fix(${app}): replace Unicode-glyph icons with Phosphor RN icon set" && git push -u origin feat/${app}-rn-icons\`.
Report app, ok, built (tsc+export exit 0), pushed, detail, blockers. Repo-boundary: this app only.`,
      { label: `regen:${app}`, phase: 'Regen + verify', schema: APPRES, model: 'opus' }
    ).then((r) => ({ app, ...r }))
  )).then((r) => r.filter(Boolean))
  log(`RN apps: ${apps.filter((a) => a.built).map((a) => a.app).join(', ') || 'none built'}`)
}

phase('Grill')
const grills = await parallel(['clinician-app', 'patient-app'].map((app) => () =>
  agent(
    `Adversarially verify "${app}" at ${CURAOS}/frontend/apps/${app}: (1) Are there ZERO Unicode-glyph icon characters left as icons (scan app/ + src/ for box-drawing U+25A0-25FF + misc-symbols U+2300-27BF used as icons; the old ◫ ▦ ✓ tab glyphs must be gone)? (2) Does it use a real Phosphor RN Icon primitive (@phosphor-icons/react-native) for tabs + nav, with a sensible fixed size? (3) \`bunx tsc --noEmit\` exit 0 + \`bunx expo export --platform web --output-dir /tmp/${app}-grill\` exit 0 (paste tails). (4) NO em/en-dashes, no committed secrets. Default real=false if glyph chars remain, no real icon set, or bundle fails. Report target="${app}", real, verdict, issues.`,
    { label: `grill:${app}`, phase: 'Grill', schema: VERDICT, model: 'opus' }
  )
)).then((r) => r.filter(Boolean))

return {
  emitter: { ok: emitter?.ok, blockers: emitter?.blockers },
  apps: apps.map((a) => ({ app: a.app, ok: a.ok, built: a.built, pushed: a.pushed, blockers: a.blockers })),
  grills: grills.map((g) => ({ target: g?.target, real: g?.real, verdict: g?.verdict, issues: g?.issues })),
  needsAttention: grills.filter((g) => g && !g.real).map((g) => ({ target: g.target, issues: g.issues })),
}
