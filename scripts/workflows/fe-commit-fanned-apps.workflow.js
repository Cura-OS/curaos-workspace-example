export const meta = {
  name: 'fe-commit-fanned-apps',
  description: 'Commit + branch + push the 17 generated Next.js web app submodules (currently uncommitted on main) onto feature branches, no secrets/build artifacts. Each app is its own git repo so this is collision-free in parallel. Reports per-app commit SHA + push status.',
  phases: [
    { title: 'Commit apps', detail: 'branch off main + commit generated app + push, per submodule (parallel)' },
  ],
}

const CURAOS = decodeURIComponent(new URL('../..', import.meta.url).pathname).slice(0, -1) + '/curaos'

const APPS = [
  'workflow-designer', 'front-office', 'fleet-manager',
  'business-automation', 'business-donation', 'business-shop', 'business-site', 'business-workflow',
  'personal-automation', 'personal-calendar', 'personal-donation', 'personal-notes',
  'personal-shop', 'personal-site', 'personal-tasks', 'personal-tracking', 'personal-workflow',
]

const RESULT = {
  type: 'object',
  required: ['app', 'ok', 'detail'],
  properties: {
    app: { type: 'string' },
    ok: { type: 'boolean' },
    branch: { type: 'string' },
    sha: { type: 'string' },
    detail: { type: 'string' },
  },
}

phase('Commit apps')
const results = await parallel(
  APPS.map((app) => () =>
    agent(
      `Commit the generated Next.js web app submodule "${app}" onto a feature branch and push it. Repo dir: ${CURAOS}/frontend/apps/${app} (a git submodule, currently on the default branch \`main\` with the generated app uncommitted).
Steps (run inside the submodule dir):
1. \`git checkout -b feat/${app}-ui-scaffold\` (NEVER commit to main directly). If the branch already exists, check it out.
2. SAFETY: confirm the generated .gitignore covers .next/, node_modules/, .env.local. Run \`git status --short\` and confirm NO .env.local, no node_modules/, no .next/ is about to be staged (.env.local.example IS allowed - it carries no secret). If any real secret or build artifact would be staged, STOP and report ok:false with the offending path.
3. \`git add -A\` then \`git commit -m "feat(${app}): scaffold Next.js app via gen:ui-app"\` with a body: "Generated production-depth app: per-screen list + [id] detail + create/edit forms (react-hook-form + zod) + server actions + filters + pagination + loading/error states + role guards + KPI dashboard + i18n + mock-first offline render. OIDC code-exchange + jose session + dev CSP + self-hosted Inter." Use Conventional Commits, NO AI-attribution trailers, NO em-dashes.
4. \`git push -u origin feat/${app}-ui-scaffold\`.
VERIFY: \`git log --oneline -1\` shows your commit; \`git rev-parse HEAD\` for the SHA; push succeeded (paste the push tail). Report app, ok, branch, sha, detail (one line: files committed + push result). If push fails (auth/network), report ok:false with the error - do NOT retry destructively.`,
      { label: `commit:${app}`, phase: 'Commit apps', schema: RESULT, model: 'sonnet' }
    )
  )
).then((r) => r.filter(Boolean))

return {
  committed: results.filter((r) => r.ok).map((r) => ({ app: r.app, branch: r.branch, sha: r.sha })),
  failed: results.filter((r) => !r.ok).map((r) => ({ app: r.app, detail: r.detail })),
  total: APPS.length,
  okCount: results.filter((r) => r.ok).length,
}
