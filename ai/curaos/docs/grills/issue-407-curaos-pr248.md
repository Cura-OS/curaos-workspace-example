# Opposite Harness Grill Blocked

GRILL: blocked-harness-unavailable
GRILL-PROBE: {"available":false,"reason":"opposite-harness grill report missing","evidence":"{\"verdict\":\"pass\",\"issues\":[],\"report_path\":\"\"}"}
GRILL-HARNESS: claude
GRILL-AGENT: claude-rescue
GRILL-TIMEOUT-MS: 600000
GRILL-REASON: grill-result-missing-report

The opposite-harness adversarial leg failed fast and no CodeRabbit-only fallback should be treated as a completed opposite-harness grill.
Subject: issue-407-curaos-pr248

## Native fallback review (2026-06-05)

FALLBACK: same-harness-native
VERDICT: pass-with-caveat

Checked PR #248 against the actual diff and APISIX documentation after the
opposite-harness workflow reproduced #495 (`claude-rescue` returned `pass` with
`report_path=""`).

Evidence:
- `gh pr diff 248 --repo your-org/curaos --name-only` limits the change to `ops/zarf/**`.
- `bun test ops/zarf/healthstack-phi-live-gates.test.ts` passed: 5 tests, 44 expectations.
- `bunx biome check ops/zarf/healthstack-phi-live-gates.test.ts` passed.
- `yq eval '.'` passed for `healthstack-phi-live-gates.yaml`, `airgap-zero-egress.yaml`, and `apisix-healthstack-gateway.yaml`.
- `bash tools/build/zarf-deploy-order-check.sh` and `bash tools/build/zarf-zero-egress-check.sh` passed.
- `bun run phi-boundary-scan` passed: no neutral-to-HealthStack PHI imports.
- Apache APISIX docs confirm `fault-injection.abort.http_status/body/vars` and nested expression arrays; the PR's missing-header guard matches that shape: https://apisix.apache.org/docs/apisix/plugins/fault-injection/
- APISIX Ingress docs confirm `ApisixRoute` v2 supports `plugin_config_name` and same-namespace service backends: https://apisix.apache.org/docs/ingress-controller/concepts/apisix_route/
- APISIX Helm docs confirm the `apisix` chart install path and `ingress-controller.config.apisix.serviceNamespace` value used by this PR: https://apisix.apache.org/docs/helm-chart/apisix/

Caveat:
- No local or staging Kubernetes endpoint is available in this lane, so the live
  Layer 3 / Layer 5 APISIX and Presidio HTTP assertions remain blocked by
  external environment access. The PR wires manifests and harness URLs; it does
  not prove live CRD reconciliation or Presidio runtime behavior.
- `bash tools/build/zarf-digest-check.sh` still fails on existing M8 layout-only
  placeholders (`@sha256:<digest>`, migration-jobs stub, umbrella chart stub,
  k3s installer stub). This is pre-existing M8-S4 debt, not introduced by #248.

## Re-verification after parent merge (2026-06-05)

Parent merge commit: `curaos@46dee99e4eb78377c82292db517d8ba7afcbd210`
from PR #248.

CodeRabbit fixes applied before merge:
- Presidio analyzer/anonymizer deployments now carry pod-level non-root
  security contexts and container-level `allowPrivilegeEscalation:false`,
  `readOnlyRootFilesystem:true`, `capabilities.drop:["ALL"]`, plus `/tmp`
  emptyDir mounts.
- `APISIX_GATEWAY_URL` and `PRESIDIO_URL` are derived from
  `PHI_BOUNDARY_NAMESPACE` in `ConfigMap/healthstack-phi-boundary-live-env`;
  separate URL variables were removed to prevent namespace/URL drift.

Final verification against the merged parent content:
- `bun test ops/zarf/healthstack-phi-live-gates.test.ts` passed: 5 tests,
  50 expectations.
- `bunx biome check ops/zarf/healthstack-phi-live-gates.test.ts` passed.
- `yq eval '.'` passed for `healthstack-phi-live-gates.yaml`,
  `airgap-zero-egress.yaml`, and `apisix-healthstack-gateway.yaml`.
- `bash tools/build/zarf-deploy-order-check.sh` and
  `bash tools/build/zarf-zero-egress-check.sh` passed.
- `bun run phi-boundary-scan` passed: no neutral-to-HealthStack PHI imports.
- `gitleaks git --staged --no-banner --redact` passed before the parent fix
  commit was pushed.
