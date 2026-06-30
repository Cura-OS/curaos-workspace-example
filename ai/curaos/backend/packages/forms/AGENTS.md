---
name: curaos-forms
description: "Schema-driven form builder + renderer - JSON Schema + FHIR Questionnaire, React web + React Native (ADR-0121e)."
tags: [package]
language: typescript
framework: react
infrastructure: none
tooling: Bun
apis: []
events:
  produces: []
  consumes: []
deployment_profiles: [cloud, on-prem, hybrid, air-gap]
docs:
  agent: CONTEXT.md
  requirements: Requirements.md
npm: "@curaos/forms"
adrs:
  - ADR-0121e
  - ADR-0209
target: browser+native
---

# @curaos/forms (ADR-0121e)

Schema-driven form builder + renderer. JSON Schema + FHIR Questionnaire. Web + RN.

## Commands
```bash
bunx turbo run build --filter=@curaos/forms
bunx turbo run lint --filter=@curaos/forms
bunx turbo run test --filter=@curaos/forms
bunx turbo run storybook:build --filter=@curaos/forms
```
