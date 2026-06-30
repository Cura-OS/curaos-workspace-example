# Codex grill — M9-S7 #104 (readiness/planning grill, pre-PR)

Cross-harness adversarial planning review per [[curaos-verification-stack-rule]] Tier-2. Run BEFORE any implementation per one-task-execution-prompt §4 (Adversarial Grill Gate). Reviewer: Codex (`codex exec --sandbox read-only`, reasoning effort high). Subject: issue #104 readiness + the Redpanda-vs-Strimzi premise conflict the implementer (Claude) found during the codebase reality check.

ROUTING: role=adversarial-planning-reviewer / task_class=judgment / harness=codex (opposite-harness, mandated by §4) / effort=high / routing_source=`ai/rules/curaos_model_tiering_rule.md` + `ai/rules/curaos_verification_stack_rule.md`.

## Verdict: APPROVE-WITH-CONDITIONS (escalate broker/operator ratification before infra code; broker-agnostic prep may proceed)

The conflict is real but NOT a hard impossibility — the locked Strimzi-KafkaConnect decision is honorable against Redpanda via `KafkaConnect.spec.bootstrapServers`. The wording/ratification must be escalated to the user before infra code; the broker-agnostic codegen + per-service flag-gating prep is safe to land first.

## P0 findings (block infra merge)

1. **Premise error: broker is Redpanda, not Strimzi-managed Kafka**
   - **Where:** brief `ai/curaos/docs/research/m9-s7-debezium-wal-cdc.md:19` vs `curaos/ops/zarf/zarf.yaml:201`
   - **What:** the brief assumes a Strimzi-managed Kafka; the deployed broker is Redpanda v24.3.1. Zero Strimzi presence in any manifest. Locked decisions #1/#6 (Strimzi `KafkaConnect`/`KafkaConnector` CRDs + Strimzi operator 0.46.x) presume a Strimzi operator that does not exist.
   - **Why P0:** the entire infra path rests on this. Cannot write Strimzi CRD manifests as "honoring the existing broker" when the existing broker is Redpanda.
   - **Fix / resolution (the path the implementer missed):** Strimzi `KafkaConnect` targets ANY Kafka-API broker via `spec.bootstrapServers` — Strimzi 0.46 docs confirm the broker need not be Strimzi-managed or in K8s. Install the Strimzi operator for **Connect-only**, point `bootstrapServers` at Redpanda. This honors the locked CRD decision, keeps Redpanda, adds no second broker. **But ratify with the user first** (it adds the Strimzi-operator component to the air-gap bundle + needs the ADR-0102/RESOLUTION-MAP broker text patched).

## P1 findings (must address before infra merge)

1. **ADR-0102 / RESOLUTION-MAP conflict** — `RESOLUTION-MAP.md` ADR-0102 row says "Kafka 4.x Apache 2.0 = v1; Redpanda BSL → DEFERRED-V2", yet the Zarf bundle ships Redpanda. Update ADR/resolution text to reflect that Redpanda is the deployed v1 broker (a precedence-2 doc edit — escalate; do not unilaterally rewrite the broker baseline).
2. **CNPG pin drift** — the Zarf `cnpg-operator` component + the airgap rule pin a stale CNPG; brief asks 1.29.1 (CVE-2026-44477, CVSS 9.4). Bump in the infra PR.
3. **Citus slot topology = DISTRIBUTED → per-worker capture** (user-decided 2026-06-01). Connector/slot plan must be per-worker, not coordinator-only.
4. **Single-broker Redpanda** — Kafka Connect internal topics must use replication factor `1`, not production `3`, or Connect won't start.
5. **Poller cutover coupling** — do NOT remove/disable per-service pollers until a connector is deployed AND parallel-run proves byte-identical events. Cutover is coupled to the connector path; flag-gated prep is not.

## P2 findings (followups acceptable)

1. WAL-slot bloat: an abandoned Debezium slot pins WAL → alert + rollback cleanup (drop slot).
2. EventRouter mapping must be proven byte-identical (topic/key/payload/idempotency header) before any cutover.
3. Issue title overstates "LISTEN/NOTIFY" — the 4 in-scope services are poller-based with no NOTIFY listener; do not touch patient/workflow NOTIFY paths.

## What Claude got right (counter-balance)

1. Correctly caught that the brief's "Strimzi-managed" premise is factually wrong against the deployed Redpanda bundle — a real, load-bearing finding, not a nitpick.
2. Correctly identified that the 4 in-scope neutral services have no LISTEN/NOTIFY listener and no `pg_notify` trigger (only out-of-scope patient/workflow do), so "remove the listener+trigger" is a no-op for these 4.
3. Correctly proposed the safe atomic split (broker-agnostic codegen + flag-gated prep first, infra after escalation) and kept the poller default-ON / dual-safe per the rolling-update rule.

## Ask-user items (escalation candidates — each has a recommendation, but all are foundational-architecture/precedence-2 → escalate)

- Ratify **Strimzi Connect-only against Redpanda via `bootstrapServers`** as the corrected locked decision (recommended), vs vanilla Connect Deployment / Debezium Server / full Strimzi-Kafka migration.
- Keep Redpanda as the v1 broker + patch ADR-0102/RESOLUTION-MAP (recommended), vs migrate the broker baseline to Apache-Kafka/Strimzi.
- Authorize adding the Strimzi-operator (Connect-only) component to the air-gap Zarf bundle.

## Pre-PR note

No PR exists yet at grill time — this is the §4 readiness/planning grill. When PR1/PR2 (codegen + 4-service flag prep) open, the standard PR-time T2 grill per `pr-verify-merge` applies; this file may gain a `## Re-grill verification` section if the same lane is re-grilled at PR time.

---

## PR-time re-grill (infra PR, 2026-06-01)

Cross-harness adversarial PR-time review per [[curaos-verification-stack-rule]] Tier-2, run on the WORKING TREE after the infra + per-service-flag + docs changes landed (before merge-request). Reviewer: Codex (`codex exec --sandbox read-only`, reasoning effort high), opposite-harness per one-task-execution-prompt §4. Subject: the actual PR diff (KafkaConnect/KafkaConnector/Publication manifests, CNPG CDC params, Zarf strimzi-connect component, identity relay flag, ADR/RESOLUTION-MAP/airgap-rule edits, cutover runbook).

ROUTING: role=adversarial-pr-reviewer / task_class=judgment / harness=codex (opposite-harness, mandated by §4) / effort=high / routing_source=`ai/rules/curaos_model_tiering_rule.md` + `ai/rules/curaos_verification_stack_rule.md`.

### Verdict: APPROVE-AFTER-FIXES (all P0/P1 resolved in-PR; no user escalation needed — every finding carried a doc/code-grounded recommendation, auto-applied per `curaos_recommendation_auto_apply_rule.md`)

### Findings + resolution (all applied to the working tree this PR)

| # | Severity | Grill finding | Resolution applied |
|---|---|---|---|
| 1 | **P0** | Wrong outbox table names — manifests used `party_outbox` / `org_outbox`; actual tables are `party_core.parties_outbox` + `org_core.orgs_outbox` (verified `schema.ts:105/190` + `0001_init.sql`). | Fixed all Publication CRDs + `table.include.list` to `parties_outbox` / `orgs_outbox`; identity confirmed `identity_core.audit_outbox` (`0006_audit_outbox_add.sql`). Added the source-of-truth citations to the manifest comment. |
| 2 | **P0** | EventRouter NOT byte-identical: `expand.json.payload: false` would emit the payload as an escaped JSON string (poller emits a parsed object); stock SMT also emits a mandatory `id` header the poller does not; the `headers` jsonb column wasn't propagated. | Set `table.expand.json.payload: true` (parsed object — matches the poller, per Debezium 3.5 docs). Added required `table.field.event.id: id` + a `DropHeaders` SMT removing the spurious `id` header. Verified (audit-core code) the consumer dedupes on the PAYLOAD-derived hash-chain key `(tenantId,resourceType,resourceId)` and reads NO header, so headers are inert. **Reframed the claim accurately**: topic/key/value byte-identical; headers explicitly NOT claimed identical but inert to the consumer. Runbook proof rewritten. |
| 3 | **P1** | Per-worker Citus capture under-expressed; missing `citus.enable_change_data_capture`. | Added `citus.enable_change_data_capture: "on"` to both the coordinator + workers CNPG clusters. Publication is on the `curaos-citus-workers` cluster (where distributed rows live); documented that the per-worker slot fan-out (one source connection/slot per worker primary) is the operator topology step. Removed the contradictory "declared on coordinator and propagated" comment. |
| 4 | **P1** | ADR-0164 §2.4 still said "CNPG operator 1.25.0" after the `zarf.yaml` bump to 1.29.1. | Updated §2.4 to CNPG 1.29.1 (CVE-2026-44477) + added Strimzi 0.46.1 + Connect image to the pinned-images list. |
| 5 | **P1** | Runbook claimed party/org "read the flag for parity/telemetry" — but no `CURAOS_OUTBOX_RELAY` read exists in party/org code. | Removed the false claim. Runbook now states party/org get NO env/config change (no poll timer, no flag read); their cutover is purely deploying the connector. |
| 6 | **P1** | Air-gap: `KafkaConnect.spec.build` plugin URL would egress to Maven Central at deploy; no checksum. | Documented that the plugin tgz is mirrored into the in-cluster registry at `zarf package create` time (not pulled at deploy — preserves zero-egress); `sha512` pinned by Renovate/M8-S4 at vendor time. |
| 7 | P2 | Outbox retention: Debezium never `markPublished`, so the outbox tables grow under steady-state CDC. | Added runbook §6 documenting the operator retention/cleanup policy requirement (out of scope for the infra manifest PR — it is a deploy-time op policy). Emitted as a `FORESIGHT` follow-up. |

### Grill-confirmed correct (counter-balance)
- Party/org/audit need NO code wiring (no `OnModuleInit`/`setInterval` relay in party/org; audit-core consumer-side) — **grill explicitly agreed** with the implementer's no-timer conclusion.
- Single-broker RF=1 on all THREE Connect internal topics — correct.
- strimzi-connect component placement (after redpanda) + deploy-order guard 11-component update — correct, guard passes.
- Rolling-update compliant: no poller removed; identity timer only no-ops on `debezium` flag; default poller.

### Escalation
None. Every finding carried a documentation/code-grounded recommended answer, auto-applied per `curaos_recommendation_auto_apply_rule.md`. The genuine "strict byte-identical headers via stock SMT is impossible" point was resolved by the consumer-reads-no-header proof + accurate reframing, not by a schema/custom-SMT change beyond M9-S7 infra.
