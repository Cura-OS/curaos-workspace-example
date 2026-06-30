# M7 — First Mold Output close-gate checklist

> Tracking: [your-org/curaos-ai-workspace#21](https://github.com/your-org/curaos-ai-workspace/issues/21) (M7 Epic).
> Close-gate Story: [your-org/curaos-ai-workspace#77](https://github.com/your-org/curaos-ai-workspace/issues/77) (M7-S8).
> Verification: `bash scripts/m7-verify.sh` (run from workspace repo root — `curaos/` is the same checkout).
>
> M7 proves the generic → vertical pattern by scaffolding the first real
> production trio (`patient-core-service` + `personal-patient-service` +
> `business-patient-service`) via M6 codegen, layering the
> `healthstack-patient-service` vertical overlay on top, wiring the M5 BPM
> admission saga across both, surfacing the schema in the `builder-studio`
> RJSF builder via `@curaos/patient-contracts`, enforcing auth/role
> guards, and emitting a tamper-evident audit chain for every PHI event.

---

## Story merge index

| Story | Title | PR | Merged commit | Status |
|-------|-------|-----|---------------|--------|
| M7-S1 | Populate `patient-core-service` scaffold via M6 codegen `--write` | [curaos#67](https://github.com/your-org/curaos/pull/67) + [curaos#66](https://github.com/your-org/curaos/pull/66) + [curaos#65](https://github.com/your-org/curaos/pull/65) | `1c51b62` / `e060d79` / `064be3a` | ✅ merged |
| M7-S2 | `patient-core-service` neutral schema + CRUD + outbox | [curaos#68](https://github.com/your-org/curaos/pull/68) | `aaef1bb` | ✅ merged |
| M7-S2.1 | Generator-evolution: inline NestJS decorator metadata in service tsconfig templates | [curaos#69](https://github.com/your-org/curaos/pull/69) | `4fd23f0` | ✅ merged |
| M7-S2.2 | Generator-evolution: trio templates emit plural REST convention + bump patient pointers | [curaos#71](https://github.com/your-org/curaos/pull/71) | `17132e3` | ✅ merged |
| M7-S3 | `healthstack-patient-service` overlay schema + view + bump | [curaos#70](https://github.com/your-org/curaos/pull/70) | `ea25e87` | ✅ merged |
| M7-S3.1 | Generator-evolution: emit `audit-event.schema.ts` trio + scope superRefine PHI scrub to VALUE fields | [curaos#72](https://github.com/your-org/curaos/pull/72) | `e7ff832` | ✅ merged |
| M7-S4 | M5 BPM patient admission workflow + cross-topic saga + healthstack/workflow pointer bump | [curaos#73](https://github.com/your-org/curaos/pull/73) | `9b8d77b` | ✅ merged |
| M7-S5 | `@curaos/patient-contracts` + bump healthstack/builder-studio pointers | [curaos#75](https://github.com/your-org/curaos/pull/75) | `5c4f4dd` | ✅ merged |
| M7-S5.1 | Generator-evolution: emit `AuthModule + AuthGuard + RolesGuard` scaffold trio by default | [curaos#77](https://github.com/your-org/curaos/pull/77) | `d500f32` | ✅ merged |
| M7-S5.2 | healthstack env-var-gate test fixture fix + pointer bump | [curaos#78](https://github.com/your-org/curaos/pull/78) | `b8bb947` | ✅ merged |
| M7-S5.3 | `publish-patient-contracts` workflow + restricted access | [curaos#79](https://github.com/your-org/curaos/pull/79) | `04e692f` | ✅ merged |
| M7-S5.4 | Generator-evolution: fold audit-chain durability stack into trio template | [curaos#81](https://github.com/your-org/curaos/pull/81) | `5d15be3` | ✅ merged |
| M7-S6 | M3 auth role enforcement on patient endpoints (cycle-3 approved) | [curaos#80](https://github.com/your-org/curaos/pull/80) | `a50fa9f` | ✅ merged |
| M7-S7 | Audit chain end-to-end + PHI envelope assertion (cycle-3 audit chain durability + per-resource lock) | merged via pointer bump `1ddc3b7` | `1ddc3b7` | ✅ merged |
| M7-S8 | M7 close-gate verify + dep-cruiser CI guard + HANDOVER | (this PR pair) | ✅ merged via close-gate PR pair | ✅ merged |

---

## Decisions honored (per [`m7-user-decisions.md`](m7-user-decisions.md))

| Decision | Pick | Where landed |
|----------|------|--------------|
| D1 — schema extension | C. Separate overlay schema + FK + view | `patient-core-service` `core.patients` table + `healthstack-patient-service` `healthstack.patients` table + `patients_full` view |
| D2 — Kafka topic strategy | B. Separate topic per layer | `curaos.core.patient.*.v1` + `curaos.healthstack.patient.*.v1` (S4 saga + S5/S6 publishing) |
| D3 — modulith loading | A. Static import + env-var conditional `imports[]` | `CURAOS_OVERLAY_HEALTHSTACK` env var conditional in modulith app + standalone-mode direct import |
| D4 — builder schema consumption | C. Hybrid (compile-time base + runtime overlay) | `@curaos/patient-contracts` published to Verdaccio (S5/S5.3) + RJSF runtime overlay fetch in `builder-studio` |
| D5 — audit envelope | Reference-only envelope with SHA-256 hash chain (IHE BALP-aligned) | M7-S7 + S5.4 generator-evolution folded `previousHash + hash` chain + PHI tripwire (S3.1 + audit-sdk superRefine) |

---

## Verification command checklist

| Check | Command | Expected | Observed |
|-------|---------|----------|----------|
| `bun install` clean | `bun install` | exit 0 | ✅ |
| Patient trio submodules registered | `grep -q patient-core-service .gitmodules && grep -q personal-patient-service .gitmodules && grep -q business-patient-service .gitmodules` | exit 0 | ✅ |
| HealthStack overlay submodule registered | `grep -q healthstack-patient-service .gitmodules` | exit 0 | ✅ |
| `@curaos/patient-contracts` package present | `[ -d backend/packages/patient-contracts ]` | exit 0 | ✅ |
| `publish-patient-contracts` workflow present | `[ -f .github/workflows/publish-patient-contracts.yml ]` | exit 0 | ✅ |
| dep-cruiser `no-neutral-to-vertical` rule wired | `grep -q no-neutral-to-vertical .dependency-cruiser.cjs` | exit 0 | ✅ |
| dep-cruiser `no-patient-core-to-healthstack` guard wired (M7-S8) | `grep -q no-patient-core-to-healthstack .dependency-cruiser.cjs` | exit 0 | ✅ (added in paired curaos PR) |
| Generator-evolution fold-backs in codegen templates | inspect `tools/codegen/templates/` for plural REST, audit-event schema scrub, AuthModule scaffold, audit-chain durability | present | ✅ (S2.2 / S3.1 / S5.1 / S5.4) |
| Workspace doc-graph clean | `bun scripts/check-doc-graph.js` | exit 0 | ✅ |
| Workspace mirror parity | `bash scripts/check-ai-mirror.sh` | exit 0 | ✅ |
| `scripts/m7-verify.sh` | `bash scripts/m7-verify.sh` (from workspace root) | PASS ≥ 35, FAIL = 0, WARN ≤ 2 | ✅ PASS:42, FAIL:0, WARN:2 (run on paired curaos PR branch) |
| Generator-evolution sweep | gh search for open `priority:critical` M7 generator-evolution issues | 0 open | ✅ (M7-S6.1 #120 is `priority:high`, not critical; #119 + #124 are normal followups) |

WARN explanation: the two WARNs from `scripts/m7-verify.sh` on the paired curaos PR come from `scripts/check-doc-graph.js` + `scripts/check-ai-mirror.sh` not being present on the curaos repo checkout (they live on the workspace repo). Both run clean from this workspace branch.

---

## Tech-stack landed in M7

- **`patient-core-service` (neutral)** — NestJS 11 + Drizzle 0.45.x against `core.patients` (no PHI columns). Generated by M6 codegen `--write` (M7-S1) and populated with schema + CRUD + outbox + barrel exports (M7-S2). Plural REST barrel convention applied via S2.2 generator-evolution.
- **`healthstack-patient-service` (vertical overlay)** — separate `healthstack.patients` schema with FK to `core.patients(id) ON DELETE CASCADE`, encryption-at-rest for PHI columns, `patients_full` view for read ergonomics (D1). Modulith loads via `CURAOS_OVERLAY_HEALTHSTACK=true` env-var gated `imports[]` (D3). Auth/role enforcement (M7-S6).
- **`workflow-core-service` (BPM saga)** — M5 admission workflow gates on `PatientRegistered` (core topic) before publishing `PatientAdmitted` (healthstack topic). Cross-topic ordering via `X-Correlation-ID` header (D2 + M7-S4).
- **`builder-studio` (RJSF builder)** — hybrid contract consumption: compile-time `@curaos/patient-contracts` (semver-pinned via Verdaccio) + runtime `GET /api/v1/contracts/patient?overlay=healthstack` for tenant-specific overlay fields (D4 + M7-S5). Degraded mode banner when overlay fetch fails.
- **`@curaos/patient-contracts` package** — JSON Schema Draft-07 export generated from Drizzle introspection of `core.patients`. Published to Verdaccio under restricted access via `.github/workflows/publish-patient-contracts.yml` (M7-S5 + S5.3).
- **Auth scaffold trio (default-emitted by codegen)** — `AuthModule + AuthGuard + RolesGuard` now part of every M6 codegen scaffold per S5.1 fold-back; applied to patient endpoints by M7-S6.
- **Audit chain (IHE BALP-aligned, D5)** — reference-only envelope with `previousHash + hash = SHA-256(eventId + occurredAt + resourceId + previousHash)`. 7-year retention on `curaos.core.audit.event.v1`. `changedFields` carries names only; PHI tripwire via audit-sdk `superRefine` scoped to VALUE fields (S3.1 generator-evolution).

---

## Generator-evolution rule honored

Per [[curaos-generator-evolution-rule]], every uncovered edge case observed during M7 implementation folded back into `tools/codegen/`:

- **S2.1** — NestJS decorator metadata flags inlined into `service-{core,personal,business}` tsconfig templates so new scaffolds typecheck out of the box.
- **S2.2** — trio templates emit plural REST convention + barrel exports.
- **S3.1** — `audit-event.schema.ts` trio emitted; superRefine PHI scrub scoped to VALUE fields (not field names) to avoid false-positive blocks on `changedFields: ['gender']`-style metadata.
- **S5.1** — `AuthModule + AuthGuard + RolesGuard` scaffold emitted by default in every new service.
- **S5.4** — audit-chain durability stack (per-resource advisory lock + `previousHash` chain) folded into trio template.

No local-only hot-fixes shipped during M7. Trio symmetry (core/personal/business + healthstack overlay) preserved.

---

## Acceptance summary (Epic-level Definition of Done)

- [x] All 7 child Stories landed (S1-S7) plus 7 generator-evolution Stories (S2.1, S2.2, S3.1, S5.1, S5.2, S5.3, S5.4).
- [x] `bash scripts/m7-verify.sh` → FAIL = 0; PASS:42; WARN:2 (within ≤ 2 budget).
- [x] dep-cruiser `no-patient-core-to-healthstack` rule wired (paired curaos PR) on top of existing `no-neutral-to-vertical`. Both fail CI on direction violation.
- [x] `@curaos/patient-contracts` builds + publishes via Verdaccio workflow.
- [x] `ai/curaos/docs/m7-close-gate-checklist.md` references all 14 PRs (this file).
- [x] `ai/curaos/docs/HANDOVER.md` M7 close section landed.
- [x] M7 Epic ([curaos-ai-workspace#21](https://github.com/your-org/curaos-ai-workspace/issues/21)) closed with `STATUS: wave-done` comment.

---

## Known limitations carried forward

| # | Item | Tracker | Action |
|---|------|---------|--------|
| 1 | HS256 fallback may accept symmetric tokens in dev mode (auth scaffold edge case) | [curaos-ai-workspace#120](https://github.com/your-org/curaos-ai-workspace/issues/120) (M7-S6.1, `priority:high`) | Fix in M8 hardening cycle |
| 2 | healthstack outbox pattern not yet ported from patient-core | [curaos-ai-workspace#124](https://github.com/your-org/curaos-ai-workspace/issues/124) (M7-S7.1) | Port in early M8 or M9 |
| 3 | Six P2 partials from S7 grills | tracked as deferred followups (non-blocking for close-gate) | Triage during M8 planning |
| 4 | codegen fold for M7-S6 principal-actor pattern | [curaos-ai-workspace#119](https://github.com/your-org/curaos-ai-workspace/issues/119) | Schedule with M9 identity/party cluster |

None block M8 entry.

---

## Forward-pointer

**Next milestone: M8 Core Air-Gap Bundle (Zarf self-hosted install).** M7 proved that:

- M6 codegen can scaffold a real production trio in `--write` mode (M7-S1, M7-S2).
- The neutral → vertical extension pattern works at the schema, topic, modulith-loading, and builder layers (D1-D4).
- Auth + audit guard rails hold across the trio + overlay path (S5.1, S6, S7, D5).

M8 picks up the deployment story: a single Zarf bundle that installs the M7-landed services into an air-gapped K3s + Cilium + CNPG + Kafka cluster ([curaos-ai-workspace#22](https://github.com/your-org/curaos-ai-workspace/issues/22)). M9 then re-generates `identity-service` via Strangler Fig + builds the diamond party/org/audit cluster ([curaos-ai-workspace#23](https://github.com/your-org/curaos-ai-workspace/issues/23)).

---

## Sign-off

Generated by the M7-S8 close-gate Story.
Verify command: `bash scripts/m7-verify.sh` from workspace repo root.
