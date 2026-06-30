export const meta = {
  name: 'v1-fe-wave',
  description: 'Drive the 20 v1 frontend apps to full Done-criteria functional parity per ADR-0219 (real wiring + depth + Playwright E2E + en/ar RTL i18n), generator-first. Each app already exists as a ~14%-functional Next.js shell (or RN for clinician/patient); the work is ENRICHMENT folded into the ui-app-emit / ui-app-native-emit generators, NOT scaffolding, NOT per-app hand edits. Each app wires to its now-merged backend contract via contract-mock (NEXT_PUBLIC_API_BASE_URL flip). Worktree-isolated lanes (each app = its own submodule). OpenDesign for any new widget/page (generator-ingestable). Zero special edits.',
  phases: [
    { title: 'Wire', detail: 'per app: assess shell + apply ADR-0219 P1-P5 generator-first + backend contract wiring + E2E + i18n + PR (parallel, worktree-isolated)' },
    { title: 'Verify', detail: 'adversarially verify a sample: flagship uses wired action pattern, E2E present, ar+RTL, contract-wired not toast-only' },
  ],
}

const TRACKER = 'your-org/curaos-ai-workspace'

const WIRED = { type: 'object', required: ['app', 'status'], properties: {
  app: { type: 'string' },
  status: { type: 'string', enum: ['done', 'partial', 'blocked', 'split'] },
  pr: { type: 'string' },
  phasesDone: { type: 'array', items: { type: 'string' }, description: 'which of P1-P5 landed' },
  wiredScreens: { type: 'array', items: { type: 'string' }, description: 'flagship/domain screens now wired to the real action pattern' },
  e2e: { type: 'boolean', description: 'Playwright e2e smoke present + wired' },
  i18n: { type: 'boolean', description: 'en + ar bundles + dir=rtl' },
  generatorEvolution: { type: 'string', description: 'what folded into ui-app-emit/ui-app-native-emit, or none' },
  openDesign: { type: 'string', description: 'OpenDesign-generated widgets/pages added (generator-ingestable), or none' },
  foresight: { type: 'array', items: { type: 'string' } },
  evidence: { type: 'string', description: 'build/typecheck/test tails + exit' },
  blocker: { type: 'string' } } }

const VERDICT = { type: 'object', required: ['app', 'real', 'verdict'], properties: {
  app: { type: 'string' }, real: { type: 'boolean' }, verdict: { type: 'string' },
  issues: { type: 'array', items: { type: 'string' } } } }

const HEAD =
  'Drive ONE CuraOS v1 frontend app to full Done-criteria functional parity per ADR-0219, GENERATOR-FIRST, in your ISOLATED worktree. The app ALREADY EXISTS as a ~14%-functional shell (UI renders, generic CRUD wired to actions/adminRequest live<->mock, but flagship screens are toast-only + no depth + no E2E + en-only). Your job is ENRICHMENT, not scaffolding.\n\n' +
  'READ FIRST (binding): the workspace ADR ai/curaos/docs/adr/0219-frontend-v1-functional-parity-program.md (the P1-P5 program) + the app per-module docs ai/curaos/frontend/apps/<app>/Requirements.md + CONTEXT.md (the Done-criteria). The backend contracts your app needs are NOW MERGED on curaos main (TypeSpec + SDK + replayable mocks per service).\n\n' +
  'THE BAR (ADR-0219, do as many phases as the app needs to hit parity):\n' +
  'P1 Flagship rewire + schema depth: make bespoke flagship screens use the WIRED action pattern (form -> create<Comp>/update<Comp> action -> adminRequest -> live-or-mock; toast = success CALLBACK, not a substitute for the call). Deepen the generic schema beyond name/status using the real backend contract fields.\n' +
  'P2 Real queries + deps + i18n: reads as useQuery with page/pageSize/search threaded; add @curaos/forms + @curaos/fhir-client where Requirements specify; LocaleProvider multi-locale + a real ar.json bundle + dir=rtl; unlock the Locale type.\n' +
  'P3 E2E: @playwright/test + playwright.config.ts + e2e/ smoke specs from the app Done-criteria happy path; wire the e2e script.\n' +
  'P4 Per-app domain depth: the irreducible flows the Requirements demand (e.g. workflow-designer BPMN in/out, front-office check-in->consent->queue, business-* save/approve/promote, personal-tracking location/geofence/SOS UI, admin tenant CRUD + plugin page, calendar availability+booking).\n' +
  'Backend wiring is CONTRACT-MOCK: wire the screens to the service REST shapes (the merged .tsp/SDK) with the replayable mock as the data source; live cutover is the NEXT_PUBLIC_API_BASE_URL flip (do not stand up live infra).\n\n' +
  'GENERATOR-FIRST, ZERO SPECIAL EDITS (binding, ADR-0219 decision 4 + [[curaos-generator-evolution-rule]]): any gap that appears in 2+ apps (a wiring pattern, an i18n scaffold, a Playwright config, a schema-from-contract emit, a flagship-screen action wiring) is a MOLD defect - fix it ONCE in tools/codegen/src/ui-app-emit.ts (web) or ui-app-native-emit.ts (RN) and regenerate, NOT a per-app hand edit. A genuinely singular screen may be hand-authored ONLY if it is generator-ingestable (regen reproduces it from config). Record what you folded in generatorEvolution. Bespoke hand-coded screens are the anti-pattern that produced the 14% shells.\n' +
  'DESIGN via OpenDesign ([[curaos-design-generation-rule]]): any NEW widget/page/design uses the OpenDesign od CLI + mcp__open-design__* MCP + design skills + online research, comply with the app + general design principles, output must be generator-ingestable config (regen reproduces it). Record in openDesign.\n\n' +
  'WORKFLOW:\n' +
  '1. You are in an isolated worktree; the app submodule is at <worktree>/curaos/frontend/apps/<app>. cd there, get on a clean main (git stash -u if dirty, git checkout main, git pull --ff-only). For RN apps the dir is the same; use ui-app-native-emit.\n' +
  '2. ASSESS the current shell: what renders, what is toast-only, what generic CRUD is wired, what depth/E2E/i18n is missing vs the Requirements Done-criteria. NOTE: some issue bodies are STALE (pre the fleet build-out, e.g. may say "delete the Flutter scaffold") - the app is already a Next.js/RN shell; assess the REAL current code, do not follow a stale instruction to re-scaffold.\n' +
  '3. Apply P1-P4 generator-first. When the generator (ui-app-emit/ui-app-native-emit) cannot yet emit a needed pattern, ENRICH the generator + drive the app from config + regen; do not fork into an app file. For a one-off flagship screen, make it generator-ingestable.\n' +
  '4. VERIFY: cd the app dir, run its build + typecheck + test (bun run build / tsc --noEmit / bun test or the app ci script) + the Playwright e2e smoke (bunx playwright test, or at least the config + spec compile). Paste tails + exit codes.\n' +
  '5. MIRROR DOCS: refresh ai/curaos/frontend/apps/<app>/Requirements.md + CONTEXT.md to the new state. NEVER put app docs inside the code submodule (repo-boundary).\n' +
  '6. COMMIT + PR: branch feat/v1-fe-<app>, conventional commit (NO em/en dashes, NO AI-attribution trailers), push, gh pr create with Closes #<issue> (issue is in ' + TRACKER + '). If the app generator change is shared (ui-app-emit), it lands in curaos (tools/codegen) - if so, open a SEPARATE curaos PR for the generator change + note both. Use env -u GITHUB_TOKEN gh.\n' +
  '7. NEVER push to main. NEVER --no-verify around a real failure (the pre-existing m10 typecheck gate, foresight #814, is the documented exception with green per-app gates pasted). If blocked on something genuinely external, status=blocked with the exact blocker.\n\n' +
  'Report: app, status (done|partial|blocked|split), pr, phasesDone (P1-P5), wiredScreens, e2e (bool), i18n (bool), generatorEvolution (folded into ui-app-emit/native or "none"), openDesign (widgets added or "none"), foresight, evidence (verify tails + exit), blocker. Repo-boundary: your app submodule + (if generator fold) tools/codegen + the ai/curaos mirror only.\n\n'

function appPrompt(u) {
  const gen = u.rn ? 'ui-app-native-emit.ts (gen:ui-app-native)' : 'ui-app-emit.ts (gen:ui-app)'
  return HEAD +
    'THIS LANE - app "' + u.app + '"' + (u.rn ? ' (React Native / Expo - use ' + gen + ')' : ' (Next.js web - use ' + gen + ')') +
    ', issue ' + TRACKER + '#' + u.issue + ', Target Version v1.\n\n' +
    'Fetch the issue body + ai/curaos/frontend/apps/' + u.app + '/Requirements.md yourself for the Done-criteria + backend deps.'
}

const DEFAULT_UNITS = [{"app": "front-office", "issue": 753, "rn": false}, {"app": "business-automation", "issue": 755, "rn": false}, {"app": "business-donation", "issue": 756, "rn": false}, {"app": "business-shop", "issue": 757, "rn": false}, {"app": "business-site", "issue": 758, "rn": false}, {"app": "business-workflow", "issue": 759, "rn": false}, {"app": "personal-automation", "issue": 760, "rn": false}, {"app": "personal-calendar", "issue": 761, "rn": false}, {"app": "personal-donation", "issue": 766, "rn": false}, {"app": "personal-notes", "issue": 767, "rn": false}, {"app": "personal-shop", "issue": 768, "rn": false}, {"app": "personal-site", "issue": 769, "rn": false}, {"app": "personal-tasks", "issue": 770, "rn": false}, {"app": "personal-tracking", "issue": 771, "rn": false}, {"app": "clinician-app", "issue": 772, "rn": true}, {"app": "patient-app", "issue": 773, "rn": true}]

const UNITS = (typeof args !== 'undefined' && args && Array.isArray(args.units)) ? args.units : DEFAULT_UNITS

phase('Wire')
// Batched fan-out (concurrency 6): 20 concurrent Opus lanes tripped the Anthropic
// server-side request limit (not usage quota) and failed the whole wave. Run in
// sequential batches of 6 so the in-flight lane count stays well under that cap.
// One retry per lane on a transient "temporarily limiting requests" error.
const FE_BATCH = 4
async function wireLane(u) {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const r = await agent(appPrompt(u), { label: 'wire:' + u.app, phase: 'Wire', model: 'opus', isolation: 'worktree', schema: WIRED })
      return { ...r, unit: u }
    } catch (e) {
      const msg = String((e && e.message) || e)
      if (attempt === 1 && /temporarily limiting|rate.?limit|overloaded|529|503/i.test(msg)) {
        log('retry wire:' + u.app + ' after transient server limit')
        continue
      }
      return { app: u.app, status: 'blocked', blocker: msg, pr: '', unit: u }
    }
  }
  return { app: u.app, status: 'blocked', blocker: 'rate-limited after retry', pr: '', unit: u }
}
const wired = []
for (let i = 0; i < UNITS.length; i += FE_BATCH) {
  const batch = UNITS.slice(i, i + FE_BATCH)
  log('fe wire batch ' + (Math.floor(i / FE_BATCH) + 1) + ': ' + batch.map((u) => u.app).join(', '))
  const res = await parallel(batch.map((u) => () => wireLane(u)))
  wired.push(...res.filter(Boolean))
}

const done = wired.filter((w) => w.status === 'done')
const partial = wired.filter((w) => w.status === 'partial')
const blocked = wired.filter((w) => w.status === 'blocked')
log('fe wire: ' + done.length + ' done, ' + partial.length + ' partial, ' + blocked.length + ' blocked of ' + UNITS.length)

phase('Verify')
const sample = [...done, ...partial].slice(0, 8)
const verdicts = await parallel(sample.map((w) => () =>
  agent(
    'Adversarially verify CuraOS frontend app "' + w.app + '" reached v1 functional parity (NOT just renders). Lane reported: status=' + w.status +
    ', phasesDone=' + JSON.stringify(w.phasesDone || []) + ', wiredScreens=' + JSON.stringify(w.wiredScreens || []) + ', e2e=' + w.e2e + ', i18n=' + w.i18n + ', PR=' + (w.pr || '') + '.\n\n' +
    'Check the PR diff via env -u GITHUB_TOKEN gh + the app code. Try to find the 14%-shell anti-patterns STILL present:\n' +
    '1. A flagship screen that is still TOAST-ONLY (a button that shows a success toast but never calls create/update -> adminRequest). Find one claimed-wired screen that is not actually wired to the action pattern.\n' +
    '2. e2e claimed but no real @playwright/test config + spec that exercises the Done-criteria happy path (an empty/stub e2e script does NOT count).\n' +
    '3. i18n claimed but no real ar.json bundle or no dir=rtl wiring (en-only LocaleProvider does NOT count).\n' +
    '4. Generic CRUD still name/status-only where the backend contract has real domain fields (no schema depth).\n' +
    '5. A bespoke hand-coded screen that is NOT generator-ingestable (violates zero-special-edits) - the generator could not reproduce it.\n' +
    '6. em/en dashes; AI-attribution trailers.\n' +
    'Default real=false if a claimed wired screen is still toast-only, e2e/i18n is a stub, or depth is absent. Report app="' + w.app + '", real, verdict, issues.',
    { label: 'verify:' + w.app, phase: 'Verify', model: 'opus', schema: VERDICT }
  ).catch(() => null)
)).then((r) => r.filter(Boolean))

return {
  wired: wired.map((w) => ({ app: w.app, status: w.status, pr: w.pr, phasesDone: w.phasesDone, e2e: w.e2e, i18n: w.i18n, generatorEvolution: w.generatorEvolution, openDesign: w.openDesign, blocker: w.blocker })),
  done: done.map((w) => w.app),
  partial: partial.map((w) => w.app),
  blocked: blocked.map((w) => ({ app: w.app, blocker: w.blocker })),
  verdicts: verdicts.map((v) => ({ app: v.app, real: v.real, issues: v.issues })),
  verifyFails: verdicts.filter((v) => !v.real).map((v) => ({ app: v.app, issues: v.issues })),
  allPRs: wired.flatMap((w) => w.pr ? [w.pr] : []),
  allForesight: wired.flatMap((w) => w.foresight || []).filter(Boolean),
  generatorEvolutions: wired.map((w) => ({ app: w.app, ge: w.generatorEvolution })).filter((x) => x.ge && x.ge !== 'none'),
}
