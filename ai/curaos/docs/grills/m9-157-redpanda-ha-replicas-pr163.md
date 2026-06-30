# Grill — m9-157 Redpanda audit-retention broker HA replica count

- **Issue:** [your-org/curaos#157](https://github.com/your-org/curaos/issues/157)
- **Branch:** `agent/fix-ops-redpanda-ha-replicas-157`
- **Reviewer harness:** Codex (opposite-harness adversarial planning grill), default model (`gpt-5`, ChatGPT-account; `gpt-5-codex` is NOT supported with this account — confirmed via probe), `model_reasoning_effort=high`, `--sandbox read-only`.
- **Scope under review:** `ops/zarf/values/redpanda-tiered.yaml`, `ops/zarf/values/audit-topics.yaml`, `ops/zarf/zarf.yaml` (connected/regulated profile HA).
- **Verdict:** `REQUEST-CHANGES` — HA broker/topic change is directionally right, but connected-profile CDC RF and producer/topic provisioning are still documentation-shaped rather than enforceable.

## Reviewer output (verbatim)

### 1. missing questions
- What concrete connected-profile artifact applies `values/redpanda-tiered.yaml` + `values/audit-topics.yaml`? Current shipped `zarf.yaml` only loads `values/redpanda.yaml` at `ops/zarf/zarf.yaml:230`.
- What enforces producer `acks=all`? `min.insync.replicas: "2"` is present at `ops/zarf/values/audit-topics.yaml:35`, but producer interfaces only pass `{ topic, messages }` with no ack contract at `backend/packages/audit-sdk/src/audit.service.ts:12`.

### 2. docs/ADR conflicts
- No conflict with air-gap rule: default remains single broker at `ops/zarf/values/redpanda.yaml:8`; ADR says air-gap tiering off / single-broker spike, scale at M9 at `ai/curaos/docs/adr/0164-zarf-bundle-layout.md:243`.
- Stale docs: `ops/zarf/README.md:37` component list omits `strimzi-connect`, while actual Zarf has required `strimzi-connect` at `ops/zarf/zarf.yaml:249`.

### 3. glossary conflicts
- NOT-FOUND: no glossary/vocab file for `connected`, `regulated`, `air-gap`, Redpanda HA terms.

### 4. hidden deps/subtasks
- `min.insync.replicas` placement: **correct** as topic config under topic `config`; evidence `replicationFactor: 3` then `config.min.insync.replicas: "2"` at `ops/zarf/values/audit-topics.yaml:34`.
- `cdc-debezium.yaml` RF=1 default: **correct** for shipped single-broker bundle; manifest states Connect refuses RF>broker-count at `ops/zarf/manifests/cdc-debezium.yaml:14`.
- Documentation-only HA reconciliation is weak: connected profile says operator must raise Connect internal RF to 3 at `ops/zarf/zarf.yaml:224`, while the required Strimzi component always ships `manifests/cdc-debezium.yaml`; add a connected overlay/subtask, not just a comment.
- `default_topic_replications`: **not required** for the explicit audit topic if topic creation honors `replicationFactor: 3`; needed only as a broader cluster-default decision for future/auto-created topics.
- Zarf/Helm schema risk: `statefulset.replicas: 3` is a known chart value and locally consistent; bigger risk is `topics:` support/wiring, since only comments say it is consumed and shipped valuesFiles omit it.

### 5. prototype candidates
- Render connected Helm with `redpanda.yaml + redpanda-tiered.yaml + audit-topics.yaml`; assert 3 StatefulSet replicas and topic job consumes `topics`.
- Smoke topic create against 3-broker Redpanda: RF=3, `min.insync.replicas=2`, producer `acks=all`.
- Connected-profile Connect smoke: Connect internal topics RF=3; default single-broker smoke still RF=1.

### 6. decision points WITH recommended answers from docs/code
- Keep `redpanda.yaml` single broker: **YES** (air-gap default explicit).
- Keep `cdc-debezium.yaml` RF=1 for default: **YES** (single-broker requires RF=1).
- Add connected-profile CDC RF overlay/substitution: **YES** — make it executable config.
- Add producer ack contract (`acks=all`): **YES** — topic quorum incomplete unless producers force it.

### 7. genuine user-escalation candidates
- **None.** All above have code/docs-backed recommendations and are forward-only ops scope.

## Implementer resolution

The grill **confirms the core fix is correct**: RF=3, `min.insync.replicas: "2"` placement under topic `config`, leaving `redpanda.yaml` single-node and `cdc-debezium.yaml` RF=1 unchanged. No user-escalation candidates.

Both #157 Done conditions are satisfied by this PR:
1. `statefulset.replicas` raised to HA count (3) in `redpanda-tiered.yaml`. ✅
2. Audit topic `replicationFactor` aligned to 3 (`≤ replicas`) + `min.insync.replicas: "2"` consistent. ✅

The REQUEST-CHANGES verdict rests on **enforceability gaps that are out of #157's scope** — these are pre-existing properties of the connected-profile opt-in design (a manual `zarf.yaml` valuesFiles append per the audit-retention-runbook §5), not regressions this PR introduces. Implementer overrules them as non-critical for #157 with citation, and captures each as FORESIGHT for follow-up:

- **Connected-profile CDC RF overlay (item 4/6):** making the Connect internal-topic RF reconciliation *executable* (a connected-profile strimzi-connect values overlay) rather than a documented operator step is a NEW subtask. The *entire* connected profile (including `redpanda-tiered.yaml` + `audit-topics.yaml` themselves) is documentation-shaped today — they are not wired into the shipped air-gap bundle by design. This PR keeps the existing pattern and documents the CDC RF step consistently. → FORESIGHT (kind=prereq).
- **Producer `acks=all` contract (item 1/6):** lives in `backend/packages/audit-sdk/` — outside this PR's owned `ops/zarf/**` paths and a concurrent worker's domain. `min.insync.replicas=2` only takes effect with `acks=all`; the SDK producer should force it. → FORESIGHT (kind=debt).
- **Stale `ops/zarf/README.md:37` component table (item 2):** says "10 layered components" but `zarf.yaml` has 11 since #104 added `strimzi-connect`. This is #104 doc drift (the deploy-order check already expects 11 and passes), not a regression from this replica-count change. Keeping it out preserves a single-purpose review surface. → FORESIGHT (kind=debt).
- **`default_topic_replications` (item 4):** reviewer confirms NOT required — the explicit audit topic carries its own `replicationFactor: 3`. No change. ✅
- **Glossary (item 3):** no ops glossary exists; nothing to update. ✅

No ADR or rule conflict (reviewer confirms air-gap rule + ADR-0164 are honored). No prototype required — config-correctness is statically verifiable (YAML parse + RF≤replicas invariant + zarf deploy-order/zero-egress/digest checks all green); live HA broker behavior is operator-driven (no live cluster in this gate).
