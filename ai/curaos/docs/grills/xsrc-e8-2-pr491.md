# Codex grill - xsrc-e8-2 PR your-org/curaos#491

GRILL-VERIFIED-SHA: 930e14923170a6c186d7f4d4c83b5ee23a954da3

## Verdict: PASS

The P1 fix was reviewed on top of the original PR tip `6610b40` and committed
as `930e149`, separating attached envelope state from completed signature state.

### Root-cause of the original P1 (now fixed)

At HEAD 6610b40, `signedStatus` was derived from `esignEnvelopeId`:

```ts
function signedStatusOf(esignEnvelopeId) {
  return esignEnvelopeId == null ? 'NoSignature' : 'Signed';
}
```

So `attachEsignEnvelope`, which only sets `esignEnvelopeId`, falsely flipped the
contract to `Signed` the instant an envelope reference was attached, before any
actual signing. That conflated "an e-sign request exists" with "signing
completed", violating the e-sign boundary.

### How the follow-up fix resolves it (verified)

- `signed_status` is now a separate persisted column, `NOT NULL DEFAULT
  'NoSignature'`, with a `CHECK (signed_status IN ('NoSignature','Signed'))`
  constraint.
- `signedStatusOf(value)` now reads the stored value and fail-closes unknown or
  null values to `NoSignature`.
- `attachEsignEnvelope` patches only `{ esignEnvelopeId }`, never
  `signedStatus`.
- In-memory `patchContract` preserves `signedStatus` unless explicitly patched;
  Postgres `patchContract` updates `signed_status` only when supplied.
- Migration `ADD COLUMN ... DEFAULT 'NoSignature'` backfills pre-existing
  attached-but-unsigned rows to `NoSignature`.
- `signed_status` is meant to be fed by completed esign-core signing events. No
  signing or verification logic was added to contract-core.

## P0 Findings (Block Merge)

None.

## P1 Findings (Must Address Before Merge)

None.

## P2 Findings (Followups Acceptable)

None.

Adversarial probes that did not yield a finding:

- No HTTP or event endpoint in this PR sets `signedStatus = 'Signed'`. This is
  correct for the stated scope: completed e-sign event ingestion lands in a
  downstream lane.
- `signedStatusOf` fail-closes unknown DB values to `NoSignature`.
- Migration is idempotent with `ADD COLUMN IF NOT EXISTS` and duplicate
  constraint handling.
- `_journal.json` uses a fixed timestamp.
- PHI and PII boundary is intact: only party-service UUID refs and an e-sign
  envelope UUID ref are present.

## What Codex Got Right

1. Correct root-cause fix: the badge is decoupled from the envelope reference
   instead of special-casing the attach route.
2. Regression is pinned at both layers: service tests assert attach stays
   `NoSignature` and an explicit signed-status patch reads back `Signed`; the
   Postgres test covers the same state through a fresh store instance.
3. Migration also fixes the data plane: the default backfill avoids marking
   existing envelope-attached rows as signed.
4. SDK and TypeSpec stay coherent: the drift guard is green and the TypeSpec enum
   matches generated `types.gen.ts`.
5. E-sign boundary is respected: contract-core stores a reference and badge only;
   signing and verification remain owned by esign-core.

## Evidence Reviewed

- PR #491 reviewed head: `930e14923170a6c186d7f4d4c83b5ee23a954da3`.
- PR #491 original head before P1 fix:
  `6610b406ba2a8cbb52111d827d254abc5e158758`.
- Files reviewed: `specs/contract.tsp`,
  `src/contracts/contract-store.ts`, `src/contracts/contracts.service.ts`,
  `src/contracts/contract.dto.ts`, `drizzle/schema.ts`,
  `drizzle/migrations/0002_contract_signed_status.sql`, and
  `drizzle/migrations/meta/_journal.json`.
- Verification evidence after fix:
  - `backend/packages/contract-sdk`: `bun run generate && bun run test && bun
    test test/drift.test.ts && bun run typecheck && bun run build && bun run
    lint`, exit 0.
  - `backend/services/contract-core-service`: `bun run lint && bun run typecheck
    && bun run spec:openapi && bun run test && bun run build`, exit 0.
  - `curaos`: `bun test tools/codegen/__tests__/sdk-emit.test.ts`, exit 0.
  - `git diff --check`, exit 0.
  - Dash scan on touched files, 0 matches.
