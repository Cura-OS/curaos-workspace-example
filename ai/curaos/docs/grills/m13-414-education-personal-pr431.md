# Codex grill — m13-414-education-personal PR curaos-ai-workspace#431

Date: 2026-06-04
Agent: codex-978560e8
Harness: Claude CLI, opposite-harness read-only planning review
Issue: https://github.com/your-org/curaos-ai-workspace/issues/414
PR: https://github.com/your-org/curaos-ai-workspace/pull/431
Companion service PR: https://github.com/your-org/education-personal-service/pull/1

## Verdict: APPROVE-WITH-CONDITIONS

## P0 findings (block merge)

None remaining for PR #431 after the worker resolved the planning-scope conflict and populated the service/docs implementation.

## P1 findings (must address before merge)

None remaining for PR #431.

## P2 findings (followups acceptable)

1. `curaos-ai-workspace#432` tracks the workspace filtered-install blocker where Bun resolves unpublished placeholder `@curaos/*` packages from npm.
2. Full Gotenberg PDF rendering and SeaweedFS physical asset deletion remain deployment-backed follow-up work beyond the M13 foundation slice.
3. A generated TypeSpec/SDK lane can be promoted later if downstream consumers need a packaged education-personal client.

## What Claude got right (counter-balance — minimum 3 items)

1. Flagged the initial conflict between in-memory research language and the module’s PG17, Kafka, Valkey, and Temporal infrastructure commitments.
2. Caught that `@1edtech/clr` was not installable and should not remain a live dependency recommendation.
3. Required the FERPA audit path to compose with the generated audit publisher instead of creating a parallel audit sink.

## Planning Review Findings

The original planning review found these risks before implementation:

1. Scaffold path risk: `service-personal` generator patterns existed, while the initial research described a hand-written service-local shape.
2. Infrastructure scope risk: Requirements and AGENTS frontmatter named PG17, Valkey, Kafka, Temporal, Gotenberg, SeaweedFS, and Flyway, while research scoped an M13 foundation slice.
3. Event-consumer ambiguity: `education.lesson.completed` needed an injectable event-bus seam until the education-core producer was available in the lane.
4. Credential issuer ambiguity: module docs pinned `did:web:<tenant-domain>`, while research had not named a DID method.
5. Audit duplication risk: the research term `FerpaAuditSink.record()` could have forked the generated audit publisher instead of adapting it.
6. Pseudonymization ambiguity: `education.learner.erased` needed a deterministic pseudonymized learner id function.
7. CLR dependency risk: `@1edtech/clr` was unavailable in the live package check, so the service needed a custom CLR bundler.

## Worker Resolution

The worker resolved the planning findings as follows:

1. Bound #414 to a foundation slice with service seams and local verification, not full deployment of Gotenberg, SeaweedFS, or live Kafka/Temporal infrastructure.
2. Kept CLR support custom/audited rather than depending on `@1edtech/clr`.
3. Preserved a provider-seam approach for AI/PII scrubbing and did not land a vLLM call path.
4. Implemented learner progress, Open Badges/CLR-shaped artifacts, privacy aggregation, FERPA audit hooks, and erasure semantics inside the service PR.
5. Filed `curaos-ai-workspace#432` for the workspace install blocker instead of masking it in the service PR.

## Required Merge Checks

Before merge, the orchestrator must verify:

1. Service PR #1 has no unresolved reviewer threads and no `needs-human` comments.
2. Workspace PR #431 has no unresolved reviewer threads and no `needs-human` comments.
3. Service verification remains green: `bun test`, `bun run typecheck`, `bun run lint`, and `semgrep --config auto src test`.
4. Workspace verification remains green: `bun scripts/check-doc-graph.js`, `bash scripts/check-ai-mirror.sh`, `git diff --check`, and staged secret scan if committing further changes.
