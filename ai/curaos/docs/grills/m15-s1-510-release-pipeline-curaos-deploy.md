# Grill — M15-S1 #510 release-pipeline (`curaos-deploy`)

**Subject:** Create `curaos-deploy` code-only submodule; deliberate `workflow_dispatch`-only release pipeline (CI gate → semver tag → BuildKit build digest-pinned → cosign sign + CycloneDX SBOM attest → publish GHCR images + Verdaccio packages + Zarf image-list for bundle host). Reuses existing `curaos/tools/verify/cosign-verify.sh` + `tools/build/repro-build.sh` + `ops/zarf` signing-trust contracts (no duplication). ai-docs under `ai/curaos/curaos-deploy/`.

**Date:** 2026-06-06
**Opposite harness:** Codex (`gpt-5.4-mini`, low effort) — read-only adversarial planning reviewer.
**GRILL:** opposite-harness (completed). The `agent-workflow-kit` probe (18s alarm) was too tight and fired `blocked-harness-unavailable`, but a direct `codex exec` with a 240s budget completed a real review (codex was reachable — it printed `OK` in the probe before the alarm). This file records the COMPLETED grill, superseding the auto-generated `*-171717ae1946.md` block-stub.

---

## Codex verdict (verbatim, condensed)

**1. Missing questions**
- `--version` source of truth (git tag / package version / release manifest).
- Trigger scope: `workflow_dispatch` only, or tag-push too.
- Does `release.sh` sign only CuraOS images, or bundles/Zarf artifacts too.
- Exact artifact set: image, `.sig`, SBOM, Zarf tarball, checksums, provenance.
- Local `cosign-dryrun` failure policy: warn-only vs hard fail.

**2. Docs/ADR conflicts**
- `justfile` local default gate is `just ci`; a bespoke local gate must not bypass that contract.
- ADR-0110 makes GitHub Actions the CI/CD control plane + meta-repo reusable-workflow model; a new submodule must not become a *second* release system.
- ADR-0211/0164 require offline keyed cosign + `ops/zarf/signing-trust`; signing outside that trust-root is a mismatch.
- New submodule still needs per-module `AGENTS.md`/`Requirements.md`/`CONTEXT.md`.

**3. Hidden deps**
- GHCR `packages:write`, release-env secrets, `COSIGN_PRIVATE_KEY`/`COSIGN_PASSWORD`.
- `docker`, `syft`, `cosign`, `bun`, `bash`, `gh`.
- Existing `cosign-verify.sh` / `repro-build.sh` / zarf signing-trust staying stable.
- SHA-pin maintenance + digest-pin enforcement for all base images.
- Clean worktree / submodule-pointer dependency if `release.sh` reads repo state.

**4. Decision points (with recommended answer)** + **5. Escalation candidates** — see Resolutions.

---

## Resolutions (implementer auto-applied per [[curaos-recommendation-auto-apply-rule]])

| # | Concern | Resolution | Source |
|---|---|---|---|
| 1 | `--version` source | Caller passes explicit `--version vX.Y.Z` (validated semver); aligns with release-please/semver. | ADR-0110 §3.6 |
| 2 | Trigger scope | **`workflow_dispatch`-only — BINDING, not a choice.** Auto CI is off (billing). Tag-push lane FORBIDDEN now. | [[curaos-local-ci-first-rule]] |
| 3 | Sign images vs bundles | **S1 = images (+ SBOM) to GHCR + packages to Verdaccio + emit Zarf image-list.** Bundle *signing* is **Story 3** (`blocked-by:#510`). Partition is explicit in the breakdown. | breakdown S1 vs S3 |
| 4 | Artifact set | image + `.sig` + CycloneDX SBOM attestation + zarf-image-list manifest. | ADR-0110 §3.10; [[curaos-image-build-rule]] |
| 5 | Local cosign-dryrun policy | **Hard fail** when cosign present (it is, locally). SKIP-with-explicit-notice ONLY when a tool (docker/syft) is genuinely absent — never `\|\| true`. | [[curaos-local-ci-first-rule]] |
| C2a | "second release system" | New submodule is **authorized** by the breakdown binding-decisions row (real submodule, code-only) + charter §1. Mitigation: `release.yml` is a thin `workflow_dispatch` caller; it **reuses** `repro-build.sh`/`cosign-verify.sh` contracts, does not re-implement them. | breakdown; [[curaos-repo-boundary-rule]] |
| C2b | trust-root | Pipeline signs to the **same cosign key namespace + GHCR namespace** the air-gap verifier (`cosign-verify.sh`) + `zarf.yaml` expect (`ghcr.io/cura-care-oriented-stack/<svc>`). Air-gap keyed path uses `--insecure-ignore-tlog` per ADR-0211. | ADR-0211 §4.6 |
| C2c | per-module docs | `AGENTS.md`+`CONTEXT.md`+`Requirements.md` authored under `ai/curaos/curaos-deploy/` (NOT in the code repo, per repo-boundary). | AGENTS §1 |
| H | secrets/deps | Pipeline reads GHCR/Verdaccio/cosign creds from env/OIDC; never hardcoded. Tool presence gated by `command -v`. `release.sh --dry-run` needs no creds. | [[curaos-image-build-rule]] |

**Genuine user-escalation candidates: NONE.** Every codex escalation candidate has a doc-resolved answer (S1/S3 partition + local-ci-first rule lock `workflow_dispatch`-only). No irreversible/destructive/T3 action and no unapproved scope remains.

**Outcome:** plan is AFK-ready. No critical flags. Proceed to implementation.
