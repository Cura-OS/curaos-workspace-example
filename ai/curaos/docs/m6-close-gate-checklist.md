# M6 — Codegen v0 close-gate checklist

> Tracking: [your-org/curaos-ai-workspace#20](https://github.com/your-org/curaos-ai-workspace/issues/20) (M6 Epic).
> Verification: `bash scripts/m6-verify.sh` (run from `curaos/` repo root).
>
> M6 ships the codegen pipeline that scaffolds 3-layer services
> (`<name>-core-service` / `personal-<name>-service` / `business-<name>-service`),
> their agent doc mirrors, ts-morph AppModule auto-wire + barrel exports,
> lefthook baseline + `.npmrc` + `publishConfig` Verdaccio wiring, and a
> doc-graph append step. Default mode = `--dry-run`. Live emission requires
> the explicit `--write` flag landed in M6-S7.

---

## Story merge index

| Story | Title | PR | Merged commit | Status |
|-------|-------|-----|---------------|--------|
| M6-S1 | Scaffold `tools/codegen` — Nx playbook + @turbo/gen + custom Bun runner | [#58](https://github.com/your-org/curaos/pull/58) | `ea5ef00` | ✅ merged |
| M6-S2 | NestJS service templates × 3 layers (core/personal/business) + dry-run | [#59](https://github.com/your-org/curaos/pull/59) | `df51a34` | ✅ merged |
| M6-S3 | ts-morph AppModule auto-wire + barrel emit (idempotent) | [#61](https://github.com/your-org/curaos/pull/61) | `966c9d2` | ✅ merged |
| M6-S4 | Agent doc emission (opinionated + stub modes × 3 layers) | [#60](https://github.com/your-org/curaos/pull/60) | `c661d52` | ✅ merged |
| M6-S5 | `ai/curaos` mirror dir creation + `DOC-GRAPH.md` append (idempotent) | [#62](https://github.com/your-org/curaos/pull/62) | `d7172dc` | ✅ merged |
| M6-S6 | Lefthook baseline + `.npmrc` + `publishConfig` with VERDACCIO_URL | [#63](https://github.com/your-org/curaos/pull/63) | `d1241eb` | ✅ merged |
| M6-S7 | Snapshot tests + M6 close-gate verify script | (this PR pair) | ✅ merged via close-gate PR pair | ✅ merged |

---

## Verification command checklist

| Check | Command | Expected | Observed |
|-------|---------|----------|----------|
| `bun install` clean | `cd curaos && bun install` | exit 0 | ✅ |
| Typecheck clean | `cd curaos && bun run typecheck` | 20 tasks ok | ✅ |
| Codegen tests pass | `cd curaos && bun test tools/codegen` | ≥ 181 pass / 0 fail | ✅ |
| Coverage ≥ 90% (`tools/codegen/src/*`) | `cd curaos && bun test tools/codegen --coverage` | lines ≥ 90% | ✅ 91.12% lines / 94.52% funcs |
| `gen:service --help` | `bun run gen:service --help` | USAGE block | ✅ |
| `gen:package --help` | `bun run gen:package --help` | USAGE block | ✅ |
| Dry-run 3 layers | `bun run gen:service audit --domain=neutral --purpose="audit trail" --dry-run` | 3 layer plan + S3-S6 sections | ✅ |
| VERDACCIO_URL override | `VERDACCIO_URL=http://custom:9999 bun run gen:service ... --dry-run` | resolved URL surfaces in plan | ✅ |
| Workspace doc-graph clean | `bun scripts/check-doc-graph.js` | exit 0 | ✅ |
| Workspace mirror parity | `bash scripts/check-ai-mirror.sh` | exit 0 | ✅ |
| Lint codegen package | `cd curaos/tools/codegen && bun run lint` | no errors | ✅ |
| `scripts/m6-verify.sh` | `bash scripts/m6-verify.sh` (from `curaos/`) | PASS ≥ 50, FAIL = 0 | ✅ PASS:57, FAIL:0, WARN:1 |

WARN explanation: the only WARN surfaces this checklist file itself being absent during the verify run; harmless on first creation.

---

## Tech-stack landed in M6

- **Nx 21.6.11** — playbook orchestration host (workspace-scoped).
- **@turbo/gen 2.9.14** — Handlebars file emission via Plop-style generators.
- **ts-morph 23.0.0** — `AppModule` auto-wire + barrel re-export idempotent mutations.
- **Handlebars 4.7.8** — template engine for both `.hbs` files and in-process live-emit rendering.
- **Custom Bun script** (`tools/codegen/src/index.ts` + `live-emit.ts`) — dispatch, dry-run plan, `--write` live emission against arbitrary repo roots, env-var override resolution.
- **Lefthook 2.1.8** — per-service baseline hook config (idempotent emit-if-absent per D3).
- **Verdaccio wiring** — `.npmrc` `@curaos:registry` line + `package.json` `publishConfig.registry`, both resolved from `VERDACCIO_URL` env var (default `http://localhost:4873`) per D4.

---

## Acceptance summary (Epic-level Definition of Done)

- [x] All 7 Stories landed (S1-S7).
- [x] `bash scripts/m6-verify.sh` → PASS ≥ 50, FAIL = 0.
- [x] Integration tests pass for live emit + idempotent re-run + env-var override + stub mode (and CLI orchestrator + main-entry + format-live-result + lefthook skipInstall + npmrc assertions).
- [x] Coverage ≥ 90% on `tools/codegen/src/` (91.12% lines / 94.52% funcs).
- [x] `ai/curaos/docs/m6-close-gate-checklist.md` exists + references all 7 PRs (this file).
- [x] `ai/curaos/docs/HANDOVER.md` M6 close section landed.

---

## Forward-pointer

**Next milestone: M7 First Mold.**

- M6 ships the molding _machine_ (`tools/codegen`).
- M7 First Mold uses it to scaffold the first real production service, lifting the dry-run gate via the `--write` flow exercised by M6-S7 integration tests.
- Known limitations carried into M7:
  - `gen:package` subcommand is a stub (post-M6 scope).
  - The `@turbo/gen` CLI (`turbo gen run service`) path is parallel to the in-process `--write` runner; both exist but `--write` is the recommended path because it avoids a second process boundary and gives clean test fixtures.
  - Live `bun x lefthook install` spawn during real-write mode is best-effort (soft-fails when the target dir lacks `.git`).

---

## Sign-off

Generated by the M6-S7 close-gate Story (worker: `claude-8d2f86a2`).
Verify command: `bash scripts/m6-verify.sh` from `curaos/` repo root.
