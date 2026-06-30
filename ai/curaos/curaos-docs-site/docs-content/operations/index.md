# Operations

Day-2 runbooks for operating a CuraOS deployment: health checks, observability,
backups, and the security paths an operator needs.

## Health checks

Every service exposes an unauthenticated health endpoint, so liveness can be
probed without a token. Through the gateway:

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://<host>/api/v1/identity/healthz
curl -s -o /dev/null -w "%{http_code}\n" https://<host>/api/v1/tenancy/healthz
```

A `200` means the service is up. Wire these into your uptime checks and the
ingress readiness probes. If a single service is down (for example `encounter`),
the rest of the platform keeps serving; the gateway returns an error only for
routes that need the down service.

## Observability

Observability is default-on, not opt-in:

- **Tracing** across services with correlation IDs, so a request can be followed
  end to end.
- **Structured logs** per service.
- **Metrics** with tenant-aware dashboards and alert templates.

Operators get per-tenant dashboards so a noisy tenant is visible without leaking
another tenant's data.

## Data and backups

PostgreSQL is managed by the CloudNativePG (CNPG) operator, one database per
tenant. CNPG handles:

- **Backups** to object storage, with point-in-time recovery.
- **Failover** of the primary within the cluster.
- **Per-tenant isolation**, since each tenant is its own database.

Valkey holds caching and ephemeral state; it is not the system of record, so its
loss degrades performance but does not lose tenant data.

## Reliability patterns

The platform is built to fail safely:

- Idempotent writes, so a retried command does not double-apply.
- Outbox/inbox plus durable events, so cross-service messages are not lost.
- Retries with backoff and dead-letter handling for poison messages.
- Correlation IDs threaded through logs, traces, and events.

## Security operations

- **Authentication** is OIDC with PKCE via Pocket-ID. See
  [Auth setup](../auth/index.md).
- **Authorization** is RBAC with optional ABAC.
- **Audit** is tamper-evident; privileged actions follow an approval path.
- **Break-glass** access is available for emergencies and is always logged with a
  reason, so the exceptional path is still accountable.

## Upgrades

APIs and event schemas are versioned with deprecation sunset dates, so a rolling
upgrade does not break consumers. The platform follows a forward-migration model:
new behavior lands alongside the old behind a feature flag, data is backfilled,
and the old path is removed only after telemetry confirms the new path. There are
no parallel `-v2` / `-next` deployments; everything is a forward migration of the
existing module.

## Edge and routing

In the reference deployment, ingress-nginx routes in-cluster, and the public edge
is Caddy plus Cloudflare for TLS and a public hostname. For a private or air-gap
install, the public edge is optional; the ingress controller is enough.

The full security model, the GDPR and HIPAA posture, and the operator's share of
compliance responsibility are in [Security & compliance](../security/index.md).

Next: [Integration](../integration/index.md) for connecting external systems.
