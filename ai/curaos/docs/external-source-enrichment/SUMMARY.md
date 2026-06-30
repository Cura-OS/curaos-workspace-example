# XSRC External-Source Enrichment: Summary (read this first)

One-page digest over the full analysis under `.ai-analysis/`. Full detail: [`reports/FINAL-EXTERNAL-SOURCE-ENRICHMENT-PLAN.md`](FINAL-REPORT.md).

## What we did

Inspected the local CuraOS workspace (derived, not assumed), cataloged 1244 OSS repos across 13 orgs, deep-cloned + indexed 41 (21G), then mapped every external feature onto our project and produced a generator-first, person-centric reuse/integration plan. All planned work filed as **v1.1** in the local tracker (`.scratch/state/symphony-work/local-issues.sqlite`, 282 rows under `workflow_name=external-source-enrichment`).

## What we have (local truth)

93 backend services (45 neutral-core / 14 personal / 12 business / 18 healthstack / 3 education), 35 SDK/shared packages, 26 apps, generator-first codegen (`tools/codegen`), TypeSpec contracts + AsyncAPI events, Bun/NestJS/Drizzle/Zod/Turborepo/React. Strong substrate: identity (passkey/DPoP/break-glass), party/org/patient diamond with PHI overlay, search (BM25+vector), patient-experience read-model, the codegen mold itself.

## What the corpus contains

609 features, 304 UI screens, 495 API endpoints, 426 DB entities, 153 workflows indexed from Odoo/ERPNext/Frappe/Dolibarr (ERP), OpenEMR/OpenMRS/OpenHospital/Bahmni/VistA + 9 VHAINNOVATIONS CPRS apps (healthcare), SuiteCRM/EspoCRM (CRM), Windmill/Activepieces/Node-RED/n8n (workflow).

## Where we stand (163 source<->local mappings)

- 34 present-strong, **14 already stronger than source**, 34 partial
- **81 real gaps**: 36 absent, 24 stub, 21 weak

## Biggest gaps (what to build, person-centric + no feature loss)

1. **FHIR-R4 clinical resource services** (Observation/Condition/MedicationRequest/Allergy) - `@curaos/fhir-client` is a stub; permissive VistA-FHIR utilities are vendorable.
2. **Revenue cycle / X12 EDI** absent (837P/837I/835/270/271) - new `@curaos/x12` SDK; OpenEMR proves the segment maps (GPL -> clean-room port, X12 layout is a government standard).
3. **Clinical Decision Support + rules/risk engine** absent (richest source domain) - adopt `cql-execution`/`fqm-execution`/`@gorules/zen-engine`; port ASRCM/AWARE/VistA rule engines (Apache, copy-OK).
4. **Insurance/broker** = entirely new domain (policy/coverage/premium/commission/claims) - new `policy-core-service` + `@curaos/insurance-sdk`, generator-first.
5. **Accounting GL / invoicing / contracts-subscriptions-renewals** mostly scaffold - Odoo/Dolibarr/ERPNext data models (GPL/LGPL -> port).
6. **Maternity, AVS, eCQM quality, ADT/ward-bed** - permissive CPRS/VistA sources, naturally person-centric.
7. **ui-kit archetypes** missing (Kanban, scheduler, data-grid, workflow canvas) - adopt shadcn/Radix/TanStack/xyflow/dnd-kit.

## Licenses (drives HOW we reuse)

19 permissive (copy-OK with NOTICE: all VistA + VHAINNOVATIONS Apache, Frappe/activepieces MIT). 11 GPL/LGPL/MPL (Odoo/ERPNext/OpenEMR/OpenHospital/OpenMRS -> port-adapt, never copy into our build). 7 AGPL (SuiteCRM/EspoCRM/Windmill/Bahmni -> service-boundary or reference). 3 unknown -> legal review. Net: ~0 copy-verbatim into our stack; 99 port-adapt, 51 reference-only. Models/standards (FHIR fields, X12 layout) are mined as specs regardless of code license.

## Phase 14 - importable tools (build less from scratch)

17 capability lanes web-researched + adversarially verified. **69 adopt / 30 trial / 57 service-boundary / 34 reference / 17 reject** (150 candidates). Adopt-now headliners: @medplum (FHIR), cql-execution + @gorules/zen-engine (CDS), Temporal + pg-boss + XState (workflow), node-x12 (claims), MapLibre + Valhalla + Traccar + PostGIS (geo/fleet), Documenso + Gotenberg + pdfme (e-sign/docs), Meilisearch + pgvector + Superset (search/BI), Novu + react-email + Postal (notify), Cerbos + @simplewebauthn (authz), shadcn/Radix/TanStack/xyflow/dnd-kit (UI/builder), OpenTelemetry + GlitchTip + Langfuse + Pact + Presidio (observability). Register: [`generated-analysis/tool-research/tool-research-register.json`](plan/tool-research-register.json).

## Next.js -> TanStack decision (asked + answered)

**STAY on Next.js + adopt `next-runtime-env`** (fixes the #840/ADR-0220 build-time-env-bake blocker, generator-first in `ui-app-emit`). Do NOT migrate the 24-app fleet (full migration scored only "better," not "much-better"; fails the multi-area bar). Trial TanStack Start for net-new apps only. Full reasoning: [`reports/DECISION-nextjs-vs-tanstack.md`](DECISION-nextjs-vs-tanstack.md).

## The binding lens

Every mapping/gap/item re-centers the source's org-centric UX onto the person (patient/customer/user), keeps a dual surface (person-facing + management) over one contract, and loses no business/compliance capability while simplifying the business. [`PERSON-CENTRIC-LENS.md`](PERSON-CENTRIC-LENS.md).

## Identity (own IdM, replace pocket-id)

v1.1 also builds our own multi-tenant CIAM/IdP + user-lifecycle + B2B org-mgmt + fine-grained entitlements to retire the self-hosted pocket-id. Mined pocket-id + Zitadel/Keycloak/Authentik + Ory(Kratos/Hydra/Keto) + Logto/SuperTokens + OpenFGA, plus online tool research (node-oidc-provider+jose, , ReBAC OpenFGA/Keto/Cerbos, SAML/LDAP/SCIM). Plan: [identity/README.md](identity/README.md) + [identity/CUTOVER-PLAN.md](identity/CUTOVER-PLAN.md); ADRs 0237-0242; 57 local rows + GH #862-868 under #849. Logto = closest stack-fit; node-oidc-provider (FAPI2-certified, MIT) = the provider engine.

## Plan + tracking

- Integration blueprint (12 categories): [`integration-plan.json`](plan/integration-plan.json)
- Implementation backlog (16 epics, **178 items**, 49 P0 / 51 P1): [`implementation-backlog.json`](plan/implementation-backlog.json)
- 16 ADR drafts: [`adr/`](../adr/) (proposed; renumber on promotion into `curaos/ai/curaos/docs/adr/`)
- License risk register: [`license-risk-register.json`](plan/license-risk-register.json)
- 282 v1.1 items in local tracker; a curated top slice synced to GitHub; the rest held local pending the v1.1 gate.

## Immediate next steps (generator-first foundations, P0)

`@curaos/x12`, `@curaos/fhir-client`, `@curaos/connector-sdk`, `@curaos/tax-engine`, `@curaos/contract-sdk` + the `ui-app-emit` dual-surface/archetype emitter + `next-runtime-env` #840 fix are the cross-cutting upstream blockers; dependent services wait per the in-flight generator/SDK barrier.
