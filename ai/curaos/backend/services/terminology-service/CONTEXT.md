# CONTEXT.md — terminology-service

## Purpose

`healthstack` overlay terminology service (issue #383, M12 Story 1). FHIR R4
terminology operations over Snowstorm (SNOMED CT) + HAPI FHIR JPA (LOINC /
RxNorm / ICD-10 / UCUM). It is the independent ROOT of the M12 clinical cluster
— `orders-service` / `clinical-doc-service` / `problems` call it on demand to
validate codes (ADR-0208 §3.15). It extends neutral core; per charter §5.2 it is
an overlay service, but terminology data is **reference data, NOT PHI** (it
carries no patient data — only the tenant config flag `tenant.terminology_jurisdiction`).

## Stack

- Runtime: NestJS 11 on Bun 1.3.14 (per `ai/rules/curaos_foundation_runtime_directives.md`)
- ORM: Drizzle (primary) per `ai/rules/curaos_orm_rule.md`
- Validation: Zod 4 per `ai/rules/curaos_validation_rule.md`
- Storage: PostgreSQL (CNPG) per `ai/rules/curaos_postgres_rule.md`
- Terminology back-ends: **Snowstorm** (Apache-2.0; SNOMED CT) front-ended by
  this service; **HAPI FHIR JPA** loads LOINC / RxNorm / ICD-10 / UCUM
  (open-license, NLM / NPM). DrugBank is OUT (Q7) — RxNorm is the medication
  default.
- Snowstorm distribution: **full** (pinned ES version per Snowstorm release
  matrix) for authoring tenants; **Lite** (~500MB Lucene, JDK17) for
  resource-constrained + air-gap edge (terminology-licensing §3). Do NOT swap
  OpenSearch into full Snowstorm — IHTSDO does not guarantee compatibility.
- PHI boundary: terminology is reference data, not PHI; no patient data persists
  here. The only tenant-scoped field is `tenant.terminology_jurisdiction`.

## FHIR resource ownership (fhir-resource-boundary §4.1)

Owns FHIR R4 `CodeSystem` / `ValueSet` / `ConceptMap`. Operations:
`$expand` / `$lookup` / `$validate-code` / `$translate` (ConceptMap), plus
`GET /terminology/suggest?text=&system=snomed` coding-assist (ADR-0208 §3.15).
ICD-10-CM→SNOMED (NLM GEM) + LOINC→SNOMED Observable-Entity ConceptMaps; tenant
value sets in HAPI JPA, versioned in Apicurio. FHIR R6 deferred (Q1) — handled
as a post-GA forward migration, NOT a parallel `-v2` server
(`ai/rules/curaos_rolling_update_rule.md`).

## SNOMED jurisdiction allow-list (terminology-licensing §4)

A curated static ISO-3166-1-alpha-2 member allow-list bundled with the service
(refreshed via scheduled human review) is validated at **module activation**,
NOT query time. A non-member `tenant.terminology_jurisdiction` blocks SNOMED
activation until a commercial-license id is recorded in tenant config.

## Air-gap (M8 Zarf path)

RF2 SNOMED snapshots bundled per national edition via Zarf; air-gap mode makes
**zero** live SNOMED International calls (CI assertion — AC #3). The
no-endpoint-configured default IS air-gap mode (bundled RF2 / Lite only).

## Integration Points

- **Produces:** `healthstack.terminology.valueset-updated` (Redpanda + durable
  outbox) → triggers downstream re-validation. The generated
  `src/events/domain-event-catalog.ts` ships the GENERIC example topic
  (`curaos.core.terminology.recorded.v1`); the domain lane replaces it with the
  `healthstack.terminology.valueset-updated` constant (AC #5). The event payload
  is reference-only: `value_set_id` is an opaque UUID, `value_set_url` is
  `/ValueSet/<value_set_id>`, `version` is numeric release-version shaped, and
  `updated_by` is an opaque actor UUID. No human-readable ValueSet slugs,
  display names, usernames, nested actor objects, or free-text qualifiers.
- **Consumes:** none — pull-only root. Services call its REST/FHIR operations on
  demand (ADR-0208 §3.15).
- **Contracts:** TypeSpec REST (`specs/terminology.tsp`) + AsyncAPI catalog
  (`specs/terminology.asyncapi.yaml`) + FHIR `CodeSystem`/`ValueSet`/`ConceptMap`
  profiles.
- **APIs:** FHIR R4 terminology operations under the service's FHIR base, plus
  the `GET /terminology/suggest` coding-assist endpoint.

## Open Questions (resolved by #383 research — see refs)

- Event name: `healthstack.terminology.valueset-updated` (issue #383 AC #5).
- Event reference fields: opaque UUID-backed ValueSet and actor references only
  (issue #408 Layer-6 PHI-boundary closure).
- Storage partition: DB-per-tenant (per `ai/rules/curaos_postgres_rule.md`);
  reference data is shared, tenant value sets are tenant-scoped.
- PHI boundary: terminology is reference data, not PHI — no HIPAA minimum-necessary
  patient-data review applies (issue #383 integration points).

## References

- `ai/rules/curaos_agents_md_schema_rule.md` — AGENTS.md schema
- `ai/rules/curaos_ai_mirror_rule.md` — 1:1 mirror
- `ai/curaos/docs/adr/` — relevant ADRs
- `ai/curaos/backend/services/terminology-service/Requirements.md` — full spec
- `ai/curaos/docs/research/2026-06-04-fhir-terminology-operations.md` —
  #397 FHIR operations, backend/fallback, event, and integration research
- `ai/curaos/docs/grills/m12-397-terminology-fhir-ops-opposite-harness.md` —
  #397 opposite-harness adversarial review
- `ai/curaos/docs/grills/m12-397-terminology-fhir-ops-planning.md` —
  #397 planning grill and implementer resolutions
