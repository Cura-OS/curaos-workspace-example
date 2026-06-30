# Grill — M15-S2 #511 synthetic watermarked demo-tenant seed

- **Subject:** `your-org/curaos-ai-workspace#511`
- **Harness:** Claude → Codex (opposite-harness adversarial planning review, read-only)
- **Date:** 2026-06-06
- **Verdict:** READY for one AFK run. No critical/user-escalation flags fired. All decision points carried recommended answers → auto-applied per [[curaos-recommendation-auto-apply-rule]].

## Reviewer output (condensed)

**Missing questions (resolved with conservative defaults):**
- Seed size → small deterministic fixture: 1 tenant, 2 patients, 2 encounters, 2 courses, 2 commerce orders (enough to demo cross-domain without masking edge cases).
- Output target → deterministic JSON manifest artifact, **no DB/API mutation** (a seed *generator*, not a *loader*; loading is the onboarding wizard S5 / demo tenant S7 job).
- Root CLI script → add `demo-seed` script, keep direct `bun tools/demo-seed/src/index.ts` working.

**Docs/ADR conflicts (DESIGN-CRITICAL, applied):**
1. **`scanForPhi` flags watermarked names/DOBs.** The watermark gate must (a) assert the watermark first, then (b) scan ONLY the *unwatermarked* leaf values for real-PHI shapes. A raw whole-entity scan would false-reject every synthetic patient.
2. **`assertReferenceOnlyEnvelope` is for neutral/reference-only cross-domain link payloads, NOT for PHI-bearing health demo entities.** Use it only on the cross-domain link payloads (which MUST be PHI-free), never on the health entities themselves.
3. Live Synthea (Java) stays **env-gated**; CI uses committed Synthea-shaped FHIR R4 sample bundles — same posture as the env-gated Presidio sidecar.
4. Strict service DTOs reject unknown `__synthetic`/`__watermark` keys → keep watermark metadata in the seed wrapper; a future importer strips it at the adapter boundary.

**Glossary:** reuse `HealthStack overlay` / `neutral` / `reference-only` / `tenant_ref` / `patient_ref`; say "synthetic PHI-shaped values", not "realistic PHI". Name the package by responsibility (`demo-seed`), not by milestone/story.

**Hidden deps/subtasks:** workspace package + lock update; ai-docs mirror under `ai/curaos/tools/demo-seed/`; committed FHIR R4 sample bundles; test matrix (determinism snapshot, missing-watermark reject, unwatermarked-real-PHI reject, cross-domain PHI-leak reject, CLI smoke).

**Decision points → auto-applied (recommended answers from codebase/design):**
- Package: `tools/demo-seed` / `@curaos/demo-seed` / `private:true` / `type:module` / Bun scripts mirroring `tools/codegen`.
- Deps: `@faker-js/faker`, `fishery`, `@types/fhir`, `@curaos/healthstack-phi-boundary: workspace:*` (versions = latest stable resolved via `bun add`, exact-pinned per [[curaos-version-pinning-rule]]).
- Determinism: `faker.seed(N)` + `faker.setDefaultRefDate(<fixed ISO>)`; never relative-date APIs without a ref date.
- Watermark shape: wrapper `{ __synthetic: true, __watermark: { token: "SYNTHETIC-DEMO", seed, source } }` + visible per-domain field markers.
- Gate: NEW `assertSyntheticWatermarkedEntity` in demo-seed; REUSE `scanForPhi` / `InMemoryPresidioScrubber` / `assertReferenceOnlyEnvelope`; do NOT alter the phi-boundary package (DRY — single PHI-vocabulary owner).
- Output: deterministic JSON manifest, no service writes.

**User-escalation candidates (none triggered):** DB/API write into a real tenant; committing a large generated Synthea corpus; running Java Synthea in CI; mutating the phi-boundary package API — all explicitly OUT of this plan, so no escalation needed.

## Resolution

Auto-applied all recommendations (logged in `ai/curaos/docs/adr/AUTO-DECISION-LOG.md`). Proceed to TDD.
