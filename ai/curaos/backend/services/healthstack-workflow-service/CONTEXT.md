# Agent Context — healthstack-workflow-service

**ADR refs:** ADR-0208 §3.18 · ADR-0115 · ADR-0099 §15 · ADR-0120 · ADR-0157 · ADR-0162 · ADR-0122

---

## Role

HealthStack-specific Temporal workflow template library. Registers 8 clinical workflow templates in CuraOS Workflow Manager (ADR-0122) at bootstrap. Does NOT own Temporal cluster (workflow-core-service owns it). Break-glass dual-sign gateway (15min timeout, auto-deny).

---

## Stack

| Concern | Choice |
|---|---|
| Runtime | NestJS (TypeScript) + Fastify |
| Workflow engine | CuraOS Workflow Manager (ADR-0122) — Temporal |
| Activity library | workflow-core-service (ADR-0204) |
| Template storage | HAPI FHIR 8.x (PlanDefinition-linked for audit) |
| Events | Kafka 4 (outbox) |
| API | tRPC (internal) |

---

## Template Registration at Bootstrap

```typescript
// On service startup:
// For each workflow template in CLINICAL_WORKFLOW_TEMPLATES:
//   await workflowManager.registerTemplate({
//     name: template.name,
//     taskQueue: 'healthstack-clinical',
//     workflowFn: template.temporalWorkflowFn,
//     activityFns: template.activities,
//   })
// Templates: clinical-pathway, care-coordination, discharge-planning,
//   break-glass-approval, medication-reconciliation, prior-auth-followup,
//   critical-value-response, abnormal-result-review
```

---

## Break-Glass Dual-Sign Pattern

```typescript
// Temporal workflow: break-glass-approval
// Signal 1: requestorApproval (immediate)
// Signal 2: supervisorApproval (within 15min)
//   await Promise.race([
//     condition(() => bothApproved),
//     sleep('15 minutes') // auto-deny on timeout
//   ])
// On approval: emit workflow.break-glass-approved
//   → consent-service grants Cerbos role (4h TTL)
// On timeout/deny: emit workflow.break-glass-denied
```

---

## PHI Audit (ADR-0157)

- `@HealthstackAudit()` on all controller methods.
- Break-glass workflow events: `PHI_EMERGENCY_ACCESS_WORKFLOW` category.
- All workflow lifecycle events audited to audit-service.
- Per-tenant `phi_audit_mode ∈ {single-source | dual-reconciled | hapi-primary}`.

---

## Key Files (once scaffolded)

```
src/
  workflow/
    workflow.controller.ts        # pathway/start, status, break-glass; @HealthstackAudit()
    template-registry.service.ts  # Temporal template registration at bootstrap
  templates/
    clinical-pathway.workflow.ts
    break-glass.workflow.ts
    discharge-planning.workflow.ts
    critical-value-response.workflow.ts
    prior-auth-followup.workflow.ts
    # ... (8 total)
  events/
    workflow.events.ts            # outbox producers
    workflow.consumers.ts         # careplan.instantiated, lab.critical-value, etc.
```

---

## Testing

- All 8 templates registered in Temporal at bootstrap.
- Break-glass: 15min timeout + auto-deny.
- Critical-value-response: escalation on non-ack.
- Clinical-pathway: triggered from careplan.instantiated end-to-end.

---

## CI Guards Checklist

- [ ] `@HealthstackAudit()` on all controller methods
- [ ] Break-glass auto-deny on 15min timeout
- [ ] Break-glass `PHI_EMERGENCY_ACCESS_WORKFLOW` audit category
- [ ] All 8 templates registered at bootstrap
- [ ] AsyncAPI 3 schemas in Apicurio
