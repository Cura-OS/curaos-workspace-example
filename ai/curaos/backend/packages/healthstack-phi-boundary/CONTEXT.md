# CONTEXT — @curaos/healthstack-phi-boundary

Integration map + rationale for the M12 PHI-boundary verification harness
([#388](https://github.com/your-org/curaos-ai-workspace/issues/388)).

## Why this exists

Epic [#26](https://github.com/your-org/curaos-ai-workspace/issues/26)
AC #2 requires PHI never to leave the overlay schemas, proven by a CI scan + a
runtime check. The 6 enforcement layers existed as accepted-ADR controls but no
harness asserted them end-to-end across the 5 clinical services. This package is
that harness — it decides nothing new; it assembles accepted controls into a green
gate (charter §5.2, [[curaos-healthstack-vision]]).

## Producers / consumers

- **Produces:** a reusable PHI-boundary CI gate (`phi-boundary-scan`) + runtime
  assertions (`assertReferenceOnlyEnvelope`, `scrubEgressOrThrow`,
  `assertClinicalServiceReferenceOnlyEnvelope`, `evaluateRouteGuard`) consumed by
  the Epic acceptance and every future healthstack service.
- **Consumes:** the 5 clinical services' event catalogs
  (`backend/services/{encounter,scheduling,clinical-doc,orders,terminology}-service/src/events/domain-event-catalog.ts`),
  the Opengrep/Semgrep engine, an APISIX gateway (env), a Presidio sidecar (env).
- **Neutral consumers it protects:** `party-core-service`, `notify-service`,
  `search-service`, `audit-core-service` — they receive references + non-PHI
  metadata only.

## Must-not-break files

- `backend/services/*/src/audit/audit-event.schema.ts` — the PHI-vocabulary owner.
  `phi-detector.ts` MIRRORS its regexes (DOB/SSN/name) + its `occurredAt`
  timestamp exemption. Keep them in lock-step.
- `ci-gates.yaml` — the `phi-boundary-scan` job is `local-only: true` (like
  `depcruise`), so it is excluded from the `check-ci-gates-sync.js` drift
  comparison. Adding a `run:` form to a `tier-*.yml` workflow without lifting it
  out of `local-only` would trip the drift gate.
- `package.json#scripts.phi-boundary-scan` — the gate's `bun run` target.

## Decisions (auto-applied per recommendation, 2026-06-04 — see AUTO-DECISION-LOG 388-*)

- **388-1 — Opengrep via Semgrep rule format + binary.** Opengrep is a Semgrep
  fork sharing the rule schema + CLI (ADR-0108). The runner resolves `opengrep`
  then `semgrep`; the rule file is standard Semgrep YAML. Source: ADR-0108;
  `semgrep` 1.157.0 present locally.
- **388-2 — `phi-boundary-scan` is a `local-only: true` blocking gate.** Matches
  the `depcruise` precedent (a repo-policy gate with no `tier-*.yml` job yet) so
  the drift check (`check-ci-gates-sync.js`) excludes it. When auto CI returns it
  lifts into the Tier-B workflow as a `run:` step verbatim. Source: `depcruise`
  gate precedent; [[curaos-local-ci-first-rule]].
- **388-3 — engine-absent = SKIP (exit 0), logic still gated.** Same posture as
  the FHIR acceptance tests + perf-smoke. `PHI_BOUNDARY_REQUIRE_ENGINE=1` fails
  closed for operator/CI-with-engine. The negative test proves the rule logic
  regardless of the binary. Source: FHIR-acceptance env-gating precedent.
- **388-4 — semgrep `metavariable-regex` is anchored.** `$MOD` binds the WHOLE
  import specifier; each rule branch is `.*`-prefixed to match the healthstack/PHI
  segment anywhere in the path. `--error` makes findings flip a non-zero exit.
  Source: semgrep CLI behavior (verified in-session).
- **388-5 — reference-only key allow-list + timestamp-value exemption.** Layer 6
  rejects any field name that is not allow-listed metadata or `*_ref`/`*_id`
  opaque-reference shaped, AND scans values for PHI EXCEPT under ISO-timestamp
  metadata keys (`occurred_at`, …) — mirroring the audit schema's `occurredAt`
  exemption so a contract timestamp does not false-trip the DOB pattern. Source:
  audit-event.schema.ts §superRefine.
- **408-1 — closed per-service Layer-6 schemas.** Research found only
  `terminology-service` has a real non-scaffold domain-event catalog payload
  today: `ValueSetUpdatedPayload`. The closed schema allows only its exact keys
  and structurally constrains every value: UUIDs for event/tenant ids, ISO
  timestamp for `occurred_at`, opaque ValueSet UUID/reference for `value_set_id`,
  `/ValueSet/<uuid>` HTTP(S) URL for `value_set_url`, numeric release-version
  shape for `version`, and opaque actor reference for `updated_by`. Nested
  objects/arrays under allowed keys are rejected. `encounter-service`, `scheduling-service`,
  `clinical-doc-service`, and `orders-service` return explicit `skipped` status
  because their catalogs still contain scaffold `*RecordedPayload` examples.
  Source: #408 research + native Claude adversarial corrections.

## Layer status (in-session-proven vs operator-gated)

| Layer | Proof |
|---|---|
| 4 Opengrep import-ban | in-session-proven (negative test green) + `just ci` wired |
| 6 reference-only envelope | active closed schema for `terminology-service`; explicit skipped-service reasons for the four scaffold-only catalogs |
| 3 APISIX route guard | guard logic in-session; live gateway → operator runbook (env `APISIX_GATEWAY_URL`) |
| 5 Presidio egress scrub | scrub wiring + double in-session; live sidecar → operator runbook (env `PRESIDIO_URL`) |
| 1 PG schema-role isolation | operator runbook (live CNPG) |
| 2 service FHIR-only access | covered by Layer 4 import-ban |

## Out of scope

Consent enforcement logic (Story 7); 42 CFR Part 2 / TEFCA QHIN security-label
filter (Q9); MPI/patient-matching (Q4); AuditEvent pseudonymization key-management
(Q14 residual, pre-prod security-review item).
