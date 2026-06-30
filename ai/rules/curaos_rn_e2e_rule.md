---
name: curaos-rn-e2e-rule
title: RN E2E (Maestro primary)
description: React Native E2E - Maestro primary (YAML flows, Expo Go compatible, auto-retry, physical-device reliable, agent-friendly); Detox documented fallback only for JS-thread-sync edge cases
metadata:
  node_type: memory
  type: feedback
  originSessionId: 957dade0-7133-4262-addf-0595f6326c47
---

User decision (2026-05-24, after Decision-7 walkthrough - grounded in Wave 6 Expo SDK 52+ frontend scaffold + AI-agent regression risk per [[curaos-decision-methodology]]):

## The rule

**Maestro is the only E2E framework for CuraOS React Native apps.** Detox permitted ONLY as documented fallback for the rare flow that requires JS-thread synchronization (e.g., complex Reanimated 3 timing). Web E2E (Playwright) is a separate decision.

| RN app type | E2E tool |
|---|---|
| HealthStack: clinician-app / patient-app / front-office | **Maestro** |
| Neutral business-*: business-automation / business-donation / business-shop / business-site / business-workflow | **Maestro** |
| Neutral personal-*: personal-automation / personal-calendar / personal-donation / personal-notes / personal-shop / personal-site / personal-tasks / personal-tracking / personal-workflow | **Maestro** |
| fleet-manager | **Maestro** |
| Web (admin-app / hosted-login) | Playwright (separate decision per research 07 §3; NOT covered by this rule) |
| Astro sites | Playwright |

## Banned

- Detox as default for new apps (Expo Go incompatible; physical device unreliable; declining)
- Appium/WebdriverIO as primary (slower; less agent-friendly; medium reliability)
- E2E test code in TS/JS for RN (Maestro YAML mandatory; Detox exception requires AGENTS.md justification)
- Skipping E2E coverage on HealthStack apps (80% minimum mandatory per [[curaos-healthstack-vision]])
- Tests that hardcode device IDs / simulator IDs (CI portability)
- PHI test data in Maestro flow inputs (use Synthea-generated synthetic data per research 05)

<!-- fold: rationale, non-binding -->

## Why Maestro (vs Detox / Appium / WebdriverIO)

| Capability | Maestro | Detox | Appium/WebdriverIO |
|---|---|---|---|
| Flow authoring | YAML (declarative, no code) | JS/TS (Jest) | TS w/ Appium API |
| Expo Go compatible (per Wave 6 SDK 52+ workflow) | yes | NO (requires bare workflow eject) | yes (managed workflow) |
| Setup complexity | low (single binary `bunx maestro test`) | high (multi-config, app rebuild) | medium |
| Physical device reliability | high (Jupiter fintech case study positive) | poor (Jupiter case: 2/10 success rate per research 07 §4) | medium |
| Cloud device farm | Maestro Cloud (paid) + Sauce/BrowserStack | BrowserStack | Sauce/BrowserStack |
| Iteration speed (flow change → result) | ~30s | minutes (app rebuild) | minutes |
| API style | sync (waits naturally) | async (`waitFor` everywhere) | async |
| Auto-retry on flake | yes | manual `--retries` | manual |
| Agent training data 2025-2026 | growing fast | high (legacy default) | high |
| Codegen recipe friendliness (per ADR-0123) | excellent (YAML template) | medium (TS code) | medium |
| 2025-2026 momentum | very high (Mobile DevX adopters) | declining | stable |
| HealthStack clinical UX testing | great (records flows agents inspect verbatim) | OK | OK |

## Maestro flow pattern

```yaml
# apps/clinician-app/.maestro/login-and-view-patient.yaml
appId: com.curaos.clinician
---
- launchApp
- tapOn: "Log in"
- inputText:
    text: "doctor.smith@hospital-mercy.example"
    id: "email-input"
- inputText:
    text: ${MAESTRO_TEST_PASSWORD}
    id: "password-input"
- tapOn: "Sign in"
- assertVisible: "Patients"
- tapOn: "Patients"
- tapOn:
    index: 0
- assertVisible: "Patient Detail"
- assertNotVisible: "Error"
```

Per [[curaos-healthstack-vision]] patient-centric: ALL clinical flows have Maestro E2E coverage; HealthStack apps require minimum 80% flow coverage before merge.

## Why Detox fallback only

Edge cases needing Detox:
- Reanimated 3 / Skia animations w/ precise JS-thread timing assertions
- Native module flows where Maestro's accessibility-tree walker misses elements (rare)
- Pre-existing Detox test inheritance (none today - clean slate)

When a flow needs Detox:
1. Document why in service AGENTS.md frontmatter `e2e.detox_flows: ["<flow-name>", ...]` w/ justification
2. Accept Expo bare workflow eject for that single app (heavy cost)
3. Prefer redesigning the flow to be Maestro-testable before accepting Detox

## Expo Go compatibility (per Wave 6)

Maestro works against Expo Go directly - no native build required for most flows. CI/CD can:
- `expo start` → Maestro drives Expo Go app on simulator
- For native-module-touching flows: `expo run:ios|android` → Maestro drives custom dev client
- Production EAS builds: Maestro on simulator OR physical device farm

Detox would force eject from managed workflow on day 1 → blocks our Wave 6 Expo SDK 52+ alignment.

## AI-agent regression detection

Per [[curaos-decision-methodology]] (200+ agent swarm 24/7): agents WILL regress RN flows. E2E is the moat.

Maestro's YAML format = agent-readable + agent-editable:
- Agent reads existing `.maestro/login-and-view-patient.yaml`
- Agent generates variant for new flow by copying + modifying - no DOM-like selector hallucination risk
- Agent runs `bunx maestro test apps/clinician-app/.maestro/<flow>.yaml`
- Output is structured (pass/fail/step trace) → agent diagnoses
- Pairs w/ Maestro Studio (records flows from real device → YAML) → agents can generate flows from manual session

Detox JS/TS code:
- Agent rewrites test code → higher hallucination risk
- DOM-like selectors break w/ refactor → tests become brittle (per [[curaos-decision-methodology]] anti-pattern: tests coupled to implementation)

## CI integration

```yaml
# .github/workflows/rn-e2e.yml
name: RN E2E (Maestro)
on:
  pull_request:
    paths:
      - 'frontend/apps/clinician-app/**'
      - 'frontend/apps/patient-app/**'
      - 'frontend/apps/front-office/**'
      # ...
jobs:
  maestro:
    runs-on: macos-14
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install
      - run: bunx eas build --profile=preview --local
      - uses: mobile-dev-inc/action-maestro-cloud@v1
        with:
          api-key: ${{ secrets.MAESTRO_CLOUD_API_KEY }}
          app-file: ./app.ipa
```

Cloud farm deferred for v1 (Maestro Cloud paid); local simulator CI w/ macOS runners covers smoke tests.

## Modulith ↔ standalone compliance

Per [[curaos-modulith-standalone-rule]]:
- Standalone clone of single RN app: `bun install && bunx maestro test .maestro/<flow>.yaml` works on host (no monorepo deps)
- Modulith mode: same; Turborepo orchestrates per-package E2E runs
- Prod: EAS Build artifacts tested via Maestro before submit/release

## Local + 3rd-party rule compliance

Per [[curaos-local-vs-3rdparty-rule]]:
- Local (default): Maestro CLI on simulator + occasional physical device
- 3rd-party (optional): Maestro Cloud / Sauce Labs / BrowserStack - via env var `MAESTRO_FARM_API_KEY`
- Tenant-supplied: not applicable (E2E is dev/CI, not tenant-facing)

## How it satisfies CuraOS rules

| Rule | Compliance |
|---|---|
| AGENTS.md §3 charter self-hosted first | Maestro CLI runs locally; cloud farm 3rd-party opt-in |
| AGENTS.md §4 air-gap | Maestro runs offline (Maestro Cloud opt-in only) |
| AGENTS.md §6 NFR reliability | Auto-retry; physical device reliable; flow-level smoke + integration |
| [[curaos-orchestration-rule]] (D0) | RN apps deploy to EAS / app store; Maestro tests artifacts (not K8s concern) |
| [[curaos-bun-primary-rule]] | `bunx maestro test ...`; `bun install` in CI |
| [[curaos-modulith-standalone-rule]] | Per-app `.maestro/` flows work in standalone clone or modulith |
| [[curaos-healthstack-vision]] | Patient + clinician flows = first-class E2E coverage requirement |
| [[curaos-ai-mirror-rule]] | `.maestro/*.yaml` flows mirrored under curaos/frontend/apps/<app>/.maestro + ai/curaos/frontend/apps/<app>/.maestro |
| [[curaos-decision-methodology]] | YAML flows = agent-readable; reduces regression risk from 200+ swarm |

## Agentic-tool friendliness

Why Maestro wins for AI agents specifically:
- YAML flows = agents read + generate w/o code-level hallucination
- Sync API = no `waitFor` hell agents have to reason about
- Auto-retry = flaky tests don't block agent iteration loop
- Maestro Studio records flow from real interaction → YAML → agent uses as template for similar flows
- Structured output (step trace pass/fail) = agent diagnoses w/o log spelunking
- Single binary (`bunx maestro`) = no global install per [[curaos-bun-primary-rule]]
- Pairs w/ kubernetes-mcp-server (per [[curaos-orchestration-rule]]) when E2E hits backend services in k3d cluster

## How to apply

- Every RN app has `.maestro/` directory at repo root w/ flow YAMLs per user journey
- Service AGENTS.md frontmatter declares:
  ```yaml
  e2e:
    framework: maestro
    coverage_min: 80  # 80% of user journeys must have E2E flow (HealthStack apps mandatory)
    cloud_farm: false  # true if Maestro Cloud / Sauce / BrowserStack opt-in
    detox_flows: []  # empty by default; populated only w/ justified exceptions
  ```
- Codegen Engine recipes (per ADR-0123) for new RN apps emit `.maestro/_template.yaml` starter flow
- CI workflow runs Maestro on simulator for PR; physical device + cloud farm on nightly
- AI-doc per app `ai/curaos/frontend/apps/<app>/CONTEXT.md` references this rule + lists user journeys covered

## ADRs queued

Per digest §6:
- **ADR-0142 (NEW, testing strategy frontend)**: full version including web Playwright + RN Maestro picks; this rule = short form for RN E2E
- **ADR-0099 (charter)**: amend §8 execution standards testing subsection to link this rule
