export const meta = {
  name: 'v1-fe-native-wave',
  description: 'Drive remaining v1 [v1][fe] apps to ADR-0219 Done-criteria parity (native Claude orchestration, per-app submodule PR)',
  phases: [
    { title: 'Wire', detail: 'one agent per app: P1 wired-actions + P2 i18n + P3 e2e + P4 depth, push branch + open PR' },
    { title: 'Verify', detail: 'adversarial T2: toast-vs-action ratio, real e2e spec, ar.json+dir=rtl' },
  ],
}

// Apps not yet in-flight (batch-1 personal-tasks/notes/shop run as separate direct agents).
// org = cura-care-oriented-stack for kebab web apps; RN apps live in your-org.
const APPS = (Array.isArray(args) && args.length ? args : [
  { app: 'business-site', issue: 758, org: 'cura-care-oriented-stack', rn: false },
  { app: 'business-workflow', issue: 759, org: 'cura-care-oriented-stack', rn: false },
  { app: 'personal-calendar', issue: 761, org: 'cura-care-oriented-stack', rn: false },
  { app: 'personal-automation', issue: 760, org: 'cura-care-oriented-stack', rn: false },
  { app: 'personal-donation', issue: 766, org: 'cura-care-oriented-stack', rn: false },
  { app: 'personal-site', issue: 769, org: 'cura-care-oriented-stack', rn: false },
  { app: 'personal-tracking', issue: 771, org: 'cura-care-oriented-stack', rn: false },
  { app: 'clinician-app', issue: 772, org: 'your-org', rn: true },
  { app: 'patient-app', issue: 773, org: 'your-org', rn: true },
])

const WORKSPACE_ROOT = process.env.CURAOS_WORKSPACE_ROOT || process.cwd()

const WIRE_SCHEMA = {
  type: 'object',
  required: ['app', 'status', 'branch', 'pr_url', 'action_calls', 'toast_calls', 'has_ar_json', 'has_dir_rtl', 'has_e2e', 'evidence'],
  properties: {
    app: { type: 'string' },
    status: { type: 'string', enum: ['pushed-pr-open', 'blocked', 'partial'] },
    branch: { type: 'string' },
    pr_url: { type: 'string' },
    action_calls: { type: 'number', description: 'count of UI call-sites invoking generated create*/update*/publish* actions via adminRequest' },
    toast_calls: { type: 'number', description: 'count of toast() calls remaining' },
    has_ar_json: { type: 'boolean' },
    has_dir_rtl: { type: 'boolean' },
    has_e2e: { type: 'boolean', description: 'real playwright.config.ts + e2e/*.spec.ts present' },
    evidence: { type: 'string', description: 'last 15 lines of typecheck+test exit-code paste' },
    blocker: { type: 'string' },
  },
}

const VERDICT_SCHEMA = {
  type: 'object',
  required: ['app', 'real', 'reasons'],
  properties: {
    app: { type: 'string' },
    real: { type: 'boolean', description: 'true only if actions >> toast (wired not toast-only), real e2e spec exists, ar.json + dir=rtl present, typecheck/test green' },
    action_calls: { type: 'number' },
    toast_calls: { type: 'number' },
    reasons: { type: 'string' },
  },
}

function wirePrompt(a) {
  const emit = a.rn ? 'gen:ui-app-native (ui-app-native-emit.ts)' : 'gen:ui-app (ui-app-emit.ts)'
  return [
    `You are a CuraOS v1 frontend parity worker. Bring app "${a.app}" to ADR-0219 Done-criteria parity and open a PR.`,
    '',
    `Issue: ${a.org}/curaos-ai-workspace#${a.issue}. First run: env -u GITHUB_TOKEN gh issue view ${a.issue} --repo your-org/curaos-ai-workspace --json title,body --jq .body  -- read its full Done-criteria.`,
    `Also read the app Requirements at ${WORKSPACE_ROOT}/ai/curaos/frontend/apps/${a.app}/Requirements.md for the per-app Done-criteria list (if present).`,
    '',
    'CLONE + BRANCH (clean, collision-free, your own checkout):',
    `  cd /tmp && rm -rf fe-${a.app} && git clone git@github.com:${a.org}/${a.app}.git fe-${a.app} && cd fe-${a.app}`,
    `  git checkout -b feat/v1-parity-${a.app}`,
    '',
    'THE BAR (from frontend-v1-coverage-matrix.md + ADR-0219). The generators already emit the wired pattern; your job is to USE it + add depth:',
    'P1 - WIRE FLAGSHIP CALL-SITES (the dominant defect): every UI mutation currently ends in toast()+setLocal(). Rewire each to call the generated src/actions/*-service.ts action (create*/update*/publish*) which goes through adminRequest -> live-or-mock (NEXT_PUBLIC_API_BASE_URL flip). toast() becomes the SUCCESS CALLBACK, never the substitute. Deepen the generic schema beyond name/status where the domain contract is known.',
    'P2 - i18n: LocaleProvider multi-locale; add an ar.json bundle (real translations, mirror keys of en.json); dir=rtl when locale=ar; unlock the Locale type. If the generator can emit this, regenerate via ' + emit + ' and fold the fix there (generator-first, zero special edits per ADR-0219 decision 4). Hand-add only if singular.',
    'P3 - E2E: real @playwright/test dep + playwright.config.ts + e2e/*.spec.ts smoke covering the Done-criteria happy path; wire the e2e script. NOT a stub.',
    'P4 - DOMAIN DEPTH: the irreducible per-app flows named in the issue Done-criteria (e.g. public booking page, approval gate, connector catalogue, location/geofence/SOS for personal-tracking, etc.).',
    a.rn ? 'RN NOTE: this is a React Native Expo app. Use the ui-app-native generator + Maestro/RN-equivalent e2e where Playwright does not apply; wire actions identically.' : '',
    '',
    'GENERATOR-FIRST (binding, ADR-0219 decision 4 + [[curaos-generator-evolution-rule]]): any gap that appears in 2+ apps is a MOLD defect -- fix it once in ' + WORKSPACE_ROOT + '/curaos/tools/codegen/src/' + (a.rn ? 'ui-app-native-emit.ts' : 'ui-app-emit.ts') + ' and regenerate, NOT a per-app hand edit. If you must hand-edit, justify it as singular in the PR body and note the generator gap as FORESIGHT.',
    '',
    'VERIFY (must be green before PR): run the app gates:',
    '  bun install --frozen-lockfile || bun install',
    '  bun run typecheck   (or: bunx tsc --noEmit)',
    '  bun test',
    a.rn ? '' : '  bun run build',
    'Capture the LAST 15 LINES + exit code of typecheck and test verbatim for the evidence field.',
    '',
    'COMMIT + PUSH + PR (do this yourself):',
    '  git add -A && git commit -m "feat: v1 functional parity (wiring + depth + i18n + e2e)"',
    `  git push -u origin feat/v1-parity-${a.app}`,
    `  env -u GITHUB_TOKEN gh pr create --repo ${a.org}/${a.app} --base main --head feat/v1-parity-${a.app} --title "feat: v1 functional parity (wiring + depth + i18n + e2e)" --body "Closes your-org/curaos-ai-workspace#${a.issue}. P1 wired actions >> toast, P2 ar.json+RTL, P3 Playwright e2e, P4 domain depth. <paste verification evidence here>"`,
    '',
    'HARD RULES: no em/en dashes anywhere (use - , ; : or parens). No AI-attribution commit trailers. Never push to main. Conventional commit. If blocked on push/auth, still report the local branch + run status.',
    '',
    'Return ONLY the structured object: app, status, branch, pr_url, action_calls (count UI call-sites now invoking generated actions via adminRequest), toast_calls (remaining toast() count), has_ar_json, has_dir_rtl, has_e2e, evidence (the 15-line exit-code paste), blocker if any.',
  ].filter(Boolean).join('\n')
}

function verifyPrompt(a, w) {
  return [
    `Adversarially verify the v1 parity PR for app "${a.app}": ${w.pr_url}`,
    `Inspect the diff: env -u GITHUB_TOKEN gh pr diff ${w.pr_url} 2>/dev/null  (or clone the branch ${w.branch}).`,
    'Default to real=FALSE unless ALL hold (skeptic stance):',
    '1. WIRED not toast-only: UI mutation call-sites invoke generated create*/update*/publish* actions through adminRequest. action_calls must clearly exceed remaining toast-only writes. A diff that only adds toasts or only renders is NOT wired -> real=false.',
    '2. REAL e2e: playwright.config.ts + at least one e2e/*.spec.ts with actual page interactions (not an empty/placeholder spec). RN apps: equivalent Maestro/RN e2e.',
    '3. i18n: ar.json bundle with real keys (not an empty {} stub) AND dir=rtl wired for ar locale.',
    '4. Gates green: the PR body / worker evidence shows typecheck + test passing with exit 0.',
    'Count action_calls and toast_calls yourself from the diff. Report real (bool), action_calls, toast_calls, reasons (cite specific files/lines).',
  ].join('\n')
}

phase('Wire')
log(`Native FE wave: ${APPS.length} apps -> P1-P4 parity + PR (6 concurrent cap)`)

const results = await pipeline(
  APPS,
  (a) => agent(wirePrompt(a), { label: `wire:${a.app}`, phase: 'Wire', schema: WIRE_SCHEMA, model: 'opus', effort: 'high' }),
  (w, a) => {
    if (!w || w.status === 'blocked' || !w.pr_url) return { app: a.app, wire: w, verdict: { app: a.app, real: false, reasons: 'no PR / blocked' } }
    return agent(verifyPrompt(a, w), { label: `verify:${a.app}`, phase: 'Verify', schema: VERDICT_SCHEMA, model: 'opus', effort: 'high' })
      .then((v) => ({ app: a.app, wire: w, verdict: v || { app: a.app, real: false, reasons: 'verify returned null' } }))
  }
)

const clean = results.filter(Boolean)
const merged_ready = clean.filter((r) => r.verdict && r.verdict.real && r.wire && r.wire.pr_url)
log(`Wire+verify done: ${merged_ready.length}/${APPS.length} verified-real and ready to merge`)

return {
  total: APPS.length,
  ready_to_merge: merged_ready.map((r) => ({ app: r.app, pr_url: r.wire.pr_url, branch: r.wire.branch, issue: APPS.find((a) => a.app === r.app)?.issue, action_calls: r.verdict.action_calls, toast_calls: r.verdict.toast_calls })),
  needs_attention: clean.filter((r) => !(r.verdict && r.verdict.real)).map((r) => ({ app: r.app, pr_url: r.wire?.pr_url, reasons: r.verdict?.reasons, blocker: r.wire?.blocker })),
}
