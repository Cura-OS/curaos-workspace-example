# Opposite Harness Grill Blocked

GRILL: blocked-harness-unavailable
GRILL-PROBE: {"available":false,"reason":"probe exited 142","evidence":"2026-06-05T15:31:11.615728Z  WARN codex_core_skills::loader: ignoring interface.icon_large: icon path with '..' must resolve under plugin assets/\n2026-06-05T15:31:11.616054Z  WARN codex_core_skills::loader: ignoring interface.icon_small: icon path with '..' must resolve under plugin assets/\n2026-06-05T15:31:11.616059Z  WARN codex_core_skills::loader: ignoring interface.icon_large: icon path with '..' must resolve under plugin assets/\n2026-06-05T15:31:11.616368Z  WARN codex_core_skills::loader: ignoring interface.icon_small: icon path with '..' must resolve under plugin assets/\n2026-06-05T15:31:11.616374Z  WARN codex_core_skills::loader: ignoring interface.icon_large: icon path with '..' must resolve under plugin assets/\n2026-06-05T15:31:11.616667Z  WARN codex_core_skills::loader: ignoring interface.icon_small: icon path with '..' must resolve under plugin assets/\n2026-06-05T15:31:11.616671Z  WARN codex_core_skills::loader: ignoring interface.icon_large: icon path with '..' must resolve under plugin assets/\n2026-06-05T15:31:11.617279Z  WARN codex_core_skills::loader: ignoring interface.icon_small: icon path with '..' must resolve under plugin assets/\n2026-06-05T15:31:11.617283Z  WARN codex_core_skills::loader: ignoring interface.icon_large: icon path with '..' must resolve under plugin assets/\n2026-06-05T15:31:11.955986Z  WARN codex_core_plugins::manifest: ignoring interface.defaultPrompt[0]: prompt must be at most 128 characters path=/Users/dev/.codex/.tmp/plugins/plugins/ngs-analysis/.codex-plugin/plugin.json\n2026-06-05T15:31:11.963180Z  WARN codex_core_plugins::manifest: ignoring interface.defaultPrompt[0]: prompt must be at most 128 characters path=/Users/dev/.codex/.tmp/plugins/plugins/ngs-analysis/.codex-plugin/plugin.json\n2026-06-05T15:31:11.963201Z  WARN codex_core_plugins::manifest: ignoring interface.defaultPrompt[0]: prompt must be at most 128 characters path=/Users/dev/.codex/.tmp/plugins/plugins/ngs-analysis/.codex-plugin/plugin.json\ncodex\nOK\nsh: line 1: 62622 Alarm clock: 14         perl -e 'alarm 15; exec @ARGV' codex exec -m gpt-5.4-mini -c model_reasoning_effort=low --sandbox read-only --output-last-message /tmp/curaos-codex-grill-probe.md 'Return exactly OK.'"}
GRILL-HARNESS: codex
GRILL-AGENT: codex:codex-rescue
GRILL-TIMEOUT-MS: 20000
GRILL-REASON: probe exited 142

The opposite-harness adversarial leg failed fast and no CodeRabbit-only fallback should be treated as a completed opposite-harness grill.
Subject: issue-317-audit-core-pr18

## Native adversarial fallback — 2026-06-05

Fallback verdict: PASS, with the explicit caveat that this is NOT a completed opposite-harness grill. The committed workflow leg above is blocked by harness availability (`probe exited 142`), so this native review is only merge-risk mitigation.

PR reviewed: your-org/audit-core-service#18
Head reviewed: 71e0dee9bf443cfcef6169d0af42401e730a0cc8

Checks performed:
- Diff scope is limited to audit hash material/schema/publisher/validator and matching tests: `src/audit/audit-chain-hash.ts`, `src/audit/audit-event.schema.ts`, `src/audit/audit-publisher.service.ts`, `src/consumer/audit-chain-validator.service.ts`, `test/audit-chain-hash-v3.test.ts`, `test/integration/audit-consumer-e2e.test.ts`, `test/integration/cross-cluster-chain-e2e.test.ts`.
- Ingress gate rejects v1/absent by construction: `src/audit/audit-event.schema.ts` uses `hashVersion: z.literal(2).or(z.literal(3))`.
- Producer path stamps the current material version and computes the hash with the same constant: `src/audit/audit-publisher.service.ts` calls `auditChainHashForVersion(..., CURRENT_AUDIT_HASH_VERSION)` and sets `hashVersion: CURRENT_AUDIT_HASH_VERSION`.
- Validator dispatch is exact, not range-based: `src/audit/audit-chain-hash.ts` accepts only `hashVersion === 3` for v3 and `hashVersion === 2` for v2; v1/absent returns false or throws before verification.
- Consumer fails closed on unsupported/tampered body integrity: `src/consumer/audit-chain-validator.service.ts` validates schema first, then emits broken on hash mismatch without advancing the head.
- Regression tests cover v2 compatibility, v1/absent rejection, tampered v2 immutable fields, schema rejection, resource separator rejection, and lowercase-hex previousHash/hash constraints.

Verification evidence:
- `bun run ci` in `backend/services/audit-core-service`: 65 pass, 0 fail, 236 expect calls; `tsc` completed.
- `git diff --check` in `backend/services/audit-core-service`: clean.
- Stale contract scan over `src`: no remaining `hashVersion >= 3` or stale `New producers stamp hashVersion: 2/3` wording.

Adversarial conclusion:
- No live downgrade path found for explicit v1 or absent `hashVersion`.
- No producer/validator version drift found; both use the canonical shared hash function.
- No paper blocker remains from the CodeRabbit comment drift; comments now match the exact fail-closed contract.
