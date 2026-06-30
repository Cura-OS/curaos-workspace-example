---
name: curaos-postgres-rule
title: PostgreSQL (CNPG + DB-per-tenant + pgBouncer + SeaweedFS backup)
description: PostgreSQL on K8s - CloudNativePG operator + Citus distributed PG (10K+ tenant scale per DA13 Q3) + always-on pgBouncer Pooler + Barman streaming backup to SeaweedFS for PITR/air-gap; 3rd-party PG via tenant connection string per PgProvider abstraction. Per-tenant schema sharded by tenant_id across Citus worker nodes (replaces prior DB-per-tenant pattern at 10K+ scale).
metadata:
  node_type: memory
  type: feedback
  originSessionId: 957dade0-7133-4262-addf-0595f6326c47
---

User decisions (2026-05-25 DA13 walk):
- **Q3 scale pivot:** 10K+ tenants from day 1 → DB-per-tenant replaced w/ **Citus extension on CNPG** (distributed PG; shard schemas across workers).
- **Q6 backup target pivot:** MinIO AGPLv3 risk → replaced w/ **SeaweedFS S3** (Apache 2.0; already in stack per ADR-0101).

Prior decisions (2026-05-24 DA4): CNPG operator + pgBouncer + Barman engine STAND.

## The rule

**CloudNativePG (CNPG) + Citus extension are the only PostgreSQL stack for CuraOS K8s clusters** (K3s/Talos/RKE2 per [[curaos-orchestration-rule]]).

| Concern | Choice |
|---|---|
| Operator | **CloudNativePG (CNPG)** - CNCF Sandbox; non-StatefulSet PVC mgmt |
| Scale topology | **Citus distributed PG** - coordinator + 3-5 worker nodes per cluster; shard tables by `tenant_id` |
| Tenant isolation model | **Shared schema sharded by `tenant_id` across Citus workers** (replaces prior DB-per-tenant at 10K+ scale per DA13 Q3) |
| HealthStack PHI override | **DB-per-tenant still mandatory for HealthStack clinical services** (smaller tenant count; strongest PHI isolation; per [[curaos-healthstack-vision]]) |
| Connection pooling | **pgBouncer** via CNPG `Pooler` CRD (always-on in front of Citus coordinator) |
| Backup target | **SeaweedFS S3** (Apache 2.0; already in ADR-0101 stack; air-gap safe per [[curaos-airgap-rule]]; replaces MinIO per DA13 Q6) |
| Backup engine | **Barman** (CNPG built-in streaming; S3-compatible target) |
| PITR retention | Per-tenant policy (default 30d; configurable per tier) |
| GDPR erasure | Primary DB purge w/in 30d (per DA13 Q7); backups exempt w/ documented retention exemption |
| Multi-region DR | CNPG `Cluster.spec.replica.source` standby clusters |
| 3rd-party provider (per [[curaos-local-vs-3rdparty-rule]]) | RDS / Cloud SQL / Aiven / Crunchy Bridge / Citus Cloud via tenant connection string via `PgProvider` abstraction |

## Tenant isolation model decision tree

| Service class | Pattern | Rationale |
|---|---|---|
| **Neutral high-volume (e.g., audit, events, calendar, tasks)** | **Citus shared schema sharded by `tenant_id`** | 10K+ tenant scale; per-tenant DB impractical at this volume per DA13 Q3 |
| **HealthStack clinical (PHI-bearing)** | **DB-per-tenant via CNPG `Database` CRD** | Strongest PHI isolation; hospital-tier customer count (smaller); HIPAA audit cleanest |
| **Single-tenant on-prem / air-gap** | **Single schema** | Per [[curaos-orchestration-rule]] on-prem profile; one tenant per deployment |
| **3rd-party-provided** | Tenant's own PG (RDS/Aiven/Citus Cloud) | Per [[curaos-local-vs-3rdparty-rule]] |

Service AGENTS.md frontmatter declares pattern explicitly.

## Banned

- Manual StatefulSet + DIY backup scripts (anti-pattern for 91-service SaaS)
- MinIO for new backups (AGPLv3 risk in air-gap bundle per DA13 Q6 - SeaweedFS replaces)
- DB-per-tenant for non-HealthStack services at 10K+ scale (use Citus distributed per DA13 Q3)
- Cross-tenant shared schema for HealthStack PHI (DB-per-tenant mandatory there)
- pgAdmin / Adminer exposed publicly (port-forward + RBAC; CiliumNetworkPolicy denies)
- WAL archiving to local PV only (always to SeaweedFS S3 for off-cluster durability per [[curaos-local-vs-3rdparty-rule]])
- SET vs SET LOCAL anti-pattern (RLS PHI leak) - DB-per-tenant + Citus tenant_id sharding default avoids this entirely
- Citus shard count changes post-prod without re-shard plan (locks per-table at create_distributed_table)

<!-- fold: rationale, non-binding -->

## Why Citus (vs YugabyteDB vs sharded clusters)

Per DA13 Q3 walk:

| Aspect | Citus on CNPG (chosen) | YugabyteDB | Multi-Citus regions |
|---|---|---|---|
| PG compat | 100% (PG extension) | Wire-protocol compat; fewer extensions | 100% |
| Operator maturity | CNPG + Citus operator integration | YB Operator | CNPG + N coordinators |
| Distributed transactions | 2PC support | Yes (native) | Cross-cluster impossible |
| pgvector + tsvector + ltree extensions | Full | Limited | Full |
| Single logical PG view | Yes (via coordinator) | Yes | No (N clusters) |
| Operational overhead | Coordinator + 3-5 workers | Multi-master ring | Multi coordinators |
| Cross-tenant queries | Yes (via coordinator routing) | Yes | No |
| HIPAA audit per-tenant | Sharded but tenant_id filter | Same | Per-cluster cleaner |

Citus + CNPG = best fit: keeps PG ecosystem (extensions, ORM compat per [[curaos-orm-rule]] 3-tier); adds distributed scale.

## Why CNPG (vs Zalando / CrunchyData / StackGres)

| Capability | CNPG | Zalando | CrunchyData |
|---|---|---|---|
| CNCF affiliation | Sandbox | none | none |
| Non-StatefulSet PVC (safer rolling restarts under SLA) | yes | no | no |
| Citus extension support | yes (Citus operator co-deploy) | manual | yes |
| Declarative `Database` CRD | yes | manual SQL | yes |
| Built-in Barman streaming to S3 (SeaweedFS-compatible) | yes | needs WAL-G/WAL-E | uses pgBackRest |
| Helm install for air-gap (Zarf per [[curaos-airgap-rule]]) | yes | yes | yes |
| 2026 momentum | #1 stars, fastest growing | top-3 plateau | top-3 |
| Docs quality | excellent | mediocre | good |
| Patroni-based failover (HA) | yes | yes (Spilo) | yes |
| K3s install footprint | low | medium | medium |

## Why SeaweedFS (replacing MinIO per DA13 Q6)

| Aspect | SeaweedFS (chosen) | MinIO | RustFS (rejected v1) |
|---|---|---|---|
| License | **Apache 2.0** | AGPLv3 (air-gap bundle risk) | Apache 2.0 |
| Production status | Battle-tested 2015+ | Production-ready | v1.0.0-alpha (distributed mode NOT released) |
| Distributed mode | Production-ready | Production-ready | NOT YET |
| Small-file packing | Best-in-class (billions of small files) | Standard S3 | Single-node only |
| S3 compat | High | Highest | High |
| Already in CuraOS stack per ADR-0101 | Yes | No | No |
| WORM/Object Lock | Supported (PoC pre-prod) | Supported | Not implemented |
| Air-gap fit | ✅ Apache 2.0 + Zarf-bundle safe | ❌ AGPLv3 legal risk | ⚠️ Alpha + missing distributed |

RustFS revisit v2 when distributed mode GA (per DA13 Q6 research).

## How Citus shards work

```yaml
apiVersion: postgresql.cnpg.io/v1
kind: Cluster
metadata:
  name: identity-pg-citus
  namespace: identity-service
spec:
  imageName: ghcr.io/cloudnative-pg/postgresql:17.2-citus13
  instances: 5  # 1 coordinator + 4 workers (Citus auto-detects via citus extension)
  bootstrap:
    initdb:
      postInitSQL:
        - "CREATE EXTENSION IF NOT EXISTS citus;"
        - "SELECT citus_set_coordinator_host('identity-pg-citus-rw');"
  postgresql:
    parameters:
      shared_preload_libraries: 'citus,pg_stat_statements'
      citus.shard_count: '32'
      citus.shard_replication_factor: '2'
```

Per-table sharding:

```sql
-- Distributed table sharded by tenant_id
CREATE TABLE identity.users (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  email text NOT NULL,
  ...
);
SELECT create_distributed_table('identity.users', 'tenant_id');

-- Reference table (replicated to all workers; small, read-mostly)
CREATE TABLE identity.tenants (
  id uuid PRIMARY KEY,
  slug text NOT NULL,
  ...
);
SELECT create_reference_table('identity.tenants');
```

## How HealthStack DB-per-tenant works (when applicable)

For PHI-bearing clinical services only (per decision tree above):

```yaml
apiVersion: postgresql.cnpg.io/v1
kind: Database
metadata:
  name: tenant-hospital-mercy
  namespace: healthstack-patient-service
spec:
  name: tenant_hospital_mercy
  owner: app
  cluster:
    name: healthstack-pg  # dedicated cluster (not Citus; smaller tenant count)
  template: template1
```

Tenant onboarding workflow (per ADR-0123 Codegen):
1. Tenant signup → NestJS `tenant.created` event
2. Provisioning service checks service class:
   - **Neutral/Citus services:** insert tenant row into `tenants` reference table; emit `tenant.provisioned.citus` event; Drizzle migrations skip (schema already exists; tenant_id rows isolated)
   - **HealthStack PHI services:** apply `Database` CRD; CNPG creates DB; Drizzle per-tenant migrations run
3. pgBouncer pool auto-created
4. Cilium `CiliumNetworkPolicy` updated (per [[curaos-cni-rule]])
5. Tenant onboarding event emitted

## How pgBouncer wraps

Always-on in front of Citus coordinator + every per-tenant DB:

```yaml
apiVersion: postgresql.cnpg.io/v1
kind: Pooler
metadata:
  name: identity-pg-pooler
spec:
  cluster:
    name: identity-pg-citus
  type: rw
  instances: 3
  pgbouncer:
    poolMode: transaction
    parameters:
      max_client_conn: "10000"  # higher for Citus coordinator
      default_pool_size: "50"
```

`transaction` mode = default. `session` mode for prepared-statement-heavy code (declare in service AGENTS.md frontmatter under `data.pgbouncer_mode`).

## How backups work (SeaweedFS target)

CNPG `Cluster.spec.backup.barmanObjectStore` points at SeaweedFS S3:

```yaml
backup:
  barmanObjectStore:
    destinationPath: s3://curaos-pg-backups/identity-pg/
    endpointURL: https://seaweedfs-s3.curaos-ops.svc.cluster.local:8333
    s3Credentials:
      accessKeyId:
        name: seaweedfs-credentials
        key: ACCESS_KEY_ID
      secretAccessKey:
        name: seaweedfs-credentials
        key: SECRET_ACCESS_KEY
  retentionPolicy: "30d"
```

PITR: any timestamp within retention window restorable via `Cluster.spec.bootstrap.recovery.recoveryTarget.targetTime`.

## GDPR erasure (per DA13 Q7)

| Data class | 30d erasure | Notes |
|---|---|---|
| Primary DB tenant rows | YES | Citus: `DELETE WHERE tenant_id = ?` cascade across shards; HealthStack: drop DB |
| Search indexes (pgvector / tsvector) | YES | Per [[curaos-orm-rule]] |
| Caches (Valkey) | YES | TTL + explicit purge on erasure event |
| Object storage (SeaweedFS) | YES | Per-tenant prefix delete |
| Backups (Barman PITR archive) | EXEMPT | Documented retention exemption per GDPR Recital 30 + Art 17(3)(b)(e); legitimate interest + legal obligation; tombstone in primary DB tracks erasure |
| HIPAA audit log (6y) | EXEMPT | HIPAA-mandated retention overrides GDPR for healthcare data |

Erasure event triggers Temporal saga (per [[curaos-architecture-vision]]); cross-service erasure handled per ADR-0151 cross-cluster coherence.

## Dev mode (per [[curaos-orchestration-rule]] D0)

Dev infra Compose runs PG via `postgres:17-alpine` + Citus image OR plain PG (no Citus until integration test). Service connects to `postgres://app:dev@localhost:5432/<service>_dev`.

Standalone-clone boot: per-service `docker-compose.dev.yml` ships own PG container.

Integration tests in k3d (per D0): CNPG Helm + Citus operator installed; tests run against real CRDs.

## Local + 3rd-party rule compliance

Per [[curaos-local-vs-3rdparty-rule]]:
- **Local (default)**: CNPG + Citus + SeaweedFS backup - fully self-hosted, air-gap viable, Zarf-bundled per [[curaos-airgap-rule]]
- **3rd-party**: tenant supplies external PG connection string (RDS / Aiven / Citus Cloud) + external backup target
- **`PgProvider` abstraction** in code (in shared `@curaos/data` lib): wraps `CuraOSLocalProvider` (CNPG ref) vs `External3rdPartyProvider` (connection string) vs `CitusCloudProvider`
- **Hybrid profile**: control plane CNPG + Citus; tenant data plane = 3rd-party per tenant

## How it satisfies CuraOS rules

| Rule | Compliance |
|---|---|
| Workspace AGENTS.md §3 charter self-hosted first | CNPG + Citus + SeaweedFS entirely self-hostable; all Apache 2.0 |
| Workspace AGENTS.md §4 air-gap | Citus + CNPG + Barman + SeaweedFS work offline; Zarf-bundled per [[curaos-airgap-rule]] |
| Workspace AGENTS.md §6 reliability | Patroni failover + Barman PITR + Citus shard replication factor 2 |
| [[curaos-orchestration-rule]] | CNPG + Citus run on K3s/Talos/RKE2; same Helm install everywhere |
| [[curaos-cni-rule]] | Per-tenant PG access gated by CiliumNetworkPolicy (per [[curaos-cni-rule]]); app-layer tenant_id filter + Citus coordinator routing handle row isolation |
| [[curaos-local-vs-3rdparty-rule]] | PgProvider abstraction wraps local CNPG + external connection strings |
| [[curaos-modulith-standalone-rule]] | Dev uses postgres:17-alpine Compose; standalone clone same; prod CNPG+Citus via Helm |
| [[curaos-orm-rule]] | Drizzle migrations run against Citus distributed tables + per-tenant DBs; MikroORM for HealthStack clinical aggregates; Kysely for analytics |
| [[curaos-healthstack-vision]] | DB-per-tenant override for PHI = strongest isolation; Citus distributed for non-PHI scale |
| [[curaos-airgap-rule]] | SeaweedFS Apache 2.0 = zero AGPL exposure in Zarf bundle (per DA13 Q6) |

## Agentic-tool friendliness

- Declarative CRDs (`Cluster`, `Database`, `Pooler`, `Backup`, `ScheduledBackup`) + Citus extension on CNPG → agents author from spec
- Single Helm chart install per cluster profile; agents apply via ArgoCD ApplicationSet or `bunx helmfile apply`
- Docs at cloudnative-pg.io + docs.citusdata.com both excellent
- Predictable upgrade path via Helm `values.yaml` bumps + Citus version pinning per [[curaos-version-pinning-rule]]
- Citus `citus_dist_stat_activity` view → agents diagnose cross-shard query perf
- `kubectl exec -it pod/pg-instance-0 -- psql` works → agents debug live

## How to apply

- Codegen Engine recipes (per ADR-0123) emit:
  - For Citus services: `Cluster` w/ Citus image + `create_distributed_table` migration template
  - For HealthStack services: `Cluster` (non-Citus) + `Database` CRD per tenant + per-tenant Drizzle migrations
- Service AGENTS.md frontmatter declares:
  ```yaml
  data:
    engine: postgres
    operator: cnpg
    scale_topology: citus-distributed  # or db-per-tenant (HealthStack PHI only)
    pgbouncer_mode: transaction  # or session w/ justification
    backup_target: seaweedfs-s3
  ```
- ops/ codebase: single CNPG + Citus operator install per cluster profile; tenant onboarding job dispatches per service class
- Codegen recipes for tenant onboarding generate distributed-table provisioning OR per-tenant DB CRD
- `PgProvider` abstraction interface lives in shared `@curaos/data` lib (backend/packages/)
- Backup health monitoring: CNPG emits Prometheus metrics; SLO per [[curaos-slo-rule]]
- Version pinning per [[curaos-version-pinning-rule]]: CNPG operator + Citus extension + Postgres image all exact-version pinned

## ADRs queued

Per digest §6 + DA13:
- **ADR (NEW, K8s stack)** - number TBD (0135 unverified in RESOLUTION-MAP; use next free number ≥0212): CNPG + Citus named operator alongside K3s/Talos/RKE2 + Cilium; this rule = short form
- **ADR-0137 (NEW, multi-tenancy K8s)**: Capsule + vCluster + Citus distributed tables + CNPG `Database` CRD per HealthStack tenant compose
- **ADR-0101 amendment**: data-layer section updated - Citus distributed replaces DB-per-tenant default; SeaweedFS replaces MinIO as Barman target
- **ADR-0099 (charter)**: amend data-layer subsection to link this rule + [[curaos-orm-rule]]
