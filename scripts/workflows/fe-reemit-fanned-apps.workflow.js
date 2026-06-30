export const meta = {
  name: 'fe-reemit-fanned-apps',
  description: 'Re-emit the 17 fanned Next.js web apps from the now-fixed gen:ui-app generator (3 dev-render fixes: hooks import @tanstack directly, api-client consumed as dist, mock-session seeds on invalid token). Idempotent --write skips existing files, so delete the affected api/auth/config layer first, regen, build-verify (typecheck + next build exit 0), commit + push. Each app is its own repo (parallel-safe).',
  phases: [
    { title: 'Re-emit', detail: 'delete affected layer + regen + build + commit + push, per app (parallel)' },
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
    built: { type: 'boolean' },
    pushed: { type: 'boolean' },
    detail: { type: 'string' },
    blockers: { type: 'array', items: { type: 'string' } },
  },
}

phase('Re-emit')
const results = await parallel(
  APPS.map((app) => () =>
    agent(
      `Re-emit the Next.js web app "${app}" from the FIXED gen:ui-app generator and verify it builds + renders, then commit. Repo dir: ${CURAOS}/frontend/apps/${app} (git submodule, already on branch feat/${app}-ui-scaffold with the OLD generated code committed). The generator fixed 3 dev-render defects; the app's committed files predate them.
Steps:
1. cd ${CURAOS}/frontend/apps/${app}. Confirm on branch feat/${app}-ui-scaffold (git checkout it if needed; NEVER main).
2. Delete the files the fixes touch so the idempotent --write re-emits them fresh: \`rm -f src/api/admin-hooks.ts src/api/client.ts src/api/config.ts src/api/admin-fetch.ts src/api/Providers.tsx src/api/mock-data.ts src/auth/session.ts next.config.mjs\`.
3. \`cd ${CURAOS} && bun run gen:ui-app ${app} --write\` to re-emit them. Then \`bun install\` from ${CURAOS} (root).
4. VERIFY BUILD (paste real tails, exit 0 only): \`cd ${CURAOS}/frontend/apps/${app} && rm -rf .next && bun run typecheck && bun run build\` BOTH exit 0. The build route table should list list + [id] detail routes per screen.
5. Sanity-check the fixes landed: admin-hooks.ts imports useQuery from "@tanstack/react-query" (NOT "@curaos/api-client"); next.config.mjs transpilePackages is ["@curaos/ui","@curaos/api-client","@curaos/auth-sdk"] with only the @curaos/ui$ src alias; session.ts seeds mockSession when the token is absent OR invalid.
6. COMMIT + PUSH: \`git add -A\` (confirm no .env.local / node_modules / .next staged - .env.local.example is fine), \`git commit -m "fix(${app}): re-emit from generator with dev-render fixes (hooks/SDK/mock-session)"\` (Conventional Commits, no AI trailers, no em-dashes), \`git push origin feat/${app}-ui-scaffold\`.
Report app, ok, built (typecheck+build exit 0), pushed, detail (one line), blockers. Repo-boundary: code only under this app. Do NOT touch other apps or the parent. If build fails, report the exact error in blockers - do NOT mask it.`,
      { label: `reemit:${app}`, phase: 'Re-emit', schema: RESULT, model: 'sonnet' }
    )
  )
).then((r) => r.filter(Boolean))

return {
  total: APPS.length,
  built: results.filter((r) => r.built).map((r) => r.app),
  pushed: results.filter((r) => r.pushed).map((r) => r.app),
  failed: results.filter((r) => !r.ok || !r.built).map((r) => ({ app: r.app, blockers: r.blockers, detail: r.detail })),
}
