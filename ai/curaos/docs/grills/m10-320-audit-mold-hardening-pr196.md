# Grill — curaos#196 (audit-outbox mold robustness hardening, issue #320)

> Cross-harness grill: Codex → Claude. PR `your-org/curaos#196`, branch
> `agent/m10-320-audit-mold-hardening`. Closes `curaos-ai-workspace#320`. Grill 2026-06-03.
> Verdict transcribed by orchestrator (Codex sandbox blocks report-file writes).
> NOTE: work recovered from a parallel-dispatch submodule collision, re-validated on a clean branch.

## Verdict: CONDITIONAL — no P0/P1; 3 P2 (2 interim-guard, 1 narrative nit)

| ID | Sev | Status | Finding |
|---|---|---|---|
| Trio parity | — | VERIFIED | 4 code templates byte-identical across core/personal/business; hashes matched |
| enqueueWith fail-closed | — | VERIFIED | `audit-outbox.service.ts.hbs:853` throws on null db; no silent auto-commit |
| relay unbound-guard | — | VERIFIED | `audit-outbox-relay.ts.hbs:286` guard before per-row publish; noop can't burn rows |
| schema consistency | — | VERIFIED | core/personal/business schema/SQL/snapshot agree on timestamptz; no drift |
| G1 | P2 | VERIFIED | `audit-outbox-replayer.ts.hbs:157` pagination guard is docs-only; large backlog loads single call. INTERIM (worker-flagged foresight). |
| G2 | P2 | VERIFIED | `audit-outbox.module.ts.hbs:72` persisted-checkpoint PROD-MUST-OVERRIDE comment, no boot assertion. INTERIM (worker-flagged foresight). |
| G3 | P2 | VERIFIED | "22 files not 21" — the 22nd is the test file (intentional, correct artifact). Narrative nit only. |

## Disposition
No P0/P1 → merge-eligible per §3.7. G1+G2 are the worker's intentional interim PROD-MUST-OVERRIDE guards (boot-replay pagination + persisted checkpoint) — captured as foresight follow-ups (NOT merge-blocking). G3 is a non-issue. Merge proceeds.
