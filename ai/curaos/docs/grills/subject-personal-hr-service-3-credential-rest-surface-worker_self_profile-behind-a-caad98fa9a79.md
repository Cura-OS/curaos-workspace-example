# Opposite Harness Grill Blocked

GRILL: blocked-harness-unavailable
GRILL-PROBE: {"available":false,"reason":"probe exited 142","evidence":"user\nReturn exactly OK.\nhook: SessionStart\nhook: SessionStart\nhook: SessionStart Completed\nhook: SessionStart Completed\nhook: UserPromptSubmit\nhook: UserPromptSubmit Completed\ncodex\nOK\nhook: Stop\nhook: Stop\nhook: Stop Completed\nhook: Stop Completed\nsh: line 1: 89470 Alarm clock: 14         perl -e 'alarm 18; exec @ARGV' codex exec -m gpt-5.4-mini -c model_reasoning_effort=low --sandbox read-only --output-last-message /tmp/curaos-codex-grill-probe.md 'Return exactly OK.'"}
GRILL-HARNESS: codex
GRILL-AGENT: codex:codex-rescue
GRILL-TIMEOUT-MS: 20000
GRILL-REASON: probe exited 142

The opposite-harness adversarial leg failed fast and no CodeRabbit-only fallback should be treated as a completed opposite-harness grill.
Subject: SUBJECT: personal-hr-service#3 - credential REST surface + worker_self_profile, behind a consent guard.

I am implementing a credential REST surface on the NEUTRAL personal-layer service `personal-hr-service`. Issue requires: "Credential PHI reads pass through @curaos/healthstack-consent consent.guard + requires-consent decorator (gated behind the healthstack overlay flag)."

CRITICAL CONSTRAINT I found: curaos/.dependency-cruiser.cjs rule `no-neutral-to-vertical` (severity error) forbids any import edge from a `personal-*` service to a `healthstack-*` package. dep-cruiser runs tsPreCompilationDeps:true so this fires on static imports, dynamic `await import()`, AND type-only imports. So `personal-hr-service` source can NEVER reference `@curaos/healthstack-consent`.

MY DECISION: wire the consent guard at the HEALTHSTACK OVERLAY composition root (vertical layer, which legitimately imports both neutral + the vertical package), NOT inside the neutral service. The neutral service exposes its OWN consent-guard SEAM: a self-contained `requires-consent` metadata decorator + a guard CONTRACT (DI token CONSENT_GUARD + interface) the credential read routes declare, plus an in-service NO-OP default guard (pass-through when the healthstack overlay flag is OFF, since the neutral service ships standalone). When HEALTHSTACK_OVERLAY is on, the overlay composition root binds the real @curaos/healthstack-consent ConsentGuard to the seam token. The consent-enforcement test exercises the seam with a stub REJECT guard proving a PHI read is BLOCKED (403) without consent, and `bun run depcruise` stays green.

Also planned: (1) credential CRUD + validity_period issue/renew + verification record + attachment register + worker_self_profile read/edit, all individual-scoped via PersonalContext + @RequiresHrScope. (2) worker_self_profile composes injected hr-core HrsService by party_id, re-persists NO employment_type/org_unit/compensation. (3) mutations emit credential domain events via domain_outbox + audit envelopes recording changedFields NAMES only on curaos.core.audit.event.v1 via audit_outbox in the SAME tx. (4) auth-matrix test: a user CANNOT read/mutate another user's credentials. (5) idempotency-keys interceptor + reaper wired. NOTE: I CANNOT touch drizzle/schema.ts or drizzle/migrations/ (another lane #6 owns drizzle hardening concurrently).

Context files: ai/curaos/docs/research/2026-06-08-personal-hr-credential-rest-surface.md, curaos/.dependency-cruiser.cjs, curaos/backend/services/personal-hr-service/src/{auth,hrs,events,audit,db}, curaos/backend/packages/healthstack-consent/src.
