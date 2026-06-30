# Agent Context — healthstack-notes-service

**ADR refs:** ADR-0208 §3.8 · ADR-0114 · ADR-0115 · ADR-0120 · ADR-0157 · ADR-0162

---

## Role

Clinical documentation — structured/narrative notes, C-CDA generation, attestation workflow. NLP code extraction via LiteLLM + Presidio PHI redaction. Immutable addendum pattern. Specialty template library. Triggers interop-service for C-CDA export on note signing.

---

## Stack

| Concern | Choice |
|---|---|
| Runtime | NestJS (TypeScript) + Fastify |
| FHIR | HAPI FHIR 8.x JPA sidecar (HTTP) |
| Document blobs | SeaweedFS |
| C-CDA | linuxforhealth/fhir-to-cda-converter (via interop-service) |
| AI/NLP | LiteLLM + Presidio (ADR-0114) |
| Signing | healthstack-workflow-service → Temporal |
| Events | Kafka 4 (outbox) |

---

## NLP Code Extraction Pattern

```typescript
// On note text change (auto-save):
// 1. Presidio: detect + redact PHI from note text → anonymized_text
// 2. LiteLLM: POST to clinical coding model: extract ICD-10 + SNOMED codes
// 3. Return suggestions to clinician UI (not auto-committed to FHIR)
// On healthstack.notes.signed:
// 4. Emit with extracted code suggestions → healthstack-problems-service
//    consumer creates Condition resources on clinician confirmation
```

---

## Addendum Immutability

```typescript
// Addendum pattern:
// - Original Composition: immutable after signing
// - Addendum = new Composition with:
//   - relatesTo: [{ code: 'replaces', target: { reference: originalId } }]
//   - Note: 'replaces' = addendum, NOT a replacement (original preserved)
// - NEVER update original Composition.text or Composition.section after signing
```

---

## PHI Audit (ADR-0157)

- `@HealthstackAudit()` on all controller methods.
- LiteLLM calls: Presidio redaction confirmed in audit.
- Per-tenant `phi_audit_mode ∈ {single-source | dual-reconciled | hapi-primary}`.

---

## Key Files (once scaffolded)

```
src/
  notes/
    notes.controller.ts         # Composition/DocumentReference; @HealthstackAudit()
    note-authoring.service.ts   # FHIR Composition CRUD
    note-signing.service.ts     # Temporal signing workflow
    note-nlp.service.ts         # LiteLLM + Presidio code extraction
    note-ccda.service.ts        # C-CDA generation via interop-service
    template.service.ts         # Specialty template library
  events/
    notes.events.ts             # outbox producers
    notes.consumers.ts          # encounter.opened + orders.completed
```

---

## Testing

- Note CRUD + signing workflow via Temporal.
- C-CDA generation triggered on notes.signed → interop-service delegation.
- NLP extraction: Presidio redaction + LiteLLM coded concept extraction.
- Addendum: original Composition immutable after signing.
- Auto-stub on encounter.opened.

---

## CI Guards Checklist

- [ ] `@HealthstackAudit()` on all controller methods
- [ ] Presidio redaction before LiteLLM boundary
- [ ] Original Composition immutable after signing
- [ ] SMART scopes in TypeSpec + APISIX
- [ ] AsyncAPI 3 schemas in Apicurio
