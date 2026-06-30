# Codex grill — M10 #302 jose@6 ESM-vs-CommonJS runtime crash (curaos-ai-workspace#302, curaos PR #174)

> Cross-harness adversarial review per [[curaos-verification-stack-rule]] Tier-2.

## Verdict: PASS (false-positive verdict upheld) — orchestrator-self-verified

**Codex dispatch status:** Codex (`codex exec -m gpt-5-codex -c model_reasoning_effort=high --sandbox read-only`)
was dispatched against the false-positive verdict + the regression-guard plan. The Codex process
ran but produced no output within the bounded wait window (~18 min, zero bytes to the
`--output-last-message` file — a known stall on full read-only monorepo scans). Per the
one-task grill rule ("Codex stalls → default model effort high, else verify directly +
orchestrator-verified note + OPEN PR anyway"), the orchestrator performed the adversarial
verification directly. The findings below are the orchestrator's own adversarial pass — every
angle Codex would probe was checked against the repo.

## The claim under review

CodeRabbit (#302, Critical): *"jose@6 is ESM-only but the mold sets `"type":"commonjs"` →
`require('jose')` throws `ERR_REQUIRE_ESM` at runtime on every scaffolded service."*

## Adversarial verification — tried to BREAK the false-positive verdict

The verdict only holds if **no code path runs the compiled `dist/` under a Node runtime**.
Every such path was checked:

1. **Production service runtime** — every service Dockerfile (`backend/services/*/Dockerfile`)
   and every mold trio template (`templates/service-{core,personal,business}/Dockerfile.hbs`)
   runs `ENTRYPOINT ["bun", "run", "dist/main.js"]` (identity-service: `CMD ["bun", "dist/main.js"]`).
   **Bun, never Node.** ✅ no Node path.
2. **Migrator runtime** — `Dockerfile.migrator.hbs` inherits `["/sbin/tini", "--", "bun", "run",
   "run-migrations.ts"]` and does not touch jose/auth. ✅ Bun, no jose.
3. **Repo-wide grep** — `rg 'node +\.?/?dist|node +src/|node main\.js'` across `backend ops tools
   .github` → **zero hits.** No `node dist` anywhere. ✅
4. **Compose / K8s / Zarf overrides** — no `command:`/`entrypoint:` override under `ops/` introduces
   a Node runtime. ✅
5. **`curaos_bun_primary_rule.md`** — explicitly mandates Bun as the JS runtime ("Bun runs NestJS
   apps directly"). Running compiled dist under Node would *violate* the rule, not be a supported path. ✅
6. **Empirical proof** — loaded the actual compiled `notify-service/dist/auth/jwt-verifier.js`
   (which contains `const jose_1 = require("jose")` at line 34) under `bun` from the service WORKDIR:
   `require` OK, `buildJwtVerifierFromEnv` constructs a `JwtVerifier`, **no `ERR_REQUIRE_ESM`**. jose
   resolves to `jose@6.2.3`. ✅

**Conclusion:** the verdict survives the adversarial pass. There is no Node-runtime path; the runtime
is Bun, whose CJS↔ESM interop resolves `require()` of the ESM-only jose@6 transparently.
`ERR_REQUIRE_ESM` is a Node-specific error code Bun never emits. #302 is a **false positive** under
the actual runtime.

## P0 findings (block merge)

None.

## P1 findings (must address before merge)

None. The minimal correct action is a regression-guard test (no mold source change), which is what the PR does.

## P2 findings (followups acceptable)

1. **Defense-in-depth note** — the safety rests on the Bun entrypoint. The guard test locks that
   entrypoint (`bun run dist/main.js`, trio-symmetric) + `type:commonjs` + the empirical
   `require('jose')` proof, so any future flip to `node dist/main.js` fails the gate. No further
   action required; the contract is now pinned.

## What the verdict got right (counter-balance)

1. Correctly identified that the runtime — not the build (`tsc` emits `require("jose")` either way)
   — is the load-bearing fact, and that the runtime is Bun.
2. Correctly refused the naive "flip to `type:module`" fix, which would break the NestJS
   reflect-metadata decorator/DI graph the modulith depends on (identity-service proves CJS+jose
   works under Bun).
3. Correctly scoped the deliverable to a regression-guard test + false-positive closure rather than
   a mold source change, avoiding a no-op churn of all trio templates.

---

_If Codex output later lands, append a `## Re-grill verification` section here with its verdict._
