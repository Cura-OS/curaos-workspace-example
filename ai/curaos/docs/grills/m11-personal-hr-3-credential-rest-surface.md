# Grill: personal-hr-service#3 - credential REST surface + worker_self_profile behind consent guard

- Milestone/Story: M11 / personal-hr-service#3 (GA wave 2, v1.1)
- Direction: Claude -> Codex (opposite-harness adversarial planning review)
- Harness: codex `gpt-5.4` effort=high (the bundled `opposite-harness-grill` probe alarm fired at 18s on Codex cold-start - known #507 class; ran the grill call directly with a 480s budget after the probe printed `OK`)
- Date: 2026-06-08
- Verdict: PROCEED with refinements (no Critical blocker; consent-seam decision CONFIRMED non-negotiable by depcruise)

## Codex grill output (verbatim, abridged to the load-bearing items)

### 6. Decision points WITH recommended answers (auto-applied per [[curaos-recommendation-auto-apply-rule]])

1. Keep real `@curaos/healthstack-consent` imports OUT of neutral `personal-hr-service`; bind at the vertical composition root. "Depcruise makes this non-negotiable" (`.dependency-cruiser.cjs:113` `no-neutral-to-vertical`). -> AUTO-APPLIED (was my decision; confirmed).
2. Use a LOCAL `@RequiresConsent(...)` seam that writes the SAME metadata key + descriptor shape as healthstack (`curaos:requires-consent`, `resourceType`, `action`, `patientRefFrom`, optional `smartScopeResourceType`) so the overlay adapter is drop-in. -> AUTO-APPLIED.
3. Routes use a LOCAL GUARD CLASS in `@UseGuards(...)` that delegates to an injected contract token - do NOT put a symbol token directly in `@UseGuards(...)`. -> AUTO-APPLIED (NestJS correctness).
4. Keep protected credential data in `personal_hr`; do not re-persist org HR fields. -> AUTO-APPLIED.
5. Credential events stay reference-only; never emit raw credential number / jurisdiction / PSV ref / attachment ref. -> AUTO-APPLIED (the #7 producer already enforces this).
6. Audit stays reference-only with `changedFields` NAMES only, same tx as the business write via audit_outbox. -> AUTO-APPLIED.
7. Treat `worker_self_profile` as READ-COMPOSITION only until a real hr-core read API exists (`HrsService` currently exposes only `status()`). -> AUTO-APPLIED: self-profile composes via an injectable hr-core read PORT (in-memory default), keyed by party_id; does NOT add a table (lane #6 owns the schema).
8. Keep principal echo on `/whoami`; reserve `:id` for real resource reads (mold guidance). -> AUTO-APPLIED.
9. Wire idempotency to the existing `idempotency_keys` table contract: `expires_at > now()` lookup + batch reaper; no schema edits. -> AUTO-APPLIED.

### 4. Hidden deps/subtasks (addressed)
- `worker_self_profile` needs an hr-core read surface -> use an injectable read PORT with an in-memory default (the standalone-shell pattern); the real port binds at the composition root.
- Consent seam needs a concrete LOCAL guard class for `@UseGuards(...)`, not only a DI token -> `CredentialConsentGuard` (local) delegates to the injected `CONSENT_ENFORCER` contract.
- Idempotency interceptor + reaper are controller-layer work -> wired here against the existing table contract.

### 7. User-escalation candidates (resolved without escalation; recommendations exist)
- `user_id -> party_id` bridge: the principal carries `actorId` (the user); `party_id` is supplied on the self-profile body/route and resolved against the injectable hr-core read port. Conservative documented assumption; reversible. NOT escalated.
- Consent modeled as clinical FHIR patient-scoped vs personal-credential abstraction: use the SAME descriptor shape as healthstack so the overlay adapter translates 1:1. NOT escalated (recommendation in item 6.2).
- Fail-closed when `HEALTHSTACK_OVERLAY=on` but no binder: the seam's default in-service enforcer is a deny-when-flag-on-but-unbound fence (fail-closed). Documented. NOT escalated.
- "New PHI fields beyond existing schema would be T3" -> this story adds NO new PHI fields (reuses #5's schema), so NOT T3.

## docs/ADR + glossary conflicts the grill flagged (handled)
- Personal CONTEXT says "no PHI/PII rows persist here" but the credential schema DOES persist credential PII - this is the #5 boundary already resolved (overlay schema IS the protected store; hr-core stays reference-only). CONTEXT TODO event maps are pre-#7; updated as part of closeout where owned.
- `worker_self_profile` term vs `/whoami` precedent: distinct routes - `/whoami` stays the principal-echo proof; `worker-self-profile` is the new self-asserted profile resource.

## Net effect on plan
No re-scope. The consent-seam architecture is validated and the controller/guard/idempotency wiring is sharpened. Proceeding to TDD.
