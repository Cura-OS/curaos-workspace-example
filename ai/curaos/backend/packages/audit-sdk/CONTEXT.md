# @curaos/audit-sdk — Agent Context

## Quick facts
- Wraps audit-core-service REST API; batches events
- Fails open: audit failure never blocks user action
- Correlation ID from `@curaos/core`

## Key files
- `src/client.ts` — createAuditClient
- `src/hooks/useAuditLogger.ts` — React hook
- `src/batch.ts` — batch queue + flush logic
- `src/types.ts` — AuditEvent schema

## Agent rules
- Audit failures must never throw to calling code; log to console.error and continue.
- No PHI in audit event metadata; only resource IDs and action codes.
- Run `bunx turbo run build lint test` before marking done.
