# Codex grill — M9-S6.3 cross-cluster event-chain E2E PR audit-core-service#2

**Issue:** your-org/curaos-ai-workspace#259
**Branch:** verify-259 (HEAD 0c36f69, base main 810942a)
**Diff:** +428 lines, single new file `test/integration/cross-cluster-chain-e2e.test.ts`
**CI:** bun run ci → 39 pass / 0 fail (5 suites)
**Reviewer:** Codex (cross-harness Tier-2 adversarial grill, 2026-06-01)

---

## Verdict: APPROVE-WITH-CONDITIONS

One P1 finding: the PHI superRefine assertion does not specifically isolate the name-pattern gate from the closed-domain `changeValues` refinement. Everything else is structurally sound and exercises real invariants. Fix the PHI test before merge.

---

## P0 findings (block merge)

None.

---

## P1 findings (must address before merge)

### 1. PHI assertion does not isolate the superRefine name-pattern gate

- **Where:** `test/integration/cross-cluster-chain-e2e.test.ts:371-386`
- **What:** The PHI-bearing variant uses `changeValues: { role: ["Jane Doe"] }`. That payload is also rejected by the closed-domain `ChangeReferenceValueSchema` because `"Jane Doe"` is not an RBAC role code, UUID, or allowlisted reference. The `result.status === "rejected"` assertion passes whether the superRefine name-scan runs or is deleted. A developer could remove the superRefine PHI guard from `audit-event.schema.ts` without this test going red.
- **Why P1:** The PHI guard (`superRefine` on name patterns) is the load-bearing M9 PHI-boundary assertion. If it is untested, a future refactor can silently remove it.
- **Fix:** Use a value that passes all structural/changeValues schema checks but contains a name pattern, e.g. `changeValues: { userId: ["6d2a1c3e-09b0-4f7a-87f8-c5a1e3b2d9f4"] }` with an `actor.name: "Jane Doe"` in the actor block, or a `changeValues` field that accepts free-text but receives a `First Last` string. The assertion should also verify `result.reason` (or the parse error message) references the PHI/name-scan path so the test is pinned to the right gate.
- **Refs:** `src/audit/audit-event.schema.ts:113-125` (superRefine), `src/audit/audit-event.schema.ts:182-216` (ChangeReferenceValueSchema)

---

## P2 findings (followups acceptable)

### 2. Fork-detection comment overstates "red-first proof"

- **Where:** `test/integration/cross-cluster-chain-e2e.test.ts` (test description block)
- **What:** The test description mentions a "red-first proof" via mutation, but the mutation evidence is only in a code comment, not a separate documented snapshot. A future reader has no way to verify the mutation was actually run without re-running it manually.
- **Why P2:** Not a correctness issue — the fork test logic itself is real and correct. Just a documentation gap.
- **Fix:** Add a one-line comment citing the specific mutation used (`previousHash: null → chain.broken.v1`) or reference the local `bun test --watch` red run in the PR description.

---

## Attack surface detail

### (1) VACUOUS-PASS CHECK — PASS

- **Citations:** `test/integration/cross-cluster-chain-e2e.test.ts:223-226`, `:278-329`; `src/consumer/audit-chain-validator.service.ts:202-232`, `:238-255`, `:300-339`
- The fork test drives three real `validator.validate(...)` calls to establish a live `Invitation` chain head, then submits a forged envelope with `previousHash: null` (a recomputed body hash via real `createHash("sha256")`). Assertions: `result.status === "broken"`, store head unchanged, exactly one `chain.broken.v1` emitted, three `chain.verified.v1` emitted, broken payload fields present. A validator that did not fail-closed on a fork (advanced the head anyway, emitted `chain.verified.v1`) would fail the status + head + topic-count assertions. Not vacuous.

### (2) TRACE-ID CONTINUITY (#257/#258) — PASS

- **Citations:** `:121-180`, `:192-210`; `ai/curaos/docs/research/m9-s6-cross-cluster-event-chain.md:32`
- One stable `traceId` value flows through all four legs; four distinct `correlationId` values; role-grant leg's `correlationId === INVITED_ACTOR` (not the flow trace id). Wire `correlation_id` header on each emitted audit-topic message is checked against the envelope correlationId. If correlationId were collapsed to the flow traceId, the distinct-count assertion and `INVITED_ACTOR !== traceId` check both go red. The #243 divergence pairing key is protected.

### (3) SEPARATE CHAINS — PASS

- **Citations:** `:95-99`, `:168-176`, `:232-256`; `src/audit/audit-chain-head.store.ts:100-134`; `src/consumer/audit-chain-validator.service.ts:211-215`, `:238-244`
- `orgId` is deliberately reused for both `Org` and `OrgMembership` resources. Test asserts separate store head values (via `get(TENANT, "Org", orgId)` vs `get(TENANT, "OrgMembership", orgId)`), `roleGranted.previousHash === null` (genesis for OrgMembership chain, not chained off Org), and unequal hash values. If the store key dropped `resourceType` (collapsed to `tenantId:resourceId`), the role-grant leg would chain off the Org head and the `previousHash === null` assertion would fail.

### (4) HASH-CHAIN REALNESS — PASS

- **Citations:** `:122-180`, `:223-226`, `:293-305`, `:397-410`; `src/audit/audit-publisher.service.ts:229-233`; `src/consumer/audit-chain-validator.service.ts:121-127`, `:202-207`
- Normal legs built through `AuditPublisher`, which computes real SHA-256 over `eventId|occurredAt|resourceType|resourceId|previousHash`. Consumer validator recomputes identical material and compares. Forged fork helper also uses `createHash("sha256")` over that same material so the body-integrity check passes and the test isolates continuity/fail-closed behavior rather than smuggling a fake hash past a naive comparator.

### (5) PHI ASSERTION — FAIL (→ P1 above)

- **Citations:** `:371-386`; `src/audit/audit-event.schema.ts:113-125`, `:182-216`
- See P1 finding #1 above. The test exercises a real `validateRaw` path, but the chosen payload is rejected by two overlapping guards. The superRefine name-scan guard is not isolated and could be removed without the test failing.

### (6) SCHEMA VERSION + TOPIC — PASS

- **Citations:** `:54-68`, `:183-188`, `:331-349`; `src/audit/audit-publisher.service.ts:48-53`; `src/consumer/audit-chain-validator.service.ts:73-78`
- Imports audit-core's own `AUDIT_TOPIC` (= `curaos.core.audit.event.v1`) and `AuditEventEnvelopeSchema`. Asserts four messages reached that topic. Re-parses each emitted value with the M9 envelope schema. Downstream topics `curaos.core.audit.chain.verified.v1` / `.broken.v1` verified. No legacy `@curaos/audit-sdk` or `curaos.audit.events` path present.

### (7) REPO BOUNDARY — PASS

- **Citations:** `:30-40`, `:54-68`; `ai/curaos/docs/research/m9-s6-cross-cluster-event-chain.md:5-10`, `:24-25`
- Only imports are: Node built-ins, Bun test, `reflect-metadata`, and `../../src/*` (audit-core-local). No org-core-service or identity-service source import. Scope caveat: invite/accept producers do not exist in this repo — the test reconstructs cross-cluster envelope shapes inline. This proves the shared contract inside audit-core, not live org-core producer behavior.

---

## Summary table

| Attack surface | Severity | Key evidence |
|---|---|---|
| (1) Vacuous-pass check | PASS | Fork drives real validator; broken status, unchanged head, correct topic counts all asserted |
| (2) Trace-ID continuity (#257/#258) | PASS | Single traceId, 4 distinct correlationIds, role-grant correlationId = INVITED_ACTOR; wire header checked |
| (3) Separate chains | PASS | Shared orgId, separate store heads, role-grant genesis (previousHash null) asserted; resourceType drop would fail |
| (4) Hash-chain realness | PASS | Real SHA-256 `eventId\|occurredAt\|resourceType\|resourceId\|previousHash` throughout |
| (5) PHI assertion | **FAIL → P1** | Rejection real but not superRefine-isolated; closed-domain changeValues also rejects "Jane Doe" |
| (6) Schema version + topic | PASS | M9 `curaos.core.audit.event.v1` topic + envelope schema; no legacy path |
| (7) Repo boundary | PASS | Only `../../src/*` imports; no cross-service source |

---

## What Codex got right (counter-balance)

1. **Fork/fail-closed proof is genuine.** The four-step chain-establishment + forged-leg sequence is non-trivial and correctly isolates the validator's fail-closed invariant.
2. **#243 divergence pairing is protected.** The correlationId-distinct + INVITED_ACTOR assertion is the only test in the suite that guards against the #243 regression pattern.
3. **Separate chains under shared resourceId is explicit.** Deliberately sharing `orgId` across `Org` and `OrgMembership` and asserting separate genesis behavior is a strong design-intent signal, not accidental coverage.
4. **Real SHA-256 material end-to-end.** Using the publisher path for normal legs and `createHash` in the fork helper means the validator's hash-comparison branch genuinely executes, not a mock bypass.
5. **Repo boundary clean.** Zero cross-service source imports; the in-process test reconstructs foreign envelopes from the shared contract schema alone.

## Re-grill verification (c700b17) — P1 fix, orchestrator-verified

The P1 (PHI assertion didn't isolate the name-scan guard) is CLOSED in `c700b17`:
- The PHI-bearing value now lands in `resourceType` (`audit-event.schema.ts:149` = `z.string().min(1).max(96)` — a FREE-TEXT field with NO closed domain), so `'Jane Doe'` passes every structural/closed-domain check and the ONLY guard that can reject it is the superRefine name-scan. The grill's prior payload (`changeValues: { role: ['Jane Doe'] }`) was rejected by the closed-domain `ChangeReferenceValueSchema` FIRST, masking the name-scan.
- Assertions now pin the rejection to the name-scan path: `expect(result.reason).toContain('capitalised-pair pattern')` + `toContain('PHI name')` — not a generic reject.
- **RED/GREEN proof (worker-run, schema source NOT committed):** commenting out the `NAME_PATTERN` superRefine in `audit-event.schema.ts` → `resourceType: 'Jane Doe'` safeParse-passes → validator returns `'broken'` (continuity), so `expect(status).toBe('rejected')` FAILS (RED) — the name-scan was the sole rejector. Restored → GREEN. The OLD `changeValues` payload stayed GREEN under the same mutation (proof it never isolated the guard).
- P2 (fork-detection red-first) addressed: inline note citing the exact RED-making mutation added.

**Independent CI:** `bun run ci` GREEN (39 pass / 0 fail). Diff scoped to the test only (+46/−7).

**Effective verdict: APPROVE.** The sole P1 is closed + isolation proven by schema-mutation; all 6 prior-PASS surfaces unchanged (real validator, traceId/correlationId-not-collapsed #243 protection, separate Org/OrgMembership chains, real SHA-256, M9 topic, repo boundary). Test-only change; verified directly (a full re-grill of a 46-line assertion strengthening with a documented mutation proof is diminishing returns).
