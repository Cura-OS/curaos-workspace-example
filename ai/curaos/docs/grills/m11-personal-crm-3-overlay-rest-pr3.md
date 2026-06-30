# Grill: personal-crm-service#3 - compose-core overlay service, PersonalContext isolation, REST surface

- Milestone/Story: M11 (GA wave 2 / v1.1) - personal-crm-service#3
- PR: personal-crm-service#3 (branch `feat/crm-overlay-service-rest-3`)
- Grill direction: Claude -> Codex (opposite-harness adversarial planning grill)
- Reviewer model/effort: codex default model (ChatGPT account), `model_reasoning_effort=high`, `--sandbox read-only`
- Date: 2026-06-08
- Verdict: PASS (zero user-escalation candidates; all decision points carried a codebase-grounded recommendation, auto-applied per `ai/rules/curaos_recommendation_auto_apply_rule.md`)

## Subject

Build the individual-as-data-owner overlay on top of the merged 6 PII entities (#2): PersonalContext isolation,
owner-scoped store + CRUD service composing core `CrmsService`, REST surface, same-tx audit (changedFields = NAMES only)
+ domain event, idempotency-keys interceptor, cross-user auth-matrix test.

## Reviewer findings + resolution (auto-applied)

| # | Finding | Resolution |
|---|---|---|
| Route shape | acceptance says `/api/v1/personal/crm` but locked `auth-matrix.test.ts` hits `/personal-crms/*` | KEEP `/personal-crms/health,protected,whoami` (mold-locked, untouched); ADD `@Controller('personal/crm')` base; `/api/v1` is the GATEWAY prefix documented only in the tsp `@server`. Do NOT call `app.setGlobalPrefix` (would break the locked test). |
| Personal create vs core write | does creating a personal contact also write a core `crm_contact`? | NO. Personal create writes the personal row ONLY; the core link is the explicit `personal_contact_link` entity (NOT in this story's CRUD set). Composition is by `party_id` reference, not duplication. |
| Event taxonomy | core generic `buildCrmEventMessage` carries `display_name` (PII risk for personal rows) | NEW `src/crms/personal-crm-event-producer.ts` - personal-specific, REFERENCE-ONLY snake_case payloads (ids only, never display_name / notes / method value). |
| Tx proof | "one tx" must be real | Service opens `domainOutbox.transaction`; the in-memory store STAGES the row commit onto that boundary (mirrors `crm-core` `InMemoryCrmStore` buffer-commit). Row + domain event + audit envelope commit atomically; audit binds via `auditOutbox.bindTo(tx.db)`. |
| Roles | personal address-book owner | WRITE roles `user, clinician, tenant-admin` (the owner manages their OWN records); READ roles = all authenticated (`Crm_READ_ROLES`). `protected` probe stays clinician/tenant-admin. |
| Audit fields | names only | snake_case column NAMES (`display_name`, `given_name`, `relationship_type`, `consent_status`, ...), never values; `AuditEventEnvelopeSchema` PHI superRefine is the backstop. |
| Idempotency | reuse pattern | Mirror personal-hr `resolveIdempotency` + `IdempotencyStore` + `Idempotency-Key` header on POST create/add/set. No new dependency. |
| Glossary | OwnerScope canonical | `OwnerScope = { tenantId, userId }`, `userId = principal.actorId`. `coreAvailable` = `CrmsService.status()` callable. `group CRUD` = group DEFINITION only (no membership join table in schema). `consent` = per-contact sharing/communication state (NOT HealthStack consent). |

## User-escalation candidates

None. The grill explicitly returned "None. Recommendations above are enough for one AFK implementation run."
