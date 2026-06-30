# Grill — M10 #278 @curaos/notify-sdk (PR pending)

- **Date:** 2026-06-02
- **Direction:** Claude → Codex (opposite-harness, read-only, effort=high)
- **Scope:** planning recipe `ai/curaos/docs/research/2026-06-02-notify-sdk-recipe.md` + issue #278
- **Verdict:** No critical blockers. No user-escalation candidates. All decision
  points carry docs/code-backed recommendations → auto-applied per
  `ai/rules/curaos_recommendation_auto_apply_rule.md`.

## Auto-applied recommendations (Codex item 6 + conflicts)

1. **Commit generated `src/rest/*.gen.ts` + `src/events.gen.ts`; publish `dist`
   only.** Drift guard depends on committed `src`; patient-contracts precedent
   commits `src`, publishes `dist` via `files: ["dist"]`. Do NOT gitignore
   generated src.
2. **Manifest matches actual precedent, not ADR-0209 tsup text:** `tsc` build,
   `"type": "commonjs"`, `main/types → dist`, `files: ["dist"]`,
   `publishConfig.access: "restricted"` + `registry: http://localhost:4873`.
   ADR-0209's tsup/ESM+CJS + `backend/libs/` path is historical drift; current
   `backend/packages/*` + `tsc` precedent wins.
3. **Drift test:** sound ONLY with exact-pinned generator deps + committed
   lockfile. Failure message must say "contract drift OR generator-version
   drift; run `bun run generate` under locked deps."
4. **Verdaccio publish:** routine path = validate config + `bun pm pack` tarball
   (dry-run). Real publish stays manual / not a routine CI gate. (Verdaccio IS
   running here, so I additionally attempt a live publish + report honestly.)
5. **Consumer smoke:** in-repo import is necessary but insufficient — add an
   external packed-tarball install smoke (`bun pm pack` → temp project →
   import) as the "published package usable without workspace symlink" proof.
6. **Sibling recipe:** land notify-sdk as the reference; propose `gen:sdk
   <service>` codegen command as a generator-evolution follow-up BEFORE #279-284
   hand-copy.
7. **#306 nullable:** proceed (parser tolerates, types generate). README +
   event types note nullability is narrowed (`string` not `string | null`)
   until #306 backfills the 2020-12 `type: [..., "null"]` form. Not blocking.

## Conflicts resolved (Codex items 2-3)

- Path: `backend/packages/notify-sdk` (current) over ADR-0209 `backend/libs`.
- Build: `tsc`/CJS over ADR-0209 tsup/ESM+CJS (matches patient-contracts).
- ADR-0209 DoD (SBOM + cosign) NOT claimed for this lane — out of scope; not in
  issue acceptance.
- Convention: `specs/` not `contracts/` (#303 grill fixed this) — recipe already
  uses `specs/`.
- Glossary: "zero consumer-side code" → precise meaning "zero hand-written
  transport/client code"; "event types" → "event payload/header wire types".

## Hidden deps applied (Codex item 4)

- AI mirror docs `ai/curaos/backend/packages/notify-sdk/{AGENTS,CONTEXT,Requirements}.md`.
- Root-lock the 4 generator deps (exact-pinned): `@hey-api/openapi-ts@0.98.1`,
  `@hey-api/client-fetch@0.13.1`, `@asyncapi/parser@3.6.0`,
  `json-schema-to-typescript@15.0.4`. Syncpack alignment.
- Gates to pre-flight: `publint`, `syncpack`, `knip`, `depcruise` (check
  generated `src/rest` for cycles — there is an existing `@hey-api` carve-out
  for builder-sdk `generated/{client,core}`; match or add narrow path carve-out).

## Note

Codex could not reach `api.github.com` to read the issue body live; it reviewed
the recipe + local docs. Issue #278 acceptance verified independently by the
implementer via `gh issue view 278` (body matches the recipe's acceptance).
