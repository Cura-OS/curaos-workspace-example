# Context — ops/chaos

## Mission

Catalog safe, repeatable Chaos Mesh experiments for staging and other
non-production CuraOS environments, with durable evidence for downstream
resilience hardening.

## What Lives Here

| Code-side path | Purpose |
|---|---|
| `curaos/ops/chaos/README.md` | Operator run pattern, safety rules, and experiment catalog |
| `curaos/ops/chaos/experiments/*.yaml` | Chaos Mesh CRs for pod kill, network, DNS, I/O, broker, and CNPG failover drills |
| `curaos/ops/chaos/evidence/fixtures/*.json` | Fixture artifacts for local evidence-contract proof |
| `curaos/ops/chaos/evidence/runs/.gitkeep` | Live run artifact destination |

## Integration Map

### Producers

- Chaos Mesh CRs under `curaos/ops/chaos/experiments/` inject controlled faults.
- The evidence collector writes run artifacts under
  `curaos/ops/chaos/evidence/runs/<run-id>.json`.

### Consumers

- Issue #239 reads CR metadata, CR status, Kubernetes events, SLO/alert state,
  and recovery timings.
- `curaos/tools/build/chaos-evidence-check.sh` validates fixture and live
  evidence artifacts.
- SLO dashboards and alerts consume Prometheus/VictoriaMetrics/Pyrra signals
  listed in `curaos/ops/chaos/README.md`.

## Data Flow

1. Staging operator deploys Zarf components `chaos-testing-rbac` and
   `chaos-mesh`.
2. Static guards validate experiment manifests and evidence fixture contracts.
3. Operator applies exactly one experiment in namespace `chaos-testing`.
4. Kubernetes, service metrics, SLO burn, alerts, and recovery timings are
   collected before, during, and after the fault.
5. Evidence collector writes the live run artifact.
6. `chaos-evidence-check.sh --require-live` validates run ID, CR UID, metric
   impact, alert state, recovery gate, audit link, and cleanup evidence.

## Must Not Break

- `curaos/ops/chaos/experiments/*.yaml`: keep non-production annotations and
  bounded blast radius metadata.
- `curaos/ops/chaos/evidence/fixtures/*.json`: fixture mode proves the artifact
  contract only; it must never masquerade as live evidence.
- `curaos/ops/chaos/evidence/runs/`: live artifacts are committed only when they
  contain real operator approval, metric links, alert evidence, and cleanup proof.
- `curaos/ops/zarf/zarf.yaml`: Chaos Mesh components stay tied to the declared
  Zarf deployment contract.

## Open Items

- Live staging run evidence remains blocked until an approved staging cluster and
  operator change window exist.
- Downstream #239 owns persistence and analysis of live chaos evidence.
