# Codex grill - M9-S2 slice 3 identity-service#40

## Verdict: BLOCK

Static review only. I did not run `bun test`, per `.scratch/m9-s2-changevalues/grill-prompt-40.md:3`.

## P0 findings (block merge)

1. The value-aware parity E2E test fakes the M3 role audit shape, so its green proof is invalid.
   - **Where:** `.scratch/m9-s2-changevalues/value-aware-parity.test.ts:55`, `.scratch/m9-s2-changevalues/value-aware-parity.test.ts:59`, `.scratch/m9-s2-changevalues/value-aware-parity.test.ts:64`, `.scratch/m9-s2-changevalues/value-aware-parity.test.ts:91`, `.scratch/m9-s2-changevalues/value-aware-parity.test.ts:101`; `curaos/backend/services/identity-service/src/auth/auth-audit-publisher.ts:133`, `curaos/backend/services/identity-service/src/auth/auth-audit-publisher.ts:143`, `curaos/backend/services/identity-service/src/auth/auth-audit-publisher.ts:146`; `curaos/backend/services/identity-service/src/identity-core/divergence/audit-normalizers.ts:114`, `curaos/backend/services/identity-service/src/identity-core/divergence/audit-normalizers.ts:121`, `curaos/backend/services/identity-service/src/identity-core/divergence/audit-normalizers.ts:133`; `curaos/backend/services/identity-service/src/identity-core/divergence/audit-divergence-checker.ts:456`, `curaos/backend/services/identity-service/src/identity-core/divergence/audit-divergence-checker.ts:460`.
   - **What:** The new helper says to "pass the role token directly" and sets `resource_id` to just `role` (`clinician`, `auditor`, etc.). The real M3 role publisher emits `resource_id: ${targetUserId}:${role}` and `correlation_id: targetUserId`; the M3 normalizer compares the whole `resource_id` as the value-bearing reference. The checker only returns SAME when both known value sets are byte-equal. Therefore the test's claimed same-role green path compares fake M3 `['clinician']` to Diamond `['clinician']`; the production-shaped event would compare M3 `['<target>:clinician']` to Diamond `['clinician']` and go RED.
   - **Why P0:** Slice 3 is supposed to certify the high-blast-radius `auth-diamond-divergence == 0` gate. This test asserts `divergenceCount() === 0`, `pendingCount() === 0`, and `isGreen() === true` on a non-production M3 envelope shape. That can let the PR pass while real same-role events still cannot go green, making the Phase D readiness signal untrustworthy.
   - **Fix:** Make the test use the real M3 role audit shape from `AuthAuditPublisher.emitRoleEvent` (`resource_id: ${targetUserId}:${role}`), or change the consumer normalization contract so M3 role values are normalized to the same value domain Diamond emits. Then assert the same-role case goes green and the clinician-vs-auditor case goes red with production-shaped envelopes.

## P1 findings (must address before merge)

1. The rewritten caveat overclaims that value-aware parity has landed.
   - **Where:** `.scratch/m9-s2-changevalues/identity-40.diff:18`, `.scratch/m9-s2-changevalues/identity-40.diff:21`, `.scratch/m9-s2-changevalues/identity-40.diff:22`, `.scratch/m9-s2-changevalues/identity-40.diff:23`; `.scratch/m9-s2-changevalues/value-aware-parity.test.ts:13`, `.scratch/m9-s2-changevalues/value-aware-parity.test.ts:15`, `.scratch/m9-s2-changevalues/value-aware-parity.test.ts:16`; `ai/curaos/docs/adr/0212-m9-s2-changevalues-reference-only-audit.md:241`, `ai/curaos/docs/adr/0212-m9-s2-changevalues-reference-only-audit.md:242`, `ai/curaos/docs/adr/0212-m9-s2-changevalues-reference-only-audit.md:243`.
   - **What:** The proposed comment says "Value-aware parity has LANDED" and that opted-in Diamond facts compare RBAC reference values across paths. But the new test itself frames producer behavior as "once a Diamond publish site populates `changeValues`" and only exercises hand-built normalizer inputs, not the real M3 publisher shape. Combined with the P0 fake-M3 value domain, the proposed comment makes a stronger claim than the code under review proves.
   - **Why P1:** This comment sits on the `valuesKnown` contract for the auth migration gate. Overclaiming here will mislead the next reviewer into treating the old caveat as fully retired while the production-shaped green path is still unproven.
   - **Fix:** Keep the fail-closed caveat explicit until a production-shaped same-role M3/Diamond pair is covered. If the comment is updated now, phrase it conditionally: parity is available only for facts whose producer and consumer value domains are aligned, and name-only/non-opted facts remain `valuesKnown:false`.

## P2 findings (followups acceptable)

None.

## Checklist answers

1. **Consumer unchanged:** The provided artifact diff does not touch `audit-normalizers.ts`; it only changes `normalized-audit-fact.ts` and adds `value-aware-parity.test.ts` (`.scratch/m9-s2-changevalues/identity-40.diff:1`, `.scratch/m9-s2-changevalues/identity-40.diff:33`). I also ran `git diff --stat origin/main HEAD` in the live repo; the checkout is local `main` behind `origin/main`, so it reports prior slice-2 producer files, but still not `audit-normalizers.ts`.
2. **`valuesKnown` semantics:** Real consumer semantics are correct: Diamond `changeValues?.[field]` supplied returns `{ field, values: [...explicit] }` with `valuesKnown` omitted (`audit-normalizers.ts:176-179`), and omitted `changeValues` falls back to `resourceId` with `valuesKnown:false` (`audit-normalizers.ts:180-186`). `canonicalizeChanges` and `changesByField` treat omitted as known and explicit false as unknown (`normalized-audit-fact.ts:137-148`, `audit-divergence-checker.ts:483-487`). The test asserts the Diamond side correctly, but fakes the M3 value domain, so it does not assert the real cross-path behavior.
3. **Value-only divergence:** The checker genuinely compares value sets, not just field names (`audit-divergence-checker.ts:422-424`, `audit-divergence-checker.ts:460-462`), and the test's fake `clinician` vs `auditor` path would catch a name-only false-green. However, with the production M3 value shape, both same-role and different-role cases diverge until the value domains are aligned, so the test does not prove the intended production value-only counterexample.
4. **Fail-closed preserved:** A Diamond event with no `changeValues` normalizes to `{ field: 'role', values: [TARGET], valuesKnown:false }` and the test asserts `isGreen() === false` (`.scratch/m9-s2-changevalues/value-aware-parity.test.ts:127`, `.scratch/m9-s2-changevalues/value-aware-parity.test.ts:131`, `.scratch/m9-s2-changevalues/value-aware-parity.test.ts:140`, `.scratch/m9-s2-changevalues/value-aware-parity.test.ts:141`). The checker fails closed when either side's value is fallback/unknown (`audit-divergence-checker.ts:450-458`). This part is preserved.
5. **Comment accuracy:** BLOCKED by P1. The comment preserves the fail-closed note, but "parity has LANDED" overstates what this slice proves.
6. **Scope:** The provided artifact diff does not touch schema, publisher, actors, codegen templates, or `audit-normalizers.ts` (`.scratch/m9-s2-changevalues/identity-40.diff:1-37`). The live checkout stat shows prior slice-2 producer files only because local `main` is behind `origin/main`.
7. **PHI:** The new test values are RBAC role identifiers and UUID-like opaque IDs, not PHI/free text (`.scratch/m9-s2-changevalues/value-aware-parity.test.ts:19-26`, `.scratch/m9-s2-changevalues/value-aware-parity.test.ts:91`, `.scratch/m9-s2-changevalues/value-aware-parity.test.ts:115`, `.scratch/m9-s2-changevalues/value-aware-parity.test.ts:138`).

## What Claude got right

1. The Diamond-side `valuesKnown` assertions match the real `diamondChanges` contract for explicit vs absent `changeValues`.
2. The fail-closed test still covers unknown Diamond values against a known M3 value and asserts `isGreen() === false`.
3. The reviewed diff avoids touching `audit-normalizers.ts`, schema, publisher, actors, and codegen templates.
4. The test uses closed RBAC role identifiers and opaque IDs, not PHI/free-text values.
