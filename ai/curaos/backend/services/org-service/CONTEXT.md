# org-service — Agent Context

**Service:** org-service
**Cluster:** ADR-0200 (Identity · Party · Org · Audit)
**Runtime:** NestJS + TypeScript 5.x (ADR-0100)
**Last updated:** 2026-05-24

---

## 1. Current State

**Status: Clean slate (NestJS scaffold not yet generated)**

- Prior Kotlin/Spring Boot stubs replaced. Generate via `backend.nestjs-service` codegen recipe.
- gRPC contracts (`RemoveUserMemberships`, `AddMember`) must be defined before identity-service onboarding and GDPR sagas can be wired.
- PG `ltree` extension required at database provisioning time.
- No production traffic; pre-v1 GA.

---

## 2. Active ADR References

| ADR | Relevance |
|-----|-----------|
| [ADR-0099](../../../docs/adr/0099-charter-priorities-vision.md) | Generic-before-vertical; org = neutral hierarchy |
| [ADR-0100](../../../docs/adr/0100-foundation-platform-runtime.md) | NestJS TypeScript 5.x |
| [ADR-0150](../../../docs/adr/0150-baseline-alignment-rules.md) | Local + 3rd-party rule |
| [ADR-0154](../../../docs/adr/0154-provider-abstraction-convention.md) | OrgChartExportProvider convention |
| [ADR-0155](../../../docs/adr/0155-tenant-routing-curaos-tenancy.md) | TenantModule mandatory; schema-per-tenant |
| [ADR-0162](../../../docs/adr/0162-hipaa-2026-compliance-roadmap.md) | PG TDE; GDPR membership removal within saga |
| [ADR-0200](../../../docs/adr/0200-cluster-identity-party-org-audit.md) | Cluster ADR; gRPC contracts with identity; ltree data model; event topics |
| [ADR-0153](../../../docs/adr/0153-codegen-recipe-coverage.md) | Codegen recipes for scaffold/interceptors |
| [ADR-0120](../../../docs/adr/0120-foundation-auth.md) | OpenFGA AuthZ chain (membership events feed identity-service tuples) |
| [ADR-0157](../../../docs/adr/0157-hapi-fhir-phi-audit-reconciliation.md) | CuraOSAuditEvent schema for curaos.audit.events |

---

## 3. Integration Map

```
identity-service
  ──gRPC──▶ org-service.RemoveUserMemberships  (GDPR saga)
  ──gRPC──▶ org-service.AddMember              (onboarding saga: org invite)

org-service
  ──Kafka──▶ curaos.org.unit.created           (healthstack-fhir-service: create FHIR Organization)
  ──Kafka──▶ curaos.org.membership.granted     (identity-service: OpenFGA tuple write)
  ──Kafka──▶ curaos.org.membership.revoked     (identity-service: OpenFGA tuple delete)
  ──Kafka──▶ curaos.org.membership.removed     (identity-service: GDPR saga completion signal)
  ──Kafka──▶ curaos.audit.events               (AuditInterceptor; all mutations)
  ◀──Kafka── curaos.party.organization.created (trigger: create root org unit if none)

party-service
  ── party_id FK reference ──▶ org_memberships (no gRPC call; loose coupling by reference)
```

---

## 4. Key Decisions and Rationale

### D-001: PostgreSQL ltree over adjacency list or nested set
- Adjacency list: recursive CTE required for subtree; slow at depth 5+.
- Nested set: subtree reads O(1) but writes (move) O(n) — requires updating left/right for every row in subtree.
- `ltree`: subtree reads O(log n) with GiST index; writes O(children) for path recalculation; human-readable path strings useful for debugging.
- Requirement: 10-level depth, up to 10,000 nodes per tenant.

### D-002: org-service does NOT call OpenFGA directly
- OpenFGA is part of identity-service's AuthZ layer; org-service has no awareness of it.
- Membership events (`curaos.org.membership.granted/revoked`) consumed by identity-service event handler → OpenFGA tuple write/delete.
- This preserves generic-before-vertical: org-service is agnostic to how membership is used for authorization.

### D-003: Loose coupling to party-service via FK reference
- org-service stores `party_id` (UUID) in `org_memberships` — it does not call party-service gRPC to validate this party_id at membership creation.
- Validation: org-service accepts the `party_id` from the caller; integrity is enforced at application level (caller must provide valid party_id). Cross-service validation would create tight coupling and introduce saga complexity.
- Exception: identity-service onboarding saga provides a validated `party_id` (the party record was just created in party-service as the prior saga step).

### D-004: No PHI — org structure is neutral
- No HealthStack package imports.
- Org unit metadata field `jsonb` allows domain-specific data to be stored, but org-service does not interpret it.
- HealthStack stores FHIR Organization.extension fields in HAPI; org-service holds only the reference.

---

## 5. Implementation Notes for Agents

### Scaffolding order
1. `backend.nestjs-service` — scaffold.
2. `interceptor.nestjs-tenant-router` — TenantInterceptor.
3. `interceptor.nestjs-audit` — AuditInterceptor.
4. Hand-write: `proto/org.proto`; generate gRPC controllers.
5. Hand-write: ltree repository helper (`src/persistence/ltree.repository.ts`) — Drizzle/Kysely helper for ltree column operations.
6. Hand-write: `OrgUnitService.moveTo(id, newParentId)` — atomic path recalculation.
7. Hand-write: Temporal org restructuring saga (`src/workflows/`).
8. Hand-write: `OrgChartExportProvider` implementations.

### ltree persistence integration
Drizzle does not model every `ltree` operation natively. Use typed raw SQL through the service repository for:
- Path computation: `SELECT text2ltree($1 || '.' || $2)` — append child slug to parent path.
- Subtree query: `SELECT * FROM org_units WHERE path <@ $1::ltree`.
- Direct children: `SELECT * FROM org_units WHERE path ~ $1::lquery` with `{1}` depth qualifier.
- Depth: `SELECT nlevel(path) FROM org_units WHERE id = $1`.

For non-path fields (name, type, status): standard Drizzle table mappings are fine.

```typescript
// src/persistence/ltree.repository.ts
// Helper: compute ltree path from parent path + new slug
async computePath(db, parentId: string | null, slug: string): Promise<string> {
  if (!parentId) return slug;
  const parent = await db.execute<{path: string}>(sql`
    SELECT path::text FROM org_units WHERE id = ${parentId}
  `);
  return `${parent[0].path}.${slug}`;
}
```

### Org unit move (path recalculation)
```typescript
// Must be atomic: update moved node path + all descendants
// src/org-units/org-unit.service.ts
async moveOrgUnit(id: string, newParentId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const oldPath = await getPath(tx, id);
    const newPath = await computePath(tx, newParentId, getSlug(id));
    // Update all nodes in subtree (path starts with oldPath)
    await tx.execute(sql`
      UPDATE org_units
      SET path = text2ltree(${newPath} || subpath(path, nlevel(${oldPath}::ltree))::text)
      WHERE path <@ ${oldPath}::ltree
    `);
    await tx.execute(sql`
      UPDATE org_units SET parent_id = ${newParentId} WHERE id = ${id}
    `);
  });
}
```

### gRPC proto
```protobuf
// proto/org.proto
service OrgService {
  rpc RemoveUserMemberships (RemoveUserMembershipsRequest) returns (RemoveUserMembershipsResponse);
  rpc AddMember (AddMemberRequest) returns (AddMemberResponse);
}

message RemoveUserMembershipsRequest { string user_id = 1; }
message RemoveUserMembershipsResponse { int32 memberships_removed = 1; }
message AddMemberRequest {
  string party_id = 1;
  string org_unit_id = 2;
  string role = 3;
}
message AddMemberResponse { string membership_id = 1; }
```

### Valkey patterns
- Org tree cache: `t:{tenantId}:org_tree` → serialized subtree JSON (TTL 5 min; invalidated on any org unit create/update/move).
- Member count cache: `t:{tenantId}:org_member_count:{org_unit_id}` → integer (TTL 1 min).

### Testing approach
- **Unit (Vitest):** mock Drizzle ltree queries, mock Kafka, mock gRPC.
- **Integration (Testcontainers):** real PG with `ltree` extension enabled (`CREATE EXTENSION ltree`), real Kafka, real Valkey.
- **ltree test:** create 100-node tree (5 levels deep); subtree query on level 2 node; verify all descendants returned; move a subtree; verify paths updated.
- **RemoveUserMemberships test:** create user with 5 memberships across 3 org units; call gRPC; assert all soft-removed (valid_until set); assert `curaos.org.membership.removed` Kafka event emitted.
- **Audit test:** all org mutations produce `curaos.audit.events` within 5s.

---

## 6. Build Milestones

| Milestone | Deliverable |
|-----------|-------------|
| M1 | Scaffold + TenantModule + AuditInterceptor + health |
| M2 | Org unit CRUD + ltree path management |
| M3 | Org unit subtree query + move operation |
| M4 | gRPC server: RemoveUserMemberships, AddMember |
| M5 | Membership CRUD + time-bounded validity |
| M6 | Kafka events: membership.granted/revoked consumed by identity-service OpenFGA |
| M7 | GDPR path verified with identity-service saga |
| M8 | OrgChartExportProvider (JSON + Mermaid) |
| M9 | Org restructuring Temporal saga |
| M10 | FHIR Organization event verified (curaos.org.unit.created → healthstack-fhir-service) |
