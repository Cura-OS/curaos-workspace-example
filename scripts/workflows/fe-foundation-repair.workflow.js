export const meta = {
  name: 'fe-foundation-repair',
  description: 'Fix the 2 broken foundation deliverables the grill caught: api-client @types/react JSX dup (1 tsc error) and gen:ui-app emitter contract drift (7 tsc errors in generated apps). Re-verify with a fresh generated app + add generator test coverage.',
  phases: [
    { title: 'Repair', detail: 'api-client tsc fix + gen:ui-app template contract fixes (parallel)' },
    { title: 'Verify', detail: 'fresh-generate an app + typecheck both packages + the generated app' },
  ],
}
const CURAOS = decodeURIComponent(new URL('../..', import.meta.url).pathname).slice(0, -1) + '/curaos'

phase('Repair')
const FIX = {
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

const repairs = await parallel([
  // A) api-client: single blocking tsc error - ApolloProvider JSX type from duplicate @types/react.
  () => agent(
    `Fix the ONE blocking typecheck error in ${CURAOS}/frontend/packages/api-client: \`src/graphql/provider.tsx:41 TS2786 'ApolloProvider' cannot be used as a JSX component\`. Root cause (confirmed): duplicate @types/react in the tree (a hoisted 19.1.8 in the bun store vs the package-pinned 19.1.0) makes the two ReactNode types incompatible at the Apollo provider boundary.
Fix the RIGHT way: align @types/react to a single version across the api-client package + its peers so there is one React type identity (pin @types/react to match the workspace standard the other frontend packages use - check frontend/packages/ui-kit + frontend/apps/builder-studio for the agreed version; do NOT just cast to any). If a bun \`overrides\`/resolution at the frontend workspace root is the correct lever, use it. Avoid \`as any\` / @ts-ignore.
VERIFY (paste the REAL tail, re-run live, do not trust stale dist/): \`cd ${CURAOS}/frontend/packages/api-client && bun run typecheck && bun run build\` BOTH exit 0. Note: tsc emits JS even on type error (no noEmitOnError), so a present dist/ is NOT proof - only a zero exit code is. Report ok + filesChanged + verifyResult + summary + blockers. Repo-boundary: code only under frontend/packages/api-client (+ a root resolution if needed).`,
    { label: 'fix:api-client', phase: 'Repair', schema: FIX, model: 'opus' }
  ),
  // B) gen:ui-app emitter: contract drift - fix templates to the REAL ui-kit/api-client signatures + session + add a generator test.
  () => agent(
    `Fix the gen:ui-app emitter at ${CURAOS}/tools/codegen/src/ui-app-emit.ts so a freshly generated app TYPE-CHECKS. The grill found 7 tsc errors = contract drift between the emitter's templates and the REAL package APIs. Fix each against the ACTUAL signatures (verify them in the source, do not guess):
1. DataTableColumn (frontend/packages/ui-kit/src/components/data-table.tsx): requires \`key: string; header: ReactNode; cell: (row:T)=>ReactNode\`. renderScreenList emits only {key,header} - add a real \`cell\` for every column.
2. Drawer (ui-kit drawer.tsx): prop is \`onOpenChange:(open:boolean)=>void\`, NOT \`onClose\`. Fix the generated create-drawer wiring.
3. configureRestClients (frontend/packages/api-client/src/config.ts): options are \`{ restBaseUrl?, graphqlUrl? }\`, NOT \`{ baseUrl, authToken }\`. Fix renderApiClient's emitted call (auth token flows via the api-client's getAuthToken provider, not a config field - wire it correctly).
4. providers.tsx React 19 ReactNode TS2322 on CuraQueryProvider children - fix the children typing.
5. auth session: src/auth/session.ts dynamic-imports \`validateJwt\` from @curaos/auth-sdk which exports NO such symbol (only createAuthClient). Rewrite the emitted session resolver to use the REAL auth-sdk surface (createAuthClient) so a valid session does NOT always redirect to /login. Verify @curaos/auth-sdk's actual exports first.
6. Add GENERATOR TEST COVERAGE: a __tests__ test that generates ui-app for a fixture app + asserts the emitted files (snapshot or key-assertions) so this contract drift is caught in CI (generator-evolution rule >=90%).
Then COMMIT ui-app-emit.ts + the index.ts wiring (currently UNTRACKED on feat/fe-p0-sdks-verdaccio) with a conventional message.
VERIFY (paste real tails): (a) \`cd ${CURAOS} && bun run gen:ui-app admin-app\` dry-run clean; (b) generate into a TEMP/throwaway app dir + run that app's \`tsc --noEmit\` -> 0 errors; (c) the new generator test passes. Report ok + filesChanged + verifyResult + summary + blockers.`,
    { label: 'fix:gen-ui-app', phase: 'Repair', schema: FIX, model: 'opus' }
  ),
]).then((r) => r.filter(Boolean))

log(`repairs: ${repairs.filter((r) => r?.ok).length}/${repairs.length} ok`)

phase('Verify')
const VERDICT = {
  type: 'object',
  required: ['allGreen', 'results', 'verdict'],
  properties: {
    allGreen: { type: 'boolean' },
    results: { type: 'array', items: { type: 'object', additionalProperties: true } },
    verdict: { type: 'string' },
  },
}
const verify = await agent(
  `Adversarially re-verify the foundation on disk (the build agents over-claimed before; trust only live exit codes). Run + paste the REAL tail of each, report pass/fail per item:
1. \`cd ${CURAOS}/frontend/packages/ui-kit && bun run build && bun run typecheck\` (was green - confirm still green).
2. \`cd ${CURAOS}/frontend/packages/api-client && bun run typecheck && bun run build\` (was BROKEN - must now exit 0).
3. \`cd ${CURAOS} && bun run gen:ui-app admin-app\` dry-run clean.
4. Generate ui-app into a throwaway temp app + run its \`tsc --noEmit\` -> MUST be 0 errors (was 7).
5. The new gen:ui-app generator test passes.
6. \`cd ${CURAOS}/frontend/apps/admin-app && bun run build && bun run typecheck\` (was green - confirm).
A present dist/ is NOT proof (tsc emits on error); only a 0 exit code counts. Report allGreen (all of 1-6 pass), results (per item: name + pass + the exit/tail), verdict. Default to fail if uncertain.`,
  { label: 'verify-foundation', phase: 'Verify', schema: VERDICT, model: 'opus' }
)

return {
  repairs: repairs.map((r) => ({ label: r?.label, ok: r?.ok, summary: r?.summary, blockers: r?.blockers })),
  verify: { allGreen: verify?.allGreen, verdict: verify?.verdict, results: verify?.results },
}
