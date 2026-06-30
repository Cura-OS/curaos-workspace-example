# curaos-onboarding — CONTEXT

Integration map + rationale for the CuraOS first-run onboarding wizard. Code:
`curaos/curaos-onboarding/`. Story: [#514](https://github.com/your-org/curaos-ai-workspace/issues/514).
Parent epic: [#29](https://github.com/your-org/curaos-ai-workspace/issues/29).
Research: [2026-06-06-m15-s5](../docs/research/2026-06-06-m15-s5-onboarding-wizard-curaos-onboarding.md).
Grill: [m15-s5-514](../docs/grills/m15-s5-514-onboarding-wizard-curaos-onboarding.md).

## The wizard (4-step idempotent state machine)

```text
bootstrap  -> ensureTenant({ tenantRef, tenantName, orgName })          (idempotency anchor)
admin      -> ensureAdmin(tenantRef, { email, displayName })            (ensure, tenant-owner)
branding   -> applyBranding(tenantRef, { theme, logoRef? })             (upsert)
guided-tour-> loadDemoSeed(tenantRef, flatten(buildDemoSeed()))         (opt-in)
```

Each step returns `created` (first run) or `converged` (idempotent re-run). The
engine validates input via Zod (fails closed) before any backend call.

## Producers / consumers

- **Consumes** `@curaos/demo-seed` (`buildDemoSeed`, watermarked manifest, #511,
  merged) for the guided-tour path — reused, never re-implemented.
- **Consumes (live, operator-injected)** identity-service (admin create), tenancy
  (tenant bootstrap), branding/theme endpoints — via the `OnboardingBackend`
  port. Never imported directly in CI; the in-memory fixture stands in.
- **Produces** a deterministic `OnboardingResult` (tenant/admin/branding refs +
  step audit + demo entity count) — the artifact a live operator-run asserts on.
- **Consumed by (downstream)** the builder-studio M4 surface (renders forms
  against `stepSchemas`) and #516 public-demo-tenant provisioning (bootstraps the
  public demo via this wizard).

## Backend seam (why a port, not a client)

The submodule must stay code-only and deployment-profile-neutral. A concrete
identity/tenancy/branding client is deployment-specific (URLs, auth, transport),
so it is injected by the operator integration. The engine depends only on
`OnboardingBackend`; the same engine runs cloud / on-prem / hybrid / air-gap by
swapping the injected backend. Tests inject `InMemoryBackend`, whose invariants
(idempotency keyed by natural key, tenant-partitioned state) are the contract the
live client must uphold.

## Must-not-break (exact paths)

- `curaos/backend/services/identity-service/` — admin-user create contract. The
  port mirrors it; the wizard never edits the service.
- `curaos/backend/packages/tenancy/` — tenant-isolation contract. Every backend
  call is `tenantRef`-scoped; `tests/isolation.test.ts` proves cross-tenant
  reads/writes are structurally impossible.
- RBAC: first admin = `tenant-owner` only; no escalation path.

## Decisions (this module)

- **Idempotency model:** `ensure`-semantics keyed by (`tenantRef`, natural key);
  `tenantRef` is the caller-chosen, stable idempotency anchor (acceptance #2).
- **Validation:** Zod 4 at the boundary, schemas shared with the builder surface
  (DRY) — [[curaos-validation-rule]] Tier-1, [[curaos-reuse-dry-rule]].
- **Guided-tour as optional peer:** `@curaos/demo-seed` is a lazy import behind
  `guidedTour.enabled`, with an ambient `demo-seed.d.ts` so the standalone build
  typechecks before being mounted under `curaos/`. The CLI example defaults the
  tour opt-out so the standalone CLI runs with zero workspace deps.
- **Live timing deferred:** the `< 15-min` cloud-profile timing is operator-gated
  (`RUNBOOK.md`), same posture as #512 / #516 / #517.
