# Opposite Harness Grill Blocked

GRILL: blocked-harness-unavailable
GRILL-PROBE: {"available":false,"reason":"opposite-harness grill report missing","evidence":"{\"verdict\":\"pass\",\"issues\":[],\"report_path\":\"\"}"}
GRILL-HARNESS: codex
GRILL-AGENT: codex:codex-rescue
GRILL-TIMEOUT-MS: 420000
GRILL-REASON: grill-result-report-path-missing-or-mismatched

The opposite-harness adversarial leg failed fast and no CodeRabbit-only fallback should be treated as a completed opposite-harness grill.
Subject: Issue your-org/curaos-ai-workspace#599: fold cross-user COMPOSITE FK into the service-personal + service-business drizzle/schema.ts.hbs codegen mold.

CHANGE: In curaos/tools/codegen/templates/service-{personal,business}/drizzle/schema.ts.hbs I (1) added `foreignKey` to the drizzle/pg-core import, (2) added a composite UNIQUE on the base/parent table -- personal `(tenant_id, user_id, id)`, business `(tenant_id, org_id, id)` -- as the FK target, and (3) added an EXAMPLE child table (`personal_<name>_item` / `business_<name>_item`) that carries the owner composite key and references the parent via a COMPOSITE FK `foreignKey({ columns: [tenantId, ownerId, <parent>Id], foreignColumns: [parent.tenantId, parent.ownerId, parent.id] }).onDelete('cascade')`. New test cross-user-composite-fk-mold-599.test.ts asserts the raw template + a live-emit rendered service carries the composite child FK + parent composite UNIQUE and NO single-column .references(). Reference pattern: personal-crm-service#2 (5 children) + personal-hr-service#6 (6 composite FKs, already compliant -> no backfill).

DECISION I made: service-CORE was NOT changed (it is keyed (tenant_id, id) with no per-owner subject column, so there is no cross-owner reference hazard to close). I did NOT add a migration for the new example child table (the base domain table also has no migration in the mold; the service author replaces the example with real entities then runs drizzle-kit generate).

Review as adversarial planning reviewer. Do NOT implement. Return only: missing questions, docs/ADR conflicts, glossary conflicts, hidden deps/subtasks, decision points with recommended answers from docs/code, genuine user-escalation candidates.

