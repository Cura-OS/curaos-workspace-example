---
name: curaos-error-tracking-rule
title: Error tracking (GlitchTip prod + Sentry SaaS dev)
description: Split error tracking - GlitchTip self-hosted for prod/staging (AGPL, 4 containers, own MCP) + Sentry SaaS for dev/CI (Seer/AutoFix/MCP agentic tools); mandatory PHI scrub via shared SDK init helper; session replay BANNED on healthstack apps
metadata:
  node_type: memory
  type: feedback
  originSessionId: 957dade0-7133-4262-addf-0595f6326c47
---

User decision (2026-05-24, after Decision-5 walkthrough - grounded in D0 orchestration + D3 CNI + D4 PG + research 09 Sentry Labs/GlitchTip compat):

## The rule

**Two error trackers, one SDK, two DSNs by environment.**

| Environment | Tool | Why |
|---|---|---|
| Dev (local laptop, no PHI, network OK) | **Sentry SaaS** | Agents get Seer/AutoFix/Sentry MCP/Issue Summary/Query Assistant - biggest AI productivity multiplier for the 200+ agent swarm |
| CI (GitHub Actions, no PHI, network OK) | **Sentry SaaS** | Same; CI errors flagged + Seer triages |
| Staging (synthetic data) | **GlitchTip self-hosted** | Parity w/ prod; tests PHI scrub pipeline |
| Prod (PHI, air-gap possible per AGENTS.md §4) | **GlitchTip self-hosted** | AGPL clean for hosting tenants; 4 containers fit air-gap Zarf bundle; PHI never leaves cluster |
| 3rd-party (tenant cloud per [[curaos-local-vs-3rdparty-rule]]) | tenant chooses (Sentry SaaS / Bugsnag / Datadog / etc) via `ErrorTrackerProvider` abstraction | Tenant brings their own DSN/keys |

Migration GlitchTip ↔ Sentry self-hosted = DSN swap only (same Sentry SDK protocol; zero code change). Confirmed in research 09.

## Mandatory PHI scrub

Every SDK init across every NestJS service + every frontend bundle goes through shared `@curaos/observability` init helper:

```ts
// packages/observability/src/init-error-tracking.ts
import * as Sentry from '@sentry/node';
import { scrubPhi } from './phi-scrubber';

Sentry.init({
  dsn: process.env.ERROR_TRACKER_DSN,  // GlitchTip prod DSN or Sentry SaaS dev DSN
  environment: process.env.NODE_ENV,
  beforeSend(event, hint) {
    return scrubPhi(event);  // regex first → Presidio NLP (if available)
  },
  beforeBreadcrumb(breadcrumb) {
    return scrubPhi(breadcrumb);
  },
  release: process.env.SENTRY_RELEASE,
  tracesSampleRate: 0,  // distributed tracing handled by OTel/Tempo per D-future; don't duplicate
  // Session replay BANNED on healthstack-* apps; allowed neutral apps via opt-in
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
});
```

PHI scrubber strategy (per research 05 §1):
1. Regex pass first (fast, structured fields: SSN, MRN, DOB, phone, email)
2. Presidio NLP pass (free-form text) if available in environment
3. Whole-event drop if scrubber unsure (fail-safe)

`@curaos/observability` lib lives at `curaos/backend/packages/observability/` per [[curaos-ai-mirror-rule]] structure.

## Banned

- Session replay on healthstack-* apps (DOM recording = PHI risk; enforced by CI lint rule)
- PHI in error context w/o beforeSend scrub (mandatory pipeline)
- Sentry self-hosted as default (BSL legal review burden + 16-32GB RAM + duplicates OTel/Tempo)
- Bug-trackers w/o Sentry SDK wire-compat (lose migration optionality)
- Per-service custom SDK init (must use shared @curaos/observability helper)
- Performance APM in Sentry/GlitchTip (let Tempo own distributed traces per D-future obs)

<!-- fold: rationale, non-binding -->

## Why GlitchTip for prod (not Sentry self-hosted)

| | GlitchTip | Sentry self-hosted | Sentry SaaS |
|---|---|---|---|
| Container count | 4 | 20+ | n/a |
| RAM floor | ~2 GB | 16-32 GB | n/a |
| License | AGPL (CuraOS hosts tenants cleanly) | BSL since 2023 (commercial restrictions) | proprietary |
| Air-gap install (per [[curaos-orchestration-rule]] Zarf) | trivial (4 containers in Zarf bundle) | possible but heavy | NO |
| PHI scrub via SDK `beforeSend` | yes (Sentry SDK feature) | yes | yes |
| Session replay (PHI risk on DOM forms) | NO (feature for healthcare) | yes (must disable per app) | yes (must disable per app) |
| Performance APM waterfall traces | NO | yes (duplicate of OTel/Tempo) | yes (duplicate) |
| AI tools (Seer/AutoFix/Sentry MCP) | NO | **NO - SaaS only** | YES |
| Own MCP server (own AI agent introspection) | YES (17 tools per glitchtip.com/documentation/mcp) | NO (Sentry MCP is SaaS-only) | YES |
| Sentry SDK wire-compat | YES (DSN swap migrates seamlessly) | YES | YES |
| CNCF/OpenSSF affiliation | none | none | none |

## Why Sentry SaaS for dev/CI

Per research 09:
- Seer = AI debugging agent inside Sentry SaaS infra (closed source, NOT in self-hosted)
- AutoFix = AI-generated patches for issues
- Sentry MCP = MCP server for agents to query Sentry SaaS (NOT GlitchTip)
- Issue Summary + Query Assistant = LLM features in SaaS UI

For dev/CI (no PHI, network OK, agents want these tools in coding loop) → SaaS is the right pick. Org policy may forbid; if so, drop to GlitchTip dev (lose AI tools, keep GlitchTip MCP).

## Session replay rules

- **healthstack-* apps**: session replay BANNED (DOM recording = PHI capture). Verified by lint rule in CI: any healthstack package importing `@sentry/replay` fails build.
- **neutral apps**: session replay OFF by default. Opt-in per app via `AGENTS.md` frontmatter `error_tracking.session_replay: true` + tenant explicit consent + Presidio masking layer enabled.

## Per-tenant project model

- CuraOS-managed: one GlitchTip project per tenant; tenant-id added to every event via SDK `Sentry.setTag('tenant_id', ...)` (set by tenant-context middleware in NestJS per [[curaos-orchestration-rule]] dev/prod patterns)
- DSN per project rotated quarterly via OpenBao
- Project quotas enforced (per-tenant event rate limit) to prevent noisy-neighbor at error tracker

## Local + 3rd-party rule compliance

Per [[curaos-local-vs-3rdparty-rule]]:
- **Local (default)**: GlitchTip self-hosted for prod/staging
- **3rd-party (per-tenant opt-in)**: Sentry SaaS / Bugsnag / Datadog / HighlightIO via tenant DSN - same `ErrorTrackerProvider` abstraction
- **`ErrorTrackerProvider` abstraction** in `@curaos/observability`: wraps DSN selection + scrubber config + tenant routing

## GlitchTip MCP server (agentic introspection)

Per research 09, GlitchTip ships an MCP server (enable via env var) w/ 17 tools:
- Browse issues by severity / project / tenant
- Inspect stack traces
- Get performance summary
- Check uptime monitor status
- List recent releases
- Query issue counts by tag

Agents working on prod triage use this MCP for first-line debugging. Pairs w/ kubernetes-mcp-server (per [[curaos-orchestration-rule]]) for full prod context.

## How it satisfies CuraOS rules

| Rule | Compliance |
|---|---|
| AGENTS.md §3 charter self-hosted first | GlitchTip default; SaaS only dev convenience |
| AGENTS.md §4 air-gap | GlitchTip 4 containers in Zarf bundle (per D0); SaaS only non-air-gap envs |
| AGENTS.md §6 reliability + security (PHI) | beforeSend scrub mandatory; session replay banned healthstack; per-tenant project |
| [[curaos-orchestration-rule]] (D0) | GlitchTip deployed via Helm to K3s cluster; Zarf-bundled for air-gap |
| [[curaos-cni-rule]] (D3) | GlitchTip endpoint reachable per CiliumNetworkPolicy from services; egress to api.sentry.io only when SaaS configured (FQDN allow-list) |
| [[curaos-postgres-rule]] (D4) | GlitchTip uses its own PG via CNPG Cluster - namespace `glitchtip`; standard pattern |
| [[curaos-local-vs-3rdparty-rule]] | ErrorTrackerProvider abstraction; tenant DSN BYO |
| [[curaos-healthstack-vision]] (patient PHI #1) | Session replay banned healthstack; PHI scrub mandatory pipeline |
| [[curaos-modulith-standalone-rule]] | Dev SDK points at Sentry SaaS DSN (env var); standalone clone same env var; prod K8s ConfigMap injects GlitchTip DSN |
| [[curaos-bun-primary-rule]] | @sentry/bun 1.x SDK works for both backends (GlitchTip + Sentry) |

## Agentic-tool friendliness

Why split path wins for AI agents:
- **Dev/CI** (Sentry SaaS): agents get Seer auto-debug + AutoFix patches + Sentry MCP queries = direct productivity boost for 200+ agent swarm
- **Prod** (GlitchTip): agents get GlitchTip MCP (17 tools) for triage; pairs w/ kubernetes-mcp-server for full context
- **Migration**: trivial (DSN swap) → no agent rework if env changes

## How to apply

- All services + frontends import `@curaos/observability` init helper (single function: `initErrorTracking()`)
- Service AGENTS.md frontmatter declares:
  ```yaml
  error_tracking:
    provider: glitchtip  # or sentry-saas (dev) / external (3rd-party)
    session_replay: false  # MUST stay false for healthstack-*
    phi_scrub: required
  ```
- Codegen Engine recipes (per ADR-0123) include `initErrorTracking()` call in service bootstrap template
- Per-tenant GlitchTip project provisioned by tenant onboarding workflow (per [[curaos-postgres-rule]] flow + ADR-0137 multi-tenancy queued)
- CI lint rule: any healthstack-* package importing `@sentry/replay` fails build
- Dev env var template: `ERROR_TRACKER_DSN=https://<key>@o<org>.ingest.us.sentry.io/<project>` (Sentry SaaS DSN per dev)
- Prod ConfigMap injects: `ERROR_TRACKER_DSN=https://<key>@glitchtip.curaos-ops.svc.cluster.local/<tenant-project>`

## ADRs

ADR-0140 was never filed at that number. Cross-ref `ai/curaos/docs/adr/RESOLUTION-MAP.md` for the actual error-tracking ADR if one has been filed.
