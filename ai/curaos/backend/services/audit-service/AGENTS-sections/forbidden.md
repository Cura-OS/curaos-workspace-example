# audit-service §9 - Forbidden Actions

- Do NOT add another Kafka consumer on `curaos.audit.events`.
- Do NOT write to `audit_events` table from any service other than audit-service.
- Do NOT use ORM create/update on hash-chain insert path.
- Do NOT delete from `audit_events` outside the retention Temporal workflow with legal-hold verification.
- Do NOT upload to SeaweedFS cold tier without object lock enabled.
- Do NOT skip self-audit on admin query endpoints.
- Do NOT store OpenBao signing keys in env vars or code; use OpenBao transit engine.
- Do NOT change GENESIS_HASH constant without chain re-genesis migration plan.
