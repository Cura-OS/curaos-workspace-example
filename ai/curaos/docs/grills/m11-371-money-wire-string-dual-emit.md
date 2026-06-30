# Grill — 371 money event payload JSON-number → string dual-emit

Issue: `your-org/curaos-ai-workspace#371`. PRs: codegen mold (curaos) + 5 service submodules.

## Cross-harness grill status: SKIPPED (known-broken)

Codex adversarial grill is BROKEN (`#380`, hangs) per the dispatch brief — do NOT attempt. Substitute = rigorous structured self-review below + CodeRabbit at PR time. Recorded per one-task §4 grill-location rule.

## Self-review (adversarial lens)

1. **Decision conflict?** None. 369-1 (binding) prescribes exactly dual-emit-then-drop string serialization. Issue body + rolling-update rule align. No `-v2` path.
2. **Hidden deps?** The consumer reject-guard (#369) must stay — confirmed out of scope, not removed. No downstream consumer parses `_str` yet, so adding `_str` is purely additive (legacy consumers ignore unknown JSON keys). No contract break.
3. **Precision correctness.** `moneyMinorStr(number)` MUST reject a value that already lost precision (`!Number.isSafeInteger`) rather than emit a corrupt string — otherwise the string "looks lossless" but encodes an already-truncated double. Guard: throw on non-safe-integer `number`; accept `bigint` losslessly. This mirrors the #369 fail-closed posture on the produce side.
4. **Nullable money.** `commerce` has `amount: number | null`. The sibling `_str` must be `string | null` and null-passthrough (no `moneyMinorStr(null)`).
5. **Flag semantics.** `CURAOS_MONEY_WIRE_DUAL_EMIT` default-on (emit both). `=off` suppresses the `_str` siblings for a clean rollback to pure-legacy wire. Default-on is safe because `_str` is additive.
6. **Trio symmetry.** The mold money region (helper + flag + example dual-emit) must be byte-identical across service-{core,personal,business}. Snapshot test asserts md5 equality + flag-off suppression.
7. **JSON.stringify ordering.** Adding `_str` keys to the payload object does not reorder existing keys for existing consumers (JSON object key order is not a contract; consumers key by name). Safe.
8. **Generator-evolution gate.** The 5 service catalogs are hand-authored (#342), but the GENERIC pattern (money → dual-emit `_str`) folds into the mold so future scaffolds inherit it. Gate fires: fix=template + snapshot, trio symmetric.

Verdict: design is sound, additive, reversible (flag-off). Proceed to TDD.
