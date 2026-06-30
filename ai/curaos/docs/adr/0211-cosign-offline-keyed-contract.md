# ADR-0211 — cosign offline-keyed signing + verification contract

- **Status**: Accepted (2026-05-28)
- **Owners**: CuraOS Platform Engineering · Air-gap track
- **Supersedes**: §M8-S5 paragraph in [ADR-0164](0164-zarf-bundle-layout.md) ("`cosign.pub` placeholder bundled in M8-S5") — M8-S4 (issue [#86](https://github.com/your-org/curaos-ai-workspace/issues/86)) wires the real key + policy-controller; resolution-pin appended to ADR-0164.
- **Related**:
  - [ADR-0164](0164-zarf-bundle-layout.md) §2.1 (component 7 `signing-trust`) + §2.4 (same-tool determinism)
  - [[curaos-airgap-rule]] — zero Internet egress invariant
  - [[curaos-image-build-rule]] §"Mandatory signing + SBOM" — consumed by this ADR
  - [[curaos-version-pinning-rule]] — cosign + policy-controller + Actions all SHA-pinned
  - [[curaos-quality-gates-rule]] — Tier B (digest-check) + Tier C (admission-rejection k3d test)

## 1. Context

[ADR-0164](0164-zarf-bundle-layout.md) §2.1 declared a `signing-trust` component (Layer 6 / position 7 in the 10-component bundle) holding a `cosign.pub` for offline image verification. M8-S1 staged a `PLACEHOLDER` public key + filed M8-S5 as the follow-up to ship the real key. The wave-2 schedule re-numbered that follow-up as **M8-S4** (issue [#86](https://github.com/your-org/curaos-ai-workspace/issues/86)) so the cosign signing flow lands ahead of M8-S5's rollback runbook (it needs signed bundles to exist).

[ADR-0164](0164-zarf-bundle-layout.md) §2.4 also resolution-pinned the **same-tool determinism contract**: BuildKit twice → byte-identical digest; Buildah twice → byte-identical digest; cross-tool parity is intentionally NOT gated. Cosign therefore signs per-tool digests, never tool-agnostic refs.

[[curaos-airgap-rule]] forbids any Internet call at deploy or verify time. That makes the conventional sigstore "keyless OIDC + Fulcio cert + Rekor log entry" pattern infeasible — every one of those steps requires reachable Internet endpoints (`fulcio.sigstore.dev`, `rekor.sigstore.dev`, the OIDC issuer). The air-gap profile is therefore **keyed cosign only**.

This ADR pins the contract for:

- Keypair generation, storage, distribution
- Signing in CI on release tags (with the fork-PR secret-presence gate)
- Verification at PR time (harness) + at admission time (ClusterImagePolicy)
- Trust-root bundling inside the Zarf package
- Negative-test contract (unsigned image → HTTP 403 at admission)
- Key rotation cadence + procedure

## 2. Decision

Adopt **offline keyed cosign** as the singular CuraOS-owned image signing contract. Explicitly REJECT:

| Rejected alternative                      | Why                                                                                  |
|-------------------------------------------|--------------------------------------------------------------------------------------|
| Keyless OIDC + Fulcio short-lived certs   | Requires reachable Fulcio + OIDC IdP — incompatible with hard air-gap.               |
| Rekor transparency log inclusion proofs   | Rekor verification call is network-bound; banned at deploy + admission.              |
| KMS-backed cosign (AWS / GCP / Azure)     | Cloud KMS unavailable on customer K3s nodes; vendor lock-in violates [[curaos-local-vs-3rdparty-rule]]. |
| Multi-key federation (per-service keys)   | Out of M8 scope; bundle complexity + rotation surface multiplies linearly per service. Filed as M8 P2 followup. |
| Notary v2 / Cosign cosign-bundle dual     | Two signature toolchains = double the supply-chain surface. Reject until justified. |

The keypair is a **single ECDSA P-256 key** (cosign default for `generate-key-pair` v3.0.6; the issue body referred to ed25519 but cosign v3.0.6 does not expose an algorithm flag — P-256 is the sigstore-keyed standard and is what `policy-controller` natively verifies). Rotation cadence + procedure in §5.

## 3. Air-gap signing flow (the contract)

```
release tag (v0.1.0-spike etc.)
  │
  ▼
GitHub Actions: repro-build.yml emits per-tool digests
  │   (BuildKit twice + Buildah twice → same-tool determinism per ADR-0164 §2.4)
  │
  ▼
GitHub Actions: cosign-sign.yml
  │
  │   if secrets.COSIGN_PRIVATE_KEY is empty:
  │     → skip gracefully (fork PR — no signing privilege per §6.3)
  │
  │   else:
  │     cosign sign \
  │       --yes \
  │       --tlog-upload=false \            ← NEVER touch Rekor (air-gap)
  │       --key env://COSIGN_PRIVATE_KEY \ ← keyed, not keyless
  │       <image>@sha256:<hex>
  │
  ▼
GHCR: <image>.sig artifact pushed alongside the original image
  │
  │   ── transport (USB / sftp / courier — no Internet) ──
  │
  ▼
Zarf package on customer infra
  │   ops/zarf/assets/cosign.pub
  │   ops/zarf/components/signing-trust/cosign-public-key-secret.yaml
  │   ops/zarf/components/signing-trust/cluster-image-policy.yaml
  │
  ▼
sigstore policy-controller (admission webhook)
  │   on every Pod create whose image matches `ghcr.io/cura-care-oriented-stack/**`:
  │     cosign verify \
  │       --key <Secret cosign-public-key> \
  │       --insecure-ignore-tlog \         ← Rekor inclusion proof BANNED (offline)
  │       <image>@sha256:<hex>
  │
  ▼
  if signature valid + key matches → admit
  else → DENY with HTTP 403
```

`--insecure-ignore-tlog` (verify side) + `--tlog-upload=false` (sign side) are the two flags that turn cosign into a hard-air-gap-safe tool. Both are stable cosign API since v2.0. The `--insecure-` prefix is a sigstore convention warning that the operator has opted out of transparency-log auditability — air-gap operators accept that tradeoff because the alternative is no signing at all.

## 4. Implementation

### 4.1 Component layout

The Zarf component 7 (`signing-trust`) was extended in M8-S4 (issue #86):

```
curaos/ops/zarf/
├── assets/
│   └── cosign.pub                      ← real ECDSA P-256 key (committed)
└── components/
    └── signing-trust/
        ├── namespace.yaml              ← cosign-system Namespace
        ├── cosign-public-key-secret.yaml  ← Secret backing the ClusterImagePolicy
        ├── cluster-image-policy.yaml   ← `ghcr.io/cura-care-oriented-stack/**` enforce policy
        └── policy-controller-values.yaml  ← Helm values for sigstore/policy-controller chart v0.10.6
```

`curaos/tools/verify/cosign-verify.sh` is the PR-time + deploy-time verification harness.

`curaos/.github/workflows/cosign-sign.yml` signs on release-tag.
`curaos/.github/workflows/cosign-verify.yml` runs the harness + the admission-rejection negative test on every PR.

### 4.2 Why we don't sign upstream images locally

The ClusterImagePolicy matches **only** `ghcr.io/cura-care-oriented-stack/**`. Upstream public images (Cilium, CNPG operator, pgBouncer, Redpanda, Harbor, GlitchTip, Pyrra, the policy-controller image itself) are NOT signed by the CuraOS key. Their trust model is:

1. Exact `@sha256:<hex>` digest pin in `zarf.yaml` per [[curaos-version-pinning-rule]].
2. Renovate auto-PRs that re-resolve digests against the upstream registry on the documented cadence.
3. The CI guard `tools/build/zarf-digest-check.sh` refuses `zarf package create` if any upstream ref lacks a digest.

Locally re-signing upstream images would imply CuraOS asserts authorship of code it did not write — a stronger trust statement than the customer wants. Digest-pin + Renovate is the consensus pattern (Tigera/Calico, Wallarm, Bridgecrew, Dangerzone — all do the same split).

### 4.3 Why a Secret, not a ConfigMap

The `policy-controller` ClusterImagePolicy CRD spec accepts the public key via `authorities[].key.secretRef`. The content is the SAME ASCII PEM `cosign.pub` (public key — no privacy concern), but using a Secret matches the upstream sigstore convention + simplifies rotation runbooks (operators expect `kubectl create secret generic cosign-public-key --from-file=cosign.pub=...`). The ConfigMap path exists in the chart (`cosign.cosignPub` value) but bakes the key into the chart's own ConfigMap, coupling rotation to a Helm upgrade. We keep the Secret-based model so rotation is a single `kubectl apply -f` operation.

### 4.4 Why `policy.sigstore.dev/include: "false"` on cosign-system itself

The `cosign-system` namespace is excluded from its own policy-controller's admission scope. Without this label the chart's own image pulls would deadlock (the webhook can't admit its own startup Pod because it isn't running yet). Documented at https://github.com/sigstore/policy-controller#opting-in-to-the-controller.

### 4.5 Verifier behavior on key mismatch

If an operator deploys a Zarf bundle signed with key A onto a cluster bundled with key B's `cosign.pub` (e.g. mid-rotation snafu), `cosign verify` returns "key does not match signing key in the bundle" and the admission webhook returns 403. The negative test in `cosign-verify.yml` covers the unsigned case; the key-mismatch case is the same code path with a different error string.

### 4.6 Zarf signature co-location + post-rewrite admission glob

**Problem.** At air-gap deploy time, the Zarf `zarf-agent` mutating admission webhook rewrites every PodSpec image ref before any other admission controller sees it. The rewrite swaps the registry host but preserves the original image path and digest. A ref like

```
ghcr.io/cura-care-oriented-stack/identity-core-service:0.1.0-spike@sha256:<hex>
```

becomes

```
zarf-docker-registry.zarf.svc.cluster.local:5000/ghcr.io/cura-care-oriented-stack/identity-core-service:0.1.0-spike@sha256:<hex>
```

(Source: Zarf upstream `src/internal/agent/hooks/pods.go` and the `ZarfInClusterContainerRegistry*` constants; full reference at [Zarf wiki — System Architecture §1.1](https://deepwiki.com/zarf-dev/zarf/1.1).)

`policy-controller`'s `ClusterImagePolicy` matches by **literal image glob** against the post-mutation PodSpec it admits. If the glob only lists `ghcr.io/cura-care-oriented-stack/**`, the in-cluster mirror shape DOES NOT MATCH, and the policy falls through to the cluster-wide no-match policy (`warn`-mode for upstream images). The unsigned pull would then be silently admitted — fail-open. This is the exact failure mode the Codex Tier-2 grill flagged as Check 8 / P0 against PR-A 8dd0a88.

**Decision.** The `ClusterImagePolicy` lists three globs covering every shape the API server can plausibly see for a CuraOS-owned image:

| Glob | When it fires |
|---|---|
| `ghcr.io/cura-care-oriented-stack/**` | CI smoke tests, dev clusters without Zarf, non-air-gap deploys pointing K3s directly at GHCR. |
| `zarf-docker-registry.zarf.svc.cluster.local:5000/ghcr.io/cura-care-oriented-stack/**` | **Default air-gap path.** Every PodSpec post-zarf-agent rewrite. |
| `127.0.0.1:31999/ghcr.io/cura-care-oriented-stack/**` | Defensive — the NodePort form. Normally only operator-side via `zarf tools registry`; included so admission still fails-closed if a PodSpec ever references it. |

`mode: enforce` applies to every glob, so the policy fails-closed for missing/invalid signatures across all shapes.

**Signature artifact distribution into the in-cluster registry.** Zarf does NOT automatically bundle cosign `.sig` OCI artifacts alongside the images it mirrors — `zarf package create` only signs the `zarf.yaml` manifest itself (Zarf-package integrity), and the per-image `.sig` we publish via `cosign-sign.yml` lives only at GHCR. For the air-gap path to actually verify, the `.sig` artifact must be reachable from the in-cluster mirror at the matching digest.

For M8-S4 we resolve this in two layers:

1. **Digest preservation guarantees signature reachability when `.sig` is present.** Zarf preserves `@sha256:<digest>` verbatim through the rewrite (no CRC32 suffix is appended to digest-pinned refs, only to non-digest tags). A `.sig` artifact, being content-addressed by image digest, would resolve to the SAME location relative to the mirrored image (`<repo>:sha256-<digest>.sig`). So as long as the `.sig` artifact is mirrored, cosign verification works against the in-cluster ref.

2. **M8-S4 ships the negative test against the mirror-shape ref; the positive-path .sig mirroring lands in M8 P2 followup.** Today's `cosign-verify.yml` admission tests prove the **policy glob** covers the post-rewrite shape (the P0 fix). The complementary positive test — that a `.sig` artifact actually exists at the rewritten path and cosign-verifies — requires also adding each `.sig` OCI artifact as an entry in `zarf.yaml`'s `images:` block (or using a `composer` plugin that does so), so `zarf package create` copies them into the bundle. That work is listed in §8 as an M8 P2 followup; until then, an air-gap deploy where the `.sig` was not mirrored would correctly fail-closed (admission deny) — which is the desired security posture. The follow-up is "make signed images deployable", not "stop fail-open" (the P0 fix already stops fail-open).

**`tools/verify/cosign-verify.sh` target flag.** The harness gained `--target=ghcr|mirror|both` (default `both`). When run on a plain CI runner the `mirror` leg detects the absent DNS for `zarf-docker-registry.zarf.svc.cluster.local` and reports SKIP (not failure) — CI without a k3d cluster has no Zarf mirror by design. When run from inside a Zarf-bootstrapped K3s node, both legs verify. `--strict --target=mirror` fails-closed on unreachable DNS so deploy-time tests cannot accidentally pass without exercising the in-cluster path.

**Why not just verify against ghcr.io in the air-gap cluster?**

That would require Internet egress to `ghcr.io` at admission time, which `[[curaos-airgap-rule]]` forbids categorically. The whole point of the in-cluster mirror is that the cluster never reaches outside its perimeter. Verification must therefore use the in-cluster ref shape end-to-end.

**Why not strip the Zarf path prefix and verify against the bare image name?**

`policy-controller` evaluates globs against the literal admitted PodSpec ref, not a normalized form. Trying to "strip" the Zarf prefix would require a custom admission webhook that runs BEFORE policy-controller — extra infrastructure for no security gain, and it would mask the diagnostic value of seeing the actual ref in admission logs. Listing both globs is the standard sigstore pattern and matches how the upstream Wallarm and Tigera deployments handle their air-gap mirrors.

## 5. Key rotation cadence + procedure

**Cadence**: every 12 months OR immediately on suspected key compromise. Aligned with the [[curaos-quality-gates-rule]] Tier E nightly review.

**Procedure** (operator-side, offline-safe):

1. **Offline machine** (cold environment per [[curaos-airgap-rule]]):
   ```bash
   export COSIGN_PASSWORD="$(openssl rand -base64 32)"  # store in vault
   cosign generate-key-pair --output-key-prefix curaos-cosign-vYYYYMM
   # produces curaos-cosign-vYYYYMM.{key,pub}
   ```
2. **Replace** `curaos/ops/zarf/assets/cosign.pub` with the new public key. Commit + open PR. CI guard `zarf-digest-check.sh` asserts PEM validity.
3. **Update** GitHub Actions secrets:
   - `COSIGN_PRIVATE_KEY` ← contents of `curaos-cosign-vYYYYMM.key`
   - `COSIGN_PASSWORD` ← the new password
   Use the `release` environment scope so PRs from forks cannot read the secret.
4. **Cut release**: tag `vX.Y.Z`. `cosign-sign.yml` signs every CuraOS-owned image with the new key.
5. **Repackage** Zarf bundle. The new `cosign-public-key` Secret + ClusterImagePolicy ship inside the new `.tar.zst`.
6. **Deploy** to customers. The cluster receives the new public key via the next `zarf package deploy`. Old images still in-cluster either pass (signature attached for the old key is still in the registry and cosign accepts multiple authorities IF we configure them — out of scope today; M9 multi-key federation followup) or fail closed → operator must roll the workload.
7. **Wipe** the old private key from the vault per the org's data-retention policy.

**Overlap window**: until M9 multi-key federation, rotation is "stop-the-world" — every CuraOS-owned image must be re-signed with the new key before the new public key lands in clusters. M8-S6 rollback runbook covers the rollback path if re-signing fails.

## 6. Secret-setup procedure (orchestrator-side; one-time)

This procedure is **orchestrator-side** — the worker that wrote this ADR did NOT touch the live GitHub Actions secrets. The orchestrator runs the following manually on the upstream `your-org/curaos` repo:

```bash
# 1. The matching private key was generated 2026-05-28 by the M8-S4 worker.
#    The worker handed the orchestrator the .key file + password OUT OF BAND
#    (e.g. via Signal, 1Password, in-person USB). NEVER via git, NEVER via PR.
#
# 2. Orchestrator: set the secrets on the curaos repo's `release` environment.
gh secret set COSIGN_PRIVATE_KEY \
  --repo your-org/curaos \
  --env release \
  --body "$(cat /path/to/curaos-cosign-v202605.key)"

gh secret set COSIGN_PASSWORD \
  --repo your-org/curaos \
  --env release \
  --body "<the password>"

# 3. Verify the secrets landed (does NOT print values):
gh secret list --repo your-org/curaos --env release

# 4. Trigger a manual cosign-sign.yml run on a recent tag to validate the wiring:
gh workflow run cosign-sign.yml \
  --repo your-org/curaos \
  --ref vX.Y.Z \
  -f images="ghcr.io/cura-care-oriented-stack/identity-core-service:vX.Y.Z@sha256:<hex>"
```

**Why this is orchestrator-only:**

- The worker has no write access to the upstream repo's secrets (per [[curaos-swarm-collaboration-rule]] §isolation).
- Secrets MUST never be committed to git, even in transit. The `gh secret set` flow stays in-memory.
- The `release` environment scope is required so PRs from forks (which never see secrets) skip `cosign-sign.yml` cleanly per §6.3 below.

### 6.3 Fork-PR secret-presence gate

`cosign-sign.yml`'s first step checks `secrets.COSIGN_PRIVATE_KEY != ''`. If the secret is absent (fork PR; PR before tag-push), every subsequent step short-circuits with a clean workflow-summary note. The job completes green without signing. This is the recommended pattern per https://docs.github.com/en/actions/security-guides/encrypted-secrets#using-encrypted-secrets-in-a-workflow.

The `cosign-verify.yml` workflow has NO secret dependency — it only verifies against the committed public key + runs the k3d admission test on a self-generated ephemeral key. Forks therefore see the verify gate, just not the sign gate.

## 7. Acceptance evidence (issue #86)

| Acceptance bullet                                                          | Evidence path                                                              |
|----------------------------------------------------------------------------|----------------------------------------------------------------------------|
| `curaos/ops/zarf/assets/cosign.pub` exists, valid ECDSA P-256, no placeholder | `curaos/ops/zarf/assets/cosign.pub` (committed in PR-A)                    |
| `tools/verify/cosign-verify.sh` executable + verifies every CuraOS image   | `curaos/tools/verify/cosign-verify.sh` + `curaos/tools/verify/README.md`   |
| CI workflow signs every emitted image                                       | `curaos/.github/workflows/cosign-sign.yml` — gated on tag-push + release env|
| policy-controller as Zarf component, digest-pinned                          | `curaos/ops/zarf/zarf.yaml` component 7 + `policy-controller-values.yaml`  |
| ClusterImagePolicy keyed verification + offline-only + Zarf-rewrite glob   | `curaos/ops/zarf/components/signing-trust/cluster-image-policy.yaml` (3 globs per §4.6) |
| Integration test for admission rejection (3 shapes: ghcr + mirror + NodePort) | `curaos/.github/workflows/cosign-verify.yml` job `admission-reject` (tests A/B/C) |
| Trust-root file lands at `/etc/curaos/signing/cosign.pub` on K3s nodes      | `curaos/ops/zarf/zarf.yaml` component 7 `files:` block                     |
| No private-key material in git history                                      | `gitleaks detect --staged` in the PR pipeline; ADR §3 enforces             |
| Bundled cosign binary digest-pinned                                         | `cosign-sign.yml` + `cosign-verify.yml` install via SHA-pinned `cosign-installer@v4.1.2`; binary release `v3.0.6` |

Negative test (issue Verification §3):

```bash
docker tag busybox:1.36 localhost:5000/test-unsigned:1
docker push localhost:5000/test-unsigned:1
kubectl run test-unsigned --image=localhost:5000/test-unsigned:1 --restart=Never 2>&1 \
  | grep -q "denied: image .* not signed"
```

is replaced (functionally equivalent) by `cosign-verify.yml`'s `admission-reject` job which:

1. Boots a k3d cluster with policy-controller v0.13.1.
2. Applies the CuraOS ClusterImagePolicy + cosign-public-key Secret.
3. Attempts to `kubectl run` an unsigned image under `ghcr.io/cura-care-oriented-stack/**`.
4. Asserts the API server returns a denial mentioning `policy.sigstore` or `signature` in the response.

## 8. Open items + followups

- **M9 multi-key federation.** Today one key signs every CuraOS image. Per-service keys + multi-authority CIPs are deferred to M9 once we have stable RBAC inside `cosign-system`.
- **SBOM attestations.** [[curaos-image-build-rule]] §"Mandatory signing + SBOM" calls for `cosign attest --predicate sbom.cdx.json` post-sign. Filed as M8 P2 followup against the air-gap track — signing is the harder half; SBOM attach reuses the same key + workflow.
- **Rollback runbook (M8-S5).** Documents what happens when a rotated key fails the round-trip verify step in `cosign-sign.yml` — for now the workflow `exit 1`s and the release is blocked.
- **Cosign 3.x ed25519 support.** Filed upstream as sigstore/cosign feature request; if the algorithm flag lands in 3.1, M10 rotation switches to ed25519 per the issue body's original intent. ECDSA P-256 satisfies the keyed-offline contract identically until then.
- **Per-image `.sig` artifact mirroring into the Zarf bundle (M8 P2 followup).** Per §4.6, Zarf does not auto-bundle cosign `.sig` artifacts. The M8-S4 policy correctly fails-closed if a `.sig` is absent from the in-cluster mirror (Codex grill regression now covered by test B). The positive-path "signed CuraOS image admits successfully in air-gap" requires explicitly listing each `.sig` OCI artifact in `zarf.yaml`'s `images:` block (or using a Zarf composer plugin that derives `.sig` refs from the image list). Filed as `m8-p2-cosign-sig-zarf-mirror.md` followup. Until that lands, the in-cluster path correctly denies — the security posture is intact, but signed images cannot deploy on air-gap clusters yet.

## 9. References

- [sigstore/cosign v3.0.6 release notes](https://github.com/sigstore/cosign/releases/tag/v3.0.6)
- [sigstore/policy-controller v0.13.1 docs](https://docs.sigstore.dev/policy-controller/overview/)
- [sigstore/helm-charts policy-controller chart v0.10.6](https://github.com/sigstore/helm-charts/tree/main/charts/policy-controller)
- [Freedom of the Press Foundation Dangerzone CI](https://github.com/freedomofpress/dangerzone) — same air-gap-keyed pattern at scale.
- [ADR-0164 Zarf bundle layout](0164-zarf-bundle-layout.md) — parent component layout
- [ADR-0158 Air-gap bundle SLA](0158-air-gap-bundle-sla.md) — Tier 1 contract this signing step satisfies
- [[curaos-airgap-rule]] · [[curaos-image-build-rule]] · [[curaos-version-pinning-rule]] · [[curaos-quality-gates-rule]]
