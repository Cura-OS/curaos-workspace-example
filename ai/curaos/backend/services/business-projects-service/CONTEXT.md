# business-projects-service — Agent Context

**ADR-0205 §3.12** | Business overlay | NestJS (TypeScript) | 2026-05-24

---

## Stack

NestJS + Fastify | PG17 (schema-per-tenant) | Kafka/NATS (ADR-0102) | Better Auth + Cerbos (ADR-0120) | `@curaos/tenancy` (ADR-0155) | JWT + mTLS (ADR-0156) | OTel (ADR-0107) | TypeSpec → REST + tRPC

---

## Dependency Graph

```
business-projects-service
  ──▶ hr-service (TimeEntry.project_id; employee status events)
  ──▶ party-service (assignee_party_id, ProjectMember.party_id)
  ──▶ notify-service (task due date notifications)
  ──▶ PostgreSQL 17, Kafka/NATS
  ──▶ ADR-0120 + ADR-0155 + ADR-0104

Consumed by:
  business-cases-service (case resolution linked to task)
  hr-service (time entries aggregate by project)
```

---

## Key Design Constraints

- **No Gantt engine on backend.** `GET /projects/:id/tasks` + `GET /projects/:id/dependencies` return flat lists; Builder App (ADR-0121b) renders Gantt client-side. Server provides critical path computation only.
- **Task `position` is a float** for ordered lists. Use midpoint insertion (between predecessor and successor floats) to avoid frequent rebalancing. Rebalance (reassign 1..N integers × 1000) when gap < 0.001.
- **No duplicate TimeEntry.** `TimeEntry` lives in hr-service; business-projects-service reads time data via `hr.time.entry.submitted` events (aggregated into project reports), not by storing it locally.
- **Plane (AGPL) is UX reference only.** No Plane code import. CI SBOM gates this.
- **Critical path algorithm:** DAG topological sort; longest path by duration. Pure TypeScript implementation; no external graph library required unless performance demands it.

---

## Files Must Not Break

- `project.task.status-changed` Kafka topic — consumed by analytics.
- `project.sprint.completed` — consumed by analytics.
- hr-service `TimeEntry.project_id` linkage — must remain a nullable UUID FK concept.

---

## Test Requirements

- Kanban position ordering: 10 tasks → drag task 5 to position 2 → float positions correct.
- Critical path: 4-node DAG with known longest path → server returns correct ordered list.
- `hr.employee.status-changed` (terminated) → open tasks re-assigned to `manager_party_id`.
- SBOM: no Plane or AGPL package in dependency tree.
- Cerbos: viewer JWT → `PATCH /tasks/:id` returns 403.
