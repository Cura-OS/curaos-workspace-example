# curaos §7 - Pricing + Air-Gap Rules

- Pricing: ADR-0159 is the canonical source. Every service that emits billing events emits a Stripe MeterEvent via the codegen recipe `billing.meter-event` (canonical: ADR-0159 §6.2), using `@curaos/billing-client`.
- Air-gap: bundles are three-tier (Core / HealthStack / AI) per ADR-0158 §2.1. New components added to any tier must update the bundle manifest in ADR-0158. Bundle must install offline with zero external calls.

See [[curaos-airgap-rule]] for Zarf singular release format + delta updates.
