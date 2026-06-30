# Agent Context — healthstack-automation-service

**ADR refs:** ADR-0208 §3.19 · ADR-0115 · ADR-0157 · ADR-0162 · ADR-0122

---

## Role

HealthStack clinical automation overlay on automation-core-service (ADR-0204) via Activepieces runtime in CuraOS Workflow Manager (ADR-0122). Registers 8 clinical Activepieces flows at bootstrap. Consent check mandatory before any patient-facing outreach action.

---

## Stack

| Concern | Choice |
|---|---|
| Runtime | NestJS (TypeScript) + Fastify |
| Automation engine | CuraOS Workflow Manager (ADR-0122) — Activepieces |
| Piece SDK | automation-core-service (ADR-0204) |
| Consent gate | healthstack-consent-service tRPC |
| Events | Kafka 4 (outbox + consumers) |
| API | TypeSpec REST |

---

## Flow Registration at Bootstrap

```typescript
// On service startup:
// For each flow in CLINICAL_AUTOMATION_FLOWS:
//   await automationCore.registerFlow({
//     name: flow.name,
//     trigger: flow.trigger,
//     actions: flow.actions,
//     scope: 'healthstack',
//     tenantActivation: true, // must be enabled per tenant
//   })
// Flows: appointment-reminder, medication-adherence-check, lab-result-notify,
//   care-gap-outreach, device-alert-route, prior-auth-expiry,
//   consent-expiry, preventive-care-reminder
```

---

## Consent Enforcement Pattern

```typescript
// Before any patient-facing automation action:
// const decision = await consentService.decision({
//   patientId,
//   purpose: 'patient-communication',
//   requesterId: 'automation-service',
//   dataCategory: 'contact-information'
// })
// if (decision.result !== 'permit') {
//   await audit.record({ event: 'AUTOMATION_OUTREACH_SUPPRESSED', patientId, flowId })
//   return // suppress outreach silently
// }
```

---

## PHI Audit (ADR-0157)

- `@HealthstackAudit()` on all controller methods.
- Patient outreach: `PHI_AUTOMATED_OUTREACH` audit category.
- Suppressed outreach (consent deny): also audited.
- Per-tenant `phi_audit_mode ∈ {single-source | dual-reconciled | hapi-primary}`.

---

## Key Files (once scaffolded)

```
src/
  automation/
    automation.controller.ts    # trigger, flows registry; @HealthstackAudit()
    flow-registry.service.ts    # Activepieces flow registration at bootstrap
    consent-gate.service.ts     # Consent check before outreach actions
  flows/
    appointment-reminder.flow.ts
    medication-adherence.flow.ts
    lab-result-notify.flow.ts
    care-gap-outreach.flow.ts
    device-alert-route.flow.ts
    prior-auth-expiry.flow.ts
    consent-expiry.flow.ts
    preventive-care-reminder.flow.ts
  events/
    automation.events.ts        # outbox producers
    automation.consumers.ts     # appointment.reminder-due, lab.report-finalized, etc.
```

---

## Testing

- All 8 flows registered in Activepieces at bootstrap.
- Appointment reminder: T-72h/24h/2h triggers tested.
- Device alert: 15min escalation on non-ack tested.
- Consent deny: outreach suppressed + audit record created.
- Tenant activation: flow disabled when tenant hasn't subscribed.

---

## CI Guards Checklist

- [ ] `@HealthstackAudit()` on all controller methods
- [ ] Consent check before every patient outreach action
- [ ] Suppressed outreach logged in audit
- [ ] All 8 flows registered at bootstrap
- [ ] AsyncAPI 3 schemas in Apicurio
