# Grill report — M11 hr-core-service domain impl (#340)

- Issue: your-org/curaos-ai-workspace#340 (domain-impl lane; scaffold already merged via curaos #201)
- Branch: `agent/feat-hr-core-domain-claude-fe2035a2` (hr-core-service submodule)
- Date: 2026-06-03

## Opposite-harness grill: UNAVAILABLE

Codex grill was attempted (`codex exec -c model_reasoning_effort=high --sandbox read-only`).
Two failures:
1. `gpt-5.1-codex` → `400 model not supported when using Codex with a ChatGPT account`.
2. default model → `You've hit your usage limit … try again at Jul 3rd, 2026`.

Per one-task-execution-prompt §4: opposite-harness unavailable. The worker brief
also mandates a self-grill before done. Because the task is otherwise fully
specified and blocking a complete task on an external-quota outage is not
warranted, I ran a rigorous SAME-HARNESS adversarial self-grill of the plan
(below), auto-applied every recommendation that docs/code resolve, and will run a
final self-grill before closeout. `GRILL: self (codex-unavailable)`.

## Self-grill verdict (adversarial pass on the plan)

### 6. Decision points WITH recommended answers (auto-applied per curaos_recommendation_auto_apply_rule.md)

- **Comp-field ABAC role**: JWT `ALLOWED_ROLES = ['user','clinician','tenant-admin']`
  is a TRIO-SYMMETRIC codegen template (byte-identical across services) and the role
  vocabulary is owned by identity-service. There is NO `hr-manager` role.
  → **Recommendation:** map the elevated `tenant-admin` role to the HR-manager
  comp-read privilege at the neutral-core layer; implement ABAC as an injectable
  `COMP_FIELD_POLICY` seam (in-process default enforces the documented rule; the
  modulith composition root can later bind the real `@cerbos/grpc` client). Do NOT
  edit the trio-symmetric `jwt-verifier.ts` (would break trio symmetry + is a
  cross-cutting/T3 change). Auto-applied.
- **Live Temporal worker / BullMQ scheduler**: module AGENTS.md rule says "Use
  `@curaos/workflow-client` for Temporal — do not register Temporal workers in this
  service" and "time tracking re-uses BullMQ scheduler; no Kimai dependency". The
  #340 Acceptance checklist is domain model + events + REST + integration + OTel +
  ABAC + generator-evolution — it does NOT list a live Temporal/BullMQ runtime.
  → **Recommendation:** leave-request transitions emit domain events
  (`leave.requested`/`approved`/`rejected`) that the external Temporal workflow
  consumes; time entries are CRUD. Live worker/scheduler wiring is out of scope →
  FORESIGHT. Auto-applied.
- **Rolling-update (generic `hr` placeholder table)**: migration `0000_audit_outbox.sql`
  already creates `hr_core.hr`. Forward-only rule forbids dropping it.
  → **Recommendation:** KEEP the `hr` placeholder table (harmless, unused) in
  schema.ts + migrations; ADD real entity tables (`employees`, `compensations`,
  `leave_requests`, `time_entries`) in a NEW additive migration `0002_hr_domain.sql`.
  Auto-applied.
- **Integration vs real PG in CI**: sibling services keep `bun run ci` green WITHOUT
  live infra — unit tests use in-memory adapters; the Postgres store is validated by
  migration-parse + a `DATABASE_URL`-gated live test that skips in CI.
  → **Recommendation:** mirror that — InMemory store for unit tests, Postgres
  (Drizzle) store wired at composition root, live-PG integration test gated on
  `DATABASE_URL` (skips cleanly in CI). ABAC authorization matrix runs ALWAYS
  (security-critical). Auto-applied.
- **PII boundary**: module rule — never store name/email/photo; reference `party_id`
  only. Comp fields are sensitive PII but live in hr_core gated by ABAC (per research).
  → **Recommendation:** `employees.party_id` (uuid ref), no names; comp fields gated.
  Auto-applied.

### 4. Hidden deps/subtasks
- `nestjs-zod` named but the scaffold already validates via plain `zod` + a strict
  schema + `parseOrThrow`. Adding `nestjs-zod` is not required for the acceptance and
  would diverge from the proven sibling idiom → keep `zod`, FORESIGHT nestjs-zod adoption.

### 7. User-escalation candidates
- None. The dedicated `hr-manager` platform role is cross-cutting (identity-service)
  but has a clear conservative recommendation (map `tenant-admin`) + FORESIGHT, so it
  is auto-applied, not escalated.

## Re-grill verification (self-grill on the implementation, pre-commit)

Codex remained quota-limited; ran a final same-harness adversarial self-grill of
the diff focused on the ABAC comp-field security surface. No P0/P1 found.

- ABAC WRITE: defence-in-depth — route `@Roles('tenant-admin')` (403 for
  clinician/user) AND service `assertCompAccess('write')` (`COMP_FIELD_POLICY`).
- ABAC READ: route open to any authenticated role; service redacts sensitive
  amounts → null for non-HR-managers (record existence + effective_date not secret).
  Matches "never returned to non-HR-manager".
- Cross-tenant comp read: `InProcessCompFieldPolicy` denies when principal tenant
  ≠ resource tenant (belt-and-suspenders on top of the repo's tenant filter + 404).
  Unit-tested.
- Event PII leakage: `CompensationRecorded` carries only id/employee_id/
  effective_date/currency — NO amounts. Asserted the serialized event omits the
  salary value.
- BigInt wire: `toCompWire` Number(cents) — within safe-integer range.
- Leave double-approve: Drizzle `WHERE status='pending'` makes the transition
  atomic at the DB; live-PG-tested.

Verdict: SHIP. Findings (currency included in redaction set; in-memory
transition TOCTOU guarded only at service layer) are conservative/non-blocking.

VERIFICATION (verbatim) is pasted in the issue closeout comment.
