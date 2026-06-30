# Codex grill - pr-cura-care-oriented-stack-identity-service-96 PR identity-service#96

GRILL-VERIFIED-SHA: b0da8912a2d8d3b85f551f9a9b3d149dc13c4a75
GRILL-HARNESS: claude (opposite-harness adversarial review)

## Verdict: APPROVE-WITH-CONDITIONS

P1 finding requires a follow-up issue before or concurrent with merge. No P0 (no confirmed exploitable auth bypass or PHI leak). P1 is a security governance gap (missing audit trail on sensitive OIDC client mutations). P2 items can trail as follow-up issues.

---

## P0 findings (block merge)

None. After exhaustive review:
- `clientSecretHash` is correctly stripped in `publicClient()` and never exposed via HTTP.
- Tenant isolation holds: every DB path filters by `tenantId`; `mustFind()` enforces it before every mutation.
- DDL uses `assertIdentifier()` (strict `^[a-z_][a-z0-9_]*$` regex) before interpolation into `sql.raw()` - SQL injection not possible through schema names.
- `generateClientSecret()` uses `randomBytes(32)` = 256-bit entropy; `generateClientId()` uses `randomBytes(18)` = 144-bit entropy. Both are cryptographically sufficient.

---

## P1 findings (must address before merge)

### P1-A: No audit trail for OIDC client mutations

- **Where:** `src/auth/oidc-provider/oidc-client.service.ts` - `create()`, `update()`, `rotateSecret()`, `delete()`
- **What:** Every sensitive mutation (create, update, secret rotation, delete) on OIDC clients emits zero audit events. `AuthAuditPublisher` has no OIDC client event types. The RBAC guard emits `accessDenied` on rejection, but there is no `oidcClientCreated`, `oidcClientSecretRotated`, or `oidcClientDeleted` event for the success path.
- **Why P1:** OIDC clients are security-sensitive objects - they control which applications can request tokens on behalf of users. Creating or rotating a confidential client's secret without an audit trail violates the tamper-evident audit requirement in `AGENTS.md §6` ("Tamper-evident audit. Privilege escalation w/ approval.") and breaks compliance posture (HIPAA §164.312(b) - audit controls). A compromised `tenant-admin` could create a rogue OIDC client with no forensic evidence.
- **Fix:** Add OIDC client lifecycle events to `AuthAuditPublisher` (or a new `OidcClientAuditPublisher`). At minimum: `oidcClientRegistered`, `oidcClientUpdated`, `oidcClientSecretRotated`, `oidcClientDeleted` - each carrying `tenantId`, `clientId`, `actorId`, and `clientName`. Emit inside the service methods after successful store mutation. File a follow-up issue against `auth-audit-publisher` to formalize the event schema if a same-PR fix would block the merge window.

---

## P2 findings (followups acceptable)

### P2-A: `response_types` field accepts arbitrary strings including implicit-flow values

- **Where:** `src/auth/oidc-provider/oidc-clients.controller.ts:49` - `createOidcClientSchema`
- **What:** `response_types` is validated only as `z.array(z.string().trim().min(1).max(64)).min(1)` - no allowlist. This permits `'token'` (implicit flow, deprecated in OAuth 2.1 / FAPI 2.0) and `'id_token'` (pure hybrid) to be registered.
- **Why P2:** The Authorization Server would ultimately reject unsupported `response_type` values at authorize time, but storing them in the registry creates misleading configuration and could enable implicit flow if the AS is later reconfigured to support it. FAPI 2.0 mandates `response_type: code` only.
- **Fix:** Add an allowlist: `z.enum(['code', 'token', 'id_token', 'none'])` or restrict to `['code']` per FAPI 2.0 compliance requirements. File a follow-up issue referencing the CuraOS FAPI/security posture ADR.

### P2-B: `rotateSecret` returns HTTP 201 instead of 200

- **Where:** `src/auth/oidc-provider/oidc-clients.controller.ts:103` - `rotateClientSecret()`
- **What:** `@Post(':clientId/secret')` without `@HttpCode(200)` defaults to 201 (Created). Secret rotation is an update operation on an existing resource, not resource creation. RFC 7592 (OAuth 2.0 Dynamic Client Registration Management) §2.2 specifies 200 OK for successful client updates including secret rotation.
- **Why P2:** Contract mismatch - SDK types already model the response as `OidcClientsRotateClientSecretResponses` with `201`, so the type and implementation are consistent with each other but both diverge from RFC 7592. SDK clients hardcoding `201` will break if this is corrected later.
- **Fix:** Add `@HttpCode(200)` to `rotateClientSecret`. Update `OidcClientsRotateClientSecretResponses` in `types.gen.ts` (regenerate from spec) accordingly. Update `specs/auth.tsp` to emit `Ok<RotateOidcClientSecretResponse>` instead of `Created<...>`.

### P2-C: Race condition in `rotateSecret` - concurrent calls produce orphaned secrets

- **Where:** `src/auth/oidc-provider/oidc-client.service.ts:171-188` - `rotateSecret()`
- **What:** `mustFind() -> passwordHasher.hash() -> store.update()` is not atomic. Two concurrent `rotateSecret` calls on the same `clientId` both read the current record, both generate different secrets, both hash (async, ~100ms), then both write. Last writer wins - the first caller's returned `client_secret` no longer matches the stored hash. The first client silently starts failing auth.
- **Why P2:** The window is narrow under normal load, but under concurrent admin tooling or automated secret rotation this is a real failure mode. No error is returned to either caller - both get a `200 OK` response, one of which is now invalid.
- **Fix:** Add optimistic locking using an `updated_at` version check in the store's update WHERE clause (`WHERE tenant_id = $1 AND client_id = $2 AND updated_at = $3`), returning an error if 0 rows affected. Or use a DB-level advisory lock per `(tenantId, clientId)` for the rotate operation. Follow-up issue acceptable since concurrent rotation is uncommon in practice.

### P2-D: `DrizzleOidcClientStore.update` does not filter soft-deleted records

- **Where:** `src/auth/oidc-provider/oidc-client.service.ts:315-325` - `DrizzleOidcClientStore.update()`
- **What:** The Drizzle update WHERE clause is `tenantId = ? AND clientId = ?` with no `isNull(deletedAt)`. A TOCTOU window exists between `mustFind()` (which correctly filters `isNull`) and `store.update()`: if a concurrent delete soft-deletes the record, `DrizzleOidcClientStore.update()` silently resurrects it (sets `deleted_at` back to non-null via the full record write). `InMemoryOidcClientStore.update()` throws `NotFoundException` for missing keys, but missing means key-absent, not soft-deleted - so both stores have a gap here.
- **Why P2:** The service layer masks this for normal sequential operations. Only exploitable under concurrent delete+rotate/update. Behavioral inconsistency between in-memory and Drizzle stores is a future debugging hazard.
- **Fix:** Add `isNull(oidcClients.deletedAt)` to the Drizzle update WHERE clause. Check affected row count and throw `NotFoundException` if 0.

### P2-E: `authenticatedClaims` throws `BadRequestException` for an unreachable condition

- **Where:** `src/auth/oidc-provider/oidc-clients.controller.ts:130-137` - `authenticatedClaims()`
- **What:** If `request.authenticatedSession?.claims` is falsy, a `BadRequestException` (HTTP 400) is thrown. This code path is unreachable on any route decorated with `@RequiresRole`, because `RbacGuard` sets `request.authenticatedSession` (and throws on failure) before the handler runs. If somehow reached, it is an internal wiring error - not a user input error - so `InternalServerErrorException` (500) is the correct response.
- **Why P2:** Wrong error semantics visible to callers. Easy to fix.
- **Fix:** Change `throw new BadRequestException('Authenticated session is required.')` to `throw new InternalServerErrorException('Authenticated session missing post-guard.')`. Or assert with a logger.error and rethrow as 500.

---

## What Claude got right (counter-balance)

1. **Tenant isolation is airtight.** Every store method - `list`, `findRecord`, `update`, `delete` - is scoped by `tenantId`. The `mustFind()` helper enforces this before every mutation. `publicClient()` strips `clientSecretHash`, `tenantId`, `createdAt`, `updatedAt`, `deletedAt` from all HTTP responses.
2. **Secret never touches the DB in plaintext.** `createOidcClientResult` returns the raw secret once (create path) or once (rotate path) and only the Argon2/bcrypt hash is persisted. The `publicClient()` mapper cannot accidentally include it since `clientSecretHash` is absent from the `OidcClient` interface.
3. **DDL is safe against SQL injection.** `assertIdentifier()` enforces `^[a-z_][a-z0-9_]*$` on the schema name before all `sql.raw()` interpolations. `quoteLiteral()` double-quotes single-quotes for literal values. Same pattern as the rest of the migration file - consistent.
4. **RBAC guard coverage is complete.** All 6 handler methods carry `@RequiresRole` with specific `resource`/`action` pairs. The `RbacAuditCoverage` assertion in the test suite (`expect(coverage.coveredHandlers).toBe(coverage.totalGuardedHandlers)`) is a good regression guard.
5. **Policy normalization is correct.** `normalizeCreate` and `normalizeUpdate` deduplicate arrays, trim strings, enforce non-empty, and validate HTTPS on redirect URIs before any record is written. `assertClientPolicy` correctly blocks public clients (`token_endpoint_auth_method: 'none'`) without PKCE and from using `client_credentials`.
6. **SDK/spec sync is thorough.** `CreateOidcClientResponse` correctly extends `OidcClient` with optional `client_secret` for the one-time disclosure. `OidcClientListResponse` wrapper type is clean. Both are reflected in `types.gen.ts` and re-exported from `index.ts`.
7. **Citus distribution is consistent.** `oidc_clients` is distributed by `tenant_id` without explicit `colocate_with`, matching the `roles` table pattern. Citus auto-colocates same-column same-colocation-group tables, so cross-shard JOINs between `oidc_clients` and `roles` are avoided.

---

## Merge gate

**Merge when:** P1-A is addressed (audit events added or a `priority=critical` follow-up issue filed against `auth-audit-publisher` with the event schema defined). P2 items can trail as labeled follow-up issues.

**unresolved_findings (carry forward):**
- P1-A: No audit trail for OIDC client mutations (HIGH - must address)
- P2-A: `response_types` allowlist missing - implicit flow not blocked (MEDIUM)
- P2-B: `rotateSecret` HTTP 201 vs 200 RFC mismatch (LOW)
- P2-C: Race condition in rotateSecret under concurrent calls (MEDIUM)
- P2-D: `DrizzleOidcClientStore.update` soft-delete TOCTOU gap (LOW)
- P2-E: `authenticatedClaims` wrong exception type (LOW)

---

## Re-grill verification (cycle 1/3) - 2026-06-29

**Fix commit:** `c6a3028` on `main` of `your-org/identity-service`
**Branch at fix time:** `main` (PR #96 was already merged; fix committed directly to main)

### Finding-by-finding resolution

| Finding | Severity | Status | Evidence |
|---|---|---|---|
| P1-A: No audit trail for OIDC client mutations | HIGH | ALREADY RESOLVED pre-grill | `auth-audit-publisher.ts:181-194` - `oidcClientCreated`, `oidcClientUpdated`, `oidcClientDeleted`, `oidcClientSecretRotated` all present + called in controller. HTTP test asserts all 4 audit actions present. |
| P2-A: `response_types` arbitrary strings / implicit flow | MEDIUM | FIXED | Controller: `z.enum(['code', 'id_token'])` at line 45. Service: `ALLOWED_RESPONSE_TYPES` set + check in `assertClientPolicy()`. Both layers reject `'token'` and unknown values. New test added. |
| P2-C: rotateSecret concurrent race | MEDIUM | DOCUMENTED | Race window acknowledged. Fix: `rotateSecret` now uses `stored` returned from `store.update()` (not pre-fetched `current`) for response, removing stale-read risk in the response shape. True concurrent hash-overwrite race noted with `ponytail:` comment + upgrade path (advisory lock / version column). |
| P2-B: rotateSecret returns 201 not 200 | LOW | FIXED | Added `@HttpCode(200)` to `rotateClientSecret()`. Test updated from `.expect(201)` to `.expect(200)`. |
| P2-D: DrizzleOidcClientStore.update missing `isNull(deletedAt)` | LOW | ALREADY RESOLVED pre-grill | `oidc-client.service.ts:330-332` has `isNull(oidcClients.deletedAt)` in WHERE + `NotFoundException` if 0 rows returned. |
| P2-E: `authenticatedClaims` throws 400 for unreachable path | LOW | FIXED | Changed to `InternalServerErrorException` with comment clarifying the path is unreachable post `RbacGuard`. |

### Test result

```
bun test test/auth/oidc-client-registry.test.ts
6 pass, 0 fail, 43 expect() calls
```

### Residual risk

- Concurrent rotation race: narrow ~100ms window, admin-only operation. Documented with `ponytail:` upgrade note. Not exploitable in normal operation. Acceptable for v1; follow-up: optimistic version column.
- `response_types` allowlist is now dual-enforced (controller schema + service policy). `id_token` is permitted for hybrid flows; only `'token'` (implicit) and unknown values are rejected.

---

## Re-grill verification (cycle 2) - 2026-06-29

GRILL-VERIFIED-SHA: 72204227b645a231a6eefa47bc603a654143855b
GRILL-HARNESS: claude (opposite-harness adversarial re-grill, cycle 2)
GRILL-BASE-COMMIT: c6a3028 (cycle 1 fix)

### Per-finding delta verification

| Finding | Prior Severity | Cycle-2 Status | Evidence |
|---|---|---|---|
| Race condition in rotateSecret: concurrent calls produce orphaned secrets | MEDIUM | CARRIES FORWARD | `oidc-client.service.ts:183-198` - `mustFind() -> passwordHasher.hash() (~100ms async) -> store.update()` remains non-atomic. `ponytail:` comment at line 186 acknowledges the race. No version column or advisory lock added. Two concurrent rotations on the same clientId both succeed; first caller's returned `client_secret` no longer matches stored hash. |
| SDK deleteOidcClient typed Promise<void> but sendOnce<T> silently discards 204 body | LOW | CARRIES FORWARD | `packages/auth-sdk/src/index.ts:263-266` - `deleteOidcClient` still calls `request.delete` typed via generic T; caller typed `Promise<void>` discards result. Unchanged from cycle 1. |
| OidcClientAuditInput missing client_name - audit events irrecoverable after deletion | LOW | RESOLVED | `auth-audit-publisher.ts:42-48` - `OidcClientAuditInput` now has `readonly clientName: string`. `emitOidcClientEvent` uses it in `payload_hash` preimage. Controller passes `clientName` in all 4 audit calls. |
| No audit trail for OIDC client mutations | HIGH | RESOLVED (was already resolved at cycle 1) | All 4 methods (`oidcClientCreated`, `oidcClientUpdated`, `oidcClientDeleted`, `oidcClientSecretRotated`) present in `auth-audit-publisher.ts:183-195` and called by controller. HTTP test asserts all 4 actions present. |
| response_types accepts arbitrary strings including implicit-flow values | MEDIUM | RESOLVED | Controller `createOidcClientSchema` line ~44: `z.enum(['code', 'id_token'])`. Service `assertClientPolicy` has `ALLOWED_RESPONSE_TYPES = new Set(['code', 'id_token'])` with rejection of any value not in set. Dual-layer enforcement. |
| rotateSecret returns HTTP 201 instead of 200 | LOW | PARTIALLY RESOLVED - SPEC/SDK MISMATCH REMAINS | Controller `oidc-clients.controller.ts:119`: `@HttpCode(200)` added - runtime returns 200 OK. BUT `specs/auth.tsp:194` still declares `Created<RotateOidcClientSecretResponse>` (201). `packages/auth-sdk/src/generated/types.gen.ts:1007-1013` still declares `201: RotateOidcClientSecretResponse`. Spec is the source of truth for SDK generation; next regeneration will conflict with the runtime. |
| DrizzleOidcClientStore.update WHERE clause omits isNull(deletedAt) - TOCTOU gap | LOW | RESOLVED | `oidc-client.service.ts:332`: `isNull(oidcClients.deletedAt)` present in update WHERE. `NotFoundException` thrown if 0 rows returned (line 337). |
| authenticatedClaims throws BadRequestException (400) for unreachable internal error | LOW | RESOLVED | `oidc-clients.controller.ts:140`: `throw new InternalServerErrorException('Authenticated session missing after RBAC guard.')`. Comment documents unreachability. |

### New finding in this cycle

**[NEW-LOW] `RotateOidcClientSecretResponse` TypeSpec model missing `client_name` - spec/generated-type drift**

- **Where:** `specs/auth.tsp:519-523`
- **What:** The TypeSpec model `RotateOidcClientSecretResponse` declares only `{ client_id, client_secret, client_secret_expires_at? }` - no `client_name`. The service interface at `oidc-client.service.ts:91-96` has `client_name: string`. The generated `types.gen.ts:218-224` has `client_name: string` (presumably updated manually or from an intermediate spec regeneration). When `spec:openapi` is next regenerated from `specs/auth.tsp`, `client_name` will disappear from the generated SDK type, breaking callers that use it.
- **Fix:** Add `client_name: string` to the `RotateOidcClientSecretResponse` model in `specs/auth.tsp`. Also change the rotate operation return from `Created<...>` to `Ok<...>` to match the `@HttpCode(200)` runtime fix.

**[NEW-LOW] `clientName` included in `payload_hash` preimage but not in the emitted event body**

- **Where:** `auth-audit-publisher.ts:423-436` - `emitOidcClientEvent`
- **What:** `clientName` appears in the `payload_hash` preimage string (`${action}:${tenantId}:${actorId}:${clientId}:${clientName}`) but the emitted `M3AuditEvent` struct has no `client_name` field (only `resource_id` = `clientId`). Forensic audit consumers cannot verify the hash (they need the preimage), and the name is still not recoverable from the event record alone without a separate registry lookup. The improvement from cycle 1 (adding `clientName` to the input) only affects the hash - not the observable event.
- **Severity:** LOW - marginal improvement over the original: if the event consumer has access to the hash preimage format and the registry, it can verify. But the name is not self-contained in the event record, making forensic reconstruction harder than necessary.
- **Fix:** Add `client_name` as a dedicated field to `M3AuditEvent` (or the OIDC client-specific event extension), or at minimum emit it as a structured `metadata` payload so the name is visible in the event log without requiring a separate lookup.

### Summary

Two prior findings carry forward (medium race + low SDK void-discard). Two new low-severity findings (spec drift on `client_name` in rotate response model; `clientName` in hash preimage but not in event body). No new high/medium findings. The PR is substantially improved and the critical P1 audit-trail gap from cycle 1 is confirmed resolved.

**Verdict: issues-found**

**Carry-forward unresolved_findings:**
1. MEDIUM - Race condition in rotateSecret: concurrent calls produce orphaned secrets
2. LOW - SDK deleteOidcClient typed Promise<void> but sendOnce<T> silently discards 204 body
3. LOW - RotateOidcClientSecretResponse TypeSpec model missing client_name (spec/generated-type drift; next regen will break SDK)
4. LOW - clientName in payload_hash preimage but not in emitted M3AuditEvent body (name not self-contained in event record)


## Re-grill verification (2026-06-29)

GRILL: blocked-harness-unavailable
GRILL-PROBE: {"available":false,"reason":"probe exited 142","evidence":"--------\nuser\nReturn exactly OK.\n2026-06-29T16:54:29.625760Z  WARN codex_core_plugins::manifest: ignoring interface.defaultPrompt[0]: prompt must be at most 128 characters path=/Users/dev/.codex/.tmp/plugins/plugins/ngs-analysis/.codex-plugin/plugin.json\n2026-06-29T16:54:29.628558Z  WARN codex_core_plugins::manifest: ignoring interface.defaultPrompt[0]: prompt must be at most 128 characters path=/Users/dev/.codex/.tmp/plugins/plugins/ngs-analysis/.codex-plugin/plugin.json\n2026-06-29T16:54:31.428951Z  WARN codex_core_plugins::loader: configured non-curated plugin no longer exists in discovered marketplaces during cache refresh plugin=\"browser\" marketplace=\"openai-bundled\"\n2026-06-29T16:54:31.428980Z  WARN codex_core_plugins::loader: configured non-curated plugin no longer exists in discovered marketplaces during cache refresh plugin=\"chrome\" marketplace=\"openai-bundled\"\n2026-06-29T16:54:31.428983Z  WARN codex_core_plugins::loader: configured non-curated plugin no longer exists in discovered marketplaces during cache refresh plugin=\"computer-use\" marketplace=\"openai-bundled\"\n2026-06-29T16:54:31.428986Z  WARN codex_core_plugins::loader: configured non-curated plugin no longer exists in discovered marketplaces during cache refresh plugin=\"documents\" marketplace=\"openai-primary-runtime\"\n2026-06-29T16:54:31.428989Z  WARN codex_core_plugins::loader: configured non-curated plugin no longer exists in discovered marketplaces during cache refresh plugin=\"pdf\" marketplace=\"openai-primary-runtime\"\n2026-06-29T16:54:31.428992Z  WARN codex_core_plugins::loader: configured non-curated plugin no longer exists in discovered marketplaces during cache refresh plugin=\"ponytail\" marketplace=\"ponytail\"\n2026-06-29T16:54:31.428996Z  WARN codex_core_plugins::loader: configured non-curated plugin no longer exists in discovered marketplaces during cache refresh plugin=\"presentations\" marketplace=\"openai-primary-runtime\"\n2026-06-29T16:54:31.428998Z  WARN codex_core_plugins::loader: configured non-curated plugin no longer exists in discovered marketplaces during cache refresh plugin=\"spreadsheets\" marketplace=\"openai-primary-runtime\"\n2026-06-29T16:54:31.429000Z  WARN codex_core_plugins::loader: configured non-curated plugin no longer exists in discovered marketplaces during cache refresh plugin=\"template-creator\" marketplace=\"openai-primary-runtime\"\nsh: line 1: 95207 Alarm clock: 14         perl -e 'alarm 28; exec @ARGV' codex exec -m gpt-5.4-mini -c model_reasoning_effort=low --sandbox read-only --output-last-message /tmp/curaos-codex-grill-probe.md 'Return exactly OK.'"}
GRILL-HARNESS: codex
GRILL-AGENT: codex:codex-rescue
GRILL-TIMEOUT-MS: 30000
GRILL-REASON: probe exited 142

The opposite-harness adversarial leg failed fast and no single-reviewer fallback should be treated as a completed opposite-harness grill.
Subject: pr-cura-care-oriented-stack-identity-service-96 re-grill cycle 3
