# External-Source Enrichment (XSRC)

Tracked deliverables of the external open-source corpus-mining + tool-research program (Phases 0-14). Maps healthcare/ERP/CRM/broker/workflow OSS onto CuraOS, generator-first + person-centric. The 21G raw corpus (`external-sources/`) and bulk derived indices (`.ai-analysis/generated-analysis/`, `source-catalog.json`) stay git-ignored (reproducible); the durable decisions, plan, and reports live here.

## Read first
- [SUMMARY.md](SUMMARY.md) - one-page digest
- [FINAL-REPORT.md](FINAL-REPORT.md) - full executive report (25 sections)
- [DECISION-nextjs-vs-tanstack.md](DECISION-nextjs-vs-tanstack.md) - stay Next.js + next-runtime-env
- [PERSON-CENTRIC-LENS.md](PERSON-CENTRIC-LENS.md) - binding lens (person-centric, no feature loss)

## Execute
- [v1.1 execution orchestration prompt](../../../../docs/agents/v1.1-execution-orchestration-prompt.md) - runbook: waves, collision partition, generator-first barrier, stop predicate
- [V1.1-EXECUTION-GOAL-PROMPT.md](V1.1-EXECUTION-GOAL-PROMPT.md) - paste-ready goal prompt + model/effort suggestion
- [EXECUTION-PLAN.md](EXECUTION-PLAN.md) - the 8-wave execution plan (lane assignments, critical path, coverage statement, stop predicate)

## Identity (own IdM, replace pocket-id)
- [identity/README.md](identity/README.md) - own multi-tenant CIAM/IdP + user-mgmt + entitlements; pocket-id cutover; ADRs 0237-0242

## Plan (machine-readable)
- [plan/integration-plan.json](plan/integration-plan.json) - 12-category blueprint
- [plan/implementation-backlog.json](plan/implementation-backlog.json) - 16 epics, 178 items
- [plan/source-to-local-map.json](plan/source-to-local-map.json) - 163 mappings
- [plan/gap-analysis.json](plan/gap-analysis.json) - 81 gaps
- [plan/code-reuse-ledger.json](plan/code-reuse-ledger.json) - reuse modes A-H
- [plan/license-risk-register.json](plan/license-risk-register.json) - per-system license verdicts
- [plan/tool-research-register.json](plan/tool-research-register.json) - Phase 14: 150 importable tools, 69 adopt

## Crosswalks
- [crosswalks/feature-taxonomy.json](crosswalks/feature-taxonomy.json)
- [crosswalks/data-model-crosswalk.json](crosswalks/data-model-crosswalk.json)
- [crosswalks/ui-visual-inventory.json](crosswalks/ui-visual-inventory.json)
- [crosswalks/workflow-map.json](crosswalks/workflow-map.json)

## ADRs (proposed, 0221-0236)
- [0221-direct-reuse-vs-service-boundary-for-large-external-sys.md](../adr/0221-direct-reuse-vs-service-boundary-for-large-external-sys.md) - XSRC-ADR-0001  -  Direct reuse vs service boundary for large external systems
- [0222-odoo-module-reuse-strategy-lgpl-port-adapt-no-copy.md](../adr/0222-odoo-module-reuse-strategy-lgpl-port-adapt-no-copy.md) - ADR-0222: Odoo module reuse strategy (LGPL, port-adapt, no copy)
- [0223-vista-mumps-analysis-and-integration-strategy-apache-su.md](../adr/0223-vista-mumps-analysis-and-integration-strategy-apache-su.md) - ADR-0223: VistA/MUMPS analysis and integration strategy (Apache substrate, CPRS apps, FHIR
- [0224-openhospital-reuse-strategy-gpl-port-adapt-service-boun.md](../adr/0224-openhospital-reuse-strategy-gpl-port-adapt-service-boun.md) - ADR-0224: OpenHospital reuse strategy (GPL: port-adapt + service-boundary, no verbatim c
- [0225-erpnext-frappe-reuse-strategy-gpl-mit-split.md](../adr/0225-erpnext-frappe-reuse-strategy-gpl-mit-split.md) - ADR-0225: ERPNext/Frappe reuse strategy (GPL/MIT split)
- [0226-dolibarr-contracts-billing-reuse-strategy-gpl.md](../adr/0226-dolibarr-contracts-billing-reuse-strategy-gpl.md) - ADR-0226: Dolibarr contracts/billing reuse strategy (GPL)
- [0227-crm-strategy-for-broker-insurance-workflows-espocrm-sui.md](../adr/0227-crm-strategy-for-broker-insurance-workflows-espocrm-sui.md) - ADR-0227: CRM strategy for broker/insurance workflows (EspoCRM/SuiteCRM AGPL, custom-entit
- [0228-workflow-automation-runtime-strategy-local-workflow-cor.md](../adr/0228-workflow-automation-runtime-strategy-local-workflow-cor.md) - ADR-0228: Workflow automation runtime strategy (local workflow-core vs Windmill/Activepi
- [0229-license-and-attribution-governance-agpl-gpl-mpl-permiss.md](../adr/0229-license-and-attribution-governance-agpl-gpl-mpl-permiss.md) - ADR-0229: License and attribution governance (AGPL/GPL/MPL/permissive matrix)
- [0230-xsrc-fhir-hl7-interoperability-strategy.md](../adr/0230-xsrc-fhir-hl7-interoperability-strategy.md) - ADR-0230: (XSRC) FHIR/HL7 interoperability strategy
- [0231-scheduling-calendar-architecture-xsrc-phase-12.md](../adr/0231-scheduling-calendar-architecture-xsrc-phase-12.md) - ADR-0231: Scheduling/calendar architecture (XSRC Phase 12)
- [0232-billing-contracts-revenue-cycle-architecture.md](../adr/0232-billing-contracts-revenue-cycle-architecture.md) - ADR-0232: Billing / contracts / revenue-cycle architecture
- [0233-human-in-the-loop-workflow-architecture.md](../adr/0233-human-in-the-loop-workflow-architecture.md) - ADR-0233: Human-in-the-Loop Workflow Architecture
- [0234-ui-embedding-vs-native-rebuild-person-centric-re-center.md](../adr/0234-ui-embedding-vs-native-rebuild-person-centric-re-center.md) - ADR-0234: UI embedding vs native rebuild (person-centric re-center)
- [0235-insurance-broker-domain-modeling-new-domain-generator-f.md](../adr/0235-insurance-broker-domain-modeling-new-domain-generator-f.md) - ADR-0235: Insurance / Broker Domain Modeling (new domain, generator-first)
- [0236-demo-data-from-vista-vehu-and-synthea-via-database-back.md](../adr/0236-demo-data-from-vista-vehu-and-synthea-via-database-back.md) - ADR-0236: Demo data from VistA-VEHU and Synthea via database-backed seeds

## Tracking
Local: 282 v1.1 rows in `.scratch/state/symphony-work/local-issues.sqlite` (`workflow_name=external-source-enrichment`). GitHub: epic [#849](https://github.com/your-org/curaos-ai-workspace/issues/849) + 12 curated foundation issues (#850-861).
