# party-service §1 - Baseline Rules (Mandatory)

## Neutrality rule (ADR-0099)
- party-service MUST NOT import any `@healthstack/*`, `@erp/*`, or `@educationstack/*` package.
- No FHIR types in party-service business logic. `fhir_id` is an opaque string in `party_external_refs`.
- Any proposal to add clinical fields (diagnosis, medication, encounter) to party-service is a violation of generic-before-vertical. Reject it.

## PII encryption (ADR-0162)
- `given_name`, `family_name`, `date_of_birth`, `gender_identity`, all `party_contacts.value` fields: encrypted via OpenBao transit middleware.
- Encryption in persistence middleware only - NOT in controller or service layer.
- Do NOT log raw values from persons table.
- Do NOT filter/sort on encrypted columns.

## Tenancy (ADR-0155)
- `TenantModule.forRoot()` in AppModule - mandatory.
- Tenant-scoped Drizzle connection/session helper for all DB access - mandatory.
- `TenantCacheService` for Valkey - mandatory.
- `@SkipTenancy()` only on `/health`, `/metrics`.
- ESLint: `require-tenant-module` (error), `no-raw-db-client` (error), `no-raw-cache-manager` (warn).

## Audit (ADR-0157)
- `AuditInterceptor` globally registered. All mutations produce `curaos.audit.events`.
- `AnonymizePerson` audit event: `action = "party.person.anonymized"`.
- All gRPC calls from identity-service also produce audit events (AuditInterceptor on gRPC controller).

## GDPR erasure (ADR-0162)
- `AnonymizePerson` must null ALL PII fields; set `display_name = "[Removed]"`, `status = "erased"`.
- NEVER delete the party row - tombstone required.
- Emit `curaos.party.person.erased` Kafka event AFTER successful DB update.
- Invalidate `ResolveSmartUser` Valkey cache for this user_id on anonymisation.
