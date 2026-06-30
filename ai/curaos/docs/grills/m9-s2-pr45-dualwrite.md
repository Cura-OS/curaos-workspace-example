## Verdict (PROCEED)

Static review only. `bun test` intentionally not run per orchestrator instruction.

No P0/P1 blocker found. I tried to break pairing, PHI boundary, dual-write gating, swallow scope, revoke symmetry, optional DI defaulting, data-write scope, and test honesty. The implementation matches ADR-0212 §7.1 for the live role producer.

### 1. Pairing correctness

**PROCEED.** Both legs use the same target-user id-space value for the live pairing key `(tenantId, correlationId)`.

- ADR-0212 requires Diamond `correlationId = targetUserId` because M3 sets `correlation_id = targetUserId`; otherwise facts sit pending and never reach value diff: `ai/curaos/docs/adr/0212-m9-s2-changevalues-reference-only-audit.md:258`.
- M3 role events encode `resource_id = ${targetUserId}:${role}` and `correlation_id = input.targetUserId`: `curaos/backend/services/identity-service/src/auth/auth-audit-publisher.ts:143`, `curaos/backend/services/identity-service/src/auth/auth-audit-publisher.ts:146`.
- `assignRole` passes route `:id` as `targetUserId: userId` to M3, then passes the same `userId` to Diamond: `curaos/backend/services/identity-service/src/admin/admin.controller.ts:115`, `curaos/backend/services/identity-service/src/admin/admin.controller.ts:118`, `curaos/backend/services/identity-service/src/admin/admin.controller.ts:121`.
- Diamond sets `resourceId: targetUserId` and `correlationId: targetUserId`: `curaos/backend/services/identity-service/src/admin/admin.controller.ts:85`, `curaos/backend/services/identity-service/src/admin/admin.controller.ts:87`.
- Checker pair key is exactly tenant + correlation id, with operation excluded: `curaos/backend/services/identity-service/src/identity-core/divergence/audit-divergence-checker.ts:176`.

### 2. PHI invariant

**PROCEED.** Production Diamond `changeValues` carries only the bare closed-enum role code; target/user id is not inserted into `changeValues`.

- ADR-0212 explicitly forbids target in Diamond `changeValues` and says Diamond combines bare role code with target from `correlationId` only in the normalizer: `ai/curaos/docs/adr/0212-m9-s2-changevalues-reference-only-audit.md:256`, `ai/curaos/docs/adr/0212-m9-s2-changevalues-reference-only-audit.md:260`.
- Producer emits `changeValues: { role: [role] }` only: `curaos/backend/services/identity-service/src/admin/admin.controller.ts:90`.
- `role` is parsed through `assignRoleSchema` and `isRole`: `curaos/backend/services/identity-service/src/admin/admin.controller.ts:30`, `curaos/backend/services/identity-service/src/admin/admin.controller.ts:31`, `curaos/backend/services/identity-service/src/admin/admin.controller.ts:159`, `curaos/backend/services/identity-service/src/rbac/rbac-types.ts:1`, `curaos/backend/services/identity-service/src/rbac/rbac-types.ts:18`.
- Audit schema independently restricts `changeValues` entries to RBAC role code, UUID, or allowlisted reference, never free text: `curaos/backend/services/identity-service/src/identity-core/audit/audit-event.schema.ts:75`, `curaos/backend/services/identity-service/src/identity-core/audit/audit-event.schema.ts:85`, `curaos/backend/services/identity-service/src/identity-core/audit/audit-event.schema.ts:97`, and keeps `changeValues` inside the PHI scan: `curaos/backend/services/identity-service/src/identity-core/audit/audit-event.schema.ts:160`, `curaos/backend/services/identity-service/src/identity-core/audit/audit-event.schema.ts:161`.

### 3. dualWrite gating

**PROCEED.** OFF emits no Diamond publish; ON publishes the Diamond audit leg.

- Gate returns before `identityCoreAudit.publish` when `dualWrite` is false: `curaos/backend/services/identity-service/src/admin/admin.controller.ts:73`.
- Diamond mode default is `off`; `dualWrite` is true only when mode is not `off`: `curaos/backend/services/identity-service/src/identity-core/diamond-mode.ts:23`, `curaos/backend/services/identity-service/src/identity-core/diamond-mode.ts:102`.
- Admin tests assert OFF keeps M3 and emits no Diamond for assign + revoke: `curaos/backend/services/identity-service/test/admin/admin-controller-diamond-audit.test.ts:162`, `curaos/backend/services/identity-service/test/admin/admin-controller-diamond-audit.test.ts:168`, `curaos/backend/services/identity-service/test/admin/admin-controller-diamond-audit.test.ts:171`, `curaos/backend/services/identity-service/test/admin/admin-controller-diamond-audit.test.ts:177`.

### 4. Swallow correctness

**PROCEED.** Diamond audit publish failure is caught after M3 emits; it does not roll back the grant and does not swallow M3 failures.

- `assignRole` writes the grant, then awaits M3 `roleAssigned`, then Diamond audit, then force reauth: `curaos/backend/services/identity-service/src/admin/admin.controller.ts:108`, `curaos/backend/services/identity-service/src/admin/admin.controller.ts:115`, `curaos/backend/services/identity-service/src/admin/admin.controller.ts:121`, `curaos/backend/services/identity-service/src/admin/admin.controller.ts:122`.
- Diamond catch is scoped inside `emitDiamondRoleGrantAudit`; the M3 emit is outside that catch, so M3 failures still throw: `curaos/backend/services/identity-service/src/admin/admin.controller.ts:76`, `curaos/backend/services/identity-service/src/admin/admin.controller.ts:92`, `curaos/backend/services/identity-service/src/admin/admin.controller.ts:115`.
- Swallow mirrors `actors.service.ts` audit fan-out catch: `curaos/backend/services/identity-service/src/identity-core/actors/actors.service.ts:423`, `curaos/backend/services/identity-service/src/identity-core/actors/actors.service.ts:441`.
- Unit test proves a rejected Diamond publish does not throw and force reauth still runs: `curaos/backend/services/identity-service/test/admin/admin-controller-diamond-audit.test.ts:180`, `curaos/backend/services/identity-service/test/admin/admin-controller-diamond-audit.test.ts:187`, `curaos/backend/services/identity-service/test/admin/admin-controller-diamond-audit.test.ts:204`, `curaos/backend/services/identity-service/test/admin/admin-controller-diamond-audit.test.ts:206`.

### 4b. Revoke path

**PROCEED.** Revoke dual-writes with same Diamond shape and pairs with M3 `RoleRevoked`.

- M3 normalizer maps both `RoleAssigned` and `RoleRevoked` to `role-grant`: `curaos/backend/services/identity-service/src/identity-core/divergence/audit-normalizers.ts:85`, `curaos/backend/services/identity-service/src/identity-core/divergence/audit-normalizers.ts:88`.
- Diamond normalizer maps `ActorMembership` + `role` to `role-grant`: `curaos/backend/services/identity-service/src/identity-core/divergence/audit-normalizers.ts:248`, `curaos/backend/services/identity-service/src/identity-core/divergence/audit-normalizers.ts:249`.
- `revokeRole` passes route `userId` to M3 `targetUserId` and then calls the same Diamond helper: `curaos/backend/services/identity-service/src/admin/admin.controller.ts:143`, `curaos/backend/services/identity-service/src/admin/admin.controller.ts:146`, `curaos/backend/services/identity-service/src/admin/admin.controller.ts:153`.
- Parity test records revoke through real producers, real normalizers, real checker, and asserts `pendingCount() === 0`, `divergenceCount() === 0`, `isGreen() === true`: `curaos/backend/services/identity-service/test/integration/divergence/role-grant-producer-parity.test.ts:163`, `curaos/backend/services/identity-service/test/integration/divergence/role-grant-producer-parity.test.ts:173`, `curaos/backend/services/identity-service/test/integration/divergence/role-grant-producer-parity.test.ts:182`, `curaos/backend/services/identity-service/test/integration/divergence/role-grant-producer-parity.test.ts:185`.

### 5. @Optional() DI fix

**PROCEED.** Static evidence says unbound interface injection resolves to `undefined`, so constructor default applies; current module wiring provides the concrete publisher needed by the new parameter.

- Constructor default is `identityDiamondModeFromEnv()` on the optional `IdentityDiamondMode` parameter: `curaos/backend/services/identity-service/src/admin/admin.controller.ts:44`, `curaos/backend/services/identity-service/src/admin/admin.controller.ts:45`.
- Compiled metadata shows that the interface parameter is `Object` and optional, while `IdentityCoreAuditPublisher` is a concrete dependency: `curaos/backend/services/identity-service/dist/admin/admin.controller.js:157`, `curaos/backend/services/identity-service/dist/admin/admin.controller.js:160`, `curaos/backend/services/identity-service/dist/admin/admin.controller.js:161`.
- `AppModule` imports `IdentityCoreModule`, and that module exports `IdentityCoreAuditPublisher`: `curaos/backend/services/identity-service/src/app.module.ts:59`, `curaos/backend/services/identity-service/src/identity-core/identity-core.module.ts:138`, `curaos/backend/services/identity-service/src/identity-core/identity-core.module.ts:141`, `curaos/backend/services/identity-service/src/identity-core/identity-core.module.ts:148`.

### 6. Scope

**PROCEED.** This is audit-only. I found no `actor_memberships` data write in the changed producer path, and no schema/normalizer/checker/template change in the PR-B diff.

- Diff touches `src/admin/admin.controller.ts`, `src/identity-core/identity-core.module.ts`, and two tests only: `.scratch/m9-s2-changevalues/pr45-dualwrite.diff:1`, `.scratch/m9-s2-changevalues/pr45-dualwrite.diff:110`, `.scratch/m9-s2-changevalues/pr45-dualwrite.diff:125`, `.scratch/m9-s2-changevalues/pr45-dualwrite.diff:339`.
- Producer calls `identityCoreAudit.publish` only; no repository/table write exists in helper: `curaos/backend/services/identity-service/src/admin/admin.controller.ts:76`, `curaos/backend/services/identity-service/src/admin/admin.controller.ts:77`, `curaos/backend/services/identity-service/src/admin/admin.controller.ts:90`.
- `actor_memberships` remains a separate Diamond data table with composite membership PK; the role producer does not write it: `curaos/backend/services/identity-service/src/identity-core/db/schema.ts:224`, `curaos/backend/services/identity-service/src/identity-core/db/schema.ts:243`.
- `resourceId=targetUserId` does not break parity because the Diamond normalizer assembles role-grant target from `correlationId`, not `resourceId`, when explicit `changeValues.role` exists: `curaos/backend/services/identity-service/src/identity-core/divergence/audit-normalizers.ts:191`, `curaos/backend/services/identity-service/src/identity-core/divergence/audit-normalizers.ts:218`, `curaos/backend/services/identity-service/src/identity-core/divergence/audit-normalizers.ts:223`, `curaos/backend/services/identity-service/src/identity-core/divergence/audit-normalizers.ts:228`.

### 7. Test honesty

**PROCEED.** Parity test drives real `AdminController.assignRole`, real M3 publisher, real Diamond publisher, real normalizers, and real checker. It is not hand-shaping both facts.

- Test constructs `AuthAuditPublisher` and `IdentityCoreAuditPublisher`, then passes both into a real `AdminController`: `curaos/backend/services/identity-service/test/integration/divergence/role-grant-producer-parity.test.ts:76`, `curaos/backend/services/identity-service/test/integration/divergence/role-grant-producer-parity.test.ts:86`, `curaos/backend/services/identity-service/test/integration/divergence/role-grant-producer-parity.test.ts:90`, `curaos/backend/services/identity-service/test/integration/divergence/role-grant-producer-parity.test.ts:102`.
- Test calls real `controller.assignRole`, normalizes captured wire envelopes, records them in a real checker, and asserts no pending/divergence: `curaos/backend/services/identity-service/test/integration/divergence/role-grant-producer-parity.test.ts:116`, `curaos/backend/services/identity-service/test/integration/divergence/role-grant-producer-parity.test.ts:123`, `curaos/backend/services/identity-service/test/integration/divergence/role-grant-producer-parity.test.ts:124`, `curaos/backend/services/identity-service/test/integration/divergence/role-grant-producer-parity.test.ts:139`, `curaos/backend/services/identity-service/test/integration/divergence/role-grant-producer-parity.test.ts:144`.
- Captured Diamond envelope assertion checks wire contract and target absence from `changeValues`: `curaos/backend/services/identity-service/test/integration/divergence/role-grant-producer-parity.test.ts:149`, `curaos/backend/services/identity-service/test/integration/divergence/role-grant-producer-parity.test.ts:155`, `curaos/backend/services/identity-service/test/integration/divergence/role-grant-producer-parity.test.ts:158`, `curaos/backend/services/identity-service/test/integration/divergence/role-grant-producer-parity.test.ts:160`.

### Residual notes

- **P2 test gap:** direct unit tests instantiate `AdminController` manually and do not prove Nest DI construction through `AppModule`. Static wiring looks sound from module import/export and compiled optional metadata, but a focused module-compile test would catch future provider-token regressions.
- **P2 known RED-bias:** ADR-0212 documents that repeated role grants for one `targetUserId` collide on `(tenantId, correlationId)` and can over-count divergences; this remains acceptable no-false-green behavior, not a blocker: `ai/curaos/docs/adr/0212-m9-s2-changevalues-reference-only-audit.md:262`.
