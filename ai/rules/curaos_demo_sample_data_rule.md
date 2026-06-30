---
name: curaos-demo-sample-data-rule
title: Demo/sample data (database-backed, no runtime API mocks)
description: App-visible demo, local dev, public demo, and live verification data must be real data persisted through service-owned database seeds or fixtures; API mocks are test-only
paths:
  - "curaos/backend/services/**"
  - "curaos/backend/packages/**"
  - "curaos/frontend/apps/**"
  - "curaos/frontend/packages/**"
  - "curaos/tools/codegen/**"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 9810975c-2b16-46b3-a252-aa175ac615e1
---

# CuraOS Demo/Sample Data Rule

App-visible demo/sample data for local dev, public demos, deployed sites, and
live verification MUST be real data persisted in the backing database through
service-owned seeds or fixtures.

Frontend/API mocks are allowed only for unit tests and CI e2e harnesses. They
MUST NOT be the demo/runtime data plane.

## Binding Rule

When an app, service, workflow, generator, SDK, or contract needs demo-visible
data:

1. Seed it through the owning service or database fixture.
2. Make the seed replayable and tenant-aware.
3. Keep runtime paths pointed at real services and the database.
4. Limit API mocks to unit tests and CI e2e harnesses.
5. Verify local live sweeps and deployed demos with mocks off.

If a generated app or service relies on runtime mocks for demo data, the shared
fix belongs in the generator, SDK, contract, or service seed owner per
[[curaos-generator-evolution-rule]].

## Applies To

- Local developer stacks.
- Public demo tenants.
- Deployed brochure/demo surfaces.
- Live e2e verification.
- Generated frontend apps and backend services.
- SDK or contract test harnesses that produce app-visible data.

## Allowed Mock Use

Mocks are allowed only in:

- Unit tests.
- CI e2e harnesses where deterministic isolation is required.
- Captured contract fixtures used to verify request/response compatibility.

Mock fixtures must not leak into app runtime defaults, local demos, public
demo tenants, or production-like verification.

## Verification

Closeout evidence for app-visible demo data must show:

- The app is running with frontend/API mocks disabled.
- Data is returned through the API gateway or owning service.
- The backing service/database contains the seeded rows or equivalent persisted
  records.
- The seed path is repeatable from scripts or service fixtures.

<!-- fold: rationale, non-binding -->

## Links

- [[curaos-generator-evolution-rule]] - generated/runtime mock defects fold back
  into the shared owner.
- [[curaos-verify-before-build-rule]] - runtime behavior must be proven before
  image build or deployment.
- [[curaos-local-ci-first-rule]] - local CI is the default verification gate.
