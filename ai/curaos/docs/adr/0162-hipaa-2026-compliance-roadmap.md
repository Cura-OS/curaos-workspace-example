# ADR-0162 — HIPAA Security Rule 2026 Compliance Roadmap

**Status:** Accepted
**Date:** 2026-05-24
**Resolves:** ADR-0151 F-016 Major — HIPAA final rule 2026 compliance scope
**Decision:** 1+4 — Foundation v1 GA targets full technical compliance; BAA-signing gated to v1.5 after certification audits
**Owners:** Platform Security, HealthStack, Legal/Compliance
**Amendments:** ADR-0108, ADR-0120, ADR-0208 (see §10)

---

## 1. Status

Accepted. Supersedes the informal HIPAA compliance notes scattered across ADR-0115 §2.4 and ADR-0120 §6. All HIPAA compliance posture decisions are authoritative here; other ADRs reference this document.

---

## 2. Context

### 2.1 HIPAA Security Rule 2026 NPRM — What changed

On 27 December 2024 HHS Office for Civil Rights (OCR) published a Notice of Proposed Rulemaking (NPRM) at 90 FR 800 — the first substantive revision to the HIPAA Security Rule since 2013. Key structural change: **elimination of the "addressable vs. required" distinction** at 45 CFR 164.306(d). Every implementation specification becomes required, with narrowly enumerated exceptions. This converts previously optional controls into hard mandates.

Final rule publication target: **May 2026** (per OCR's own guidance at the April 2026 HIPAA Summit). Compliance deadline post-publication: **180–240 days** from effective date (NPRM proposed 180 days; industry expects final rule to use 240). Puts enforcement onset at approximately **December 2026 – January 2027**.

Status as of 2026-05-24: final rule not yet published. Trump administration has not confirmed rescission or major rollback; OCR director acknowledged possible "different view on burdens" but did not endorse withdrawal. Planning assumes NPRM technical substance survives into final rule; any softening of mandates reduces scope, not increases it.

### 2.2 Mandatory technical controls introduced by NPRM

| Control | NPRM requirement | CFR reference (proposed) |
|---|---|---|
| MFA | Mandatory for all interactive ePHI-system access; phishing-resistant (FIDO2/WebAuthn) preferred; TOTP acceptable; SMS last-resort | 45 CFR §164.312 |
| Encryption at rest | Mandatory for all ePHI; aligns with NIST standards (AES-256 in practice) | 45 CFR §164.312(a)(2)(iv) |
| Encryption in transit | Mandatory; TLS 1.3 minimum implied by NIST SP 800-52 alignment | 45 CFR §164.312 |
| Asset inventory | Technology asset inventory + network map updated ≥ annually; tracks ePHI movement | 45 CFR §164.308 |
| Vulnerability scanning | ≥ every 6 months | 45 CFR §164.308 |
| Penetration testing | ≥ every 12 months; human-led (not automated-only) | 45 CFR §164.308 |
| Risk assessment | Annual + per-system-change; continuous threat identification | 45 CFR §164.308(a)(1) |
| DR recovery objective | Critical systems restorable within **72 hours** | 45 CFR §164.308(a)(7) |
| Breach detection | 24-hour operational triggers (access change, contingency plan activation) | 45 CFR §164.308 |
| Breach reporting | "Without unreasonable delay" + ≤60 days post-discovery (unchanged from current rule); new 24-hour operational escalation separate | 45 CFR §164.400 |
| BA verification | Annual written certification from Business Associates confirming technical safeguard implementation | 45 CFR §164.314 |
| Anti-malware / segmentation | Mandatory; network segmentation; patch management; remove unnecessary software | 45 CFR §164.312 |
| Workforce training | Annual security awareness training; role-based for PHI-handling staff | 45 CFR §164.308(a)(5) |
| Audit controls | Annual Security Rule compliance audit | 45 CFR §164.312(b) |

### 2.3 CuraOS timeline collision

ADR-0151 F-016 identified that Foundation v1 GA (~Oct/Nov 2026 per ADR-0099 §12) overlaps the final rule publication window. This ADR resolves that collision with an explicit scope decision.

### 2.4 Why BAA-signing cannot precede certification

A Business Associate Agreement (BAA) is a legal instrument with breach-notification liability (60-day HHS reporting, customer notification, OCR enforcement). Signing BAAs before passing a third-party audit creates contractual exposure without independent verification that controls actually work. Industry norm for SaaS healthcare platforms: SOC 2 Type II first, then customer BAA execution. HITRUST CSF r2 adds healthcare-specific depth; ISO 27001:2022 covers international customer requirements.

---

## 3. Decision

**Option 1+4 accepted.**

- **Foundation v1 GA** ships with all technical HIPAA controls implemented and compliance documentation published. CuraOS is HIPAA-technically-ready at GA. No BAA-signing at this stage.
- **Foundation v1.5 GA** (target: Month 15 from build start) ships after SOC 2 Type II, HITRUST CSF r2, and ISO 27001:2022 audits complete. BAA-signing goes live. Full clinical customer onboarding enabled.

Rejected alternatives:

- **Option 2 — ship BAA at v1 GA:** Rejected. Legal liability without independent attestation. One breach before audit completion would be catastrophic to business continuity.
- **Option 3 — defer all HIPAA work to post-GA:** Rejected. Architectural rework after GA (HSM migration, encryption scheme changes) far more expensive than building correctly in foundation.

---

## 4. V1 GA Scope — Technical Controls

All controls below must be implemented and verified before Foundation v1 GA release gate. Each row maps to an existing ADR that owns the implementation. This ADR adds the explicit HIPAA mandate justification and enforcement requirement.

### 4.1 Identity and access controls

| Control | Implementation | HIPAA mandate | ADR owner |
|---|---|---|---|
| MFA mandatory for HealthStack users | WebAuthn passkey (FIDO2) as primary; TOTP (HMAC-based per NIST SP 800-63B AAL2) as fallback; SMS explicitly blocked for PHI-system access | 45 CFR §164.312 — MFA required | ADR-0120 |
| RBAC + ABAC + ReBAC | Cerbos (ABAC policy engine) + OpenFGA (ReBAC for consent graphs) layered on Keycloak RBAC; enforced at API gateway (APISIX) | Access control standard | ADR-0120 |
| Break-glass emergency access | Dual sign-off by two authorized individuals; auto-expiry ≤4 hours; full audit trail; reviewed quarterly | Emergency access procedure | ADR-0157 |
| Session management | Inactivity timeout ≤15 min for PHI-touching sessions; token revocation via Keycloak; opaque tokens at boundary | Automatic logoff | ADR-0120, ADR-0156 |
| Unique user identification | Every user account unique; no shared credentials for ePHI systems; service accounts use mTLS client certs not passwords | Unique user ID | ADR-0120 |

**MFA exception policy (narrow):**
Exceptions permitted only under documented waiver:
1. Legacy FDA-cleared medical devices (pre-March 2023) unable to support MFA — document in asset inventory, isolate on VLAN, plan migration.
2. Genuine clinical emergency (break-glass path above applies instead, not exception).
3. No SMS/voice OTP for any ePHI-system access without documented waiver + compensating control.

### 4.2 Encryption

| Control | Implementation | HIPAA mandate | ADR owner |
|---|---|---|---|
| Encryption at rest — database | PostgreSQL 17 TDE via `pg_tde` extension; AES-256-XTS; keys in OpenBao (Vault-compatible); key rotation ≥ annually | 45 CFR §164.312(a)(2)(iv) | ADR-0101, ADR-0108 |
| Encryption at rest — object storage | SeaweedFS SSE-S3 (AES-256); envelope encryption with OpenBao-managed KEK | Same | ADR-0108 |
| Encryption at rest — cache | Valkey (Redis-compatible) TLS in-transit + encrypted RDB/AOF at rest using OS-level encryption (LUKS2 on data volumes) | Same | ADR-0108 |
| Encryption at rest — backups | All Velero backup artifacts encrypted at rest; Restic encryption for file-level backups; backup encryption keys stored separately from data encryption keys | Same | ADR-0111 |
| Encryption in transit — external | TLS 1.3 enforced at ingress (APISIX + cert-manager); TLS 1.2 minimum with approved cipher suites only; no SSLv3/TLS 1.0/1.1 | 45 CFR §164.312 | ADR-0108, ADR-0156 |
| Encryption in transit — service-to-service | mTLS via Istio service mesh with cert-manager-issued SPIFFE/SPIRE certificates; auto-rotate ≤90-day cert lifetime | Same | ADR-0156 |
| Key management | OpenBao (self-hosted Vault fork); auto-unseal via Shamir secret sharing (≥3-of-5); HSM upgrade path documented (PKCS#11 interface preserved) | Encryption key management | ADR-0108 |
| Key rotation | Database keys: annual + on-demand; TLS certs: 90 days; backup keys: annual; documented rotation runbooks | Key rotation policy | ADR-0108 |

**HSM upgrade path:** Current implementation uses software-based key storage in OpenBao (satisfies HIPAA; HSM is not mandated). If a future regulatory interpretation requires HSM, OpenBao's PKCS#11 plugin enables migration without re-architecting encryption layers. Risk logged in §9 Open Questions.

### 4.3 Audit and integrity

| Control | Implementation | HIPAA mandate | ADR owner |
|---|---|---|---|
| Audit logging | Hash-chained audit log in PostgreSQL (`pg_audit` extension + application-layer event sourcing); every ePHI access, modification, disclosure logged with: timestamp, user ID, action, resource, tenant ID, outcome | 45 CFR §164.312(b) — Audit controls | ADR-0104, ADR-0157 |
| Tamper-evident audit storage | Audit events written to WORM-mode SeaweedFS bucket; SHA-256 Merkle chain links across entries; reconciliation job detects gaps | Integrity / non-repudiation | ADR-0157 |
| Audit retention | 6 years minimum (HIPAA) for all ePHI audit records; lifecycle policy enforced in SeaweedFS | Retention standard | ADR-0157 |
| Regulatory inspection support | Per-tenant audit export API: time-bounded, redacted for non-party data, signed export package; supports OCR audit requests | Audit controls | ADR-0157 |
| PHI redaction at LLM boundary | Presidio NLP pipeline scrubs PHI (18 HIPAA identifiers) before any ePHI reaches LLM inference; redaction log retained | Minimum necessary / disclosure | ADR-0114 |

### 4.4 Incident detection and response

| Control | Implementation | HIPAA mandate | ADR owner |
|---|---|---|---|
| Runtime threat detection | Falco (syscall-level) + Tetragon (eBPF kernel tracing); policy violations alert within seconds | Security incident detection | ADR-0108 |
| SIEM | Wazuh; aggregates Falco/Tetragon alerts + Kubernetes audit logs + application logs; correlation rules for ePHI access anomalies | Same | ADR-0108 |
| 24-hour breach detection target | Wazuh alert → PagerDuty / Grafana OnCall page; P1 (potential PHI breach) SLA: acknowledge ≤15 min, assess ≤4 hr, contain ≤24 hr | 45 CFR §164.308 — 24-hr operational trigger | ADR-0108, ADR-0107 |
| Breach notification — operational | Contingency plan activation: notify affected parties within 24 hours operationally; HHS notification without unreasonable delay + ≤60 days | 45 CFR §164.400 | Incident response plan (§5.2) |
| Incident response runbook | Written IR plan covering: detect → contain → eradicate → recover → notify → post-incident review; tested quarterly tabletop | 45 CFR §164.308(a)(6) | IR plan doc (§5.2) |
| Post-incident review | Formal PIR within 72 hours of containment; root cause documented; fed into risk assessment | Same | IR plan doc |

### 4.5 Infrastructure security

| Control | Implementation | HIPAA mandate | ADR owner |
|---|---|---|---|
| Network segmentation | Capsule-enforced Kubernetes namespace isolation per tenant; NetworkPolicy restricts ePHI pod lateral movement; separate VLAN for clinical workloads | 45 CFR §164.312 | ADR-0109, ADR-0155 |
| Tenant isolation | @curaos/tenancy enforces schema-per-tenant for HealthStack (no shared PHI tables); Capsule namespace isolation at K8s layer | PHI partitioning | ADR-0155, ADR-0109 |
| Vulnerability scanning | Trivy (container + IaC) + Semgrep (SAST) + OSV-Scanner (dependency CVEs) in CI/CD; Snyk for real-time dependency monitoring; scan ≥ every 6 months for production systems | 45 CFR §164.308 | ADR-0108 |
| Patch management | Critical CVEs patched within 72 hours; high within 14 days; base images rebuilt weekly; automated Renovate PRs for dependency updates | Same | ADR-0108 |
| Anti-malware | Container image scanning (Trivy) at build + admission; Falco detects malicious process execution at runtime; no unnecessary software in ePHI containers | Same | ADR-0108 |
| Penetration testing | Annual external human-led pen test; scope: all ePHI-handling surfaces (API gateway, HAPI FHIR, auth, tenant routing); findings triaged and remediated before next GA; results retained 3 years | 45 CFR §164.308 | New activity (§7) |
| Asset inventory | Automated technology asset inventory: all pods, services, storage volumes, network endpoints that process ePHI; updated continuously via K8s resource watch + monthly reconciliation report | 45 CFR §164.308 | ADR-0108 |

### 4.6 Backup and disaster recovery

| Control | Implementation | HIPAA mandate | ADR owner |
|---|---|---|---|
| Automated backup | Velero: daily full + hourly incremental for all ePHI namespaces; Restic for file-level SeaweedFS content; backup jobs monitored with alerting on failure | 45 CFR §164.308(a)(7) — Contingency plan | ADR-0111 |
| Offsite backup | Backup artifacts replicated to geographically separate storage (air-gap: local cold store; cloud: S3-compatible secondary region) | Same | ADR-0111 |
| Recovery time objective | Critical ePHI systems: restore within **72 hours** (NPRM mandate); target RTO 4 hours for production (exceeds mandate) | Same | ADR-0111 |
| Recovery point objective | RPO ≤ 1 hour for ePHI (hourly incremental); ≤ 24 hours for cold backups | Same | ADR-0111 |
| DR test | Quarterly automated DR test in staging environment; restore from backup, verify data integrity, document results; annual full failover test | Same | ADR-0111 |
| Backup encryption | All backup artifacts encrypted before transport; Restic AES-256-GCM; encryption keys stored in OpenBao separate from data-at-rest keys | Same | ADR-0108 |

---

## 5. V1 GA Scope — Compliance Documentation

Documentation artifacts must be authored, reviewed (legal + security), and published by v1 GA gate. No code gate; documentation gate.

### 5.1 Document inventory

| Document | Owner | Purpose | HIPAA mandate |
|---|---|---|---|
| Risk Assessment (NIST SP 800-30) | Platform Security | Annual formal risk assessment; scoped to all ePHI-handling systems; threat catalog + likelihood + impact + mitigations | 45 CFR §164.308(a)(1) |
| Incident Response Plan | Platform Security | Written IR procedures: escalation tree, containment playbooks, HHS notification procedure, customer notification template, post-incident review process | 45 CFR §164.308(a)(6) |
| Workforce Training Program | Platform Security + HR | Annual HIPAA security awareness curriculum; role-based modules (clinical staff, developers, ops); completion tracking; new-hire onboarding module | 45 CFR §164.308(a)(5) |
| Asset Inventory Procedure | Platform Security | How asset inventory is generated, maintained, and reviewed; ePHI data-flow network map | 45 CFR §164.308 |
| Vulnerability Management Procedure | Platform Security | Scan cadence, severity triage SLAs, patch workflow, exception process | 45 CFR §164.308 |
| BAA Template (CuraOS as Covered Entity) | Legal | CuraOS signs as covered entity with sub-processors; lists permitted uses, breach notification SLAs, sub-BAA chain requirements | 45 CFR §164.314 |
| Privacy Notice Template (NPP) | Legal | HIPAA Notice of Privacy Practices for covered-entity customers to use; template with required elements per 45 CFR §164.520 | 45 CFR §164.520 |
| Patient Rights Procedure | Product + Legal | DSAR fulfillment workflow: access, correction, restriction, accounting of disclosures; time limits per HIPAA (30-day, 60-day extension) | 45 CFR §164.522–528 |
| Vendor Management Policy | Procurement + Legal | BAA chain validation: every sub-processor that touches PHI must sign BAA; annual re-verification; pre-approved vendor list | 45 CFR §164.314 |
| Business Continuity Plan | Platform Engineering | DR procedures, communication plan, manual workaround procedures for ePHI access during outage | 45 CFR §164.308(a)(7) |

### 5.2 Incident Response Plan — required elements

The IR plan must address:
1. **Detection:** Wazuh alert thresholds that trigger IR process; on-call escalation contacts.
2. **Triage:** P1 = potential PHI breach; P2 = confirmed ePHI access anomaly; P3 = non-PHI security event.
3. **Containment:** Per-tenant access revocation procedure; session invalidation via Keycloak; network isolation via NetworkPolicy patch.
4. **Eradication:** Root cause identification; artifact preservation for forensics; evidence chain-of-custody.
5. **Recovery:** Velero restore procedure; data integrity verification; service restoration sequence.
6. **Notification:** 24-hour operational notification to affected internal parties; ≤60-day HHS breach notification; customer notification per BAA terms (post-v1.5); OCR notification template.
7. **Post-incident review:** Mandatory within 72 hours of containment; updates risk assessment and vulnerability management procedure.

### 5.3 Workforce training requirements

| Audience | Modules | Cadence |
|---|---|---|
| All workforce | HIPAA basics; password and MFA policy; phishing awareness; physical security; incident reporting | Annual + on-hire |
| Developers + ops | Secure coding (OWASP Top 10); PHI handling in code; secret management; CI security gates | Annual + on-hire |
| HealthStack clinical ops | PHI access controls; minimum-necessary principle; patient rights; break-glass procedure | Annual + on-hire |
| Leadership + legal | BAA obligations; breach liability; OCR enforcement overview | Annual |

Training completion tracked in HR/LMS system. Non-completion blocks ePHI system access (enforced via Keycloak group membership synced from LMS completion status).

---

## 6. V1.5 Scope — Compliance Certification and BAA-Signing

V1.5 target: **Month 15** from foundation build start. Gate: all three audits passed, reports in hand.

### 6.1 Third-party audits

| Audit | Target start | Duration | Rationale |
|---|---|---|---|
| **SOC 2 Type II** | Month 6 (v1 GA) | 6-month observation + report | Minimum enterprise customer requirement; covers Security, Availability, Confidentiality trust service criteria | 
| **HITRUST CSF r2** | Month 9 | ~6 months assessment | Healthcare-specific; cross-references HIPAA, NIST, ISO; most health system procurement requires this | 
| **ISO 27001:2022** | Month 9 | ~6 months certification | International recognition; required for non-US market entry; integrates with SOC 2 evidence | 
| **HIPAA OCR mock audit** | Month 12 | 2 weeks internal | Internal rehearsal of OCR audit; identifies gaps before BAA-signing goes live |

Audits are parallel from Month 9. SOC 2 observation window begins at v1 GA so audit report is available at Month 12, before full v1.5 GA.

### 6.2 BAA-signing readiness checklist

Before any customer BAA is executed, all items must be confirmed:
- [ ] SOC 2 Type II report in hand (unqualified opinion on Security + Confidentiality criteria)
- [ ] HITRUST CSF r2 certification issued
- [ ] ISO 27001:2022 certificate issued
- [ ] HIPAA OCR mock audit completed, all findings remediated
- [ ] Customer-facing BAA template reviewed by healthcare-specialist legal counsel
- [ ] Per-customer BAA review process defined (legal team sign-off required per BAA)
- [ ] Vendor BAA chain complete: every sub-processor handling ePHI has signed BAA with CuraOS
- [ ] Trust center portal live (see §6.3)
- [ ] Breach notification SLA verified: 24-hour internal escalation → ≤60-day HHS notification → customer notification per BAA terms

### 6.3 Vendor BAA chain (sub-processors)

Every vendor or sub-processor that may handle ePHI must have a signed BAA with CuraOS before that vendor is used in any HealthStack deployment. Examples:

| Sub-processor category | Requirement |
|---|---|
| Cloud infrastructure (if used in cloud SaaS profile) | BAA with cloud provider (AWS, GCP, etc.) |
| LLM inference (if BYO model with ePHI input) | BAA with inference provider OR Presidio redaction verified before any LLM call (ADR-0114) |
| Backup offsite storage (cloud) | BAA with cloud storage provider |
| Monitoring / SIEM (if SaaS-based) | BAA with monitoring vendor |
| Email / notification delivery | BAA if any PHI in notification payload |

Air-gap and on-prem deployments: customer is covered entity; CuraOS ships as software only. Customer manages own BAA chain for their sub-processors. CuraOS provides BAA chain documentation template and vendor evaluation checklist.

### 6.4 Customer-facing trust center

Portal at `trust.cura.os` (or equivalent) launched at v1.5 GA, containing:
- Current audit reports (SOC 2 Type II, HITRUST CSF, ISO 27001) — available under NDA click-through
- Security whitepaper (architecture, controls, encryption details)
- BAA template (for customer review before signing)
- Incident history (public summary of past security incidents, resolution status)
- Subprocessor list (all vendors with PHI access and BAA status)
- Penetration test summary (scope, findings category, remediation status — not full report)
- Uptime / SLA history

### 6.5 Per-customer compliance dashboard (in-product)

Available to HealthStack Scale tier customers post-v1.5 GA:
- Tenant-scoped audit log access (their data only; exportable for their own auditors)
- Access review reports (who accessed what PHI, when)
- MFA enforcement status for all their users
- Last vulnerability scan + pen test dates
- Backup and DR status for their tenant
- BAA document access and signed copy download

---

## 7. Timeline

| Milestone | Target | Deliverable | Gate owner |
|---|---|---|---|
| NPRM technical controls mapped to architecture | Month 0 (complete) | This ADR (ADR-0162) | Platform Security |
| Foundation v1 build — technical controls implemented | Months 1–6 | All §4 controls shipped and verified | Platform Engineering |
| Foundation v1 build — compliance docs authored | Months 4–6 | All §5 documents reviewed + published internally | Legal + Platform Security |
| **Foundation v1 GA** | **Month 6** | Technical HIPAA-ready; compliance docs live; NO BAA-signing; NO clinical PHI onboarding yet | Product + Legal |
| HealthStack early access (non-PHI or waivered) | Months 6–12 | Non-PHI tenants; PHI tenants only under explicit interim agreement with customer's own covered-entity controls acknowledged | HealthStack PM + Legal |
| SOC 2 Type II observation window | Months 6–12 | 6-month audit observation; auditor engaged by Month 6 | Compliance |
| HIPAA OCR mock audit | Month 12 | Internal rehearsal; all gaps remediated | Platform Security |
| HITRUST CSF r2 + ISO 27001:2022 assessments | Months 9–15 | Parallel tracks; certifications issued by Month 15 | Compliance |
| SOC 2 Type II report issued | Month 12 | Unqualified report; available in trust center | Compliance |
| First annual pen test | Month 11 (pre-v1.5) | External human-led test; findings remediated before v1.5 GA | Platform Security |
| **Foundation v1.5 GA** | **Month 15** | BAA-signing live; full clinical customer onboarding; trust center live | Product + Legal + Compliance |
| Annual recertification | Year 2+ | SOC 2 + HITRUST + ISO 27001 annual renewal; pen test annual; risk assessment annual | Compliance |
| HIPAA final rule re-validation | Post-publication | Re-validate architecture against final rule text; file delta ADR if changes needed | Platform Security |

**Critical path note:** SOC 2 Type II auditor must be engaged by Month 6 (v1 GA) to start the observation window. Delay here pushes v1.5 GA. This is the longest-lead compliance activity.

---

## 8. Per-Tenant Compliance Tier

| Tier | BAA available | Compliance posture | PHI allowed |
|---|---|---|---|
| **Cloud SaaS Starter** | No | Non-HealthStack only; no PHI processing | No |
| **Cloud SaaS Growth** | No (until v1.5) | Same | No |
| **Cloud SaaS Scale** | Yes (post-v1.5) | Full HIPAA compliance; SOC 2 Type II + HITRUST CSF + ISO 27001 reports available; BAA executed before PHI onboarding | Yes — after BAA signed |
| **On-prem** | Customer-managed | Customer is covered entity; CuraOS ships HIPAA-ready software; customer owns their BAA chain; CuraOS provides documentation support | Yes — customer's responsibility |
| **Air-gap** | Customer-managed | Same as on-prem; no external calls; customer owns compliance attestation; CuraOS provides air-gap compliance evidence package (ADR-0158) | Yes — customer's responsibility |
| **Hybrid** | Joint | Vendor control plane + customer data plane; BAA covers control plane; customer manages data plane BAA chain; joint responsibility matrix documented | Yes — after BAA for control plane |

**HealthStack early access (Months 6–12, pre-v1.5):** PHI-handling tenants may onboard only under an explicit interim agreement acknowledging:
1. CuraOS is in the SOC 2 observation period; full report not yet issued.
2. Customer is a covered entity responsible for their own HIPAA compliance.
3. CuraOS provides all technical controls (§4) and evidence but no formal BAA until v1.5.
4. Customer accepts risk of interim period in writing.

This is primarily for health system design partners conducting pilots under their own covered-entity compliance umbrella.

---

## 9. CI Guards and Ongoing Compliance Posture

Compliance is not a one-time project. These automated and scheduled activities maintain posture:

### 9.1 Automated (CI/CD)

| Check | Frequency | Tooling | Owner |
|---|---|---|---|
| Container image vulnerability scan | Every build | Trivy + OSV-Scanner | Platform Security |
| SAST — PHI leakage patterns | Every PR | Semgrep (custom PHI ruleset) | Platform Security |
| Secret scanning | Every commit (pre-commit hook + CI) | Gitleaks + detect-secrets | Platform Security |
| SBOM generation | Every build | Syft | Platform Security |
| mTLS cert validity check | Daily | cert-manager alert + custom probe | Platform Ops |
| Backup job success verification | Daily | Velero status + alerting | Platform Ops |

### 9.2 Scheduled

| Activity | Frequency | Owner | Evidence artifact |
|---|---|---|---|
| Compliance posture check (all §4 controls active) | Daily automated + weekly manual review | Platform Security | Posture dashboard |
| Access review — per-tenant active users + permissions | Weekly | Platform Security + HealthStack PM | Access review report |
| Vendor BAA chain validation | Monthly | Legal | BAA registry |
| Vulnerability scan — production systems | Every 6 months minimum (NPRM mandate); monthly in practice | Platform Security | Scan report |
| DR failover test | Quarterly | Platform Ops | DR test report |
| Penetration test | Annual | External firm | Pen test report |
| Risk assessment (NIST SP 800-30) | Annual + per major system change | Platform Security | Risk assessment doc |
| Workforce training completion audit | Annual | HR + Platform Security | Training completion report |
| SOC 2 / HITRUST / ISO 27001 recertification | Annual | Compliance | Audit report |
| HIPAA policy review | Annual | Legal + Platform Security | Policy review record |

### 9.3 Compliance posture SLA

Any single technical control from §4 going offline triggers:
- **P1 alert:** All ePHI access suspended for affected tenant until control restored.
- Incident opened in IR system.
- Root cause remediated within 24 hours for MFA/encryption/audit controls; 72 hours for others.
- Post-incident review within 72 hours of restoration.

---

## 10. Amendments to Referenced ADRs

The following ADRs require amendment to cross-reference this decision and/or update their HIPAA compliance sections.

### ADR-0108 (Security baselines)
Add §X: HIPAA Technical Control Mapping. Table mapping each NPRM technical mandate to the specific tool/config choice in ADR-0108. Explicit statements:
- "Vulnerability scanning ≥ every 6 months per 45 CFR §164.308: satisfied by Trivy + Semgrep in CI + monthly production scans."
- "Penetration testing ≥ every 12 months per 45 CFR §164.308: annual external pen test scheduled (see ADR-0162 §7)."
- "Asset inventory per 45 CFR §164.308: automated K8s resource inventory + monthly reconciliation."
- "Anti-malware per 45 CFR §164.312: Trivy at admission + Falco runtime."

### ADR-0120 (Foundation Auth)
Add to §6 (Compliance):
- "MFA is **mandatory** (not optional) for all HealthStack users accessing ePHI systems per ADR-0162 §4.1 and 45 CFR §164.312."
- "WebAuthn (FIDO2) is primary; TOTP is fallback; SMS OTP is **blocked** for any ePHI-system access."
- "MFA exception policy: see ADR-0162 §4.1."
- "Session timeout: ≤15 minutes inactivity for PHI-touching sessions."
- Reference ADR-0162 as authoritative HIPAA compliance document.

### ADR-0208 (HealthStack clinical services)
Add per-tenant compliance tier section referencing §8 of this ADR. Make explicit:
- HealthStack Scale tier requires executed BAA before PHI onboarding.
- HealthStack on-prem/air-gap: customer covered-entity compliance responsibility.
- Early access PHI pilot: interim agreement required (see §8).
- Clinical service SLAs (ADR-0208) must be verified against the 72-hour DR RTO mandate.

### ADR-0157 (HAPI FHIR PHI audit)
Add HIPAA audit retention note: "All ePHI audit records retained minimum 6 years per HIPAA documentation retention standard (45 CFR §164.316(b)(2)). WORM SeaweedFS lifecycle policy enforced."

### ADR-0099 §15 (patient-centric principles)
Add: "HIPAA compliance posture is a patient-safety enforcement mechanism, not a checkbox. PHI breach = direct patient harm (identity theft, clinical decision on wrong data). Technical controls in ADR-0162 §4 are patient-safety controls."

### ADR-0159 (pricing/packaging)
Add BAA-tier pricing note: "HealthStack Scale tier includes BAA execution (post-v1.5). BAA is not a standalone add-on; it is bundled with Scale tier as the minimum viable compliance posture for PHI-handling tenants."

---

## 11. Action Items

All action items are owned by CuraOS teams; none assigned to external parties.

| # | Action | Owner | Target | Done criteria |
|---|---|---|---|---|
| A-1 | Engage SOC 2 Type II auditor; start observation window | Compliance | Month 6 (v1 GA) | Auditor engagement letter signed |
| A-2 | Author Risk Assessment (NIST SP 800-30) | Platform Security | Month 5 | Document reviewed by legal; filed |
| A-3 | Author and test Incident Response Plan | Platform Security | Month 5 | Tabletop exercise completed; plan signed off |
| A-4 | Develop Workforce Training Program materials | Platform Security + HR | Month 5 | Curriculum authored; LMS integration configured; first cohort completed |
| A-5 | Implement MFA enforcement for HealthStack users (WebAuthn primary, TOTP fallback, SMS blocked) | Auth team | Month 4 | Keycloak policy enforced; tested end-to-end |
| A-6 | Implement automated asset inventory for ePHI workloads | Platform Ops | Month 4 | K8s resource watch deployed; monthly report automated |
| A-7 | Configure 24-hour breach detection alerting (Wazuh → PagerDuty/Grafana OnCall) | Platform Security | Month 3 | P1 PHI-breach alert fires in staging test |
| A-8 | Engage HITRUST CSF r2 assessor | Compliance | Month 9 | Assessor engaged; kickoff completed |
| A-9 | Engage ISO 27001:2022 certification body | Compliance | Month 9 | Certification body engaged; gap assessment started |
| A-10 | Schedule and run first annual penetration test | Platform Security | Month 11 | Pen test report received; all critical/high findings remediated |
| A-11 | Amend ADR-0108, ADR-0120, ADR-0208, ADR-0157, ADR-0099, ADR-0159 per §10 | Architecture | Month 6 | All amendments merged |
| A-12 | Launch trust center portal (trust.cura.os) | Product | Month 15 (v1.5 GA) | Portal live with audit reports, BAA template, subprocessor list |
| A-13 | Complete HIPAA OCR mock audit | Platform Security | Month 12 | Mock audit report; all findings remediated |
| A-14 | Author BAA template (CuraOS as Business Associate) | Legal | Month 12 | Healthcare-specialist counsel review complete |
| A-15 | Build per-customer compliance dashboard (Scale tier) | Product | Month 14 | Feature complete and tested on staging HealthStack tenant |
| A-16 | Re-validate architecture against HIPAA final rule text post-publication | Platform Security | Within 30 days of final rule publication | Delta analysis complete; follow-on ADR filed if changes required |

---

## 12. Open Questions

| # | Question | Impact | Resolution path |
|---|---|---|---|
| OQ-1 | Final HIPAA rule publication date and content — does it diverge materially from NPRM (e.g., HSM mandate, stricter MFA methods, shortened notification timelines)? | High — could require architectural rework if HSM or different encryption requirements added | Monitor OCR announcements; A-16 triggers re-validation within 30 days of publication |
| OQ-2 | Trump administration position on NPRM — will final rule soften or rescind mandatory MFA / encryption mandates? | Medium — if rescinded, controls remain in place voluntarily (still needed for enterprise sales and certification audits) | No action required; planning to NPRM level is correct regardless of final rule outcome |
| OQ-3 | HITRUST CSF r2 vs HITRUST e1 — which certification tier is required by target health system customers? | Medium — e1 is faster (1–2 months) but covers fewer controls; r2 is full assessment; most large health systems require r2 | Survey design-partner health systems by Month 6; default to r2 unless all early customers accept e1 |
| OQ-4 | LLM inference + ePHI: if a HealthStack Scale customer enables AI features with real PHI inputs, does Presidio redaction (ADR-0114) fully satisfy minimum-necessary and BAA requirements, or is a more restrictive "no PHI to LLM" policy needed? | High — affects AI feature roadmap and sub-processor BAA chain | Legal review of Presidio redaction approach against minimum-necessary standard before enabling LLM features for Scale tier (Month 12 target) |
| OQ-5 | On-prem customer compliance: CuraOS ships HIPAA-ready software but cannot audit customer's operating environment. Does CuraOS need to provide a self-assessment questionnaire / deployment compliance checklist for on-prem covered entities? | Low-Medium — affects on-prem go-to-market and customer enablement | Product decision; default is to include compliance deployment guide in on-prem bundle documentation (Month 15) |

---

## 13. References

| Source | Notes |
|---|---|
| HHS OCR NPRM (90 FR 800, 2025-01-06) | Primary source: proposed HIPAA Security Rule amendments |
| [HIPAA Security Rule NPRM — HHS factsheet](https://www.hhs.gov/hipaa/for-professionals/security/hipaa-security-rule-nprm/factsheet/index.html) | OCR official summary |
| [HIPAA Journal — 2026 updates and final rule status](https://www.hipaajournal.com/hipaa-updates-hipaa-changes/) | Running tracker of NPRM status and industry response |
| [HIPAA Journal — Final rule edges closer (March 2026)](https://www.hipaajournal.com/final-rule-implementing-hipaa-security-rule-updates-edges-closer/) | Current publication status; OCR "two months away" statement |
| [Accountable HQ — MFA requirements guide](https://www.accountablehq.com/post/2026-hipaa-rule-mandatory-mfa-for-ephi-access-requirements-and-compliance-guide) | MFA scope, exceptions, FIDO2/WebAuthn specifics |
| [HIPAA Vault — 2026 changes](https://www.hipaavault.com/resources/2026-hipaa-changes/) | Technical safeguard mandate summary |
| [Alston & Bird — Final rule on track (Nov 2025)](https://www.alston.com/en/insights/publications/2025/11/hipaa-security-rule-overhaul) | Legal analysis; timeline confidence |
| NIST SP 800-63B | Authentication assurance levels; AAL2 minimum for MFA |
| NIST SP 800-30 | Risk assessment framework (required for §5.1 risk assessment document) |
| NIST SP 800-52 | TLS configuration guidance; TLS 1.3 alignment |
| ADR-0099 | Platform charter; §12 timeline; §15 patient-centric principles |
| ADR-0101 | PostgreSQL TDE / pg_tde |
| ADR-0104 | Audit architecture |
| ADR-0107 | Observability + alerting |
| ADR-0108 | Security baselines (amended per §10) |
| ADR-0109 | Capsule namespace isolation |
| ADR-0111 | Velero backup + DR |
| ADR-0114 | Presidio PHI redaction at LLM boundary |
| ADR-0115 | HealthStack overlay |
| ADR-0120 | Auth + MFA (amended per §10) |
| ADR-0150 | Baseline alignment rules; vendor management |
| ADR-0151 | Cross-cluster coherence scan; F-016 resolved by this ADR |
| ADR-0155 | Tenant routing (@curaos/tenancy) |
| ADR-0156 | Auth token flow + mTLS |
| ADR-0157 | HAPI FHIR PHI audit + reconciliation (amended per §10) |
| ADR-0158 | Air-gap bundle SLA |
| ADR-0159 | Pricing + packaging (amended per §10) |
| ADR-0208 | HealthStack clinical services cluster (amended per §10) |
