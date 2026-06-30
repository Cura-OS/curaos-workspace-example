# Codex grill — M9-S5 audit-core-service wave (S5.1/S5.2/S5.4/S5.5)

> Cross-harness adversarial grills (Claude orchestrator → Codex), Tier-2 per
> [[curaos-verification-stack-rule]]. The M9-S5 wave scaffolds audit-core-service + its consumer +
> tiered retention + the identity coupling. HIGH-BLAST-RADIUS (PHI boundary + HIPAA + new submodule
> + codegen template changes). Parent #102. Unblocked by #99 Phase D closing (local-staging gauge
> green accepted per maintainer directive 2026-05-31; see AUTO-DECISION-LOG).

Design: `ai/curaos/docs/research/m9-s5-audit-core-service.md` (5-task split S5.1-S5.5).

## S5.1 — scaffold (curaos PR #152 → `fcfe15d`, issue #247) — APPROVE
audit-core-service scaffolded **core-only** (NOT a trio). The worker caught a real architecture
conflict: the sub-issue said "trio symmetry mandatory" but ADR-0210 (line 19) names party/org/audit
as three NEUTRAL ROOTS (single services) + `.gitmodules` confirms party-core/org-core scaffolded
core-only. Independently verified; core-only auto-applied + logged (AUTO-DECISION-LOG). The worker
fixed **3 generator mold defects** (fold-back per [[curaos-generator-evolution-rule]]):
`--core-only` flag (so future neutral roots don't hand-discard), a latent **AuthModule-import bug**
every fresh core service hit (controller `@UseGuards` without the module import → `JWT_VERIFIER`
unresolvable → e2e bootstrap fail; party-core only passed because hand-patched), unused-import lint
cleanup. **Grill APPROVE:** `--core-only` correct + trio-default preserved, AuthModule fix
non-breaking (party-core/org-core already had it — template now aligns), audit-core inherits the
PHI gate/hash chain unweakened, submodule + bun.lock sound, no new defect. CI 89 turbo tasks / 0 fail.

## S5.2 — kafka consumer + chain re-validation (audit-core-service PR #1 → `810942a`, #248) — APPROVE (2 cycles)
NET-NEW kafkajs consumer for `curaos.core.audit.event.v1`; re-validates the SHA-256 chain against
the canonical `audit_chain_heads` (no re-impl), PHI-gates each envelope, emits chain.verified/broken.v1,
fail-closed. **Round 1 REQUEST-CHANGES — 3 real defects:**
1. **HIGH — redelivery false-break.** Kafka is at-least-once; a VALID redelivered event (head already
   advanced to its `hash`) carries the old `previousHash` → continuity check wrongly emitted
   `chain.broken.v1`. Normal redelivery would false-alarm.
2. **HIGH — PHI bypass via exported `validate()`.** The public typed `validate()` (exported in
   index.ts) mutated the store WITHOUT the Zod reference-only gate (only `validateRaw` gated) → a
   typed caller bypasses PHI rejection.
3. **MEDIUM — offset commit ordering** unverifiable (no explicit commit strategy) → crash-after-CAS-
   before-commit → redelivery → defect 1.
**Round 2 fix (`197b835`) — APPROVE:** idempotent redelivery (`storedHead === hash` → verified no-op,
no re-advance, no broken — and the idempotent-accept is NON-exploitable: `hash` is derived from the
event body before the equality check, so an attacker can't forge a body hashing to the stored head
without it being the same event); both entry points now run the PHI schema gate before any store
mutation; explicit process-then-commit ordering. Genuine fork/tamper STILL caught. 2 new tests
load-bearing (red-pre/green-post). CI 34 pass / 0 fail.

## S5.4 — tiered-retention config (curaos PR #153 → `72544ae` + runbook #251, #249) — APPROVE
KIP-405 hot 90d local query window → SeaweedFS S3 cold tier for the HIPAA tail. **Grill APPROVE:**
retention math correct (`local.retention.ms`=7,776,000,000=exactly 90d ≤ `retention.ms`=220,898,664,000
which EXCEEDS the 7-exact-year floor 220,752,000,000 with ~1.7-day margin; HIPAA §164.530(j) mandates
6y → met with margin); air-gap pins tiering OFF (untouched `redpanda.yaml` keeps
`cloud_storage_enabled=false`; no external audit egress offline); **SeaweedFS not MinIO** (ADR-0163
DA13 Q6 AGPLv3 air-gap); per-tenant override raise-only above the floor (can't shorten below HIPAA);
no new defect. (Codex corrected the orchestrator's prompt which overstated the floor gap ~1000×.)

## S5.5 — identity uniqueness migration (identity-service PR #62 → `242d11a`, #250) — APPROVE
Forward-only PARTIAL `UNIQUE (tenant_id, external_subject, issuer) WHERE external_subject IS NOT NULL
AND issuer IS NOT NULL` on `identities` (ADR-0210 §S5; #99 closed → issuer shape pinned). **Grill
APPROVE:** partial predicate correct (nulls unconstrained, full federation identities unique,
cross-tenant allowed, half-null unconstrained); forward-only + idempotent (`IF NOT EXISTS`); folded
into BOTH shared + per-tenant schema-ensure; schema.ts Drizzle index matches the SQL; test
load-bearing (dup-rejected/null-allowed/cross-tenant proven vs live PG); no cross-service src import.
CI 376 pass / 0 fail.

## Pointer chain (M9-S5 wave)
workspace `<this>` → curaos `414d79b` (= #153 ops `72544ae` + #154 pointer bumps) → audit-core
`810942a` (S5.2) + identity-service `242d11a` (S5.5). curaos `fcfe15d` (S5.1 scaffold) carried in.

## Remaining S5 work
- **S5.3 = #244** (audit-outbox + replayer) — the heavy multi-day durable-messaging piece + the
  generator fold-back. `needs-triage` (a `needs-decision` on the `markReplayComplete` host wiring per
  `06-RECOMMENDED-GATE-DESIGN.md` Stage 2). Closes the last #243 V1 crash-lost-fact residual. NOT yet
  dispatched — needs the host-wiring decision resolved first. S5.2's consumer fold-back (KafkaAuditConsumer
  → codegen `src/events/` template) is noted on #244 to carry with the in-flight-barrier-aware lane.

## Process note
The §3.4 gate sub-agents twice dropped stray malformed scripts into the workspace
(`sync-issue-to-project.js`, `wire-subissues.js`) — both caught + removed, never committed. The
codex runtime hit one transient "CLI not available" collision under concurrent grills — retried clean.
