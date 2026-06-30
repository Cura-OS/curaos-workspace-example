---
name: curaos-bun-compile-rule
title: Bun compile packaging (single-binary services, local==live compile parity)
description: Backend services ship as `bun build --compile` single binaries on a shared runtime base; one canonical compile-flags source shared by local verify + image build + CI; coding constraints that keep services compile-safe; native-addon (.node) escape; mandatory local smoke test with the SAME compile flags before any image build
paths:
  - "curaos/backend/services/**"
  - "curaos/tools/codegen/templates/service-*/Dockerfile.hbs"
  - "curaos/tools/codegen/src/live-emit.ts"
  - "curaos/tools/build/**"
  - "curaos/backend/services/**/src/main.ts"
metadata:
  type: rule
---

# Bun compile packaging rule

<!-- fold: rationale, non-binding -->

Backend NestJS services ship as a single self-contained binary produced by `bun build --compile`, not as an image carrying `node_modules` + `dist` + source. One image = one sealed binary on a shared runtime base. This kills per-service `bun install` (the frozen-lockfile fragility), the multi-GB build cache that caused the 2026-06-27 disk-pressure fleet eviction, and ships no interpretable source. See [[curaos-bun-compile-packaging]] for the proven spike + research.

## 1. ONE canonical compile-flags source (local == CI == image)

There is exactly ONE definition of the compile command, in `tools/build/bun-compile.sh` (or `tools/build/compile-flags.ts` exporting the arg array). EVERY consumer calls it: the local verify script, the Dockerfile build stage (via the same script copied into the build context), and CI. NEVER hand-write `bun build --compile ...` flags in a second place; drift between local and image compile = local verification that does not predict live behavior, which is the whole failure this rule prevents.

Canonical flags (the script owns these, do not duplicate):
```
bun build --compile \
  --target=<TARGET> \           # bun-linux-x64-baseline for the Hetzner/k3d runtime (see §5)
  --minify --sourcemap --bytecode \
  ./src/main.ts --outfile <svc> \
  $(derive-externals <svc>)     # see §3 - DERIVED, never hand-listed
```

Local verify and the image build MUST pass the identical TARGET, externals, and flags. The local smoke test (§4) compiles with the SAME target as the image so the binary executed locally is byte-for-byte the runtime artifact's behavior (modulo CPU baseline).

## 2. Coding constraints that keep a service compile-safe

`bun --compile` statically resolves every `import`/`require` at BUILD time. Code that defeats static resolution either fails the build or silently drops a module. To stay compile-safe:

- **No dynamic `require(variable)` / `import(variable)` with a non-literal specifier** in service code. Dynamic import is allowed ONLY with a string literal bun can see. A computed specifier becomes an unbundled hole that crashes at runtime.
- **No reliance on on-disk file layout at runtime**: no `__dirname`/`process.cwd()`-relative `readFileSync` of source/asset files expecting the repo tree. Embedded assets must be imported (bun embeds them) or loaded from a mounted path/configmap, never assumed present next to a binary that has no source tree. Use `import ... with { type: "file" }` / `Bun.file(import.meta.dir + ...)` patterns the bundler understands, or ship the asset in the image explicitly.
- **Validation = Zod** (per [[curaos-validation-rule]]); `class-validator`/`class-transformer` stay BANNED. They are in the externalized-absent set (§3); importing them would force them into the bundle and break the parity assumption.
- **Default Nest adapter = `@nestjs/platform-express`** (installed, bundled). Do NOT add `@nestjs/microservices`, `@nestjs/websockets`, `@nestjs/graphql`, or any transport package as a real dependency without updating §3 handling first; they are externalized today precisely because nothing depends on them.
- **`import 'reflect-metadata'` stays the first line of `main.ts`** (decorator metadata). bun 1.3 native decorators handle the rest.
- **Env-factory stores keep refusing InMemory at runtime** (durable Postgres required); this is unaffected by compile and must stay (it is the data-truth guard).

## 3. Externals are DERIVED, never hand-maintained

The external set = (packages NestJS core/common reference via `loadPackage`/`optionalRequire`/`loadAdapter`) MINUS (packages present in the resolved dependency tree). Extract the nest optional-require targets with:
```
grep -rhoE "(loadPackage|optionalRequire|loadAdapter)\)\('[^']+'" <@nestjs/core> <@nestjs/common> | grep -oE "'[^']+'$" | tr -d "'" | sort -u
```
A package on that list that is NOT installed -> `--external` it (provably unreachable, identical to today's `bun run` which also lacks it). A package on that list that IS installed (e.g. `@nestjs/platform-express`) -> BUNDLE it (omit from external). The `derive-externals` helper computes this per service at build time. A build-time assertion MUST fail loudly if a name in the external set actually resolves in `node_modules` (means it should be bundled, not externalized). Hand-edited external lists are forbidden - they are exactly the flaky failure mode this rule exists to kill.

## 4. MANDATORY local smoke test with the SAME compile flags (verify-before-build)

Before ANY image build or deploy, the service binary MUST be compiled locally with the canonical script (§1) and pass a smoke test, per [[curaos-verify-before-build-rule]]:
1. Compile with the canonical flags + the service's derived externals + the runtime TARGET.
2. Run the binary with REAL env (DATABASE_URL to a local seeded Postgres, JWT secret).
3. Assert: process boots (NestFactory completes DI), `GET /healthz` = 200, and at least one authed real-data route returns seeded rows (not empty, not 5xx).
A binary missing something it needs FAILS this test loudly here, not silently in prod. This local run is the contract: same compile flags + same target => same runtime behavior as live. `tools/build/verify-service-binary.sh <svc>` performs steps 1-3 and is the gate; CI runs it; agents run it before proposing an image build. No green smoke test => no image, no deploy.

## 5. Native addons (.node) escape pathway

`bun --compile` cannot embed native `.node` binaries. Services depending on native addons (detected by the existing `GLIBC_DEP_PREFIXES` set: `@temporalio/`, `sharp`, `@swc/`, `better-sqlite3`) MUST:
- `--external` the native package(s) AND ship the addon's runtime files beside the binary (glibc base, copy the package's compiled `.node` + its JS shim from the build stage), OR
- fall back to the legacy `dist + node_modules` image for that specific service (the shared-base+copy-dist pathway).
Pick per service; the generator selects the escape automatically from `GLIBC_DEP_PREFIXES`. Currently only `workflow-core-service` and `education-organization-service` (both `@temporalio/*`) need this. Use `--target=bun-linux-x64-baseline` for the k3d/Hetzner runtime unless the host CPU is confirmed AVX2 (else "Illegal instruction" crashes); the local smoke test on the same baseline target catches this.

## 6. Runtime base + image shape

One shared minimal runtime base (the pinned `oven/bun` digest; glibc variant for native-addon services, alpine otherwise) built once. Per-service runtime stage = `FROM <base>; COPY --from=build <binary>; USER bun; ENTRYPOINT ["<binary>"]`. No `bun install`, no `node_modules`, no `dist`, no source in the runtime image. Generator-owned in `tools/codegen/templates/service-*/Dockerfile.hbs` + `live-emit.ts`; never hand-edit a single service's Dockerfile (see [[curaos-generator-evolution-rule]]).

Links: [[curaos-bun-compile-packaging]] [[curaos-verify-before-build-rule]] [[curaos-generator-evolution-rule]] [[curaos-validation-rule]] [[curaos-bun-primary-rule]] [[curaos-image-build-rule]]
