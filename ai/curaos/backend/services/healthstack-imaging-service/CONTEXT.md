# Agent Context — healthstack-imaging-service

**ADR refs:** ADR-0208 §3.7 · ADR-0115 · ADR-0157 · ADR-0162 · ADR-0114

---

## Role

DICOM PACS proxy, OHIF Viewer session management, MONAI Deploy AI inference orchestrator. Manages `ImagingStudy` lifecycle from order receipt to signed report. PHI redaction at AI boundary via Presidio.

---

## Stack

| Concern | Choice |
|---|---|
| Runtime | NestJS (TypeScript) + Fastify |
| DICOM PACS | dcm4chee sidecar (JVM, LGPL 2.1) |
| DICOM viewer | OHIF Viewer 3.x (Apache 2.0, static assets) |
| AI inference | MONAI Deploy (Apache 2.0) |
| PHI redaction | Presidio (ADR-0114) |
| FHIR | HAPI FHIR 8.x JPA sidecar (HTTP) |
| Storage | SeaweedFS (report PDFs) |
| Events | Kafka 4 (outbox) |
| Auth | Better Auth + SMART-on-FHIR + Cerbos |

---

## OHIF Viewer Token Pattern

```typescript
// GET /imaging/viewer-session/:studyId
// 1. Validate SMART user/ImagingStudy.read scope at APISIX
// 2. Verify consent: consent.decision(patientId, 'imaging', requesterId)
// 3. Generate scoped DICOMweb URL: wado-rs/{tenantId}/{studyUid}
// 4. Issue time-limited SMART token scoped to studyUid (4h expiry)
// 5. Return: { ohifUrl, wadoBaseUrl, smartToken, expiresAt }
// Audit: @HealthstackAudit() on this method
```

---

## MONAI Deploy Inference Pattern

```
healthstack.imaging.study-received (Kafka)
  → trigger MONAI Deploy job: POST /monai/jobs { studyUid, pipelineId }
  → Presidio redaction: strip PHI from DICOM metadata before MONAI
  → MONAI inference → result JSON
  → create FHIR Observation + ImagingSelection in HAPI
  → emit healthstack.imaging.inference-complete
  → on failure/timeout (30min): notify-service alert
```

---

## dcm4chee Per-Tenant Isolation

- Each tenant gets dedicated study root (AE title prefix: `{tenantId}_`).
- STOW-RS ingest: `X-Tenant-ID` header sets target study root.
- WADO-RS retrieve: tenant scope validated before serving DICOM data.
- Cross-tenant DICOM access: blocked at proxy layer.

---

## PHI Audit (ADR-0157)

- `@HealthstackAudit()` on all controller methods.
- DICOM proxy: audit per study access (studyUID hashed in logs).
- OHIF token: audit actor, studyUID, scope, expiry.
- MONAI: Presidio redaction confirmation in audit record.

---

## Key Files (once scaffolded)

```
src/
  imaging/
    imaging-study.controller.ts   # FHIR ImagingStudy + viewer session; @HealthstackAudit()
    dicom-proxy.service.ts        # STOW-RS/WADO-RS/QIDO-RS proxy to dcm4chee
    ohif-session.service.ts       # SMART token + OHIF URL generation
    monai-inference.service.ts    # MONAI Deploy job trigger + result ingestion
  events/
    imaging.events.ts             # outbox producers
    imaging.consumers.ts          # orders.placed consumer
```

---

## Testing

- STOW-RS + WADO-RS round-trip with dcm4chee (test container).
- OHIF viewer session token generated; token scoped to studyUID.
- MONAI inference trigger: mock MONAI endpoint; Observation attached to ImagingStudy.
- Presidio PHI redaction confirmed before MONAI.
- Per-tenant DICOM isolation tested.

---

## CI Guards Checklist

- [ ] `@HealthstackAudit()` on all controller methods
- [ ] Presidio redaction before MONAI boundary
- [ ] OHIF token scoped to studyUID; expires 4h
- [ ] dcm4chee per-tenant isolation tested
- [ ] SMART scopes in TypeSpec + APISIX
