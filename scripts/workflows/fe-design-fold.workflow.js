export const meta = {
  name: 'fe-design-fold',
  description: 'Fold the OpenDesign CuraOS Aqua app-shell grammar into the generator + @curaos/ui: per-app unique accent palette, grouped+iconed sidebar (lucide icons, section headers), brand mark per app, KPI dashboard, token contract. Then regen all 19 web apps, build-verify, and grill render fidelity. Implements the user directive: distinct per-app designs, organized side menus, icons utilized.',
  phases: [
    { title: 'UI design layer', detail: 'add icon system + per-app palette generator + grouped-nav primitives to @curaos/ui' },
    { title: 'Emitter fold', detail: 'rewrite renderAppShell (grouped iconed nav + per-app accent + brand) + KPI dashboard + token contract in gen:ui-app' },
    { title: 'Regen + verify', detail: 'regen all 19 web apps from the redesigned generator, build green, render-check sample (parallel)' },
    { title: 'Grill', detail: 'adversarially verify design depth on disk + sample apps render the new shell' },
  ],
}

const ROOT = decodeURIComponent(new URL('../..', import.meta.url).pathname).slice(0, -1)
const CURAOS = `${ROOT}/curaos`
const EMITTER = `${CURAOS}/tools/codegen/src/ui-app-emit.ts`
const UIKIT = `${CURAOS}/frontend/packages/ui-kit`
const DESIGN = `${ROOT}/ai/curaos/frontend/design-system`

const WEB_APPS = [
  'admin-app', 'workflow-designer', 'front-office', 'fleet-manager',
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
const APPRES = {
  type: 'object',
  required: ['app', 'ok', 'detail'],
  properties: {
    app: { type: 'string' }, ok: { type: 'boolean' }, built: { type: 'boolean' },
    pushed: { type: 'boolean' }, detail: { type: 'string' }, blockers: { type: 'array', items: { type: 'string' } },
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

// ─────────────────────────────────────────────────────────────────────
// Phase 1 - Design layer in @curaos/ui: icon system + per-app palette
// generator + grouped-nav primitives. Single-writer on ui-kit.
// ─────────────────────────────────────────────────────────────────────
phase('UI design layer')
const uiLayer = await agent(
  `Add the design layer to @curaos/ui at ${UIKIT} so the generator can give EACH app a distinct identity with a grouped, iconed sidebar. STUDY the OpenDesign reference FIRST: ${DESIGN}/app-shell.html (the shell grammar), ${DESIGN}/navigation.html, ${DESIGN}/tokens.json (token contract). The reference shows: a deep-blue rail with a brand block (mark + name), GROUPED nav sections (uppercase section labels), nav items each with an inline SVG icon + label + optional badge + active state (accent tint + left treatment), a tenant/user footer; an accent token contract (--primary-300..900 ramp + semantic success/warning/error/info) where swapping the primary ramp re-themes the whole app.
Add to ui-kit (match the existing token-driven + dark-mode + RTL component style; read src/components.css + an existing component first):
1. ICON SYSTEM: add lucide-react as a dep (pin latest; install from the curaos ROOT). Re-export a curated icon set from @curaos/ui (e.g. an Icon component or a typed icon map) so generated apps reference icons by name. Cover the domains the apps need: building/users/shield/clipboard/calendar/cart/file/bell/settings/log-out/grid/workflow/truck/heart/stethoscope/dollar/package/chart, etc.
2. GROUPED SIDEBAR primitives: extend the existing Sidebar/NavItem so nav supports SECTIONS (a NavSection with an uppercase label) and NavItem accepts an icon + optional badge + active state, matching the reference. Keep AppShell/Sidebar/Topbar API backward-compatible where possible (add, don't break).
3. PER-APP ACCENT: ensure the theme token contract supports a per-app accent ramp (--accent / --primary ramp + --accent-fg + --accent-muted) so a single per-app value re-themes nav-active, primary buttons, focus rings, KPI accents, brand mark. Document the contract.
4. KPI/Stat already exist (KpiCard/StatCard) - verify they consume the accent token; adjust if needed to match the reference KPI tiles (label + value + trend).
Export everything new from src/index.ts. VERIFY (paste real tails, exit 0): \`cd ${UIKIT} && bun install && bun run build && bun run typecheck\`. NO em-dashes/en-dashes anywhere (binding rule). Report ok + filesChanged + verifyResult + summary + blockers. Repo-boundary: code only under frontend/packages/ui-kit.`,
  { label: 'ui-design-layer', schema: BUILD, model: 'opus' }
)
log(`ui design layer: ${uiLayer?.ok ? 'OK' : 'BLOCKED ' + (uiLayer?.blockers ?? []).join('; ')}`)

// ─────────────────────────────────────────────────────────────────────
// Phase 2 - Fold the design into the gen:ui-app emitter. Single-writer.
// ─────────────────────────────────────────────────────────────────────
phase('Emitter fold')
let fold = null
if (uiLayer?.ok) {
  fold = await agent(
    `Fold the OpenDesign CuraOS Aqua shell into the gen:ui-app emitter ${EMITTER} so EVERY generated app gets a DISTINCT per-app identity + a grouped, iconed sidebar (the user's directive: "special designs / different designs for different apps", "side menus organized like the design", "icons utilized like the designs"). Read the emitter fully + the reference ${DESIGN}/app-shell.html + ${DESIGN}/navigation.html + ${DESIGN}/tokens.json + the new @curaos/ui design layer (Phase 1 added icon system + grouped Sidebar/NavSection/NavItem-with-icon + per-app accent contract).
Changes to fold into the emitter templates (generator-evolution: every app inherits this):
1. PER-APP UNIQUE PALETTE: add a deterministic palette generator - from the app name (+ domain), derive a UNIQUE accent ramp (--primary-300..900 + --accent-fg + --accent-muted) for each of the 22 apps, so no two apps share an accent (user chose "per-app unique palette"). Emit it into the app's theme/token CSS so the whole shell re-themes. Keep WCAG-reasonable contrast. Document the mapping (e.g. hash app name -> hue, fixed S/L ramp).
2. GROUPED + ICONED SIDEBAR: rewrite renderAppShell to emit the reference's grouped sidebar - a brand block (per-app mark initial + app display name), nav grouped into SECTIONS with uppercase labels (e.g. a primary section of the app's screens, then a SETTINGS/account section with Settings + Log out), each NavItem carrying a domain-appropriate icon (map each screen's service/route to a sensible icon from the @curaos/ui icon set) + active state. Use the new @curaos/ui grouped-nav primitives.
3. KPI DASHBOARD: ensure the root dashboard uses the reference's KPI tile row (KpiCard per service, accent-tinted) + a page header (title + subtitle + primary action with icon).
4. TOPBAR: breadcrumb + search (Cmd K) + icon actions + user avatar, per reference.
Keep ALL working behavior intact (OIDC callback, mock-first render + mock-session, dev CSP, @tanstack-direct hooks, api-client-as-dist, ESM, detail/form/action/filter depth). Update the generator test ui-app-emit.test.ts to assert: per-app accent emitted (two different apps -> different accent values), grouped nav sections, icon per nav item, brand mark uses app name. Keep it green. NO em/en-dashes.
VERIFY (paste real tails, exit 0): \`cd ${CURAOS} && bun test tools/codegen/__tests__/ui-app-emit.test.ts\` green, AND \`bun run gen:ui-app admin-app\` dry-run + \`bun run gen:ui-app personal-tasks\` dry-run show DIFFERENT accent values + grouped iconed nav in the emitted AppShell. Report ok + filesChanged + verifyResult + summary + blockers.`,
    { label: 'emitter-fold', schema: BUILD, model: 'opus' }
  )
  log(`emitter fold: ${fold?.ok ? 'OK' : 'BLOCKED ' + (fold?.blockers ?? []).join('; ')}`)
} else {
  log('emitter fold SKIPPED: ui design layer not ok')
}

// ─────────────────────────────────────────────────────────────────────
// Phase 3 - Regen all 19 web apps from the redesigned generator (parallel).
// ─────────────────────────────────────────────────────────────────────
phase('Regen + verify')
let regen = []
if (fold?.ok) {
  // ui-kit changed: rebuild it first so apps resolve the new exports.
  await agent(
    `Rebuild @curaos/ui so the redesign exports are available to consumers: \`cd ${UIKIT} && bun run build\` exit 0 (paste tail). Then \`cd ${CURAOS} && bun install\` so the workspace relinks. Report ok + verifyResult.`,
    { label: 'rebuild-uikit', phase: 'Regen + verify', schema: BUILD, model: 'sonnet' }
  )
  regen = await parallel(
    WEB_APPS.map((app) => () =>
      agent(
        `Regenerate the web app "${app}" with the redesigned gen:ui-app (per-app accent + grouped iconed sidebar + KPI dashboard) and verify it builds, then commit. Dir ${CURAOS}/frontend/apps/${app} (git submodule; ${app === 'admin-app' ? 'branch feat/admin-app-scaffold - has WORKING hand state, preserve auth/mock' : 'on its feat/' + app + '-ui-scaffold branch'}).
Steps: (1) delete the shell + theme files the redesign re-emits so the idempotent --write regenerates them: \`rm -f src/surfaces/AppShell.tsx src/theme/*.ts src/theme/*.tsx app/globals.css\` (keep auth/api/mock files). (2) \`cd ${CURAOS} && bun run gen:ui-app ${app} --write\`. (3) \`bun install\` from ${CURAOS}. (4) Fix any error. VERIFY (real tails, exit 0): \`cd ${CURAOS}/frontend/apps/${app} && rm -rf .next && bun run typecheck && bun run build\` BOTH exit 0. (5) Sanity: AppShell now has grouped nav sections + icon imports + a per-app accent in the theme. NO em/en-dashes. (6) COMMIT + PUSH on the app's current feat branch (no main; no secrets/artifacts staged): \`git add -A && git commit -m "feat(${app}): apply per-app design - grouped iconed sidebar + accent + KPI dashboard" && git push\`.
Report app, ok, built, pushed, detail, blockers. Repo-boundary: this app only. Do NOT touch the parent.`,
        { label: `regen:${app}`, phase: 'Regen + verify', schema: APPRES, model: 'sonnet' }
      ).then((r) => ({ app, ...r }))
    )
  ).then((r) => r.filter(Boolean))
  const built = regen.filter((r) => r.built).map((r) => r.app)
  log(`regen: ${built.length}/${WEB_APPS.length} built`)
} else {
  log('regen SKIPPED: emitter fold not ok')
}

// ─────────────────────────────────────────────────────────────────────
// Phase 4 - Grill design depth + render.
// ─────────────────────────────────────────────────────────────────────
phase('Grill')
const sample = regen.filter((r) => r.built).map((r) => r.app).slice(0, 3)
const grills = await parallel([
  () => agent(
    `Adversarially verify on disk: did gen:ui-app at ${EMITTER} GENUINELY gain per-app design + grouped iconed nav, or is it still the flat generic shell? Generate TWO different apps (admin-app + personal-tasks) into throwaway temp dirs + inspect emitted src/surfaces/AppShell.tsx + theme: (a) do they have DIFFERENT accent palettes (not both teal)? (b) is the sidebar GROUPED into sections with uppercase labels? (c) does each nav item carry an ICON (not a bare label)? (d) brand mark per app name? Run each throwaway tsc -> 0. Default real=false unless all four confirmed from actual file contents. Report target="design-fold", real, verdict, issues. The user explicitly said the apps all looked the same, side menus unorganized, icons unused - prove that is fixed.`,
    { label: 'grill:design-fold', phase: 'Grill', schema: VERDICT, model: 'opus' }
  ),
  ...sample.map((app) => () =>
    agent(
      `Adversarially verify ${CURAOS}/frontend/apps/${app}: re-run typecheck + build (exit 0 only). Does src/surfaces/AppShell.tsx have grouped nav SECTIONS + an icon per item + a per-app accent in the theme (distinct from other apps)? Does it preserve working auth/mock/CSP? NO em/en-dashes. Report target="${app}", real, verdict, issues. Default real=false on build fail or if the shell is still the flat iconless generic one.`,
      { label: `grill:${app}`, phase: 'Grill', schema: VERDICT, model: 'opus' }
    )
  ),
]).then((r) => r.filter(Boolean))

return {
  uiLayer: { ok: uiLayer?.ok, blockers: uiLayer?.blockers },
  emitterFold: { ok: fold?.ok, summary: fold?.summary, blockers: fold?.blockers },
  regen: { total: WEB_APPS.length, built: regen.filter((r) => r.built).map((r) => r.app), failed: regen.filter((r) => !r.built).map((r) => ({ app: r.app, blockers: r.blockers })) },
  grills: grills.map((g) => ({ target: g?.target, real: g?.real, verdict: g?.verdict, issues: g?.issues })),
  needsAttention: grills.filter((g) => g && !g.real).map((g) => ({ target: g.target, issues: g.issues })),
}
