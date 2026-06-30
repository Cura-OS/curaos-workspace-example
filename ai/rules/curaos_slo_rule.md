---
name: curaos-slo-rule
title: SLO mgmt (Pyrra + OpenSLO)
description: SLO management - Pyrra primary (active dev; K8s CRD + UI; OpenSLO spec format we write in); Sloth maintenance-only; SLO CRD per service per tenant auto-emitted by Codegen recipes
metadata:
  node_type: memory
  type: feedback
  originSessionId: 957dade0-7133-4262-addf-0595f6326c47
---

User decision (2026-05-24, after Decision-6 walkthrough - grounded in D0 orchestration + D3 CNI + D4 PG + D5 error tracking):

## The rule

**Pyrra is the only SLO management tool for CuraOS clusters. OpenSLO is the spec format we author in (Pyrra natively speaks it).**

| Concern | Choice |
|---|---|
| SLO tool | **Pyrra** (Polar Signals stewardship; active dev 2025-2026; K8s CRD + UI) |
| Authoring format | **OpenSLO** YAML (spec-driven; Pyrra reads it; future-proof for tool swap) |
| Per-tenant model | One `ServiceLevelObjective` CRD per service per tenant (tenant-id label) |
| Output | Prometheus recording + alerting rules consumed by VictoriaMetrics (per D-future obs stack) |
| Alert routing | Alertmanager → tenant-supplied PagerDuty/OpsGenie webhook (Grafana OnCall archived per research 08) |
| Codegen recipe (per ADR-0123) | Per-service template emits SLO CRD w/ default thresholds; tenant onboarding applies per-tenant values |

## Banned

- Sloth as primary (maintenance-only; use Pyrra)
- Manual Prometheus rules per service (anti-pattern at 96 services × multi-tenant scale)
- Nobl9 SaaS / Grafana Cloud SLO as primary (violates charter §3 + §4 air-gap)
- Per-service custom SLO tooling (one platform, no snowflakes)
- Static threshold alerts (use multi-burn-rate; Pyrra emits)

<!-- fold: rationale, non-binding -->

## Why Pyrra (vs Sloth / OpenSLO orchestrators / manual / SaaS)

| Capability | Pyrra | Sloth | Manual | Nobl9/Grafana Cloud |
|---|---|---|---|---|
| Declarative K8s CRD | yes (`ServiceLevelObjective`) | no (YAML files) | no | proprietary API |
| Built-in K8s-native UI | yes | no (Grafana dashboard needed) | no | yes |
| Multi-burn-rate alerts auto-generation | yes | yes | manual | yes |
| Active dev 2025-2026 | yes (Polar Signals) | **maintenance-only** (self-declared late 2024) | n/a | yes |
| Air-gap install (per [[curaos-orchestration-rule]] Zarf) | yes (Helm chart) | yes (CLI binary) | n/a | NO |
| Per-tenant SLO (multi-tenant scale) | one CRD per tenant per service | one YAML per tenant per service | manual | proprietary |
| VictoriaMetrics compatibility | yes (PromQL) | yes | yes | varies |
| Codegen Engine recipe friendliness | excellent (one CRD template) | good (one YAML template) | brittle | n/a |
| OpenSLO spec adoption | reads OpenSLO directly | yes | n/a | partial |
| K3s Helm install (per [[curaos-orchestration-rule]] D0) | yes | n/a (CLI tool) | n/a | NO |
| 2025-2026 momentum | very high (Polar Signals Dec 2025 production-validated 90% cross-zone traffic reduction case) | declining | n/a | commercial |

## Pyrra `ServiceLevelObjective` CRD pattern

```yaml
apiVersion: pyrra.dev/v1alpha1
kind: ServiceLevelObjective
metadata:
  name: identity-service-availability-tenant-mercy
  namespace: identity-service
  labels:
    tenant_id: hospital-mercy
    service: identity-service
    profile: cloud-saas
spec:
  target: "99.9"
  window: 30d
  description: "Identity service auth requests for tenant-mercy must succeed 99.9% over 30d"
  indicator:
    ratio:
      errors:
        metric: http_requests_total{job="identity-service",tenant_id="hospital-mercy",code=~"5.."}
      total:
        metric: http_requests_total{job="identity-service",tenant_id="hospital-mercy"}
  alerting:
    name: IdentityServiceAvailabilityTenantMercy
    labels:
      severity: critical
      tenant_id: hospital-mercy
      runbook: https://runbooks.curaos-internal/identity-availability
```

Per-tenant onboarding pipeline applies one CRD per service per tenant w/ tenant-specific thresholds (some tenants 99.9%, enterprise tier 99.99%).

## OpenSLO authoring (spec layer)

We write SLOs as OpenSLO YAML in `ops/slo/<service>/<tenant>.yaml`; Pyrra reads + applies. Reasons:
- Spec is tool-agnostic - if Pyrra ever stops, swap to Sloth/other w/o rewriting SLOs
- Reviewable in PR diff (YAML, not generated rules)
- One source of truth per service per tenant
- Codegen Engine emits OpenSLO templates from service spec (per ADR-0123)

## Multi-burn-rate alerts (standard SRE pattern)

Pyrra auto-generates per SLO:
- **Page-immediately** (2% budget burned in 1h)
- **Page-soon** (5% budget burned in 6h)
- **Ticket** (10% budget burned in 3d)
- Burn-rate alerts use Google SRE workbook formula; reduces noise vs static thresholds

## Alert routing (Grafana OnCall archived alternative)

Per research 08 §9, Grafana OnCall OSS archived 2026-03-24. Pattern:
- Pyrra-emitted Prometheus alerts → Alertmanager (per D-future observability)
- Alertmanager → webhook → tenant-supplied PagerDuty/OpsGenie key (per [[curaos-local-vs-3rdparty-rule]] external alert routing)
- Internal: webhook → Slack/Mattermost (per tenant config)

## Codegen Engine integration

Per [[curaos-foundation-runtime-directives]] + ADR-0123, Codegen recipes per service include:

```yaml
# Generated by Codegen recipe nestjs-service-v1
# ops/slo/identity-service/_default.openslo.yaml
apiVersion: openslo/v1
kind: SLO
metadata:
  name: identity-service-default-availability
spec:
  service: identity-service
  indicator:
    ratioMetric:
      counter: true
      good:
        metricSource:
          type: prometheus
          spec:
            query: 'sum(rate(http_requests_total{job="identity-service",code!~"5.."}[5m]))'
      total:
        metricSource:
          type: prometheus
          spec:
            query: 'sum(rate(http_requests_total{job="identity-service"}[5m]))'
  objectives:
    - target: 0.999
      timeWindow:
        - duration: 30d
          isRolling: true
```

Tenant onboarding pipeline copies this template + injects tenant_id + tier-appropriate target (99.9% standard, 99.99% enterprise) → applies as Pyrra CRD.

## How it satisfies CuraOS rules

| Rule | Compliance |
|---|---|
| AGENTS.md §3 charter self-hosted first | Pyrra Helm to K3s; no cloud SLO dependency |
| AGENTS.md §4 air-gap | Pyrra in Zarf bundle (per D0); no external calls |
| AGENTS.md §6 NFR observability + reliability | Multi-burn-rate alerts standard SRE; auto-generated from declarative spec |
| [[curaos-orchestration-rule]] (D0) | Pyrra deployed via Helm to K3s + ArgoCD ApplicationSet per cluster |
| [[curaos-cni-rule]] (D3) | Pyrra UI reachable per CiliumNetworkPolicy (internal-only by default; tenant tier gates external access) |
| [[curaos-postgres-rule]] (D4) | Pyrra uses cluster Prometheus/VictoriaMetrics; doesn't touch CNPG directly |
| [[curaos-error-tracking-rule]] (D5) | SLO breaches → GlitchTip prod project alert (via Alertmanager webhook); error rate metric same as SLO denominator |
| [[curaos-local-vs-3rdparty-rule]] | External alert routing via tenant PagerDuty/OpsGenie keys |
| [[curaos-modulith-standalone-rule]] | Dev mode = no SLO enforcement (Pyrra not installed in Compose); CI k3d cluster runs Pyrra for SLO config validation |
| [[curaos-ai-mirror-rule]] | ops/slo/<service>/<tenant>.yaml mirrored under curaos/ops/ + ai/curaos/ops/ |
| [[curaos-bun-primary-rule]] | n/a (Pyrra is Go); CLI invocation via `bunx -p pyrra-cli pyrra` for one-off generation in CI |

## Agentic-tool friendliness

Why Pyrra wins for AI agents specifically:
- ONE CRD model (ServiceLevelObjective) agents author from spec
- OpenSLO YAML format → agents read existing SLOs + generate new ones using same template
- Pyrra UI lets agents inspect SLO state via screenshot/scrape in prod triage flow
- Predictable alert YAML output → agents understand what fires when
- Single source of truth (OpenSLO YAML files in git) → agents diff per-tenant changes in PR
- No proprietary API to learn (vs Nobl9); agents stay in K8s/Prometheus mental model
- Pairs w/ kubernetes-mcp-server (per [[curaos-orchestration-rule]]) for SLO CRD introspection

## How to apply

- Pyrra Helm release per cluster (`ops/pyrra-release.yaml` ArgoCD ApplicationSet); installed alongside Prometheus/VictoriaMetrics
- OpenSLO YAML files at `ops/slo/<service>/<tenant>.yaml` per [[curaos-ai-mirror-rule]] structure
- Codegen Engine recipe (per ADR-0123) for any new service emits `_default.openslo.yaml` template
- Tenant onboarding workflow (per [[curaos-postgres-rule]] flow): copies default OpenSLO templates + injects tenant_id + tier target → applies as Pyrra CRD
- Service AGENTS.md frontmatter declares:
  ```yaml
  slo:
    tool: pyrra
    target_default: 99.9
    target_enterprise: 99.99
    window: 30d
    indicators: [availability, latency_p95, error_rate]
  ```
- AlertManager config routes per-tenant alerts via labels: `{tenant_id="hospital-mercy", severity="critical"}` → tenant-supplied webhook
- CI integration: Pyrra CRD apply dry-run in k3d cluster validates new SLOs before merge

## ADRs queued

Per digest §6:
- **ADR-0141 (NEW, SLO management)**: full version; this rule = short form
- **ADR-0099 (charter)**: amend §6 NFR observability subsection to link this rule
- **ADR-0140 (D5 error tracking already queued)**: cross-ref this rule for alert routing
