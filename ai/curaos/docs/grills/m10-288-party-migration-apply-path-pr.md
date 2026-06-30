# Adversarial Grill — party-core-service#288 (migration apply-path, mirrors org-core#225)

- **Issue:** your-org/curaos-ai-workspace#288 (M10, party-core-service)
- **Reviewer harness:** Codex (opposite-harness, read-only sandbox), default ChatGPT-account model, high effort
- **Implementer:** Claude (claude-e9b75147)
- **Date:** 2026-06-02
- **Verdict:** No P0/P1. Mirror approach confirmed correct + complete once `test/migration-apply-path.test.ts` lands (it did).

## Scope grilled

Mirror the proven org-core-service#225 fix (PR org-core#5) into party-core-service:
1. populate `drizzle/migrations/meta/_journal.json` (idx 0 = `0001_init`, idx 1 = `0002_outbox_publisher`, version 7, postgresql, breakpoints true)
2. add `--> statement-breakpoint` separators between DDL in both SQL migrations
3. un-gitignore the journal (`meta/*` + `!meta/_journal.json`)
4. add `test/migration-apply-path.test.ts` (journal-completeness guard + gated real-PG apply guard)

## Reviewer findings (Codex)

1. **Missing questions** — none blocking. Confirm "mirror org-core" = equivalent behavior with party names + three-table assertions (recommended; applied). Confirm no live Postgres required for the no-DSN CI run (recommended: yes, gated; applied).
2. **Docs/ADR conflicts** — none. ADR-0210 is consistent with party-core's THREE tables (`parties`, `parties_outbox`, `audit_chain_heads`). Do NOT import org-core's five-table expectation. Do not claim the trigger proves broker delivery (it proves the NOTIFY wake path only).
3. **Glossary** — `parties_outbox_inserted` is the PostgreSQL NOTIFY channel (not a Kafka topic); `curaos.core.party.registered.v1` is the domain event topic; `_journal.json` is the deploy migration manifest, snapshots remain regenerable. Name the test by behavior, not "mirror org-core". (Applied — file/describe names are behavior-based.)
4. **Hidden deps** — `.gitignore` must use `drizzle/migrations/meta/*` + `!drizzle/migrations/meta/_journal.json`; journal tags must exactly match SQL filenames; breakpoint needed after the function body AND after `DROP TRIGGER` in `0002`. (All applied.)
5. **Prototype candidates** — the apply-path test itself; must fail with an empty/absent journal and pass with two entries; assert table count exactly 3. (Captured as RED → GREEN evidence in PR.)
6. **Decision points (recommended answers, auto-applied)** — keep existing `migration-split.test.ts` (yes); add separate apply-path test (yes); track only `_journal.json` not snapshots (yes); party identifiers only (yes).
7. **User-escalation candidates** — only conditional (exact org-core test body required-but-unavailable / deps unavailable for AFK verify / Drizzle 0.45.2 lacks migrator read API). None triggered: equivalent-behavior test written, deps resolve in the monorepo workspace, drizzle-orm 0.45.2 migrator API is present and used by the gated real-PG layer.

## Implementer resolution

All recommendations auto-applied (per `ai/rules/curaos_recommendation_auto_apply_rule.md`). No P0/P1, no user escalation required. RED captured (3 fail / 4 skip / 3 pass against empty journal) → GREEN (6 pass / 4 skip / 0 fail no-DSN).
