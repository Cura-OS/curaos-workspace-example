# M12 clinical-flow demo runbook (Epic #26 DoD demo)

> Agent-doc mirror of `curaos/test/integration/m12-clinical-flow/` (the test CODE
> lives in `curaos/`; this runbook is the agent doc). Source issue:
> [curaos-ai-workspace#390](https://github.com/your-org/curaos-ai-workspace/issues/390)
> · Epic [#26](https://github.com/your-org/curaos-ai-workspace/issues/26)
> acceptance #1 + the Epic DoD demo.

This runbook reproduces the Epic DoD demo end-to-end:
**schedule → encounter → note → order → audit** — the full patient journey, with
the audit chain reconciled (ADR-0157) and the PHI-boundary (#388) + consent
(#389) invariants active.

## The demo (one patient journey)

```text
Appointment.booked → checked-in → encounter.requested
  → Encounter(planned → arrived → in-progress)
    → clinicaldoc.authored + order.requested
      → ServiceRequest / Task → Observation / DiagnosticReport (result.available)
  → encounter.finished → Appointment.fulfilled
```

Every edge is a durable event. The seed (`src/fixtures.ts` `seedClinicalFlow`)
is one tenant + one patient (referenced by **opaque id only** — the demo's PHI
stays behind the patient-core boundary) + one appointment + the encounter it
materialises + the clinical note + a **LOINC-coded** lab order (CBC panel
`58410-2`).

## Mode A — in-session demo (no infra; the CI-gated proof)

This is the deterministic, scripted journey the acceptance suite drives. It IS
the demo's narrative, runnable anywhere with zero infra:

```bash
cd curaos/test/integration/m12-clinical-flow
bun test
```

Expected: `12 pass · 4 skip · 0 fail`. The 12 in-session tests are the demo
beats:

| Demo beat | What you see | Test block |
|---|---|---|
| **Schedule** | `Appointment.booked` then `checked-in` materialises the `Encounter` (`planned`) | `AC#1` |
| **Encounter** | `encounter.requested` → `status-changed` to `in-progress` (the authoring window opens) | `AC#1` |
| **Note** | `clinicaldoc.authored` fires off the in-progress encounter | `AC#1` / `AC#5` |
| **Order** | `order.requested` rides a **terminology-validated** LOINC code; `$validate-code` participates; an unvalidated code is rejected | `AC#1` (terminology) |
| **Result** | `ServiceRequest`/`Task` → `Observation` → `result.available` | `AC#1` / `AC#5` |
| **Close** | `encounter.finished` → `Appointment.fulfilled` | `AC#1` |
| **Audit** | the 8 immutable audit legs reconcile intact against `audit-core` (v3 tamper-evidence); a mutated field breaks the chain | `AC#2` |
| **PHI-boundary** | no patient name / DOB / SSN / MRN / address on any flow event or audit leg; a smuggled PHI value IS caught | `AC#3` |
| **Consent** | a granted consent → the flow runs (`PROCEED`); a patient opt-out → the PHI-authoring write is blocked (`REJECT`) | `AC#3` |
| **SLA** | triage-to-clinician / order-turnaround / discharge-summary timers each start + stop at their named transitions (ADR-0161 signals) | SLA block |

## Mode B — live demo (operator-driven; the AC #4 LIVE proof)

The **live** full-flow run over real Redpanda + all 5 services deployed + live
HAPI `$validate-code` + CNPG Postgres + the deployed audit-core validator + the
deployed `ConsentInterceptor`. This is the operator step that closes Epic
acceptance #4's live edge — see [REAL-INFRA-RUNBOOK.md](REAL-INFRA-RUNBOOK.md)
for the compose stack + the env vars, then:

```bash
cd curaos/test/integration/m12-clinical-flow
E2E_LIVE=1 bun test   # the [live-e2e] block runs; sentinels must be wired first
```

The `[live-e2e]` block is **skipped** unless `E2E_LIVE=1` and has no in-process
fallback, so an absent stack never green-washes.

## What proves what (in-session vs operator-gated)

- **In-session-proven** (CI gate): AC#1, AC#2, AC#3, AC#5, terminology
  participation, SLA signals — the choreography + contract + reconciliation +
  invariants.
- **Operator-gated** (live full-flow run): AC#4's live edge — broker durability,
  real HAPI `$validate-code`, a real 5-service deployment, the deployed
  audit-core validator + `ConsentInterceptor`. The in-session journey IS the
  demo's narrative; the live run is its production-infra confirmation.

## Cross-references

- Test code: `curaos/test/integration/m12-clinical-flow/`
- Package README (CI vs live table): `curaos/test/integration/m12-clinical-flow/README.md`
- Real-infra stack: [REAL-INFRA-RUNBOOK.md](REAL-INFRA-RUNBOOK.md)
- Flow contract: `ai/curaos/docs/research/m12-encounter-lifecycle.md` §5
- Audit reconciliation: ADR-0157; SLA signals: ADR-0161
- Gates: PHI-boundary (#388, `@curaos/healthstack-phi-boundary`); consent (#389, `@curaos/healthstack-consent`)
