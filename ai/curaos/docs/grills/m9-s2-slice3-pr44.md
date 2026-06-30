# Codex grill — M9-S2 slice 3 PR identity-service#40 PR-A

## Verdict (PROCEED)

Static-only cross-harness adversarial grill of PR-A canonical-token normalizer reconciliation. I did **not** run `bun test`; orchestrator supplied the dynamic proof (`43 divergence + 253 ci pass`, `REAL_CI_EXIT=0`). I tried to break token construction, pairing, PHI boundaries, fallback behavior, non-role paths, and test honesty. No P0/P1/P2 blocking findings found.

## P0 findings

None.

## P1 findings

None.

## P2 findings

None.

## Checklist findings

1. **Token symmetry: PASS.**
   - **Evidence:** ADR-0212 §7.1 requires both normalizers to emit `membership:<targetUserId-UUID>#<rbac-role-code>` for `role` values, with M3 splitting `${targetUserId}:${role}` and Diamond assembling bare `changeValues.role` with `correlationId` (`ai/curaos/docs/adr/0212-m9-s2-changevalues-reference-only-audit.md:252`, `ai/curaos/docs/adr/0212-m9-s2-changevalues-reference-only-audit.md:254`, `ai/curaos/docs/adr/0212-m9-s2-changevalues-reference-only-audit.md:255`, `ai/curaos/docs/adr/0212-m9-s2-changevalues-reference-only-audit.md:256`).
   - **Evidence:** M3 implementation splits on the first `:` via `indexOf(':')`, slices left/right, and emits `membership:${target}#${roleCode}` (`curaos/backend/services/identity-service/src/identity-core/divergence/audit-normalizers.ts:151`, `curaos/backend/services/identity-service/src/identity-core/divergence/audit-normalizers.ts:152`, `curaos/backend/services/identity-service/src/identity-core/divergence/audit-normalizers.ts:161`, `curaos/backend/services/identity-service/src/identity-core/divergence/audit-normalizers.ts:162`, `curaos/backend/services/identity-service/src/identity-core/divergence/audit-normalizers.ts:163`).
   - **Evidence:** Diamond implementation maps explicit `role` values to `membership:${correlationId}#${r}` (`curaos/backend/services/identity-service/src/identity-core/divergence/audit-normalizers.ts:220`, `curaos/backend/services/identity-service/src/identity-core/divergence/audit-normalizers.ts:223`, `curaos/backend/services/identity-service/src/identity-core/divergence/audit-normalizers.ts:228`).
   - **Evidence:** RBAC roles are closed kebab strings with no `:` (`curaos/backend/services/identity-service/src/rbac/rbac-types.ts:1`, `curaos/backend/services/identity-service/src/rbac/rbac-types.ts:8`); role assignment validates role through `isRole` before publishing (`curaos/backend/services/identity-service/src/admin/admin.controller.ts:24`, `curaos/backend/services/identity-service/src/admin/admin.controller.ts:25`, `curaos/backend/services/identity-service/src/admin/admin.controller.ts:53`, `curaos/backend/services/identity-service/src/admin/admin.controller.ts:58`). User ids originate from `randomUUID()` in both in-memory and Postgres registration paths (`curaos/backend/services/identity-service/src/auth/registration-store.ts:132`, `curaos/backend/services/identity-service/src/auth/registration-store.ts:145`, `curaos/backend/services/identity-service/src/auth/registration-store.ts:346`, `curaos/backend/services/identity-service/src/auth/registration-store.ts:347`).
   - **Break attempt:** role containing `:` cannot pass the closed role domain; UUID target has no `:`. Split-on-first-colon is correct for the live M3 shape.

2. **Pairing correctness: PASS.**
   - **Evidence:** ADR binds live pair key to `(tenantId, correlationId)`, not operation type, and states Diamond `ActorMembership` role events must set `correlationId=targetUserId` (`ai/curaos/docs/adr/0212-m9-s2-changevalues-reference-only-audit.md:258`).
   - **Evidence:** checker `pairKey` is exactly tenant + correlationId (`curaos/backend/services/identity-service/src/identity-core/divergence/audit-divergence-checker.ts:176`, `curaos/backend/services/identity-service/src/identity-core/divergence/audit-divergence-checker.ts:179`); unmatched facts stay pending (`curaos/backend/services/identity-service/src/identity-core/divergence/audit-divergence-checker.ts:206`, `curaos/backend/services/identity-service/src/identity-core/divergence/audit-divergence-checker.ts:211`) and `isGreen()` requires both zero divergence and zero pending (`curaos/backend/services/identity-service/src/identity-core/divergence/audit-divergence-checker.ts:331`, `curaos/backend/services/identity-service/src/identity-core/divergence/audit-divergence-checker.ts:333`).
   - **Evidence:** parity test (c) feeds M3 with `TARGET` and Diamond with a request-scoped correlation id, then asserts `divergenceCount()===0`, `pendingCount()===2`, `isGreen()===false` (`curaos/backend/services/identity-service/test/identity-core/divergence/value-aware-parity.test.ts:132`, `curaos/backend/services/identity-service/test/identity-core/divergence/value-aware-parity.test.ts:150`).
   - **Break attempt:** mismatched correlation ids create two buckets, not a false-green pair.

3. **PHI invariant: PASS.**
   - **Evidence:** ADR says the comparison token is normalizer-internal and the target never enters `changeValues` (`ai/curaos/docs/adr/0212-m9-s2-changevalues-reference-only-audit.md:256`, `ai/curaos/docs/adr/0212-m9-s2-changevalues-reference-only-audit.md:260`).
   - **Evidence:** schema allows `changeValues.role` only through the closed `RoleEnum`, UUID, or allowlisted typed references (`curaos/backend/services/identity-service/src/identity-core/audit/audit-event.schema.ts:75`, `curaos/backend/services/identity-service/src/identity-core/audit/audit-event.schema.ts:85`, `curaos/backend/services/identity-service/src/identity-core/audit/audit-event.schema.ts:97`) and uses closed keys (`curaos/backend/services/identity-service/src/identity-core/audit/audit-event.schema.ts:102`, `curaos/backend/services/identity-service/src/identity-core/audit/audit-event.schema.ts:110`, `curaos/backend/services/identity-service/src/identity-core/audit/audit-event.schema.ts:144`, `curaos/backend/services/identity-service/src/identity-core/audit/audit-event.schema.ts:148`).
   - **Evidence:** PHI superRefine keeps `changeValues` inside the serialized scan (`curaos/backend/services/identity-service/src/identity-core/audit/audit-event.schema.ts:154`, `curaos/backend/services/identity-service/src/identity-core/audit/audit-event.schema.ts:161`) and rejects name-shaped patterns (`curaos/backend/services/identity-service/src/identity-core/audit/audit-event.schema.ts:180`, `curaos/backend/services/identity-service/src/identity-core/audit/audit-event.schema.ts:186`). The new parity test asserts `john-smith` and `hiv-positive` throw at schema parse (`curaos/backend/services/identity-service/test/identity-core/divergence/value-aware-parity.test.ts:155`, `curaos/backend/services/identity-service/test/identity-core/divergence/value-aware-parity.test.ts:188`).
   - **Break attempt:** target UUID is used only by the normalizer via `correlationId`; the wire `changeValues.role` remains a bare role-code.

4. **Fail-closed preserved: PASS.**
   - **Evidence:** Diamond role canonicalization occurs only when `explicit !== undefined`; absent values fall through to `{ values:[resourceId], valuesKnown:false }` (`curaos/backend/services/identity-service/src/identity-core/divergence/audit-normalizers.ts:220`, `curaos/backend/services/identity-service/src/identity-core/divergence/audit-normalizers.ts:222`, `curaos/backend/services/identity-service/src/identity-core/divergence/audit-normalizers.ts:234`, `curaos/backend/services/identity-service/src/identity-core/divergence/audit-normalizers.ts:240`).
   - **Evidence:** checker treats any `valuesKnown:false` side as divergent before set comparison (`curaos/backend/services/identity-service/src/identity-core/divergence/audit-divergence-checker.ts:450`, `curaos/backend/services/identity-service/src/identity-core/divergence/audit-divergence-checker.ts:459`).
   - **Evidence:** parity test (e) asserts absent `changeValues` produces fallback `valuesKnown:false`, pairs, and stays red (`curaos/backend/services/identity-service/test/identity-core/divergence/value-aware-parity.test.ts:194`, `curaos/backend/services/identity-service/test/identity-core/divergence/value-aware-parity.test.ts:214`).
   - **Break attempt:** no absent-value path can silently match a known role token.

5. **Non-role fields untouched: PASS.**
   - **Evidence:** M3 only reshapes field `role`; all other fields keep `values:[resourceId]` (`curaos/backend/services/identity-service/src/identity-core/divergence/audit-normalizers.ts:151`, `curaos/backend/services/identity-service/src/identity-core/divergence/audit-normalizers.ts:166`).
   - **Evidence:** Diamond only tokenizes explicit `role`; non-role explicit references are copied as-is and absent non-role values use the same fail-closed fallback (`curaos/backend/services/identity-service/src/identity-core/divergence/audit-normalizers.ts:223`, `curaos/backend/services/identity-service/src/identity-core/divergence/audit-normalizers.ts:232`, `curaos/backend/services/identity-service/src/identity-core/divergence/audit-normalizers.ts:240`).

6. **Test honesty: PASS.**
   - **Evidence:** new parity test imports production `AuditEventEnvelopeSchema`, `AuthDiamondDivergenceChecker`, `normalizeDiamondAuditEvent`, and `normalizeM3AuditEvent` (`curaos/backend/services/identity-service/test/identity-core/divergence/value-aware-parity.test.ts:19`, `curaos/backend/services/identity-service/test/identity-core/divergence/value-aware-parity.test.ts:26`).
   - **Evidence:** M3 fixture uses production shape `resource_id: ${TARGET}:${role}` and `correlation_id: TARGET` (`curaos/backend/services/identity-service/test/identity-core/divergence/value-aware-parity.test.ts:37`, `curaos/backend/services/identity-service/test/identity-core/divergence/value-aware-parity.test.ts:49`).
   - **Evidence:** Diamond fixture is parsed through `AuditEventEnvelopeSchema.parse`, with `resourceType:'ActorMembership'`, bare `changeValues.role`, and target in `correlationId` (`curaos/backend/services/identity-service/test/identity-core/divergence/value-aware-parity.test.ts:57`, `curaos/backend/services/identity-service/test/identity-core/divergence/value-aware-parity.test.ts:80`).
   - **Evidence:** happy path asserts both canonical tokens, then `pendingCount()===0`, `divergenceCount()===0`, `isGreen()===true` (`curaos/backend/services/identity-service/test/identity-core/divergence/value-aware-parity.test.ts:83`, `curaos/backend/services/identity-service/test/identity-core/divergence/value-aware-parity.test.ts:110`).
   - **Break attempt:** this is not hand-built `NormalizedAuditFact`; it exercises real normalizers and real checker. The Diamond producer remains simulated, and the test says so (`curaos/backend/services/identity-service/test/identity-core/divergence/value-aware-parity.test.ts:12`, `curaos/backend/services/identity-service/test/identity-core/divergence/value-aware-parity.test.ts:17`).

7. **Scope: PASS.**
   - **Evidence:** the PR-A diff touches only normalizer/doc/test files: `audit-normalizers.ts`, `normalized-audit-fact.ts`, three divergence tests, and one integration divergence test (`.scratch/m9-s2-changevalues/pr44-canonical-token.diff:1`, `.scratch/m9-s2-changevalues/pr44-canonical-token.diff:136`, `.scratch/m9-s2-changevalues/pr44-canonical-token.diff:191`, `.scratch/m9-s2-changevalues/pr44-canonical-token.diff:405`, `.scratch/m9-s2-changevalues/pr44-canonical-token.diff:505`, `.scratch/m9-s2-changevalues/pr44-canonical-token.diff:727`).
   - **Evidence:** live Diamond actor CRUD still publishes `resourceType:'Actor'` with request principal correlation id (`curaos/backend/services/identity-service/src/identity-core/actors/actors.service.ts:412`, `curaos/backend/services/identity-service/src/identity-core/actors/actors.service.ts:440`); request principal correlation still comes from header/session (`curaos/backend/services/identity-service/src/identity-core/actors/actors.controller.ts:143`, `curaos/backend/services/identity-service/src/identity-core/actors/actors.controller.ts:158`). ADR still documents the `ActorMembership` producer gap and required PR-B envelope shape (`ai/curaos/docs/adr/0212-m9-s2-changevalues-reference-only-audit.md:264`).
   - **Break attempt:** PR-A does not mutate schema, publisher, actor CRUD producer, or codegen template. Normalizer is correct for PR-B's required envelope shape.

8. **Defensive fallback: PASS.**
   - **Evidence:** malformed M3 role `resource_id` with no `:` returns the whole string as the carried value, not a canonical token (`curaos/backend/services/identity-service/src/identity-core/divergence/audit-normalizers.ts:151`, `curaos/backend/services/identity-service/src/identity-core/divergence/audit-normalizers.ts:160`).
   - **Evidence:** well-formed Diamond role with explicit values always emits `membership:<correlationId>#<role>` (`curaos/backend/services/identity-service/src/identity-core/divergence/audit-normalizers.ts:223`, `curaos/backend/services/identity-service/src/identity-core/divergence/audit-normalizers.ts:229`).
   - **Break attempt:** a bare malformed M3 string cannot equal a well-formed Diamond `membership:...#...` token, so this fallback is red-biased, not false-green.

## Static verification notes

- `.scratch/m9-s2-changevalues/pr44-parity.test.ts` is byte-identical to live `test/identity-core/divergence/value-aware-parity.test.ts`.
- Workspace status before writing this artifact already had `curaos` submodule dirtiness from untracked `.turbo/` artifacts only; no source diff was present in `curaos/backend/services/identity-service`.
- No dynamic tests run by Codex for this grill, per user instruction.
