# Grill — M10-273 search-service scaffold (PR search-service#1)

- **Issue:** your-org/curaos-ai-workspace#273
- **PR:** your-org/search-service#1
- **Reviewer:** Codex (`gpt-5.5`, `model_reasoning_effort=high`, `--sandbox read-only`) — opposite-harness adversarial review per [[curaos-verification-stack-rule]]
- **Implementer harness:** Claude Code
- **Date:** 2026-06-02
- **Initial verdict:** BLOCK (1 Critical + 4 Major)
- **Disposition after implementer triage:** SHIP — 1 real fix applied, 2 clarified as documented deferrals, 1 deferred-by-design (already in CONTEXT scaffold-status), 1 false positive (sandbox artifact, refuted by verbatim local CI).

## Findings + disposition

### 1. Critical — `SearchHit.source` returns indexed document content (PHI boundary)
`src/providers/search/search.provider.interface.ts`, both in-memory providers.

**Disposition: clarified (documented assumption), not a code change to strip.** A
search engine that returns no document projection cannot answer a query — stripping
`source` makes search useless. The NEUTRAL boundary is enforced at **index time**
(ADR-0201 §2.5): an overlay must not index raw PHI into a neutral OpenSearch index;
it indexes a reference id + an allowlisted non-clinical label. Added an explicit
`PHI boundary` contract note on `SearchHit.source` documenting the index-time gate +
a follow-up Story for a per-mapping field allowlist enforced at `POST /admin/indexes`.

### 2. Major — `mode: 'hybrid'` degrades to lexical-only (no query vector on the HTTP path)
`src/query/query.service.ts`, `query.dto.ts`, `hybrid.provider.interface.ts`.

**Disposition: documented deferral.** The query-embedding step is the opt-in semantic
path gated by `search.rerank.enabled` (Requirements §"Quick-start" rule 6) and lands
with the vLLM/OpenAI embedding provider in a follow-up Story. The hybrid provider
handles a missing vector gracefully (BM25 leg of the RRF only), so `hybrid` is never
WORSE than `bm25` and gains the ANN leg with no API change once the embedder is wired.
Added a `Scaffold deferral` note in `QueryService.domain`.

### 3. Major — party-erasure consumer (`curaos.party.erasure.requested.v1`) not wired
`src/admin/admin.service.ts`.

**Disposition: deferred-by-design (already declared).** CONTEXT.md "Scaffold status"
lists the erasure consumer wiring as a deferred follow-up. `eraseParty()` exists and is
unit-tested as the single code path the future consumer invokes (proves all tenant
aliases are purged). Wiring the inbound Kafka consumer is a follow-up Story, not
scaffold scope.

### 4. Major — alias not canonicalized / not required to start with the JWT tenant
`src/admin/admin.dto.ts`, `admin.controller.ts`, `admin.service.ts`.

**Disposition: FIXED (auto-applied — real isolation hardening).** Added
`assertTenantScopedAlias(tenantId, alias)` in `admin.service.ts`: registration rejects
any alias that does not start with `${principal.tenantId}.` (the JWT-derived tenant),
so a tenant-admin cannot mint a cross-tenant-looking alias whose index prefix collides
with another tenant's namespace. Every later reindex/status/delete looks the alias up by
`(tenantId, alias)`, so the boundary holds for the whole lifecycle. New unit test:
`rejects an alias not scoped to the caller tenant`.

### 5. Major — "`bun run test` fails 18 integration tests: port 0 in use"
`test/integration/*`.

**Disposition: FALSE POSITIVE — sandbox artifact.** The grill ran with
`--sandbox read-only`, which blocks `app.listen(0)` (the ephemeral-port bind the Bun +
supertest harness needs; the harness uses `await app.listen(0)` precisely to get a
real port, per the M9-S2 grill P1.1 fold-back). Outside the sandbox, `bun run ci` is
**47 pass / 0 fail** (verbatim local CI pasted on the issue + PR). Not a real failure.

## Re-grill verification
Not re-run: the only code change (#4) is additive isolation hardening with a covering
test; #1/#2 are doc-only clarifications; #3 was already declared deferred; #5 is refuted
by verbatim local CI. `bun run ci` re-run after the fixes: exit=0, 47 pass / 0 fail.
