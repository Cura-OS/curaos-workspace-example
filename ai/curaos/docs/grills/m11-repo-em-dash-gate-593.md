# Grill: repo-level em-dash gate + emitter-source sweep (curaos-ai-workspace#593)

- Subject: curaos-ai-workspace#593 - repo-level em-dash gate + sweep emitter source dashes + already-committed service dashes
- PR target: curaos monorepo (`fix/repo-em-dash-gate-593`)
- Grill direction: Claude -> Codex (opposite-harness adversarial planning review)
- Codex model/effort: gpt-5.5 / high (gpt-5.2-codex unsupported on ChatGPT account, fell back to default)
- Date: 2026-06-09
- Verdict: NO critical blocker. All decision points carried a recommendation; auto-applied per `ai/rules/curaos_recommendation_auto_apply_rule.md`.

## Plan presented
1. Sweep all 348 tracked files containing em-dash (U+2014, 2130x) or en-dash (U+2013, 4x) -> replace each with ASCII hyphen-minus. Files are comments, JSDoc, markdown, YAML/JSON config, shell, codegen emitter src (`tools/codegen/src/*.ts`), and codegen `__tests__/*.ts`. `backend/services/*` already clean (0 dash files).
2. Add `scripts/em-dash-gate.sh` modeled on the content-repo dual-engine gate (`curaos-website/scripts/em-dash-gate.sh`). This host runs BSD grep (no PCRE `-P`), so the byte-fallback path is the one that actually executes; the original issue's suggested `grep -rlP` returned 0 matches here (silent false-negative).
3. Wire the gate into `ci-gates.yaml` + `ci-local.sh` + `justfile` as a blocking gate.

## Codex findings + resolution (all auto-applied)
| Finding | Codex recommendation | Resolution |
|---|---|---|
| Blanket dash->hyphen replacement | Yes, but classify string-literal vs comment changes | Auto-applied. Verified `backend/services/*` clean; emitted strings (sdk-emit descriptions) are internal package metadata, not legal/branded copy -> safe to ASCII-ize. |
| Codegen snapshot/byte-identity tests when emitter + assertion both swept | Accept sweep but review generated-output diff, not just green assertions | Auto-applied: re-ran `bun test` over `tools/codegen` after sweep (render-exercising, not parse-only) + diffed. |
| `sdk-emit.ts` package descriptions | Accept ASCII change unless branded/legal copy | Auto-applied: these are internal `@curaos/*-sdk` descriptions, not legal/marketing -> ASCII. |
| YAML/JSON parsing risk (` em-dash item` -> ` - item` in plain scalar) | JSON safe; YAML needs parser verification | Auto-applied: re-ran `bun run typecheck` + `ci-gates-sync` (parses ci-gates.yaml) + full `ci-local.sh` after sweep. No plain-scalar leading dash collisions (all dashes were inline prose/comment punctuation, none were YAML list markers). |
| `ci-gates-sync` drift (compares `ci-gates.yaml` run: lines vs `.github/workflows/tier-*.yml`) | Safe only if BOTH source and derived workflow run lines swept identically | Auto-applied: sweep covered both `ci-gates.yaml` AND `.github/workflows/*.yml` in the same pass; re-ran `node scripts/check-ci-gates-sync.js` green. |
| Gate scope: whole tree vs subset | Whole tracked tree, text/binary-safe; subset invites regressions | Auto-applied: gate scans whole tree via `git ls-files`, `-I` skips binaries. |
| Allowlist | No allowlist initially; add only for documented external/legal/spec text | Auto-applied: zero allowlist. Gate has an env-var allowlist mechanism documented but empty. |

## User-escalation candidates
None requiring escalation. The single candidate Codex raised (preserve published package-description wording / external-legal quoted text) is moot: no legal/branded/marketing copy is in scope; all swept strings are internal comments, docs, config, and internal package metadata.
