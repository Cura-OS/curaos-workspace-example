# Grill — m10-307 Verdaccio publisher (tiered) — Claude→Codex opposite-harness

- **Issue:** your-org/curaos-ai-workspace#307
- **Implementer harness:** Claude (Opus 4.8 1M)
- **Reviewer harness:** Codex (`codex exec`, read-only, default model, effort high)
- **Date:** 2026-06-03
- **Scope:** ops/dev/verdaccio 3-tier publish policy + programmatic curaos-ci provisioner + 7 SDK publish-smoke wiring
- **Verdict:** No critical flags. All decision points carried codebase-backed recommendations (auto-applied per [[curaos-recommendation-auto-apply-rule]]); zero user-escalation candidates.

## Reviewer findings + resolution

| # | Finding | Resolution |
|---|---|---|
| 1 | Verdaccio does NOT support arbitrary `$VAR` interpolation in package access/publish groups (verdaccio.org/docs/env lists fixed env vars only). `publish: $CURAOS_PUBLISH_GROUP` would silently not bind. | **Applied.** Two explicit config files: `config.yaml` (DEV anon-publish) + `config.authed.yaml` (STAGING/LIVE curaos-ci), selected by compose `VERDACCIO_CONFIG`. Logged AUTO-DECISION-LOG row 1. |
| 2 | DEV anon group: use `$all`, not `$anonymous` — `$anonymous` denies logged-in dev clients. | **Applied.** `publish: $all` on the DEV `@curaos/*` block. AUTO-DECISION-LOG row 2. |
| 3 | Do NOT commit an `_authToken` line into the persistent `.npmrc` (gitleaks finding + secret leak). Existing workflows generate a temp `.npmrc` at publish time (`scripts/m2-package-publishing.mjs` `npmrcForRegistry`, `.github/workflows/publish-packages.yml`). | **Applied.** `scripts/sdk-package-publishing.mjs` reuses the M2 temp-`.npmrc` + `NODE_AUTH_TOKEN` pattern. No token committed. AUTO-DECISION-LOG row 3. |
| 4 | `htpasswd -bB` leaks the password via argv (`ps`). Prefer stdin. | **Applied.** Provisioner uses `htpasswd -niBC 12 <user>` with the password on STDIN; pure-Bun bcrypt fallback when the binary is absent. |
| 5 | Tracked `htpasswd` cannot safely receive generated secret hashes. | **Applied.** Tracked `htpasswd` is comment-only seed; provisioner writes the gitignored `htpasswd.generated` (the compose mount target). |
| 6 | `.gitignore` does not ignore `.env`; `.env.example` empty. | **Applied.** Added `.env`/`.env.local`/`.env.*.local` + `ops/dev/verdaccio/htpasswd.generated` to `.gitignore`; populated `.env.example` with placeholders. |
| 7 | `turbo.json` had no `publish-smoke` task + no `NODE_AUTH_TOKEN`/`VERDACCIO_URL` env pass-through. | **Applied.** Added `publish-smoke` turbo task with `env: [VERDACCIO_URL, NODE_AUTH_TOKEN, VERDACCIO_CONFIG]`. |
| 8 | Persistent Verdaccio storage + `unpublish:false` → repeated `0.1.0` smoke publishes collide. | **Applied.** publish-smoke publishes a unique `<base>-smoke.<epoch>` version and restores the manifest afterward. |
| 9 | Generator-Evolution: fold the `publish-smoke` script into `tools/codegen/src/sdk-emit.ts`, not just the 7 hand-written manifests. | **Applied.** Added to `renderPackageJson` + snapshot test in `sdk-emit.test.ts`. |
| 10 | Glossary: "token" overloaded. Use `VERDACCIO_CI_PASSWORD` (htpasswd login) vs `NODE_AUTH_TOKEN` (npm publish). | **Applied.** Provisioner reads `VERDACCIO_CI_PASSWORD`; publish-smoke reads `NODE_AUTH_TOKEN`, matching the `VERDACCIO_TOKEN` secret convention in publish-packages.yml. |
| 11 | README claimed "@curaos/* reads require authentication" — conflicts with binding anon-read decision. | **Applied.** README rewritten with the 3-tier table; anon-read everywhere documented. |

## User-escalation candidates

None. Reviewer item 7 (genuine escalation) returned empty: the binding user decision covers anon reads + 3-tier publish, and every remaining choice had a clear codebase recommendation.
