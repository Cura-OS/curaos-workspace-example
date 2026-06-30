# Grill — M11 W2/W3/W4 + accounting domain-impl wave

- **Scope:** 9 neutral `-core-service` domain implementations on the codegen scaffold — #342 sales, #343 procurement, #344 inventory, #347 fleet, #348 esign, #351 donation, #352 event, #353 site, #345 accounting.
- **Tier:** T2 adversarial, opposite-harness fallback (fresh-context Claude — Codex unavailable this session).
- **Date:** 2026-06-03.

## Round 1 — initial grill (8 services, parallel workflow wgrz2j9p7)
| Service | Verdict | Findings |
|---|---|---|
| site #353 | SAFE-TO-MERGE | clean (3 P2) |
| event #352 | FIX | P1: cancel→re-register unique-violation 500 (in-memory masked it) |
| sales #342 | FIX | P1: revenue over-recognition (no cumulative cap, proven 300%); P1: durability test theater |
| procurement #343 | FIX | P1: currency-equality not enforced (cross-currency false 3-way-match + corrupt budget ledger); P1: mold-divergence relay edit (correct, tracked #366) |
| inventory #344 | FIX | P1: negative-stock TOCTOU race; P1: immutability trigger untested |
| fleet #347 | FIX | P1: double-booking race; P1: geofence re-delivery double-emit |
| **esign #348** | **2 P0** | P0: durable-iff-write VIOLATED (`outbox.enqueue` auto-commit not `enqueueWith(tx)`); P0: audit leg bypasses outbox; P1: test theater |
| **donation #351** | **1 P0** | P0: consumer not idempotent under concurrent at-least-once (double-confirm + double-emit); 3 P1 (receipt-numbering race, receipt not durable-iff-confirm, weak durability test) |

Recurring theme: **TOCTOU races** (read-outside-tx then mutate) + **durability test theater** (in-memory `failNextWrite` throws before enqueue, so enqueue-then-throw rollback never asserted; in-memory store + in-memory outbox were separate buffers).

## Round 2 — fixes + re-grill
All 7 FIX/P0 services fixed in-PR (row locks, advisory locks, compare-and-set, retry loops, shared in-memory tx buffers for real durability assertions). CodeRabbit threads (60+ across 7 PRs) resolved — notably real **PHI/PII-boundary** findings (donation donor-display-name leak in columns + event payload + receipt schema → removed; neutral core = party references only).

Re-grilled the data-integrity-critical services:
- **esign #348 → SAFE-TO-MERGE** — both P0s fixed (durable-iff-write + audit leg now `enqueueWith(tx.db)`/`bindTo(tx.db)` inside `store.transaction`); durability test is a real regression guard (mental-revert confirmed it catches the ghost event).
- **donation #351 → SAFE-TO-MERGE** — P0 + 3 P1 fixed, mutation-tested (revert → test fails); CAS idempotency, bounded receipt-retry, in-tx receipt issuance, deferred-buffer durability.

## accounting #345 (added after sales/proc/inv merged)
- Round 1 grill: **1 P1** (no P0) — W2 event money narrowed to JS number (`z.number().int()` → JSON.parse precision loss > 2^53, silent wrong-amount GL entry, contradicting "bigint end-to-end"); 2 P2 (no FK/posting-INSERT balance recheck; unguarded JSON.parse). Double-entry core, idempotency fence, durability, tenant isolation all verified solid under attack.
- Fix: upstream producers emit JSON numbers (verified) → reject `> MAX_SAFE_INTEGER` + foresight #369 for producer string-amount migration; FK + deferred posting-balance constraint trigger; JSON.parse try/catch → poison `handled:false`.
- Re-grill: **SAFE-TO-MERGE** — P1 + both P2 fixed, boundary test valid (parses raw JSON, not pre-rounded literal). P2 informational: live-PG assertions skip without DSN.

## Outcome
All 9 merged. The grill caught 3 genuine P0 data-integrity bugs (esign ×2, donation ×1) + a money-precision P1 (accounting) that green test suites missed — the value of cross-harness adversarial verification on the durable/consumer/ledger surface. Generator-evolution foresight seeded: #362/#363/#364/#365/#366/#368/#369 (mold folds — domain-events-seam, event-sourced-ledger, relay-guard, money-bigint, live-PG tests, drizzle.config mikro guard, regenerate commerce/crm).
