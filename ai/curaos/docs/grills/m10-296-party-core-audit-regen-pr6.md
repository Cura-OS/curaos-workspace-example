# Grill — party-core-service#6 (#296 party-core audit-stack regen)

> Cross-harness grill (Codex → Claude). PR `party-core-service#6`, branch `agent/m10-296-party-audit-regen-claude-8b1pa2rt`, commit fe6c333. Verdict transcribed by orchestrator (sandbox blocked the agent write).

## Verdict: REQUEST-CHANGES

**P1 — `PartyList` chain heads orphaned by the uniform `'Party'` backfill.** `0003_audit_outbox.sql` backfills all existing `audit_chain_heads` rows to `resource_type='Party'`, but party-core also emits `resourceType:'PartyList'` (`parties.service.ts:201-205`,`368-393`). An existing pre-regen `PartyList` head (stored under the old `(tenant,resourceId)` key) becomes `(tenant,'Party',resourceId)`; the first post-regen `list()` event looks for `(tenant,'PartyList',resourceId)`, misses, and restarts the chain at previousHash=null. Chain continuity silently broken for all list-audit heads.
- **P2** — file/in-memory chain-head stores: old key `tenant:resourceId` → new `tenant:resourceType:resourceId`; no compat reader for old JSON key shape → file-backed heads restart (P2: production file-backend use unconfirmed).

**No finding:** migration unique-index collision (existing rows unique on (tenant,resourceId); single backfill value can't dup; old index dropped before composite added); domain no-tx emission preserved; audit_outbox separate from parties_outbox (no trigger conflict); mold-faithful (the unsafe part is the service-specific backfill strategy, not mold internals).

**Required:** (1) backfill must map EVERY pre-existing emitted resource type (≥ `Party` + `PartyList`), not a uniform `'Party'`; (2) regression test: seed an old-shape `PartyList` head, apply regen, assert the next `PartyList` event links to it (not previousHash=null).
