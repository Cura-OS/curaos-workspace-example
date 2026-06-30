# #300 — full-envelope audit-chain hash: retroactive backfill / regen plan

> Acceptance item 3 of `your-org/curaos-ai-workspace#300`.
> The producer mold + the canonical consumer (`audit-core-service`) were moved
> to the full-immutable-envelope hash material atomically (the two #300 PRs).
> Already-scaffolded services still carry the OLD material and MUST be
> backfilled before they emit onto the shared `curaos.core.audit.event.v1`
> topic in an environment where `audit-core` re-validates with the NEW material.

## Canonical material (post-#300)

Defined ONCE in `src/audit/audit-chain-hash.ts` (`auditChainHashMaterial`),
shared by the producer + `audit-chain-validator.service.ts` `recomputeHash`:

```
eventId | occurredAt | tenantId | actorId | action | outcome |
resourceType | resourceId | <changeReference> | (previousHash ?? '')
```

`changeReference` = `<changedFields>~<changeValues>` where
`changedFields = changedFields === undefined ? '' : JSON.stringify(changedFields)`
and `changeValues = changeValues === undefined ? '' : stableStringify(changeValues)`
(recursively sorted keys — parse-stable on the consume side). Field order is
FIXED; reordering changes every hash.

## Divergence inventory (state at #300 landing)

Repo-wide audit of `createHash('sha256')` audit-chain digests found THREE
incompatible shapes among already-scaffolded services (all now superseded by
the canonical material above):

| Shape | Material | Services |
|---|---|---|
| 6-field (+tenantId) | `eventId\|occurredAt\|tenantId\|resourceType\|resourceId\|prev` | storage, search, calendar-core, notify, tasks-core, reports |
| 5-field (resourceType, no tenantId) | `eventId\|occurredAt\|resourceType\|resourceId\|prev` | settings, audit-core (FIXED by #300) |
| 4-field (no tenantId/resourceType) | `eventId\|occurredAt\|resourceId\|prev` | org-core, party-core, patient-core, healthstack-patient, identity-service |

All of these predate #300 and bind NONE of `actorId`/`action`/`outcome`/the
change reference — i.e. they carry the tamper-evidence gap #300 closes.

## Backfill scope (per-service, separate PRs)

For each service above, in its OWN submodule repo (code-only per the
repo-boundary rule), regen/backfill from the fixed mold:

1. Add `src/audit/audit-chain-hash.ts` (byte-identical to the mold-emitted
   `audit-chain-hash.ts.hbs` — verified byte-identical to audit-core's copy).
2. `audit-publisher.service.ts`: drop the inline `createHash('sha256')` material;
   `import { auditChainHash } from './audit-chain-hash'` and call it with the
   full immutable envelope (eventId, occurredAt, tenantId, actorId, action,
   outcome, resourceType, resourceId, changedFields, changeValues, previousHash).
3. `test/integration/audit-chain-e2e.test.ts`: recompute helper delegates to
   `auditChainHash`; widen the captured-event type with `changedFields`/
   `changeValues`; pass the full envelope at the recompute call site.
4. `bun test` (chain e2e) + `bun run typecheck` green; bump the curaos submodule
   pointer.

This is the SAME mechanical transform applied to audit-core in the #300
audit-core PR — copy that diff.

## Retroactive chain-head re-hash (data, not code)

Old chain HEADS persisted in `audit_chain_heads` were computed with the old
material. After a service backfills, its NEXT publish chains off the old head
hash (stored as `previousHash`) — which is fine: `previousHash` is an opaque
link, the validator only recomputes the CURRENT event's hash and compares the
stored head to the asserted `previousHash`. So **no head migration is required
for forward continuity** — the first post-backfill event simply links to the
last old-material head and validates (its own hash uses the new material; its
`previousHash` is the old head value, unchanged).

Cold-archive / historical re-verification is the only place the old material
matters: a verifier replaying the archived stream end-to-end must apply the
old material to pre-cutover events and the new material from each service's
backfill commit onward. Document the cutover commit SHA per service in the
archive manifest so a full-history re-verify can switch material at the right
boundary. (No M10 service is in production with a populated cold archive yet,
so this is a forward note, not an immediate migration.)

## Sequencing (generator-evolution in-flight barrier)

Per [[curaos-generator-evolution-rule]] the producer mold + validator move
together (the two #300 PRs merge as a pair). Downstream-milestone scaffold
dispatch stays BLOCKED until that pair merges — every service the next wave
produces would otherwise inherit the old material. The per-service backfills
above run AFTER the #300 pair merges, as their own `ready-for-agent` lane.

## Tracking

Backfill is a follow-up lane (NOT in the #300 PRs, which are mold + audit-core
only). File per-service issues (or fold into the existing #296 regen lane,
which already covers party-core + audit-core publisher regen for the #293
CAS/tx fix — extend its checklist with the #300 hash transform for the full
service list). One PR per submodule repo + a curaos pointer bump.
