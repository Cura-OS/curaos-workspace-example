# Grill — M10-299 consolidated mold-class audit-template hardening

- **Issue:** your-org/curaos-ai-workspace#299
- **PR:** your-org/curaos#172
- **Scope:** `curaos/tools/codegen/templates/` + emitters (no other service repos)
- **Branch:** `agent/fix-mold-audit-hardening-299`
- **Reviewer harness:** Codex (`gpt-5-codex`, `model_reasoning_effort=high`, `--sandbox read-only`)
- **Date:** 2026-06-02

## Grill verdict — Codex STALLED → self-verified (orchestrator-verified note)

The opposite-harness (Codex) adversarial grill was dispatched read-only at high
effort with the full plan + the cross-service hash-validation concern. It ran
for ~9 minutes producing **zero output** (buffered through reasoning, never
emitted a final message) and was terminated. Per the task brief fallback
(`Codex stalls → default model effort high; else verify directly +
orchestrator-verified note`), the verdict below is the **implementer's direct
self-verification at high effort**, backed by decisive in-repo code evidence
(not model recall). The orchestrator may re-run the same grill at the same path.

## Self-verified findings (code-cited)

### Finding 1 — full-envelope hash: RECLASSIFIED, NOT folded (cross-module follow-up)

The task premise — *"the canonical hash includes the full immutable envelope —
match it"* — is **factually incorrect**. Repo-wide audit of every
`createHash('sha256')` audit-chain digest shows NONE include the full immutable
envelope (no `actorId` / `action` / `outcome` / `changedFields`):

- `audit-core-service/src/consumer/audit-chain-validator.service.ts:121-126`
  (`recomputeHash`, the canonical CONSUMER of `curaos.core.audit.event.v1`):
  `` `${eventId}|${occurredAt}|${resourceType}|${resourceId}|${previousHash ?? ''}` ``
- `audit-core-service/src/audit/audit-publisher.service.ts:229-233`: same.
- `audit-core-service/test/integration/cross-cluster-chain-e2e.test.ts:447`: same.
- codegen producer template (current): adds `tenantId` →
  `` `${eventId}|${occurredAt}|${input.tenantId}|${resourceType}|${input.resourceId}|${previousHash}` ``
- codegen `audit-chain-e2e.test.ts.hbs:105` recompute: matches the producer template.

**Decision (auto-applied per recommendation, 2026-05-29 directive):** Expanding
ONLY the producer-side template hash to the full immutable envelope —
WITHOUT simultaneously changing the out-of-scope `audit-core` validator
`recomputeHash`, the `audit-core` cross-cluster e2e recompute, and every
already-scaffolded service's e2e recompute — would make the canonical
consumer `chain.broken.v1` **fail-closed-reject every generated-service
event**. The 3 M10 scaffolds waiting behind this barrier would inherit that
break (worse than the residual tamper gap). The validator is NOT in
`tools/codegen/**` and is **not yet a codegen template** (no validator `.hbs`
exists), so a producer+consumer atomic move cannot land in this codegen-only
PR. Per §8.75 step 2 (multi-file cross-module refactor) this is a
`priority=critical` **follow-up**, not an in-PR fold. A producer-only hash
change is explicitly NOT made.

Residual note: the existing 6-field hash already includes the unique `eventId`,
so two distinct events CANNOT collide on the hash even with the same chain key
(the task's "collision" concern is already mitigated). The genuine residual gap
is tamper-evidence on `actorId`/`action` — closed only by the cross-module
follow-up.

### Finding 2 — auth-matrix `expect` import: FOLDED (trio)

`bun:test` import omitted `expect` while the forged-header test (`#185`) uses
the `expect` global → ReferenceError at run. `bun:test` does NOT auto-inject
`expect` as a global, so this is a real runtime break. Added `expect` to the
import in all three trio templates. Locked by snapshot test.

### Finding 3 — agent-doc `--plain-service` naming + OVERWRITE: FOLDED (naming + no-clobber)

- **Naming (3a):** plain-service reuses the `core` agent-doc templates
  (`agentDocsLayerId('plain') → 'core'`), and `core/{AGENTS,CONTEXT,Requirements}.md.hbs`
  hardcode `<name>-core-service` + reference trio siblings
  (`personal-<name>-service`, `business-<name>-service`). For a plain service
  the rendered module name + mirror-doc paths + sibling refs are all wrong.
  Fix: thread the layer `serviceSlug` (= `layer.packageName`) + a
  `isPlain`/`layerLabel` flag into the agent-doc render context and templatize
  the `-core-service` literals + sibling block.
- **No-overwrite (3b):** `emitMirror` (`src/mirror-emit.ts`) overwrote a curated
  `CONTEXT/AGENTS/Requirements.md` whenever rendered content differed (real
  data-loss on `--write`). Fix: a `preserveExisting` option (set by the live
  agent-doc emit path) preserves an existing curated doc (surfaced as
  `preserved`, never clobbered). Default emitMirror behavior unchanged so the
  template-refresh idempotency contract + existing tests stay valid.

### Finding 4 — 0000_audit_outbox CHECK + inline UNIQUE drift: FOLDED (reconcile)

SQL (`0000_audit_outbox.sql.hbs`) used inline `idempotency_key text UNIQUE`
(Postgres auto-names `_key` constraint) while schema.ts + snapshot declare the
named unique INDEX `audit_outbox_idempotency_key_unique`; and the SQL's
`CONSTRAINT audit_outbox_status_check CHECK(...)` is absent from both schema.ts
(`.check()`) and the snapshot (`checkConstraints: {}`). Both diverge → first
`drizzle-kit generate` re-emits. Fix: SQL emits an explicit named
`CREATE UNIQUE INDEX audit_outbox_idempotency_key_unique` (drop inline UNIQUE)
matching schema+snapshot; add the `status` CHECK to schema.ts `.check()` +
record it in the snapshot `checkConstraints` so schema == SQL == snapshot.

### Finding 5 — Dockerfile.migrator placeholder digest: BLOCKED-EXTERNAL (tracked, not invented)

`@sha256:0000…` base-image digest. The base image
`ghcr.io/cura-care-oriented-stack/curaos-migration-runner:v0.1.0` is not
published yet; Renovate (`docker:pinDigests`) will digest-pin once it is. NO
digest invented. Clarify the placeholder with a `KNOWN-PENDING` comment +
build-arg so it is obviously a tracked placeholder. Stays until the image
publishes.

## Trio + generator-evolution discipline

All folded template fixes (2, 3, 4) applied core/personal/business symmetrically
with snapshot tests; coverage held ≥90%.
