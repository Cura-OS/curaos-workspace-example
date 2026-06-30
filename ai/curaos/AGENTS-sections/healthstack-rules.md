# curaos §6 - HealthStack Rules

- PHI stays in HealthStack overlay schemas only. Neutral services hold references + metadata.
- Clinical SLA enforcement: tenant-built HealthStack apps are subject to ADR-0161 three-layer gating - (1) hard separation (Cilium NetworkPolicy + APISIX block), (2) soft separation (Capsule quota + QoS + rate limit), (3) certification (audit checklist + Cosign + recert), plus tenant-controls layer.
- HAPI FHIR PHI audit: three-mode pipeline (ADR-0157) - webhook push + Debezium CDC + scheduled poll. NestJS services do NOT bypass HAPI audit; the reconciliation pipeline handles both sides.
- HIPAA 2026 compliance: ADR-0162 is the canonical compliance source. All HealthStack services reference it. BAA-signing gated to v1.5 after certification audit.
- Patient-centric priority: clinical UX/perf is never compromised for admin convenience (ADR-0099 §15).

See [[curaos-healthstack-vision]] for charter + [[curaos-postgres-rule]] for the CNPG + Citus (shared-schema sharded by tenant_id at scale) + Barman→SeaweedFS backup model.
