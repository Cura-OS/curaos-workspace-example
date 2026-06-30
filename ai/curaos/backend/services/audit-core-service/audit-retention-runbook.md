# Audit Tiered-Retention Runbook — `curaos.core.audit.event.v1`

> Operations runbook for the audit event log's hot/cold tiered-retention policy.
> Scope: M9-S5.4. Owner: audit-core-service. Profile-gated infra/ops config — no service code.
>
> Binding research: [`ai/curaos/docs/research/m9-s5-audit-core-service.md`](../../../docs/research/m9-s5-audit-core-service.md) §5.5.
> Binding rules: [[curaos-airgap-rule]] · [[curaos-postgres-rule]] (§"Why SeaweedFS") · [[curaos-rolling-update-rule]].
> Binding ADRs: ADR-0163 DA13 Q6 (SeaweedFS, not MinIO) · ADR-0164 §2.8 (air-gap tiering off) · ADR-0210 / ADR-0212 (audit shape).
>
> Config files (in the `curaos/` code repo, per the ai-mirror rule — agent docs here, config there):
> - `curaos/ops/zarf/values/redpanda.yaml` — **air-gap profile** (tiering OFF, do not touch).
> - `curaos/ops/zarf/values/redpanda-tiered.yaml` — **connected profile** (tiering ON → SeaweedFS S3).
> - `curaos/ops/zarf/values/audit-topics.yaml` — topic + tiered-retention + per-tenant override.
> - `curaos/ops/zarf/zarf.yaml` — redpanda component (documents how to opt into the connected profile).

## 1. Why tiered storage

The audit event log is the tamper-evident, reference-only record every CuraOS service emits to
`curaos.core.audit.event.v1`. HIPAA (45 CFR 164.316(b)(2)(i)) mandates a 6-year retention minimum;
CuraOS pins **7 years**. Keeping 7 years of audit segments on broker disk is uneconomic, so we split:

| Tier | Window | Storage | Governs | Config key |
|---|---|---|---|---|
| **Hot** | 90 days | Broker local PVC | Fast query window | `local.retention.ms = 7776000000` |
| **Cold** | 7 years (total) | SeaweedFS S3 (`curaos-audit-archive`) | HIPAA tail | `retention.ms = 220898664000` |

Kafka enforces `local.retention.ms <= retention.ms`. KIP-405 rolls closed segments older than the
hot window out to the cold object store; segments are deleted only after the total `retention.ms`.
Audit envelopes are **reference-only** (no PHI) — see ADR-0212 — so the cold tail carries no protected data.

## 2. Broker + topic config (KIP-405)

**Cold object store = SeaweedFS S3 (Apache-2.0), NOT MinIO** — MinIO's AGPLv3 is an air-gap legal risk
(ADR-0163 DA13 Q6). SeaweedFS exposes an S3-compatible gateway at
`seaweedfs-s3.curaos-ops.svc.cluster.local:8333` (already wired for CNPG Barman backups). It satisfies the
KIP-405 RemoteStorageManager S3 contract with path-style access enabled.

### 2a. Upstream Apache Kafka 4.x (KIP-405 — GA since Kafka 3.9)

Broker-level (`server.properties` / Helm broker config):

```properties
remote.log.storage.system.enable=true
remote.log.storage.manager.class.name=io.aiven.kafka.tieredstorage.RemoteStorageManager
remote.log.metadata.manager.class.name=org.apache.kafka.server.log.remote.metadata.storage.TopicBasedRemoteLogMetadataManager
# Aiven tiered-storage-for-apache-kafka (Apache-2.0 RSM) -> SeaweedFS S3
rsm.config.storage.backend.class=io.aiven.kafka.tieredstorage.storage.s3.S3Storage
rsm.config.storage.s3.bucket.name=curaos-audit-archive
rsm.config.storage.s3.endpoint.url=https://seaweedfs-s3.curaos-ops.svc.cluster.local:8333
rsm.config.storage.s3.path.style.access.enabled=true   # required for SeaweedFS / non-AWS
rsm.config.chunk.size=4194304
```

Topic-level (`curaos.core.audit.event.v1`):

```properties
remote.storage.enable=true
local.retention.ms=7776000000        # 90 days hot (query window)
retention.ms=220898664000            # 7 years total (HIPAA cold tail)
cleanup.policy=delete                 # append-only audit log — never compact
```

### 2b. Redpanda (the deployed/air-gap distribution)

Redpanda is Kafka-API-compatible and implements KIP-405-style tiering via native **Shadow Indexing**
(`cloud_storage_*`). The connected-profile overlay `redpanda-tiered.yaml` sets:

```yaml
tiered:
  config:
    cloud_storage_enabled: true
    cloud_storage_enable_remote_write: true
    cloud_storage_enable_remote_read: true
    cloud_storage_api_endpoint: "seaweedfs-s3.curaos-ops.svc.cluster.local"
    cloud_storage_api_endpoint_port: 8333
    cloud_storage_bucket: "curaos-audit-archive"
    cloud_storage_url_style: "path"   # path-style required for SeaweedFS
```

Topic keys in `audit-topics.yaml` carry both the upstream (`remote.storage.enable`, `local.retention.ms`)
and Redpanda-native (`redpanda.remote.write/read`, `redpanda.retention.local.target.ms`) forms, so the
same topic definition provisions correctly on either broker.

## 3. Per-tenant retention override

- **Cluster default = the HIPAA floor (7 years).** Declared in `audit-topics.yaml` under
  `tenantRetentionOverrides.default`.
- A tenant whose regulatory regime or contract needs a **longer** cold tail gets an override that
  **raises** `retention.ms` on its tenant-scoped topic/partition policy.
- **`retention.ms` may only be raised above the 7y floor, never lowered** — the HIPAA minimum is a hard floor.
- **`local.retention.ms` (the 90-day hot window) is NOT tenant-overridable** — it is an operational
  disk-budget knob, not a compliance knob.
- Applied per tenant via `rpk topic alter-config <topic> --set retention.ms=<ms>` (Redpanda) or
  Kafka AdminClient `alterConfigs` (upstream), driven by the `TENANT_TIER` Zarf variable + audit-core
  tenant config at deploy time.

```bash
# Raise a tenant's cold tail to 10 years (example). MUST be >= 7y floor (220898664000).
rpk topic alter-config curaos.core.audit.event.v1 --set retention.ms=315569520000
```

## 4. Air-gap profile — tiering PINNED OFF

The air-gap Zarf bundle **must never** ship a tiering object-store dependency
([[curaos-airgap-rule]], ADR-0164 §2.8). The air-gap profile uses `values/redpanda.yaml` only, which pins:

```yaml
tiered:
  config:
    cloud_storage_enabled: false
    cloud_storage_enable_remote_write: false
    cloud_storage_enable_remote_read: false
```

In air-gap, the broker rejects `remote.storage.enable` and the topic falls back to local-only
`retention.ms`; **audit-core-service still retains the full 7-year tail in its own Postgres store**, so
HIPAA retention is satisfied without an external object store. The connected-profile overlays
(`redpanda-tiered.yaml`, `audit-topics.yaml` tiering keys) are **never** referenced by the air-gap
component. CI guard `tools/build/zarf-zero-egress-check.sh` keeps external egress denied in air-gap.

## 5. Opting into the connected profile

In a cloud / on-prem-connected deployment, append the connected overlays to the redpanda component's
`valuesFiles:` in `curaos/ops/zarf/zarf.yaml` (Helm last-wins merge), AFTER `values/redpanda.yaml`:

```yaml
valuesFiles:
  - values/redpanda.yaml          # base
  - values/redpanda-tiered.yaml   # tiering ON -> SeaweedFS S3
  - values/audit-topics.yaml      # audit topic + hot/cold retention
```

Inject the SeaweedFS S3 credentials (`cloud_storage_access_key` / `cloud_storage_secret_key`) at deploy
time via Zarf variable / Kubernetes secret — never commit them.

## 6. Verification

1. **Config lint (always, both profiles):** `local.retention.ms <= retention.ms`; air-gap profile pins
   `cloud_storage_enabled: false`. `yq` parse all four files clean.
2. **Tiering smoke (connected profile only):** produce > one segment's worth of audit events, wait past
   `segment.ms` + the hot window, confirm a closed segment object appears in the SeaweedFS
   `curaos-audit-archive` bucket and is readable on consume (Shadow Indexing remote read).
3. **Air-gap regression:** deploy the air-gap bundle, confirm the broker starts with tiering off and no
   egress to any object store (zero-egress CNP holds).

## 7. Disclosure Accounting Report Gate

HIPAA accounting-of-disclosures adds a report-specific retention floor on top of the audit event log:

- 45 CFR 164.528 gives an individual the right to an accounting for disclosures made in the six years
  before the request.
- 45 CFR 164.528(d) and 45 CFR 164.530(j) require documenting the accounting content, accountings
  provided, and responsible office/persons for at least six years from creation or last effective date.
- CuraOS keeps the canonical audit event log for seven years total, so the raw reference trail exceeds
  the six-year floor. The disclosure accounting projection is a reference-only report index over that
  trail and must not be configured with a shorter retention/delete policy.

Retention mapping:

| Artifact | CuraOS path | Floor mapping |
|---|---|---|
| Audit event log | `curaos.core.audit.event.v1` hot/cold retention above | Seven-year total retention exceeds the six-year accounting floor. |
| Disclosure projection | `audit_core.disclosure_accounting` | Keep for at least the same six-year accounting window; tenant overrides may only raise retention. |
| Report output evidence | `GET /audits/disclosures/accounting` fixture | Proves six-year lookback, tenant scoping, and reference-only redaction. |
| Overlay recipient/PHI detail | Owning HealthStack disclosure store | Overlay responsibility; neutral audit stores only references and categories. |

Service-local verification command:

```bash
bun run test:disclosure-report-runbook
```

This command runs `test/integration/disclosure-accounting-report.test.ts`. It must pass before a
regulated rollout because it proves:

- default `lookbackStart` equals `requestedAt - 6 years`;
- rows are scoped by JWT-derived tenant id and `subject_ref`;
- report rows include only reference metadata;
- neutral audit output excludes recipient and PHI description fields.

Operator evidence required before regulated rollout:

1. Passing output from `bun run test:disclosure-report-runbook`.
2. Topic/config evidence showing `retention.ms >= 220898664000` for connected audit topics, or
   equivalent seven-year local retention evidence for the air-gap profile.
3. Config evidence showing `local.retention.ms <= retention.ms`.
4. Connected profile evidence that SeaweedFS remote tiering is enabled and readable, or air-gap
   evidence that remote tiering is disabled and local retention covers the full floor.
5. Report fixture evidence showing neutral output excludes recipient and PHI description fields.
6. Named privacy/compliance office or role responsible for receiving accounting requests and retaining
   accounting documentation.

## 8. References

- Research: [`ai/curaos/docs/research/m9-s5-audit-core-service.md`](../../../docs/research/m9-s5-audit-core-service.md) §5.5
- Research: [`research/2026-06-05-disclosure-retention-runbook-gate.md`](research/2026-06-05-disclosure-retention-runbook-gate.md)
- [`CONTEXT.md`](CONTEXT.md) · [`Requirements.md`](Requirements.md) · [`AGENTS.md`](AGENTS.md)
- KIP-405 (Kafka Tiered Storage) — GA since Apache Kafka 3.9
- Aiven `tiered-storage-for-apache-kafka` (Apache-2.0) — S3-compatible RemoteStorageManager
