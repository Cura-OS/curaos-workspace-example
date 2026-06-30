export const meta = {
  name: 'fe-icon-set-phosphor',
  description: 'Replace ui-kit icons with Phosphor Icons (researched pick for SaaS/dashboard UIs - cleaner + more polished than lucide) and FIX the oversizing bug (Icon defaulted to 1.5em/1em font-relative; nav icons ballooned vs the OD 17px target). Phosphor regular weight, fixed sensible default size, same <Icon name=...> API + IconName keys so apps need no code change. Rebuild ui-kit, render-verify in browser, grill.',
  phases: [
    { title: 'Swap to Phosphor + fix size', detail: 'lucide -> @phosphor-icons/react, fixed default size ~18px, keep the Icon API + every name key' },
    { title: 'Verify render', detail: 'rebuild ui-kit + admin-app, browser-check icons are crisp + correctly sized' },
    { title: 'Grill', detail: 'verify every generator icon name resolves, lucide gone, sizing correct, not stubs' },
  ],
}

const ROOT = decodeURIComponent(new URL('../..', import.meta.url).pathname).slice(0, -1)
const CURAOS = `${ROOT}/curaos`
const UIKIT = `${CURAOS}/frontend/packages/ui-kit`
const DESIGN = `${ROOT}/ai/curaos/frontend/design-system`

const BUILD = { type: 'object', required: ['ok', 'verifyResult', 'summary'], properties: {
  ok: { type: 'boolean' }, filesChanged: { type: 'array', items: { type: 'string' } },
  verifyResult: { type: 'string' }, summary: { type: 'string' }, blockers: { type: 'array', items: { type: 'string' } } } }
const VERDICT = { type: 'object', required: ['target', 'real', 'verdict'], properties: {
  target: { type: 'string' }, real: { type: 'boolean' }, verdict: { type: 'string' }, issues: { type: 'array', items: { type: 'string' } } } }

const ICON_NAMES = 'accounting accreditation activity analytics audit automation builder calendar care-plan care-plans clinical clinical-doc clipboard commerce contact course document document-conversion donation education ems encounter event fleet geospatial grid health home hr identity imaging integrations inventory invoice lab meds network notify org party patient plugin-runtime procurement reports sales schedule search settings shield site storage student success tags tasks tenant users workflow dashboard bell plus menu log-out chevron-right close edit trash refresh download check filter more up down'

phase('Swap to Phosphor + fix size')
const build = await agent(
  `Replace @curaos/ui's icon set with Phosphor Icons and FIX the icon oversizing bug. Context: the user said the current icons are "ugly and over sized". Two real problems: (1) ui-kit uses lucide-react; the user wants a better, researched set - use Phosphor Icons (@phosphor-icons/react), the strong pick for SaaS/dashboard product UIs (cleaner, more refined than lucide, consistent regular weight). (2) the Icon component (${UIKIT}/src/lib/icons.tsx) defaults to a FONT-RELATIVE size (comment says "1.5em default box", width/height "1em") so icons balloon relative to context - the OD design uses a FIXED ~17px (see ${DESIGN}/app-shell.html: \`svg.ic{width:17px;height:17px;stroke-width:1.7}\`).

Do this:
1. Add @phosphor-icons/react (pin latest stable) to ui-kit deps; remove lucide-react entirely (deps + all imports).
2. Rewrite the icon map (src/lib/icons.tsx) so EACH of these names maps to the closest Phosphor icon (regular weight), keeping the SAME IconName union keys + the SAME <Icon name=...> component API (so NO generated app changes):
   ${ICON_NAMES}
   Map semantically: identity=IdentificationCard, tenant=Buildings, audit=ShieldCheck, patient=HeartStraight/UserCircle, clinical/clinical-doc=ClipboardText, lab=Flask, meds=Pill, imaging=Monitor, encounter=Stethoscope, care-plan=ClipboardText, calendar/schedule=CalendarBlank, fleet=Truck, geospatial=MapPin, commerce/sales=ShoppingCart, inventory=Package/Stack, invoice/accounting=Receipt, donation=HandHeart, hr=UsersThree, org=TreeStructure, party=AddressBook, procurement=ShoppingBagOpen, integrations=Plugs, notify=Bell, reports/analytics=ChartBar, storage=Database, site=Globe, education/course/student/accreditation=GraduationCap/BookOpen, event=Ticket, ems=FirstAid, network=Graph, document=FileText, tasks=CheckSquare, workflow=FlowArrow, tags=Tag, activity=Pulse, health=Heartbeat, home=House, success=CheckCircle, dashboard/grid=SquaresFour, settings=Gear, search=MagnifyingGlass, plus=Plus, menu=List, log-out=SignOut, chevron-right=CaretRight, close=X, edit=PencilSimple, trash=Trash, refresh=ArrowsClockwise, download=DownloadSimple, check=Check, filter=Funnel, more=DotsThree, up=CaretUp, down=CaretDown, builder=Wrench, automation=Lightning, contact=AddressBook, plugin-runtime=PuzzlePiece, document-conversion=FileArrowUp.
3. FIX SIZING: the <Icon> default size must be a FIXED pixel value (default ~18px, or accept a numeric size prop) NOT 1.5em - so icons render crisp + correctly sized in the nav, buttons, KPIs. Phosphor's size prop takes a number (px). Keep currentColor, RTL-neutral, className passthrough. The nav icons should land ~17-18px like the OD design, not oversized.
4. Update the ui-kit icon test: every name resolves to a real Phosphor component, 0 lucide references remain, default size is fixed-px not em. NO em/en-dashes.
VERIFY (paste real tails, exit 0): \`cd ${UIKIT} && bun install && bun run build && bun run typecheck && bun test\` all exit 0; grep shows 0 lucide in src + 0 in package.json; the Icon default size is a fixed px. Report ok + filesChanged + verifyResult + summary + blockers. Repo-boundary: code only under frontend/packages/ui-kit.`,
  { label: 'phosphor-swap', schema: BUILD, model: 'opus' }
)
log(`phosphor swap: ${build?.ok ? 'BUILT' : 'BLOCKED ' + (build?.blockers ?? []).join('; ')}`)

phase('Verify render')
let verify = null
if (build?.ok) {
  verify = await agent(
    `Verify the Phosphor icon swap + sizing fix renders correctly. (1) \`cd ${UIKIT} && bun run build\`, then \`cd ${CURAOS} && bun install\`. (2) Start admin-app: \`cd ${CURAOS}/frontend/apps/admin-app && rm -rf .next && PORT=3000 NEXT_PUBLIC_USE_MOCK=true bun run dev\` (background), wait for Ready, curl /tenancy -> 200. (3) Fetch the rendered sidebar HTML: confirm nav icons are now Phosphor SVGs (not lucide), and check their rendered size is ~17-18px (look at the svg width/height/font-size in the markup), NOT oversized. Read the dev log for missing-icon / undefined errors. Stop the server. Report ok + verifyResult (what rendered + the icon sizes you observed) + summary + blockers.`,
    { label: 'verify-render', schema: BUILD, model: 'opus' }
  )
  log(`render: ${verify?.ok ? 'OK' : 'ISSUES ' + (verify?.blockers ?? []).join('; ')}`)
}

phase('Grill')
const grill = await agent(
  `Adversarially verify the @curaos/ui Phosphor icon swap at ${UIKIT}. (1) Does EVERY generator icon name resolve to a real Phosphor icon component (not undefined, not a fallback): ${ICON_NAMES}? Inspect the map. (2) ZERO lucide-react references remain in src + package.json (lucide fully removed)? (3) Is the Icon DEFAULT SIZE a fixed pixel value (~18px), not 1em/1.5em font-relative - so it cannot balloon? Check the component + a generated app's nav. (4) \`cd ${UIKIT} && bun run build && bun run typecheck && bun test\` exit 0. NO em/en-dashes. Default real=false if any name missing, lucide remains, or the size is still font-relative. Report target="phosphor-icons", real, verdict, issues.`,
  { label: 'grill:icons', schema: VERDICT, model: 'opus' }
)

return {
  swap: { ok: build?.ok, summary: build?.summary, blockers: build?.blockers },
  verify: verify ? { ok: verify.ok, verifyResult: verify.verifyResult } : 'skipped',
  grill: grill ? { real: grill.real, verdict: grill.verdict, issues: grill.issues } : null,
}
