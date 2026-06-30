# Live-Infra Verification Gaps — Operator Runbook

**Status:** operator runbook; the verification record is the deliverable. An in-session agent CANNOT run these (T3/HITL gate per [[curaos-verification-stack-rule]] §Tier-3) and is explicitly forbidden from fabricating output. Run these when live infra is available; paste raw output to the tracking issue, then an agent verifies + closes.

Covers two carried-forward live-verification gaps that static review could not close:

| Gap | Issue | Activates with |
|---|---|---|
| Air-gap zero-egress (M8) | [#330](https://github.com/your-org/curaos-ai-workspace/issues/330) | M15 GA-readiness (Epic #29) |
| Identity Diamond divergence (M9) | [#322](https://github.com/your-org/curaos-ai-workspace/issues/322) | M14 hardening (Epic #28) |

Both are **quarantined foresight** (Backlog) — they do NOT block M12. They surface naturally when their GA-hardening milestone runs, or earlier on explicit operator activation.

---

## 1. #330 — Air-gap zero-egress live capture

**Goal:** run the as-shipped M8 `assert-zero-egress.sh` harness wrapping a real `zarf package deploy` against a live `k3d` + Cilium + Hubble cluster; capture the real Hubble flow log + PASS line as the durable record.

### Preconditions
- `zarf`, `kubectl`, `hubble`, `jq` on PATH.
- `ciliumclusterwidenetworkpolicies.cilium.io` CRD present; `cilium-operator` rolled out.
- A `k3d` cluster with Cilium + Hubble enabled per `curaos/ops/zarf/README.md`.
- The as-shipped M8 Zarf bundle (`curaos-vX.Y.Z.tar.zst` per ADR-0164) available locally.

### Run
```bash
cd curaos
# Verify the harness contract first (read-only — do NOT edit the script):
sed -n '1,40p' scripts/assert-zero-egress.sh

# Live run: the script WRAPS the deploy; a bare run with no `-- zarf package deploy` exits 2.
scripts/assert-zero-egress.sh --evidence-dir ./zero-egress-evidence \
  -- zarf package deploy <path-to-m8-bundle>.tar.zst --confirm
echo "EXIT=$?"
```

### Expected
- stdout ends with: `PASS: zero-egress deploy window verified; evidence=<flow_log>` and **exit 0**.
- `./zero-egress-evidence/hubble-flows-*.jsonl` contains a real flow capture.
- Exit 1 = a flow to `world`/`world-ipv4`/`world-ipv6`/`reserved:world`, or an L7 DNS query outside the cluster-local suffix allowlist (`.svc.cluster.local` / `.cluster.local` / `.local`) was observed → a real egress leak; file a `priority: Critical` bug (do NOT hot-fix the script here).

### Record (closes #330)
Paste **verbatim** to issue #330 as an evidence comment:
1. The full `assert-zero-egress.sh` stdout (PASS/FAIL line + exit code).
2. The `hubble-flows-*.jsonl` (or a representative head + line count).
Then an agent: verifies the PASS, files any surfaced gaps as `priority: Critical` bugs, updates HANDOVER M8 close block (strip the "no live cluster" caveat) + `ai/curaos/ops/zarf/CONTEXT.md` (mark live-verified) + RESOLUTION-MAP row, and closes #330.

---

## 2. #322 — Identity Diamond divergence live confirmation

**Goal:** an operator enables `IDENTITY_DIAMOND_MODE` on a production-shaped staging environment and confirms the live dual-write telemetry reads `signal:auth-diamond-divergence == 0` sustained per the gauge's sampling window (the #99 Phase D acceptance criterion, ADR-0210).

### Preconditions
- A **production-shaped staging** environment (real PG, real identity-service deploy, telemetry/Grafana wired).
- Operator access to flip the `IDENTITY_DIAMOND_MODE` feature flag.

### Run
1. Enable `IDENTITY_DIAMOND_MODE` on production-shaped staging (per the service's flag config — env/config map).
2. Drive representative membership/credential write traffic (the dual-write path the Diamond model guards).
3. Read the divergence gauge (`auth-diamond-divergence`) over a full gauge sampling window.

### Expected
- `signal:auth-diamond-divergence == 0` sustained across the gauge window (no M3-legacy vs Diamond divergence).
- A non-zero reading = a real dual-write divergence; file a `priority: Critical` identity bug; do NOT proceed to Phase E.

### Record (closes #322)
Paste **verbatim** to issue #322 as an evidence comment: the raw gauge output (or a Grafana snapshot) confirming `auth-diamond-divergence == 0` sustained within the window. Do NOT synthesize a reading — the gap IS that this record does not exist.
Then an agent: verifies, records the Phase D acceptance, notes Phase E (`signal:m3-path-traffic == 0`, ADR-0210 S10 — drop M3 tables) is now unblocked, and closes #322.

> **Hard rule (both gaps):** the agent never fabricates gauge/Hubble output. The verification record is precisely the artifact that does not yet exist; only a live operator run can produce it.

## References
- [[curaos-verification-stack-rule]] §Tier-3 (T3 HITL gate)
- [[curaos-airgap-rule]] (#330)
- `ai/curaos/docs/adr/0210-m9-diamond-model-party-org-identity.md` (#322 Phase D/E)
- `ai/curaos/docs/adr/0158-air-gap-bundle-sla.md`, `0164-zarf-bundle-layout.md` (#330 bundle SLA/layout)
- Tracking issues: [#330](https://github.com/your-org/curaos-ai-workspace/issues/330), [#322](https://github.com/your-org/curaos-ai-workspace/issues/322)
