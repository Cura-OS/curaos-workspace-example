# party-service §7 - Forbidden Actions

- Do NOT import `@healthstack/*` or any FHIR-typed package.
- Do NOT delete party rows (tombstone required for GDPR).
- Do NOT skip PII encryption middleware on `persons` table writes.
- Do NOT log raw field values from `persons` or `party_contacts` tables.
- Do NOT filter/sort on encrypted DB columns.
- Do NOT change `proto/party.proto` without coordinating `@curaos/party-contracts` version bump with identity-service.
- Do NOT use raw DB clients directly; use tenant-scoped DB helper.
