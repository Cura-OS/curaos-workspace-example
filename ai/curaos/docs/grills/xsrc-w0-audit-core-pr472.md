# Codex grill - XSRC W0 audit-core PR your-org/curaos#472

GRILL-VERIFIED-SHA: ca81d5bcb6657920e86445e9e153d4fe0b5f96ef

## Verdict: BLOCK

## P0 findings (block merge)

1. Malformed previous hashes can verify as OK.
   - **Where:** backend/packages/audit-core/src/index.ts:83
   - **What:** `verifyAuditChainRecord()` validates only `record.hash` through timing-safe comparison. It does not reject malformed `record.hashPrev` or `options.previous.hash`.
   - **Why P0:** tamper-evident chain validation must fail closed on malformed chain links. A caller can provide a malformed previous hash, append a record with that value, and verification returns OK.
   - **Fix:** validate all hash-link inputs as 64-character lowercase hex before accepting or comparing, and add regression tests for malformed previous hashes.

## P1 findings (must address before merge)

None.

## P2 findings (followups acceptable)

1. Test fixture names use patient-flavored examples in a neutral package. This is low risk but easy to neutralize.

## What the worker got right

1. Package tests, typecheck, build, and lint pass.
2. The package boundary is neutral: no persistence, retention, broker publication, key storage, or PHI-specific schema.
3. Required ai mirror docs exist with owner, dependencies, integration map, and Done criteria.

---

## Re-grill verification (2026-06-29, post-ca81d5b)

**Verdict: BLOCK**

The first audit-core Tier-2 grill found a fail-closed hash validation defect. A resolver has been dispatched on the same lane branch.
