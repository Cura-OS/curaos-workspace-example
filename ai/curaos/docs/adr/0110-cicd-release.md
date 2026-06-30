# ADR-0110 — CI/CD + Release Stack

> **✅ ACCEPTED WITH ADDENDUM** — per [ADR-0150](0150-baseline-alignment-rules.md) §3: Gradle remote cache + Develocity → Nx remote cache (per ADR-0121) + Turbo; Sonatype Nexus (JVM artifacts) → Verdaccio (npm registry mirror per ADR-0121) + Harbor (OCI artifacts). GitHub Actions + ARC + Atlas + Renovate + Unleash + cosign/SLSA + vCluster previews stand. Local + 3rd-party rule applies.


**Status:** Accepted  
**Date:** 2026-05-24  
**Deciders:** Platform Engineering  
**Supersedes:** none  
**Related ADRs:**
- ADR-0107 — Observability (OpenTelemetry + Grafana)
- ADR-0108 — Security Scanning (Trivy + Grype + Semgrep)
- ADR-0109 — Container Build / Orchestration (Harbor + BuildKit + ArgoCD / FluxCD)
- ADR-0101 — Data Layer (PostgreSQL 17 + HAPI FHIR)
- ADR-0102 — Event Messaging (Apicurio Schema Registry + Kafka)
- ADR-0103 — API Surface (OpenAPI + GraphQL + AsyncAPI)
- ADR-0104 — Identity / Auth (HashiCorp Vault + OIDC)

---

## Table of Contents

1. [Context and Constraints](#1-context-and-constraints)
2. [Decision Overview](#2-decision-overview)
3. [Sub-Decision 3.1 — CI/CD Platform: GitHub Actions](#31-cicd-platform-github-actions)
4. [Sub-Decision 3.2 — Self-Hosted Runner Strategy: Actions Runner Controller](#32-self-hosted-runner-strategy-actions-runner-controller-arc)
5. [Sub-Decision 3.3 — Build Cache: Dual-Layer Gradle + BuildKit](#33-build-cache-dual-layer-gradle--buildkit)
6. [Sub-Decision 3.4 — Artifact Registry (JVM): Sonatype Nexus Repository OSS 3](#34-artifact-registry-jvm-sonatype-nexus-repository-oss-3)
7. [Sub-Decision 3.5 — Release Channels + Feature Flags: Unleash + OpenFeature](#35-release-channels--feature-flags-unleash--openfeature)
8. [Sub-Decision 3.6 — Versioning + Changelog: release-please + git-cliff](#36-versioning--changelog-release-please--git-cliff)
9. [Sub-Decision 3.7 — Schema Migration: Atlas (Ariga) Declarative](#37-schema-migration-atlas-ariga-declarative)
10. [Sub-Decision 3.8 — Multi-Repo Coordination: Renovate + SHA-Pin Workflow](#38-multi-repo-coordination-renovate--sha-pin-workflow)
11. [Sub-Decision 3.9 — Air-Gap Delivery: OCI Bundle + Cosign-Signed Helm](#39-air-gap-delivery-oci-bundle--cosign-signed-helm)
12. [Sub-Decision 3.10 — SBOM + Signing: Syft + Cosign Keyless + SLSA](#310-sbom--signing-syft--cosign-keyless--slsa)
13. [Sub-Decision 3.11 — Integration Test Execution: Testcontainers + vCluster](#311-integration-test-execution-testcontainers--vcluster)
14. [Sub-Decision 3.12 — Preview Environments: vCluster per PR](#312-preview-environments-vcluster-per-pr)
15. [Sub-Decision 3.13 — Migration Tests: Atlas Dry-Run + Shadow Validation](#313-migration-tests-atlas-dry-run--shadow-validation)
16. [Sub-Decision 3.14 — Submodule Release Coordination: Hybrid Platform + Per-Service Semver](#314-submodule-release-coordination-hybrid-platform--per-service-semver)
17. [Sub-Decision 3.15 — Documentation Publishing: Backstage TechDocs + MkDocs Material](#315-documentation-publishing-backstage-techdocs--mkdocs-material)
18. [Reusable Workflow Catalog](#4-reusable-workflow-catalog)
19. [Cross-Cutting Concerns](#5-cross-cutting-concerns)
20. [Rejected Patterns](#6-rejected-patterns-global)
21. [Implementation Sequence](#7-implementation-sequence)
22. [Definition of Done](#8-definition-of-done)
23. [Appendix A — Workflow Reference Skeletons](#appendix-a--workflow-reference-skeletons)
24. [Appendix B — Platform Manifest Schema](#appendix-b--platform-manifest-schema)
25. [Appendix C — HIPAA Audit Event Schema](#appendix-c--hipaa-audit-event-schema)
26. [Appendix D — Known Operational Risks](#appendix-d--known-operational-risks)
27. [References](#references)

---

## 1. Context and Constraints

### 1.1 System Overview

CuraOS is a composable healthcare-and-enterprise platform deployed across four topology profiles: cloud SaaS (multi-tenant), on-premises (single tenant), hybrid (vendor control plane + customer data plane), and air-gapped (fully offline). The codebase is organized as:

- **91 backend microservice submodules** — Kotlin + Spring Boot 3.x + Gradle 8.x; each is an independent Git repository mounted as a submodule in `curaos/backend/services/`.
- **~25 frontend packages** — organized across three tech stacks: React/Next.js (web admin, patient portal), Flutter (mobile), Astro (marketing / external sites). Managed as a Bun workspace under `curaos/frontend/`.
- **Workspace meta-repo** (`curaos-workspace`) — holds all agent-facing docs, ADRs, specs, and the platform manifest; no application code.
- **Shared libraries / BOMs** — a set of Gradle BOMs, Spring Boot starters, and shared Kotlin libraries published to Nexus and consumed by all 91 services.

The release model is **trunk-based development**: all work merges to `main`; feature branches live fewer than two days; no long-lived release branches. Promotion flows through three named channels: **canary** (continuous from `main`), **beta** (weekly cut from canary), **stable** (monthly cut from beta after signoff).

### 1.2 Prior Decisions That Shape This ADR

| ADR | Relevant constraint imposed |
|---|---|
| ADR-0107 | CI/CD pipelines emit structured OTel traces and logs; deploy events are forwarded to Grafana Loki via the OTel collector. |
| ADR-0108 | Trivy, Grype, and Semgrep are the security scanners; scanning steps are composed into the reusable workflow layer decided here. |
| ADR-0109 | Harbor is the OCI registry; ArgoCD (or FluxCD) handles K8s reconciliation from approved manifests. BuildKit is the container build engine. |
| ADR-0101 | PostgreSQL 17 is the primary data store; HAPI FHIR uses its own Liquibase migrator internally. CuraOS-owned schemas must be managed separately. |
| ADR-0102 | Apicurio Schema Registry enforces event schema compatibility. Schema compatibility checks are gated in CI as part of the publish workflow. |
| ADR-0103 | OpenAPI, GraphQL, and AsyncAPI specs are the contract artifacts. Breaking-change detection runs in CI using the specs as source of truth. |
| ADR-0104 | HashiCorp Vault holds all secrets. CI workflows authenticate to Vault via GitHub Actions OIDC (JWT auth method). No long-lived credentials in GH Secrets for production. |

### 1.3 Non-Negotiable Constraints

The following constraints are fixed for the life of this ADR. Any proposal that conflicts with one of these requires a superseding ADR:

1. **All source code is on GitHub.** Repo migration to GitLab, Gitea, or Bitbucket is out of scope.
2. **Air-gap support is mandatory.** CI/CD must function at customer sites with zero outbound internet access after initial provisioning. This means: no SaaS-only CI platform, no SaaS-only registry, no SaaS-only flag backend, no SaaS-only build cache.
3. **HIPAA compliance.** Every deploy, schema migration, secret rotation, and flag change on a production environment must emit a tamper-evident, immutable audit record retained for seven years.
4. **GDPR compliance.** Supply-chain attestations are part of the data lineage record. SBOMs must be generated for every release artifact and retained alongside the HIPAA audit record.
5. **License-compatible tools.** Prefer Apache 2.0 / MIT / BSD. GPL is acceptable for tools that run as infrastructure (not linked into application code). Commercial tools require a self-hosted / on-premises tier with no SaaS-only control plane. SaaS-only commercial tools are rejected for any critical-path gate.
6. **91-repo scalability.** Tooling configuration must be expressible as a single shared config in the meta-repo; no per-repo manual setup beyond a thin caller file (≤50 lines).
7. **No force-push to shared branches.** Submodule branch hygiene rule from workspace AGENTS.md applies universally.

### 1.4 Goals for This ADR

- Select tools for all 15 CI/CD sub-decisions enumerated below.
- Document rationale including all evaluated alternatives.
- Provide actionable implementation guidance: exact tool names, versions, config patterns, and workflow skeletons.
- Specify integration points with ADR-0107 through ADR-0109.
- Specify the HIPAA audit pipeline end-to-end.
- Specify the air-gap delivery pipeline end-to-end.
- Define the Definition of Done so completion is objectively verifiable.

---

## 2. Decision Overview

| # | Sub-decision | Decision | Primary alternative rejected |
|---|---|---|---|
| 3.1 | CI/CD platform | **GitHub Actions** | GitLab CI |
| 3.2 | Self-hosted runner strategy | **ARC (scale set mode) on K8s** | GitHub-hosted runners |
| 3.3 | Build cache | **Self-hosted Gradle Cache Node + BuildKit GHA/Harbor cache** | Develocity managed SaaS |
| 3.4 | Artifact registry (JVM) | **Sonatype Nexus Repository OSS 3** | JFrog Artifactory OSS |
| 3.5 | Release channels + feature flags | **Unleash v6+ (Apache 2.0) + OpenFeature SDK** | LaunchDarkly |
| 3.6 | Versioning + changelog | **release-please + git-cliff** | semantic-release |
| 3.7 | Schema migration | **Atlas (Ariga) declarative** | Flyway |
| 3.8 | Multi-repo coordination | **Renovate self-hosted + SHA-pin workflow** | Dependabot |
| 3.9 | Air-gap delivery | **OCI bundle + cosign-signed Helm via Harbor mirror** | Tar-based custom bundle |
| 3.10 | SBOM + signing | **Syft (CycloneDX) + cosign keyless + SLSA Level 2 → 3** | Notary v2 |
| 3.11 | Integration test execution | **Testcontainers (per-service) + vCluster (cross-service E2E)** | Shared staging only |
| 3.12 | Preview environments | **vCluster per-PR with sleep mode** | Garden / Okteto |
| 3.13 | Migration tests | **Atlas dry-run + shadow validation job** | Manual DBA review only |
| 3.14 | Submodule release coordination | **Hybrid: platform CalVer manifest + per-service semver** | Full monorepo atomic release |
| 3.15 | Documentation publishing | **Backstage TechDocs + MkDocs Material** | GitHub Pages standalone |

---

## 3.1 CI/CD Platform: GitHub Actions

### Decision

GitHub Actions is the sole CI/CD orchestration platform. No secondary CI system is introduced. Reusable workflows in the meta-repo enforce uniform policy (security gates, SBOM, signing, audit emission) across all 91 service submodules.

### Evaluated Options

**GitHub Actions** (selected)

All source code is already on GitHub. GitHub Actions provides:
- Native OIDC trust anchor for cosign keyless signing (the GitHub Actions OIDC provider issues per-run JWTs consumed by Fulcio/Sigstore; no long-lived signing keys needed).
- Reusable workflows (`workflow_call`) that allow the meta-repo to own all pipeline logic while service repos contain only thin caller files.
- Actions policy enforcement (SHA-pinning of third-party actions, enforced at organization level; GA August 2025).
- Native `job_workflow_ref` claim in the OIDC token, which allows Vault's JWT auth policies to restrict secret access to only approved reusable workflow runs — not arbitrary caller workflows.
- GitHub Artifact Attestations API (GA 2024) as the target for SLSA Level 3.
- Workflow call matrix for fan-out across affected submodules.

**GitLab CI**

Would require migrating all 91 submodule repositories and the meta-repo from GitHub to GitLab. The migration is estimated at multi-quarter effort with organizational risk. GitLab CI's pipeline-as-code is technically superior in some respects (DAG dependencies, child pipelines) but provides no compensating technical advantage sufficient to justify the migration cost. Rejected.

**Jenkins**

High operational overhead: plugin ecosystem fragmented (the OIDC publisher plugin, the pipeline shared library model, and the job-as-code system each have their own configuration surface); no native OIDC trust anchor for Sigstore keyless signing; requires a persistent controller (SPOF without additional HA configuration); Jenkinsfile-in-repo model gives less central policy control than GitHub's reusable workflow model. Rejected.

**Drone CI / Woodpecker CI**

Woodpecker CI (Apache 2.0 fork of Drone) is a credible self-hosted option with a simpler plugin model. However: smaller community; the reusable pipeline equivalent (pipeline templates) is less mature; GitHub webhook integration is not native — Woodpecker would become a second control plane running alongside GitHub. Rejected; tracked as a future option if GitHub Actions pricing or availability becomes problematic.

**Tekton**

Kubernetes-native; strong for GitOps-internal workflows. Lacks native GitHub webhook/PR integration at the PR-gating level without additional tooling (Tekton Triggers + Dashboard). Better suited as a K8s-internal task runner than as the primary PR-gated CI system. Rejected for primary CI; note that Tekton Pipelines could replace some ArgoCD Workflow steps in a future iteration.

**Concourse CI**

Strong pipeline-as-code model (resources/tasks/jobs); but thin GitHub Actions cache integration; no native OIDC trust anchor; smaller maintainer community; adoption has declined relative to GitHub Actions. Rejected.

**Buildkite (managed control plane)**

Excellent DX and agent model; but the control plane is SaaS-only — violates the air-gap constraint (agents on customer infrastructure cannot connect to the Buildkite SaaS control plane in an air-gapped environment). Rejected. Buildkite's self-hosted stack (Buildkite Stack) could theoretically be used, but is not an open-source product; license terms are restrictive.

**Argo Workflows**

Excellent for ML/data pipelines, long-running batch jobs, and DAG-heavy workflows. Not designed for PR-gated CI with GitHub status checks and PR comment integration. Would work as a secondary system for long-running migration or data jobs, but introducing it as the primary CI platform adds operational surface without compensating benefit. Argo Workflows is already considered in ADR-0109 for K8s-internal orchestration; this ADR does not expand that role into PR-gated CI.

### Reusable Workflow Architecture

The meta-repo (`curaos-workspace`) owns all reusable workflow files:

```
curaos-workspace/.github/
  workflows/
    # Reusable (called by services)
    _reusable-build-jvm.yml          # Gradle build + test + lint + SBOM + sign
    _reusable-build-frontend.yml     # Bun (Expo+Next+Astro) build + test + SBOM + sign
    _reusable-publish-image.yml      # BuildKit push to Harbor
    _reusable-deploy-canary.yml      # Helm upgrade to canary namespace via ArgoCD
    _reusable-promote.yml            # canary → beta → stable gate
    _reusable-schema-migrate.yml     # Atlas migrate + audit event emit
    _reusable-security-scan.yml      # Trivy + Grype + Semgrep (ADR-0108 integration)
    _reusable-sbom.yml               # Syft CycloneDX + cosign attest
    _reusable-e2e.yml                # vCluster spin-up + Playwright/Pact + teardown
    _reusable-air-gap-bundle.yml     # OCI mirror + bundle sign + manifest checksum
    _reusable-lint-commit.yml        # commitlint conventional commit enforcement
    _reusable-lint-ci.yml            # Enforce caller workflow ≤50 lines policy
    _reusable-contract-test.yml      # Pact provider verification + publish to Pact Broker
    _reusable-schema-compat.yml      # Apicurio schema compatibility check (ADR-0102)
    _reusable-api-breaking.yml       # OpenAPI breaking-change detection (ADR-0103)
    _reusable-atlas-diff.yml         # Atlas schema diff + lint for migration PRs
    _reusable-preview-env.yml        # vCluster preview create/update/destroy lifecycle
    _reusable-techdocs-publish.yml   # MkDocs build + Backstage TechDocs publish

    # Top-level orchestration (meta-repo triggered)
    platform-release.yml             # Full platform manifest release workflow
    renovate-dispatch.yml            # Renovate cron trigger
    dependency-dashboard.yml         # Renovate dependency dashboard sync
```

**Caller workflow constraint:** Each service submodule's `.github/workflows/ci.yml` file must be ≤50 lines. The `_reusable-lint-ci.yml` check fails the build if the caller file exceeds this limit or calls a workflow outside the meta-repo (unless that workflow is a first-party GitHub action at a pinned SHA). This prevents policy bypass: a service team cannot add a scanning bypass or a secret-exfiltration step by adding lines to their caller file.

**Action pinning:** All third-party GitHub Actions in the reusable workflows are pinned to full-length commit SHAs (not tags). SHA pinning is enforced at the organization level via the GitHub Actions policy (GA August 2025). The platform engineering team manages a quarterly review of pinned SHAs using Renovate's `github-actions` manager.

**OIDC + Vault integration:** The `job_workflow_ref` claim in each workflow run's OIDC token is set to the reusable workflow's full ref (e.g., `curaos-workspace/.github/workflows/_reusable-publish-image.yml@refs/heads/main`). Vault's JWT auth role for production Harbor credentials verifies this claim, ensuring that only the approved reusable publish workflow — not arbitrary caller code — can obtain Harbor push credentials.

---

## 3.2 Self-Hosted Runner Strategy: Actions Runner Controller (ARC)

### Decision

Actions Runner Controller (ARC) deployed in **runner scale set mode** on the internal Kubernetes cluster. Scale set mode is the current stable, non-deprecated ARC mode as of 2025. The old `RunnerDeployment` / `HorizontalRunnerAutoscaler` CRD mode is deprecated and will be removed in ARC v0.10.0.

GitHub-hosted runners are not used for any production build, test, or deployment step. They may be used only for public documentation builds on open-source components if CuraOS open-sources any component.

### Evaluated Options

**ARC scale set mode** (selected)

ARC is the GitHub-maintained Kubernetes operator for self-hosted runners. Scale set mode architecture:

1. The `AutoScalingRunnerSet` controller watches for scale set configuration CRDs.
2. The `RunnerScaleSetListener` pod maintains an HTTPS long-poll connection to the GitHub Actions Service (`actions-results.api.github.com`). No inbound firewall rules are needed; only outbound HTTPS on port 443.
3. On job availability message, the listener patches the `EphemeralRunnerSet` with the desired replica count.
4. New runner pods register via JIT (Just-in-Time) configuration token, execute exactly one job, then are deleted.
5. Scale-to-zero is native: when no jobs are queued, replica count drops to 0.

Air-gap compatibility: ARC runner images and the controller image are pre-pulled and stored in Harbor. At runtime, the only external dependency is the HTTPS long-poll connection to `actions-results.api.github.com`. For fully air-gapped sites using GitHub Enterprise Server (GHES), this endpoint is the GHES host. For customer sites that are network-isolated from GitHub.com entirely, a GHES instance inside the customer network is required (GHES on-premises deployment is outside CuraOS's CI scope but is documented in the ops runbook).

**GitHub-hosted runners**

No air-gap support. The runner pool is shared across all GitHub customers; toolchain versions are updated without notice in the `ubuntu-latest` label. Build reproducibility is lower. Outbound dependency on GitHub.com infrastructure. Rejected for all production workloads.

**ARC legacy mode (RunnerDeployment / HorizontalRunnerAutoscaler)**

Deprecated; will be removed in ARC v0.10.0. Do not use. Any existing legacy-mode deployments must be migrated to scale set mode before v0.10.0 is released.

**Woodpecker / Drone agents**

Second CI control plane; violates the "GitHub Actions as sole platform" decision. Rejected.

**Buildkite self-hosted agents**

SaaS control plane. Rejected.

### ARC Deployment Details

**Namespaces:**

```
arc-systems       → ARC controller and webhook server
arc-runners-build → RunnerScaleSet for JVM + frontend builds
arc-runners-e2e   → RunnerScaleSet for E2E / vCluster tests (larger pods)
arc-runners-scan  → RunnerScaleSet for security scans (isolated network policy)
```

**Scale set configuration per namespace:**

| Scale set | Min replicas | Max replicas | Pod resources | Notes |
|---|---|---|---|---|
| `build` | 0 | 20 | 4 CPU / 8 GB RAM | JVM + Gradle + BuildKit |
| `e2e` | 0 | 10 | 8 CPU / 16 GB RAM | vCluster management + Playwright |
| `scan` | 0 | 5 | 2 CPU / 4 GB RAM | Network-isolated; Trivy/Grype DB pre-seeded |

**Runner pod image:**

A custom runner image is built and published to Harbor:

```dockerfile
FROM ghcr.io/actions/actions-runner:latest
# JVM toolchain
RUN apt-get install -y openjdk-21-jdk
ENV JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64
# Gradle wrapper validation
RUN curl -sL https://services.gradle.org/distributions/gradle-8.12-bin.zip -o /opt/gradle.zip
# BuildKit (rootless)
COPY --from=moby/buildkit:v0.18 /usr/bin/buildkitd /usr/local/bin/buildkitd
COPY --from=moby/buildkit:v0.18 /usr/bin/buildctl /usr/local/bin/buildctl
# cosign, syft, atlas, helm, crane, oras
RUN curl -sSfL https://raw.githubusercontent.com/anchore/syft/main/install.sh | sh -s -- -b /usr/local/bin
```

The runner image is rebuilt weekly via a scheduled workflow and SHA-pinned in the ARC HelmRelease. The image build itself uses ARC runners (bootstrapping: first build uses a temporary GitHub-hosted runner; subsequent builds use ARC).

**Rootless BuildKit:** Runner pods do not require `privileged: true`. BuildKit runs in rootless mode via the `moby/buildkit` image with `--oci-worker-no-process-sandbox`. This satisfies the security requirement to avoid privileged containers in the build namespace.

---

## 3.3 Build Cache: Dual-Layer Gradle + BuildKit

### Decision

Two independent cache layers, each optimized for its artifact type:

- **Layer 1 — Gradle task-output cache:** Self-hosted Gradle Build Cache Node (Docker image, Apache-licensed). Deployed as a K8s Deployment backed by a PVC. Shared across all 91 JVM service builds and all ARC runner pods. Configured via `~/.gradle/gradle.properties` in the runner image.
- **Layer 2 — Docker image layer cache (BuildKit):** Primary cache stored in Harbor as an OCI cache export (`type=registry`). Secondary fallback uses GitHub Actions `type=gha` cache for PR builds from forks (which cannot write to Harbor).

For the frontend Bun workspace, Turborepo remote cache (self-hosted) replaces the Gradle cache.

### Evaluated Options

**Self-hosted Gradle Build Cache Node** (selected for JVM)

- Docker image published by Gradle (`gradle/build-cache-node`); Apache 2.0.
- Supports cache-node-to-cache-node replication for geographically distributed teams.
- Deployed as `build-cache-node` K8s Deployment with a 30 GB SSD-backed PVC; LRU eviction at 85% capacity.
- `setup-gradle` action (`gradle/actions@v4`) handles `gradle.properties` injection, wrapper validation, and local cache cleanup automatically.
- **EOL note:** Gradle has announced the standalone Build Cache Node end-of-support on 2026-12-31. The migration path is Develocity Edge (self-hosted tier of Develocity). Develocity Edge serves the same remote caching purpose but is packaged as part of the Develocity product. The Q3 2026 platform roadmap must include migration to Develocity Edge before the EOL date.

**Develocity (Gradle Enterprise) managed SaaS**

Commercial SaaS control plane; violates air-gap constraint. The on-premises (self-hosted) Develocity tier is viable and is the planned EOL migration target (replacing the Build Cache Node). Not adopted at ADR time because: (a) the Build Cache Node is still supported until end of 2026, and (b) Develocity's full feature set (build scan, test analytics) requires a commercial license. Tracked as a Phase 5 upgrade.

**GitHub Actions `actions/cache` for Gradle alone**

GHA cache size was raised to 10+ GB per repository in November 2025. However:
- Cache is per-repo, not shared across 91 service repos.
- Eviction occurs after 7 days of inactivity; a service touched rarely may have cold cache on every build.
- Cross-repo sharing requires the remote Gradle cache approach.
- Acceptable as a secondary Gradle dependency cache layer (caching the Gradle wrapper + downloaded dependencies); not sufficient as the sole cache mechanism.

**Turborepo remote cache (self-hosted)**

Adopted for the frontend Bun workspace. Turborepo's remote cache is a simple HTTP server (MIT-licensed reference implementation or compatible third-party implementations). Caches Bun workspace build outputs per affected-packages run.

**Nx Cloud managed**

SaaS-only managed tier for Nx. Rejected (SaaS constraint). Nx Cloud self-hosted is available but introduces Nx as a required toolchain layer for services not already using it.

**Bazel remote cache (BuildBuddy / BuildBarn / self-hosted)**

Full Bazel migration is out of scope for this ADR. If build times for the 91-service fleet become untenable, a future ADR may evaluate Bazel or Buck2 with a shared remote cache. BuildBuddy OSS (Apache 2.0) is the leading self-hostable Bazel remote cache. Tracked as a future option.

**sccache**

Rust/C++ compiler caching; not applicable to Gradle/JVM or to Docker layer caching.

### Cache Topology

```
ARC runner pod (JVM build)
  └── Gradle daemon
        ├── local task output cache    (ephemeral pod disk, per-run)
        └── remote task output cache  →  Gradle Build Cache Node (K8s svc, in-cluster)
                                            └── PVC (30 GB SSD)
                                                └── LRU eviction @ 85%

ARC runner pod (container build)
  └── BuildKit daemon (rootless)
        └── cache export
              ├── type=registry → Harbor cache repo (harbor.internal/cache/<service>)
              └── type=gha      → actions/cache (10 GB GHA cache, fallback for forks)
```

**BuildKit GHA cache** (`type=gha`) stores intermediate image layers in GitHub's infrastructure. Combined with `mode=max` (cache all intermediate stages, not just final), this reduces multi-stage Gradle + JRE image builds from ~3 minutes cold to ~38 seconds warm (measured on representative Spring Boot service image, 2025 benchmarks).

**Harbor registry cache** is preferred over GHA cache for production builds because: unlimited size; persists across workflow runs indefinitely; no 7-day eviction; accessible from air-gap Harbor mirrors.

### Gradle `gradle.properties` in Runner Image

```properties
# Remote build cache (Gradle Build Cache Node)
org.gradle.caching=true
org.gradle.cache.remote.url=http://build-cache-node.arc-systems.svc.cluster.local:5071
org.gradle.cache.remote.pushEnabled=true
org.gradle.cache.remote.storeEnabled=true

# Parallel execution
org.gradle.parallel=true
org.gradle.workers.max=4

# Configuration cache (Gradle 8+)
org.gradle.configuration-cache=true
```

---

## 3.4 Artifact Registry (JVM): Sonatype Nexus Repository OSS 3

### Decision

Nexus Repository OSS 3 hosts all Maven/Gradle artifacts: JARs, Gradle plugin JARs, BOMs, Kotlin library archives, and raw files. Harbor (ADR-0109) hosts all OCI images and Helm charts. These are two separate repositories with complementary roles.

### Evaluated Options

**Sonatype Nexus Repository OSS 3** (selected)

- Apache-licensed core (OSS edition).
- Supports Maven 2, Gradle (via Maven protocol), npm, PyPI, Docker (proxy only in OSS), Helm proxy, raw/generic.
- Proven at large enterprise scale (Fortune 500 production deployments).
- PostgreSQL 17 backend option (avoids embedded OrientDB, which has caused data-loss incidents in older Nexus versions; H2 and OrientDB backends are deprecated in Nexus 3.x).
- Proxy repository for Maven Central, Gradle Plugin Portal, Spring Milestones — downloaded once, served from internal cache on air-gap sites.
- Nexus REST API allows the promotion workflow to verify SLSA attestation presence before promoting a SNAPSHOT artifact to a RELEASE repository.
- Self-hosted Helm chart available; PostgreSQL connection is configurable.
- OSS edition has no HA support (active-passive only); see Known Risks section.

**JFrog Artifactory OSS**

OSS edition is limited to Maven and generic repository types; Docker, npm, PyPI, Helm require the commercial Pro edition. Feature parity is worse than Nexus OSS in the free tier for a polyglot team. JFrog's pricing model has moved toward usage-based SaaS pricing for Artifactory Cloud; the on-premises Pro tier is commercial. Rejected for OSS edition limitation; would be acceptable as a commercial replacement if Nexus OSS proves insufficient.

**GitHub Packages (Maven)**

Supports Maven repositories; requires GitHub authentication for all pulls (no anonymous read even for public repos); no proxy repository support (cannot cache Maven Central); no air-gap deployment mode (control plane is GitHub.com). Acceptable as a secondary publish target for open-source CuraOS components (if any are open-sourced). Not suitable as the primary internal registry.

**Gradle Plugin Portal**

Publish-only for Gradle plugins; not a private registry. Not applicable.

**Cloudsmith / Gemfury / MyGet**

SaaS-only; violate air-gap constraint. Rejected.

### Nexus Repository Layout

```
Hosted repositories:
  curaos-snapshots    → SNAPSHOT builds from main branch (auto-published on every merge)
  curaos-releases     → Release builds (promoted from snapshots on tag + SLSA verification)
  curaos-libs-release → Shared libraries and BOMs (long-lived, versioned)

Proxy repositories:
  maven-central-proxy → https://repo1.maven.org/maven2/
  gradle-plugins-proxy → https://plugins.gradle.org/m2/
  spring-milestones-proxy → https://repo.spring.io/milestone/

Group repositories (resolve across hosted + proxy in order):
  public              → [curaos-releases, curaos-libs-release, maven-central-proxy, gradle-plugins-proxy]
  snapshots           → [curaos-snapshots, public]
```

**SNAPSHOT policy:** SNAPSHOT artifacts are published on every merge to `main`. They are retained for 30 days and then purged via Nexus cleanup policies. Only release artifacts are eligible for air-gap bundling.

**Promotion gate:** The `_reusable-promote.yml` workflow calls the Nexus REST API to move an artifact from `curaos-snapshots` to `curaos-releases` only after:
1. A cosign signature is verified against the artifact's SHA-256 digest.
2. A SLSA Level 2 provenance attestation is present and verified.
3. All CI checks (build, test, scan, SBOM, contract test) are green.

---

## 3.5 Release Channels + Feature Flags: Unleash + OpenFeature

### Decision

**Unleash v6+** (Apache 2.0 core) is the feature flag backend. All application SDKs use the **OpenFeature** abstraction layer (CNCF incubated project) so the flag backend can be swapped without application code changes. The three release channels (canary, beta, stable) are implemented as Unleash environments, not as Git branches or separate deployments.

### Evaluated Options

**Unleash** (selected)

- Apache 2.0 core; no GPL restrictions on commercial use as infrastructure.
- Node.js + TypeScript backend; PostgreSQL storage (can share the platform PG cluster).
- 15+ server-side SDKs including Java (official); Android SDK (Kotlin); React SDK; JavaScript SDK.
- Official OpenFeature provider for Java, JavaScript, and other languages.
- Unleash Edge: a Rust-based edge proxy (Apache 2.0) that caches flag decisions locally in each namespace, providing sub-millisecond flag evaluation even when the Unleash Server is unreachable. Critical for air-gap sites and for high-throughput flag evaluation in K8s pods.
- Strong audit logging: every flag change records who changed it, what changed, and when. Audit log is accessible via the Unleash API and can be forwarded to the OTel collector.
- SSO support (SAML, OIDC) in the Enterprise tier; basic SSO in the OSS tier via custom auth hook. For HIPAA, the Enterprise tier's audit and SSO features are preferred; the OSS tier is acceptable if the audit log API is sufficient.
- Progressive rollout strategies: gradual rollout by user ID, session ID, IP, or custom context field. Used for the canary → beta → stable promotion gating.

**Flagsmith**

- BSD 3-Clause; Django / PostgreSQL backend.
- Founding member of OpenFeature; native OpenFeature providers.
- Feature-comparable to Unleash for self-hosted use.
- Slightly smaller Java/Kotlin ecosystem support.
- Viable alternative if Unleash operational overhead proves unacceptable. Not adopted at ADR time to limit tool sprawl; would be adopted if Unleash is deprecated or licensing changes.

**Flipt**

- GPL 3.0 core.
- First-class OpenFeature integration (primary evaluation path, not secondary).
- Single binary, minimal infrastructure (can embed SQLite; no separate DB required).
- GPL 3.0 creates license risk: if any CuraOS application code is ever linked against Flipt's Go library (e.g., via a thin Go sidecar), GPL copyleft may extend to CuraOS's application code. For infrastructure-only use (Flipt as a server, not a linked library), the GPL risk is lower, but legal review is required. Rejected due to license uncertainty.

**GrowthBook**

- MIT; primarily an A/B testing and experimentation platform.
- Feature flags are a secondary feature; the primary use case is statistical experiment tracking.
- Not optimal for CI/CD release channel gating. Rejected for this use case; could be adopted separately for product experimentation (A/B testing) without conflicting with Unleash for release channel flags.

**LaunchDarkly**

- Commercial SaaS.
- SaaS control plane; air-gap incompatible. Rejected.

**OpenFeature (standard alone)**

OpenFeature is an SDK abstraction, not a backend. A backend is required. OpenFeature is adopted as the SDK layer on top of Unleash.

### Release Channel Architecture

The three release channels are implemented as three Unleash environments:

| Unleash environment | Maps to | Traffic percentage | Promotion criteria |
|---|---|---|---|
| `canary` | K8s namespace `canary` | 5% of internal traffic (synthetic + early adopter) | Automatic on merge to `main` |
| `beta` | K8s namespace `beta` | 25% of production tenant traffic (opt-in tenants) | Weekly gate: canary error rate < 0.1%, P95 latency within 10% of stable |
| `stable` | K8s namespace `stable` + on-prem sites | 100% | Monthly gate: beta signoff by product + compliance |

**Canary rollout example** for a specific feature:

```
Flag: "patient-timeline-v2"
Environment: canary  → gradual rollout 10% → 50% → 100%
Environment: beta    → 0% until canary gate passes → then 100%
Environment: stable  → 0% until beta signoff → then 100%
```

The `_reusable-promote.yml` workflow reads the Unleash API to capture the current flag state snapshot at the time of each promotion. This snapshot is written into the HIPAA audit event (flag name, strategy, rollout percentage, environment, timestamp, actor identity).

**Unleash Edge deployment:**

```
Each K8s namespace (canary / beta / stable):
  unleash-edge (Rust pod, Apache 2.0)
    ↑ syncs from
  unleash-server (central, PostgreSQL-backed)
    ↑ receives changes from
  Unleash Admin UI / API
```

Air-gap sites receive a flag snapshot (JSON) bundled as an OCI artifact in the air-gap bundle (Section 3.9). Unleash Edge can be pre-seeded with this snapshot and operate fully offline, serving cached flag decisions. Flag changes at air-gap sites require a new bundle delivery cycle.

---

## 3.6 Versioning + Changelog: release-please + git-cliff

### Decision

**release-please** (Google, Apache 2.0) manages release PRs, version bumps, and GitHub Releases for all 91 backend service submodules and frontend packages. **git-cliff** (Rust, MIT, already in the global CLAUDE.md toolchain) generates the human-readable CHANGELOG body fed into release-please release notes. **changesets** (MIT) manages the frontend Bun workspace (React/Next.js/Astro/React Native packages), which has a different versioning cadence.

### Evaluated Options

**release-please** (selected for JVM and Flutter)

- Native GitHub app or GitHub Actions action (`google-github-actions/release-please-action`).
- Designed for multi-repo: each submodule runs release-please independently; the meta-repo runs a top-level release-please that tracks the platform manifest.
- Does not require commit analysis at release time (conventional commits are analyzed continuously as PRs land); release PRs are opened automatically when a releasable change is present.
- Supports multiple component strategies: `simple` (bump from version file), `maven` (bump pom.xml), `dart` (bump pubspec.yaml), `calendar-versioning` (YYYY.N for the platform manifest).
- Human review is required to merge the release PR (the release itself is intentional, not fully automated). This is preferred over semantic-release's fully automatic tagging, which has caused accidental releases in large organizations.
- Does not prescribe the changelog format; `git-cliff` generates the CHANGELOG.md body from conventional commits, and release-please uses that body as the GitHub Release description.

**git-cliff** (selected for changelog generation)

Already required by the global CLAUDE.md toolchain rule. Reads conventional commits; `cliff.toml` defines grouping, header, footer, and section names. Run in `_reusable-build-jvm.yml` on merge to `main` to update `CHANGELOG.md` in the release PR.

**semantic-release** (rejected for JVM; considered for JS packages)

Fully automated: analyzes commits, determines version, creates tag, publishes to registry, creates GitHub Release — all in one CI step without a human-review release PR. Advantages: fully hands-off velocity. Disadvantages: (a) `semantic-release-monorepo` community plugin was last meaningfully maintained in early 2022 and has open issues with 91+ package coordinations; (b) a bad commit message can trigger an accidental major version release; (c) no pause for human review before a release that touches production. Rejected for JVM services. Acceptable for individual frontend npm packages if the team prefers it; not adopted at ADR time to maintain consistency.

**changesets** (selected for frontend Bun workspace)

Designed for Bun/pnpm/Yarn workspace multi-package versioning. The changesets bot comments on every PR that lacks a changeset file, prompting intentional documentation of changes. Changesets decouples version intent from commit messages, which is appropriate for the frontend workspace where UI changes often don't map cleanly to semver conventional commit tokens. The `@changesets/action` GitHub Action opens a "Version Packages" PR when changesets are accumulated; merging that PR triggers release.

**git tag + manual version bump** (rejected)

Does not scale to 91 repos. Cannot enforce consistent versioning discipline across 91 independent teams. Rejected.

### Conventional Commit Enforcement

All repositories enforce conventional commits via `commitlint` (`@commitlint/cli` + `@commitlint/config-conventional`). Enforcement runs in `_reusable-lint-commit.yml`, called on every PR `push` event.

Accepted types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `perf`, `build`, `ci`.

BREAKING CHANGE footer triggers major version bump in release-please:

```
feat(patient-api)!: rename /patient/{id} to /patients/{id}

BREAKING CHANGE: URL path has changed; all clients must update base path.
```

### Version Scheme Per Component Type

| Component type | Tool | Version scheme | Example |
|---|---|---|---|
| Backend microservice | release-please | `<major>.<minor>.<patch>` | `identity-service@3.4.1` |
| Shared Kotlin library | release-please (maven) | `<major>.<minor>.<patch>` | `curaos-core@1.2.0` |
| Gradle BOM | release-please (maven) | `<major>.<minor>.<patch>` | `curaos-bom@2.0.0` |
| React/Next.js package | changesets | `<major>.<minor>.<patch>` | `@curaos/ui@5.1.2` |
| Flutter package | release-please (dart) | `<major>.<minor>.<patch>` | `curaos_mobile@1.3.0` |
| Astro site | changesets | `<major>.<minor>.<patch>` | `@curaos/marketing-site@2.0.1` |
| Platform manifest (meta) | release-please (calendar-versioning) | `YYYY.N` | `2026.5` (5th stable of 2026) |

---

## 3.7 Schema Migration: Atlas (Ariga) Declarative

### Decision

**Atlas** (Ariga, Apache 2.0) is the schema migration tool for all CuraOS-owned PostgreSQL 17 databases. Atlas replaces any existing Flyway or manual SQL migration setup.

**Exception:** HAPI FHIR's internal Liquibase migrations are not managed by Atlas. HAPI FHIR applies its own changelogs on pod startup. CuraOS CI does not interfere with the FHIR schema.

### Evaluated Options

**Atlas** (selected)

- Apache 2.0; written in Go; CLI + GitHub Actions action (`atlas/setup-action`).
- Declarative schema-as-code: developers write the desired state in HCL, SQL, or ORM-native format. Atlas computes the migration SQL automatically (auto-planning covers 98%+ of PostgreSQL DDL).
- Declarative and versioned workflows are both supported; CuraOS uses the versioned workflow (Atlas generates migration files into `db/migrations/` which are committed to source control) combined with a declarative schema file as the source of truth.
- Native CI integration: `atlas migrate lint` detects destructive changes; `atlas migrate apply --dry-run` previews SQL; `atlas schema diff` shows drift between expected and actual schema.
- Rollback support: Atlas generates down-migration SQL and supports auditable approval flows for rollbacks.
- PostgreSQL 17 fully tested and supported.
- Schema drift detection: `atlas schema inspect` can compare the live database schema to the expected schema and alert on drift (useful for HIPAA: unauthorized schema changes are detectable).

**Flyway** (rejected)

Redgate (Flyway's owner) discontinued the Teams subscription tier for new customers in 2025, pushing all teams toward the Enterprise tier. The OSS Flyway remains version-based (no automatic planning, no rollback support, no drift detection in the free tier). The licensing trajectory is unfavorable; adopting Flyway OSS now risks a forced migration to Enterprise pricing later. Rejected.

**Liquibase**

Retained within HAPI FHIR's boundary only. HAPI FHIR ships its own Liquibase changelogs; these cannot be replaced without forking HAPI FHIR. CuraOS-owned schemas must not use Liquibase to avoid maintaining two migration systems for the same PostgreSQL cluster.

**sqitch**

Version-based; strong change tracking and dependency management; but no declarative planning, no automatic SQL generation, and a smaller community relative to Atlas. Rejected.

**Terraform (PostgreSQL provider)**

The `hashicorp/postgresql` Terraform provider manages database-level objects: databases, roles, extensions. It is appropriate for infrastructure provisioning but not for table-level schema management in application code. Continues to be used for database and role provisioning; Atlas owns everything inside the database (tables, views, indexes, sequences, constraints).

### Atlas Migration Workflow in CI

**On every PR touching `db/schema.hcl` or `db/migrations/`:**

```yaml
# _reusable-atlas-diff.yml
steps:
  - name: Setup Atlas
    uses: ariga/setup-atlas@v0
    with:
      version: v0.28.0  # pinned SHA in production

  - name: Lint migrations (detect destructive changes)
    run: |
      atlas migrate lint \
        --dev-url "docker://postgres/17/dev?search_path=public" \
        --dir "file://db/migrations" \
        --format "{{ json .Diagnostics }}" \
        | tee lint-report.json
      # Fail if any diagnostic has severity ERROR
      jq -e '[ .[] | select(.severity == "ERROR") ] | length == 0' lint-report.json

  - name: Schema diff (show SQL that will be applied)
    run: |
      atlas schema diff \
        --dev-url "docker://postgres/17/dev?search_path=public" \
        --from "file://db/schema.hcl" \
        --to "file://db/migrations" \
        --format '{{ sql . "  " }}'
```

**On merge to `main` (canary apply):**

```yaml
# _reusable-schema-migrate.yml
steps:
  - name: Apply migrations (dry-run in beta, real in canary)
    run: |
      atlas migrate apply \
        --url "${{ secrets.DB_URL }}" \
        --dir "file://db/migrations" \
        --tx-mode all \
        --lock-timeout 30s \
        --format "{{ json . }}" \
        | tee apply-result.json

  - name: Emit HIPAA audit event
    run: |
      MIGRATION_HASH=$(sha256sum db/migrations/*.sql | sha256sum | cut -d' ' -f1)
      cat <<EOF | curl -X POST "$OTEL_EXPORTER_URL/audit" -H "Content-Type: application/json" -d @-
      {
        "event_type": "cicd.schema_migrate",
        "service": "${{ inputs.service_name }}",
        "migration_hash": "$MIGRATION_HASH",
        "applied_by": "${{ github.actor }}",
        "workflow_run": "${{ github.run_url }}",
        "environment": "${{ inputs.environment }}",
        "outcome": $(jq '.Status' apply-result.json)
      }
      EOF
```

**HAPI FHIR boundary note:** The `healthstack-fhir-service` submodule's CI workflow skips the Atlas migration step. A lint check in `_reusable-lint-ci.yml` verifies that any service whose name matches `*fhir*` does not reference `_reusable-schema-migrate.yml`.

---

## 3.8 Multi-Repo Coordination: Renovate + SHA-Pin Workflow

### Decision

**Renovate** self-hosted (Mend, Apache 2.0 core) manages dependency updates across all 91 service submodules and the meta-repo. A custom SHA-pin submodule workflow handles the promotion of submodule pointer updates through the canary → beta → stable pipeline.

### Evaluated Options

**Renovate** (selected)

In an April 2026 test with an npm monorepo of 198 direct dependencies and 14 workspaces, Dependabot created 18 separate PRs and could not group across workspace directories. In the same test, Renovate opened 2 grouped PRs (one for patch, one for minor) covering all 14 workspaces simultaneously. For 91 repos, Dependabot's per-workspace PR model would generate hundreds of PRs per week, overwhelming reviewers.

Renovate capabilities that differentiate:
- `group:monorepos` preset groups updates for related package families (e.g., all `org.springframework.boot:*` updates) into a single PR.
- `automerge: true` for `patch` updates with green CI; reviewers are not required for routine maintenance.
- Version consistency: if `org.springframework.boot:spring-boot-starter` is at 3.4.0 in service A and 3.3.9 in service B, Renovate detects the inconsistency and proposes aligning both.
- `renovate.json` in the meta-repo serves as the global preset; individual service repos may extend but not override security-critical rules.
- Renovate self-hosted runs as a GitHub App (not a GitHub Action), so it is not subject to the GitHub Actions minutes quota.
- Dependency Dashboard: a single GitHub Issue in the meta-repo shows all pending updates across 91 repos in one view.

**Dependabot** (retained as secondary layer)

Dependabot remains enabled on all repos for GitHub's native CVE security alerts (GitHub's Advisory Database → Dependabot security alerts → GitHub Security tab). Security alert PRs from Dependabot are superseded by Renovate's grouped PRs within hours. Dependabot is not the primary dependency update mechanism; it is retained only for the GitHub Advisory Database integration, which Renovate does not replicate natively.

### Renovate Configuration

```json
// curaos-workspace/renovate.json (global preset applied to all repos)
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": [
    "config:best-practices",
    ":dependencyDashboard",
    "group:springBoot",
    "group:kotlin"
  ],
  "baseBranches": ["main"],
  "schedule": ["after 3am and before 6am on Monday"],
  "commitMessagePrefix": "chore(deps):",
  "automerge": false,
  "packageRules": [
    {
      "description": "Auto-merge patch updates on green CI",
      "matchUpdateTypes": ["patch"],
      "automerge": true,
      "automergeType": "pr",
      "automergeSchedule": ["after 4am and before 6am on Monday"]
    },
    {
      "description": "Group all Spring Boot updates",
      "matchPackagePrefixes": ["org.springframework.boot"],
      "groupName": "spring-boot",
      "automerge": false
    },
    {
      "description": "Group all Kotlin updates",
      "matchPackagePrefixes": ["org.jetbrains.kotlin"],
      "groupName": "kotlin",
      "automerge": false
    },
    {
      "description": "Submodule SHA pin updates require platform engineering review",
      "matchDepTypes": ["submodule"],
      "groupName": "submodule-sha-pins",
      "automerge": false,
      "reviewers": ["team:platform-engineering"],
      "prPriority": 10
    },
    {
      "description": "Docker base image updates in runner image Dockerfile",
      "matchDatasources": ["docker"],
      "matchFileNames": ["**/Dockerfile.runner"],
      "automerge": false,
      "reviewers": ["team:platform-engineering"]
    },
    {
      "description": "GitHub Actions SHA pinning managed by Renovate",
      "matchManagers": ["github-actions"],
      "pinDigests": true,
      "automerge": false
    }
  ],
  "vulnerabilityAlerts": {
    "automerge": true,
    "labels": ["security", "renovate"]
  }
}
```

### Submodule SHA-Pin Workflow

When a service submodule publishes a release tag (GitHub Release created by release-please), the following workflow triggers in the meta-repo:

```
1. GitHub Release event fires in service repo
2. `_reusable-promote.yml` in meta-repo receives `repository_dispatch` event
3. Workflow resolves new release tag → commit SHA
4. Opens PR in meta-repo updating `.gitmodules` SHA pointer for that submodule
5. `_reusable-contract-test.yml` runs Pact provider verification for affected service pairs
6. `_reusable-api-breaking.yml` runs OpenAPI breaking-change detection
7. `_reusable-schema-compat.yml` runs Apicurio event schema compatibility check
8. If all checks pass AND update is a patch bump → auto-merge
9. If minor or major → requires human approval from `team:platform-engineering`
10. On merge → canary platform manifest updated → triggers canary deploy for that service
```

---

## 3.9 Air-Gap Delivery: OCI Bundle + Cosign-Signed Helm

### Decision

Air-gap delivery is an **OCI-first pipeline**. All artifacts — container images, Helm charts, schema migrations, Unleash flag snapshots, OPA/Kyverno policy bundles, OpenAPI specs — are packaged as OCI artifacts, signed with cosign, and bundled via a Harbor export into a single signed delivery package.

### Rationale Over Alternatives

A tar-based custom bundle (the previous approach used by some teams) requires custom tooling to create, verify, and extract. OCI artifacts provide:
- Standard format verifiable with any OCI-compatible toolchain (crane, skopeo, oras).
- Cosign signing works natively on any OCI artifact stored in an OCI registry.
- Harbor's replication feature can mirror an OCI registry to another Harbor instance — including the customer's internal Harbor at an air-gap site — without custom export scripts.
- Helm 3.8+ supports OCI natively: `helm push chart.tgz oci://harbor.internal/charts/` and `helm pull oci://harbor.internal/charts/service:1.0.0`. No `index.yaml` required.
- Flux (ADR-0109 GitOps engine) can verify cosign signatures on OCI artifacts before reconciling them, providing policy enforcement at the K8s reconciliation layer.

### Artifact Types and Packaging

| Artifact | OCI packaging method | Signing |
|---|---|---|
| Container image | Standard OCI image (BuildKit push) | `cosign sign` + SLSA provenance attestation |
| Helm chart | `helm push` to Harbor OCI repo | `cosign sign` on chart digest |
| DB migration scripts | `oras push` as OCI artifact with `application/vnd.curaos.migrations` media type | `cosign attest` with CycloneDX SBOM |
| Unleash flag snapshot | `oras push` as OCI artifact | `cosign sign` |
| OPA / Kyverno policies | `oras push` as OCI artifact | `cosign sign` |
| OpenAPI / AsyncAPI specs | `oras push` as OCI artifact | `cosign sign` |
| Platform manifest | `oras push` as OCI artifact | `cosign sign` with GPG customer key |

### Bundle Creation Workflow (`_reusable-air-gap-bundle.yml`)

```
Trigger: stable platform manifest release

1. Read platform-manifest.json (lists all service versions)
2. For each service/artifact listed:
   a. crane pull harbor.internal/<service>:<version> → save as OCI tar
   b. cosign verify harbor.internal/<service>:<version>  (verify before bundle)
   c. cosign download signature and attestation bundle
3. For each Helm chart:
   a. helm pull oci://harbor.internal/charts/<chart>:<version>
   b. cosign verify oci://harbor.internal/charts/<chart>@<digest>
4. Assemble bundle/:
   bundle/
     images/                    # OCI image tars (crane export format)
       identity-service-3.4.1.tar
       workflow-service-2.1.0.tar
       ...
     charts/                    # Helm chart tarballs
       identity-chart-3.4.1.tgz
       ...
     artifacts/                 # OCI artifacts (migrations, flags, policies, specs)
       identity-service-migrations-3.4.1.tar
       platform-flags-2026.5.tar
       ...
     signatures/                # cosign .sig and .att files for offline verify
       identity-service-3.4.1.sig
       identity-service-3.4.1.att
       ...
     trust/                     # Offline trust roots
       fulcio-root.pem           # Fulcio root CA certificate
       rekor-public-key.pem      # Rekor public key for offline Rekor log
       ctfe-public-key.pem       # Certificate Transparency log public key
     manifest.json              # SHA-256 checksums of all bundle members
     bundle.json                # Platform version, component matrix, build metadata
     manifest.json.gpg          # GPG signature of manifest.json (customer key)

5. Upload bundle to release asset or S3-compatible bucket
6. Notify customer delivery channel
```

### Customer Site Installation

```bash
# Step 1: Verify bundle integrity
gpg --verify manifest.json.gpg manifest.json
sha256sum --check manifest.json

# Step 2: Verify each artifact's cosign signature using offline bundle
for sig in signatures/*.sig; do
  artifact="${sig%.sig}.tar"
  cosign verify-blob \
    --bundle "${sig%.sig}.bundle" \
    --certificate-oidc-issuer "https://token.actions.githubusercontent.com" \
    --certificate-identity-regexp "^https://github.com/curaos/.*" \
    "$artifact"
done

# Step 3: Import images into local Harbor
for tar in images/*.tar; do
  crane push "$tar" harbor.local/curaos/$(basename "$tar" .tar)
done

# Step 4: Import Helm charts
for chart in charts/*.tgz; do
  helm push "$chart" oci://harbor.local/charts
done

# Step 5: Apply via Helm
helm upgrade --install curaos-platform \
  oci://harbor.local/charts/curaos-platform \
  --version 2026.5 \
  --values /etc/curaos/values.yaml

# Step 6: Atlas applies schema migrations from OCI artifact
# (handled by the Atlas K8s operator, which fetches migration artifact from local Harbor)

# Step 7: Unleash Edge loads flag snapshot
# (handled by the unleash-edge pod, which reads the platform-flags OCI artifact)
```

The **trust roots** (`fulcio-root.pem`, `rekor-public-key.pem`) are distributed in the bundle so air-gap sites can perform full cosign verification without contacting the public Sigstore TUF root. The customer's GPG public key is distributed during tenant onboarding and used to verify the `manifest.json.gpg` signature.

---

## 3.10 SBOM + Signing: Syft + Cosign Keyless + SLSA

### Decision

Every build artifact emits a **CycloneDX 1.5** SBOM generated by **Syft** (Anchore, Apache 2.0), signed with **cosign keyless** signing (GitHub Actions OIDC → Fulcio → Rekor), and attested at **SLSA Level 2** today with **SLSA Level 3** as the target milestone via GitHub Artifact Attestations.

### Evaluated Options

**Syft** (selected for SBOM)

- Anchore-maintained; Apache 2.0.
- Generates CycloneDX 1.5+ and SPDX 2.3 SBOMs.
- Understands JVM classpath analysis (Gradle lock files, Spring Boot fat JARs), npm `package-lock.json`, Go `go.sum`, Python `requirements.txt`.
- GitHub Actions action: `anchore/sbom-action@v0`.
- Output is consumed by Grype (vulnerability scan, ADR-0108) and forwarded to Harbor as an OCI attestation.

**Cosign keyless** (selected for signing)

- Sigstore project; Apache 2.0.
- The GitHub Actions OIDC provider issues a per-run JWT. Fulcio exchanges the JWT for a short-lived X.509 certificate binding the GitHub Actions identity to an ephemeral key pair. Cosign signs the artifact using that key. Rekor records the signing event in its transparency log.
- No long-lived signing keys are managed, stored, or rotated. The entire key lifecycle is ephemeral (≤10 minutes per signing event).
- For air-gap sites: key-based signing is used as a fallback. A customer-provisioned EC P-256 key pair is stored in the customer's Vault instance. Signing and verification use the key directly; Rekor is not required in offline mode (cosign supports `--bundle` flag for offline bundle-based verification).

**SLSA Level 2** (current baseline)

SLSA Level 2 provides: version-controlled build definitions; build process runs on a hosted CI platform (GitHub Actions); provenance is generated and signed by the CI platform. Achieved via `slsa-framework/slsa-github-generator` reusable workflows.

**SLSA Level 3** (target)

SLSA Level 3 additionally requires: isolated build environment (ephemeral ARC runners satisfy this); non-forgeable provenance generated by the CI platform's trusted build system. GitHub Artifact Attestations API (GA 2024) is the current recommended path, per GitHub's updated guidance superseding the earlier `slsa-github-generator` approach. Level 3 upgrade is a CI workflow change; no re-architecture is needed.

**Notary v2**

OCI-integrated signing; less tooling momentum than Sigstore/cosign in 2025-2026 (cosign has broader ecosystem adoption, especially in Kubernetes policy enforcement tools like Kyverno and Ratify). No keyless flow equivalent. Rejected.

**in-toto standalone**

Lower-level attestation framework. Cosign already wraps in-toto attestation format (the `cosign attest` command produces in-toto attestations). Using in-toto standalone would duplicate what cosign already provides. Rejected.

### SBOM + Signing Workflow

```yaml
# _reusable-sbom.yml
steps:
  - name: Generate CycloneDX SBOM
    uses: anchore/sbom-action@v0
    with:
      image: harbor.internal/${{ inputs.service }}:${{ inputs.version }}
      format: cyclonedx-json
      output-file: sbom.cyclonedx.json
      upload-artifact: false  # we manage artifact upload ourselves

  - name: Sign container image (keyless)
    env:
      COSIGN_EXPERIMENTAL: "1"
    run: |
      cosign sign --yes \
        harbor.internal/${{ inputs.service }}@${{ steps.build.outputs.digest }}

  - name: Attest SBOM to image
    env:
      COSIGN_EXPERIMENTAL: "1"
    run: |
      cosign attest --yes \
        --predicate sbom.cyclonedx.json \
        --type cyclonedx \
        harbor.internal/${{ inputs.service }}@${{ steps.build.outputs.digest }}

  - name: SLSA Level 2 provenance
    uses: slsa-framework/slsa-github-generator/.github/workflows/generator_container_slsa3.yml@v2
    with:
      image: harbor.internal/${{ inputs.service }}
      digest: ${{ steps.build.outputs.digest }}

  - name: Store SBOM as artifact and to WORM bucket
    run: |
      SBOM_HASH=$(sha256sum sbom.cyclonedx.json | cut -d' ' -f1)
      aws s3 cp sbom.cyclonedx.json \
        "s3://curaos-audit-worm/${{ inputs.service }}/${{ inputs.version }}/sbom.cyclonedx.json" \
        --storage-class COMPLIANCE  # S3 Object Lock COMPLIANCE mode for HIPAA

  - name: Emit HIPAA audit event (supply chain)
    run: |
      # Emitted to OTel collector → Loki + WORM bucket
      echo '{
        "event_type": "cicd.sbom_signed",
        "service": "${{ inputs.service }}",
        "version": "${{ inputs.version }}",
        "image_digest": "${{ steps.build.outputs.digest }}",
        "sbom_hash": "'"$SBOM_HASH"'",
        "slsa_level": 2,
        "signer_identity": "${{ github.workflow_ref }}",
        "timestamp": "'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'"
      }' | curl -X POST "$OTEL_AUDIT_ENDPOINT" -H "Content-Type: application/json" -d @-
```

---

## 3.11 Integration Test Execution: Testcontainers + vCluster

### Decision

Two-tier test execution:

- **Tier 1 — Per-service, per-PR:** Testcontainers for unit and service-level integration tests. Each service test suite manages its own container dependencies (PostgreSQL, Kafka, Redis, Keycloak mock, etc.) within the ARC runner pod.
- **Tier 2 — Cross-service, E2E:** vCluster for contract tests (Pact provider verification) and end-to-end multi-service scenarios. One vCluster per PR for services with declared cross-service dependencies.

### Tier 1: Testcontainers

**Why Testcontainers:**
- Spring Boot 3.x has first-class Testcontainers integration: `@ServiceConnection` annotation auto-configures `DataSource`, `KafkaTemplate`, `RedisTemplate`, etc. from a running container without manual property overrides.
- Container reuse mode (`testcontainers.reuse.enable=true` in `~/.testcontainers.properties`) reuses running containers across test methods within the same JVM process, reducing cold-start overhead.
- Kotlin-specific: the `KGenericContainer<*>` extension avoids the recursive generic type issue with Java's `GenericContainer<SELF extends GenericContainer<SELF>>`. Testcontainers Kotlin extension library (`org.testcontainers:testcontainers-kotlin`) is adopted.
- Containers are scoped to the test runner pod (ephemeral); no shared state across PRs.
- Docker-in-Docker (dind) or rootless BuildKit + Docker socket: runner pods expose the Docker socket via the `docker` sidecar. Testcontainers connects via `DOCKER_HOST` environment variable.

**Standard container set per service type:**

| Service category | Containers |
|---|---|
| Data services (most services) | PostgreSQL 17, Redis 7 |
| Event-driven services | PostgreSQL 17, Kafka (Redpanda image), Schema Registry (Apicurio) |
| Identity-integrated services | PostgreSQL 17, Keycloak 25 (WireMock for OAuth flows) |
| HealthStack services | PostgreSQL 17, HAPI FHIR (Docker) |

### Tier 2: vCluster for E2E

**Why vCluster over shared staging:**
- Shared staging is flaky: parallel PRs interfere via shared database state, shared Kafka topics, and shared service instances. A test that passes in isolation fails when another PR's canary service is deployed simultaneously.
- vCluster provides full K8s API isolation (namespace + CRD + RBAC isolation within a virtual cluster) at minimal overhead.
- Sleep mode: vClusters consume zero CPU/memory when unused (after 30-minute idle timeout). With 91 services potentially having open PRs, always-running preview environments would exhaust cluster resources.
- Official GitHub Actions integration (vCluster CLI action).

**vCluster E2E workflow:**

```yaml
# _reusable-e2e.yml
steps:
  - name: Create vCluster
    uses: loft-sh/setup-vcluster@v1
    with:
      name: pr-${{ github.event.number }}-${{ inputs.service }}
      namespace: e2e-previews
      wait: true

  - name: Deploy service under test
    run: |
      helm upgrade --install ${{ inputs.service }} \
        oci://harbor.internal/charts/${{ inputs.service }} \
        --version ${{ inputs.version }} \
        --namespace default \
        --set image.tag=${{ inputs.version }} \
        --set image.pullPolicy=IfNotPresent \
        --kubeconfig /tmp/vcluster-kubeconfig.yaml

  - name: Deploy service dependencies (stable versions)
    run: |
      # Deploy only the services listed in the service's dependency manifest
      for dep in $(jq -r '.dependencies[]' service-deps.json); do
        STABLE_VERSION=$(jq -r ".[\"$dep\"]" platform-manifest.json)
        helm upgrade --install "$dep" \
          oci://harbor.internal/charts/$dep \
          --version "$STABLE_VERSION" \
          --kubeconfig /tmp/vcluster-kubeconfig.yaml
      done

  - name: Run Pact contract verification
    run: |
      PACT_BROKER_URL=https://pact-broker.internal \
      PACT_PROVIDER_VERSION=${{ inputs.version }} \
        gradle :${{ inputs.service }}:pactVerify --no-daemon

  - name: Run Playwright E2E tests
    run: |
      PLAYWRIGHT_BASE_URL=https://pr-${{ github.event.number }}.preview.internal \
        npx playwright test --reporter=github

  - name: Destroy vCluster (on PR close or merge)
    if: always() && github.event_name == 'pull_request_target' && github.event.action == 'closed'
    run: |
      vcluster delete pr-${{ github.event.number }}-${{ inputs.service }} \
        --namespace e2e-previews
```

### Pact Contract Testing

Pact Broker is self-hosted (Docker image; PostgreSQL 17 backend; same PG cluster as other services). Pact is used for consumer-driven contract testing between all 91 services. The Pact Broker acts as the central source of truth for contracts.

**Workflow:**
1. Consumer service: generates Pact files during unit tests; publishes to Pact Broker with `gradle pactPublish`.
2. Provider service: fetches Pact files from Broker during CI; verifies them with `gradle pactVerify`. Verification result is published back to Broker.
3. The `can-i-deploy` check in `_reusable-promote.yml` calls `pact-broker can-i-deploy` before any promotion to verify that the service version can safely co-exist with its consumers at the target environment's current versions.
4. Pact Broker webhooks trigger provider verification CI runs when a consumer publishes a new contract.

---

## 3.12 Preview Environments: vCluster per PR with Sleep Mode

### Decision

Every PR touching a service with cross-service dependencies or a frontend package receives a vCluster preview environment. Preview environments are created automatically, enter sleep mode after 30 minutes of inactivity, and are destroyed on PR close or merge.

### Evaluated Options

**vCluster** (selected)

Sleep mode is critical: zero resource consumption when idle. With 91 services and potentially dozens of simultaneous open PRs, always-on preview environments would consume hundreds of GB of RAM and dozens of CPU cores. The vCluster sleep mode (activated by the vCluster Platform controller after a configurable idle timeout) makes per-PR environments economically viable.

Official GitHub Actions integration simplifies lifecycle management.

**Garden**

Strong GitOps-native preview environments with intelligent diff-based rebuilds. Higher setup complexity; steeper learning curve. Community smaller than vCluster's. Garden would be a viable alternative with more mature preview features (e.g., Garden's "local mode" for hot-reloading code changes into a remote cluster). Not adopted at ADR time; tracked as a future option.

**Okteto**

Commercial managed service for the cloud tier; violates SaaS control-plane constraint. Okteto self-hosted is available but introduces operational surface without meaningful advantage over vCluster. Rejected.

**Velero + Crossplane**

Velero handles backup/restore; Crossplane handles infrastructure provisioning. Neither is a preview environment solution on its own. Could be components of a custom preview environment system, but building a custom system is lower-leverage than using vCluster. Rejected.

### Preview Environment Lifecycle

```
PR opened / `preview` label added:
  → `_reusable-preview-env.yml` triggered
  → vCluster created: pr-{number}-{service}.e2e-previews.svc
  → Service deployed via Helm (PR image tag)
  → Dependencies deployed (stable versions from platform manifest)
  → Ingress created: https://pr-{number}.{service}.preview.internal
  → PR comment posted with preview URL + status

PR push (new commits):
  → `_reusable-preview-env.yml` triggered with `update` action
  → Helm upgrade with new image tag
  → vCluster wakes from sleep if necessary

PR idle (30+ minutes, no HTTP traffic to Ingress):
  → vCluster Platform controller activates sleep mode
  → All pods scaled to 0
  → Ingress responds with "sleeping" page
  → Pod count = 0; no resource consumption

First HTTP request to sleeping vCluster:
  → vCluster Platform wakes the virtual cluster
  → Pods restored (10-30 second cold start)
  → Request served

PR closed or merged:
  → `_reusable-preview-env.yml` triggered with `destroy` action
  → vCluster deleted (hard delete; no backup needed)
  → DNS record removed
```

**DNS for preview environments:** `external-dns` controller (already in the cluster per ADR-0109) manages the Ingress DNS entries. Preview environments use a wildcard DNS record on the `.preview.internal` subdomain.

**Resource limits per preview vCluster:**

| Resource | Limit | Notes |
|---|---|---|
| CPU (active) | 8 cores | Across all pods in the vCluster |
| Memory (active) | 16 GB | Across all pods |
| CPU (sleeping) | 0 | Sleep mode: scale to 0 |
| Memory (sleeping) | ~100 MB | vCluster control plane itself (no worker pods) |
| Storage | 20 GB PVC | Deleted on vCluster destroy |
| Max simultaneous active | 10 vClusters | Configurable LimitRange at namespace level |

---

## 3.13 Migration Tests: Atlas Dry-Run + Shadow Validation

### Decision

Every schema migration goes through three sequential gates before production apply:

1. **`atlas migrate lint`** in PR CI — detects destructive changes.
2. **`atlas migrate apply --dry-run`** in the beta pre-deploy step — generates the migration SQL without applying it; stored as a workflow artifact for review.
3. **Shadow validation job** in a dedicated K8s Job — restores the latest production schema snapshot to an ephemeral PG17 pod, applies the migration, and runs data-integrity checks.

### Shadow Validation Detail

The shadow validation job is the most important gate because `atlas migrate lint` can only detect statically-detectable issues (e.g., `DROP COLUMN`). Shadow validation catches issues that only manifest against real data shapes:

- **Row count invariants:** After migration, no table that previously had N rows should have 0 rows (unless the migration explicitly includes a documented data-altering step).
- **FK constraint health:** All foreign key constraints must be valid (no orphaned references) after the migration.
- **Index health:** All indexes must be valid (not `INVALID` status in `pg_indexes`).
- **Constraint satisfaction:** All `CHECK` constraints must be satisfied by existing data.
- **Extension compatibility:** Any PostgreSQL extension used by the service must remain functional after migration.

```yaml
# shadow-validate-job.yaml (K8s Job template)
spec:
  template:
    spec:
      initContainers:
        - name: restore-schema-snapshot
          image: harbor.internal/curaos/pg-snapshot-restore:latest
          command:
            - /bin/sh
            - -c
            - |
              pg_restore \
                --dbname "postgresql://shadow:shadow@shadow-pg:5432/shadow_$SERVICE" \
                /snapshots/${SERVICE}-latest.dump
      containers:
        - name: atlas-migrate
          image: harbor.internal/curaos/atlas:v0.28.0
          command:
            - atlas
            - migrate
            - apply
            - --url=postgresql://shadow:shadow@shadow-pg:5432/shadow_$SERVICE
            - --dir=oci://harbor.internal/migrations/${SERVICE}:${VERSION}
            - --tx-mode=all
        - name: data-integrity-check
          image: harbor.internal/curaos/shadow-validator:latest
          command:
            - /bin/sh
            - -c
            - |
              psql "postgresql://shadow:shadow@shadow-pg:5432/shadow_$SERVICE" \
                -f /validators/${SERVICE}/post-migrate-checks.sql
              # Fail if any check returns a non-zero count
```

Production schema snapshots are taken nightly via `pg_dump --schema-only` and stored in the WORM S3 bucket. The shadow validation job pulls the latest snapshot.

**HAPI FHIR exclusion:** Shadow validation skips the FHIR database. The HAPI FHIR team is responsible for validating HAPI FHIR's own Liquibase migrations; CuraOS does not own that schema.

---

## 3.14 Submodule Release Coordination: Hybrid Platform + Per-Service Semver

### Decision

Two-track versioning coexists:

- **Track A — Per-service independent semver:** Each of the 91 backend services and ~25 frontend packages has its own semantic version managed by release-please / changesets. Services release when ready, independently of each other.
- **Track B — Platform CalVer manifest:** The meta-repo cuts a platform release on a monthly cadence (stable), weekly cadence (beta), and continuous cadence (canary). The platform release is a `platform-manifest.json` that declares tested, compatible versions of all components.

### Why Not Full Monorepo Atomic Release

A single atomic release across 91 services would require:
- A single large monorepo (ruled out: teams own independent submodule repos), OR
- A dependency graph resolver that determines which services need to be released together and in what order (complex; brittle; creates coordination bottlenecks).

The hybrid approach gives teams autonomy (Track A) while providing customers and on-premises operators a stable, tested platform version as the deployment unit (Track B).

### Why Not Fully Independent Per-Service Releases

Air-gap and on-premises customers cannot continuously update. They need a point-in-time tested bundle where all component versions have been verified to work together. The platform manifest (Track B) serves this need without blocking individual service velocity.

### Promotion Flow

```
Track A (per-service):
  service PR merged
    → build CI: test + SBOM + sign
    → release-please opens release PR
    → team merges release PR
    → service N.M.P published to Nexus + Harbor
    → SHA-pin PR opened in meta-repo
    → cross-service contract tests (Pact)
    → SHA pin merged → canary manifest updated

Track B (platform):
  Nightly: canary manifest = latest SHA pin of each service on main
  Weekly: beta manifest = canary manifest snapshot if canary health gates pass
  Monthly: stable manifest = beta manifest if beta signoff obtained
    → stable manifest signed as OCI artifact
    → air-gap bundle assembled from stable manifest
    → bundle delivered to on-premises + air-gap sites
```

### Platform Manifest Schema

See Appendix B for the full `platform-manifest.json` schema.

### release-please Platform Configuration

```json
// release-please-config.json in meta-repo
{
  "release-type": "calendar-versioning",
  "versioning": "calendar-versioning",
  "calendar-versioning-scheme": "YYYY.N",
  "packages": {
    ".": {
      "changelog-path": "CHANGELOG.md",
      "release-type": "calendar-versioning",
      "extra-files": ["platform-manifest.json"]
    }
  }
}
```

---

## 3.15 Documentation Publishing: Backstage TechDocs + MkDocs Material

### Decision

**Backstage TechDocs** with MkDocs Material rendering provides the internal developer portal for all 91 services. **MkDocs Material standalone** handles external/customer-facing documentation. GitHub Pages is used only as a secondary publish target for open-source components.

### Evaluated Options

**Backstage TechDocs** (selected for internal portal)

Backstage is already the planned service catalog (referenced in ADR-0109 for cluster dashboards and service registry). TechDocs adds documentation rendering to Backstage: each service's `docs/` directory (MkDocs Material-formatted) is built by the TechDocs builder and stored in object storage (Harbor or S3-compatible). The Backstage frontend renders the docs inline with the service catalog entry.

By 2026, Backstage powers developer portals at 3,000+ companies (CNCF data); it is the de facto internal developer portal standard. TechDocs is the path of least resistance for documentation that co-exists with the service catalog.

Production deployment: two Backstage backend instances — a general backend (catalog, auth, scaffolder plugins) and a dedicated TechDocs backend (docs build + serve). This split prevents a slow documentation build from impacting catalog API latency.

**MkDocs Material standalone** (selected for external docs)

Customer-facing documentation (integration guides, API references, operator manuals) is authored in MkDocs Material and built as a static site. The static output is hosted on NGINX in a K8s pod for on-premises deployments; on GitHub Pages for cloud (CDN-fronted). The same `docs/` content from each service repo feeds both TechDocs (internal) and the MkDocs build (external) where applicable.

**Docusaurus**

React-based; stronger versioned documentation story; better for documentation sites with complex navigation trees. Heavier than MkDocs for pure documentation. Adopted at CuraOS only if MkDocs Material proves insufficient for the customer-facing docs site. Not adopted at ADR time.

**GitHub Pages alone**

No on-premises or air-gap deployment mode for the documentation site itself. Acceptable for public documentation only. Not sufficient as the sole documentation platform.

**Confluence**

Commercial; not self-hostable under acceptable license terms for all deployment tiers (cloud Confluence SaaS; Data Center edition requires commercial license). Rejected.

### TechDocs Per-Service Requirement

Every service submodule must contain:

```
<service-repo>/
  catalog-info.yaml           # Backstage entity descriptor
  docs/
    index.md                  # Overview, links to other sections
    architecture.md           # Component diagram, data flow
    api-contract.md           # Links to OpenAPI / AsyncAPI specs
    runbook.md                # Operational runbook (alerts, on-call)
    schema.md                 # Database schema overview
    events.md                 # Events produced and consumed
    dependencies.md           # Service dependencies and Pact contracts
  mkdocs.yml                  # MkDocs config (site_name, nav, theme)
```

The CI lint check in `_reusable-lint-ci.yml` verifies the presence of `docs/index.md`, `catalog-info.yaml`, and `mkdocs.yml`. Missing files fail the build.

**TechDocs publish workflow** (`_reusable-techdocs-publish.yml`):

```yaml
steps:
  - name: Build TechDocs
    run: |
      npx @techdocs/cli generate \
        --source-dir . \
        --output-dir site/

  - name: Publish to TechDocs storage
    run: |
      npx @techdocs/cli publish \
        --publisher-type awsS3 \
        --storage-name curaos-techdocs \
        --entity default/Component/${{ inputs.service_name }} \
        --directory site/
```

---

## 4. Reusable Workflow Catalog

The following table lists all reusable workflows, their triggering contexts, inputs, and outputs. This is the authoritative reference for service teams writing caller workflows.

| Workflow | Trigger | Key inputs | Key outputs | Notes |
|---|---|---|---|---|
| `_reusable-build-jvm.yml` | PR push, merge to main | `service_name`, `gradle_tasks` | `image_digest`, `sbom_hash` | Calls security-scan, sbom, publish-image |
| `_reusable-build-frontend.yml` | PR push, merge to main | `package_name`, `build_cmd` | `artifact_path`, `sbom_hash` | Handles Bun (Expo+Next+Astro) |
| `_reusable-publish-image.yml` | Called by build workflows | `image`, `digest`, `version` | `harbor_uri` | Pushes to Harbor; OIDC auth via Vault |
| `_reusable-deploy-canary.yml` | Merge to main | `service_name`, `version` | `canary_url` | Helm upgrade; waits for rollout |
| `_reusable-promote.yml` | Manual dispatch; schedule | `from_env`, `to_env`, `service`, `version` | `promoted_version` | Includes Pact can-i-deploy, Unleash flag check |
| `_reusable-schema-migrate.yml` | After canary deploy | `service_name`, `environment`, `db_url_secret` | `migration_result` | Atlas apply + HIPAA audit event |
| `_reusable-security-scan.yml` | Called by build workflows | `image`, `source_path` | `scan_result` | Trivy + Grype + Semgrep (ADR-0108) |
| `_reusable-sbom.yml` | Called by build workflows | `image`, `digest`, `version` | `sbom_hash`, `attestation_uri` | Syft + cosign attest |
| `_reusable-e2e.yml` | PR (labeled `e2e`) | `service_name`, `version`, `dep_manifest` | `e2e_result` | vCluster + Pact + Playwright |
| `_reusable-air-gap-bundle.yml` | Stable release | `platform_version`, `manifest_path` | `bundle_path`, `bundle_hash` | OCI export + GPG sign |
| `_reusable-lint-commit.yml` | PR push | — | — | commitlint; fails on non-conventional commits |
| `_reusable-lint-ci.yml` | PR push | `caller_workflow_path` | — | Fails if caller > 50 lines or calls non-meta workflow |
| `_reusable-contract-test.yml` | PR push; submodule SHA-pin PR | `service_name`, `pact_broker_url` | `can_deploy` | Pact provider verification + publish |
| `_reusable-schema-compat.yml` | PR touching AsyncAPI schemas | `schema_path`, `registry_url` | `compat_result` | Apicurio compatibility check (ADR-0102) |
| `_reusable-api-breaking.yml` | PR touching OpenAPI specs | `spec_path`, `base_ref_spec` | `breaking_changes` | OpenAPI breaking-change detection (ADR-0103) |
| `_reusable-atlas-diff.yml` | PR touching db/ | `service_name`, `dev_db_url` | `migration_sql_preview` | Atlas lint + diff; posts SQL preview as PR comment |
| `_reusable-preview-env.yml` | PR open/push/close | `action` (create/update/destroy), `service_name` | `preview_url` | vCluster lifecycle |
| `_reusable-techdocs-publish.yml` | Merge to main | `service_name` | — | TechDocs build + S3 publish |

---

## 5. Cross-Cutting Concerns

### 5.1 HIPAA Audit Pipeline

Every CI/CD action that touches production infrastructure, production data, or production secrets emits a structured audit event. The audit pipeline:

```
GitHub Actions step → HTTP POST to OTel Collector (OTLP/HTTP)
                      → OTel Collector
                            ├── Forward to Grafana Loki (structured log)
                            └── Forward to S3 WORM bucket (immutable, COMPLIANCE mode)

S3 WORM bucket:
  - Object Lock mode: COMPLIANCE (cannot be deleted or modified for 7 years)
  - Encryption: SSE-KMS (customer-managed KMS key in Vault)
  - Bucket versioning: enabled
  - Access logging: enabled (audit of audit access)
```

See Appendix C for the full audit event schema.

### 5.2 Secret Management Integration (ADR-0104)

All secrets used in CI/CD workflows are retrieved from HashiCorp Vault at runtime:

- DB credentials: `vault kv get secret/cicd/<service>/db`
- Harbor credentials: `vault kv get secret/cicd/harbor/push` — accessible only to `_reusable-publish-image.yml` via `job_workflow_ref` OIDC claim verification
- Nexus credentials: `vault kv get secret/cicd/nexus/upload` — accessible only to publish workflows
- Customer GPG key (for air-gap bundles): `vault kv get secret/delivery/gpg/<tenant-id>`
- Pact Broker token: `vault kv get secret/cicd/pact-broker/write-token`
- Unleash admin token: `vault kv get secret/cicd/unleash/admin-token`

No secrets are stored in GitHub repository-level Secrets for any production environment. GitHub Actions Secrets are used only for:
- `VAULT_ADDR` (non-secret; Vault address for OIDC auth)
- `VAULT_ROLE` (non-secret; Vault JWT auth role name)
- Development/staging non-sensitive tokens (e.g., Nexus SNAPSHOT upload token)

### 5.3 Network Policy for ARC Runners

The `arc-runners-scan` namespace has an egress-restricted NetworkPolicy: outbound traffic is allowed only to the Harbor registry, the Nexus artifact registry, the Trivy/Grype vulnerability database mirror, and the GitHub Actions Service endpoint. No other egress is permitted. This isolates vulnerability scanning from potentially reaching exfiltration destinations if a malicious dependency is executed during the scan.

### 5.4 Branch Protection Rules

All 91 service repos and the meta-repo enforce the following GitHub branch protection rules on `main`:

- Require pull request before merging (no direct push)
- Require status checks: `build`, `lint`, `security-scan`, `contract-test`, `sbom`
- Require branches to be up to date before merging
- Require signed commits (GPG or SSH signature; Sigstore Gitsign is acceptable)
- Dismiss stale reviews on push
- Require review from `team:platform-engineering` for changes to `.github/` directory
- Do not allow force pushes
- Do not allow deletions

### 5.5 Dependency on ADR-0109 (Container Tooling)

This ADR assumes the following from ADR-0109 are operational:
- Harbor registry accessible at `harbor.internal` (or equivalent DNS).
- ArgoCD or FluxCD installed on the production K8s cluster, configured to sync from Harbor OCI artifacts.
- cert-manager and external-dns are available for preview environment Ingress.
- The K8s cluster has sufficient node capacity for: 20 ARC build runners + 10 ARC E2E runners + 10 simultaneous vCluster preview environments.

### 5.6 Dependency on ADR-0107 (Observability)

Audit events are forwarded to the OTel collector via OTLP/HTTP. The OTel collector is deployed per ADR-0107 with a receiver configured for `otlp/http` on port 4318. The receiver forwards to Loki (structured logs) and to the S3 WORM bucket (audit retention).

The CI/CD audit events use the `curaos.audit` instrumentation scope so they can be filtered in Grafana independently of application telemetry.

---

## 6. Rejected Patterns (Global)

**Full GitOps CD only (no GitHub Actions CD steps):** ArgoCD / FluxCD handles K8s reconciliation. GitHub Actions retains orchestration of pre-deployment gates: SBOM, signing, contract tests, shadow migration validation, HIPAA audit emit. The boundary is intentional: GitHub Actions is the policy enforcement point; ArgoCD / FluxCD is the reconciliation mechanism. Do not collapse these.

**Per-repo CI configuration:** Service repos contain only caller workflows (≤50 lines). No build logic, security gate configuration, or signing configuration lives in individual service repos. Policy bypass via adding CI steps to individual service repos is blocked by `_reusable-lint-ci.yml`.

**SaaS-only tools on the critical deployment path:** LaunchDarkly, Buildkite managed, Nx Cloud managed, Develocity managed SaaS, JFrog Artifactory Cloud, Cloudsmith — all rejected for any step that gates a production deployment. Developer-experience-only tools (not on the deployment critical path) may be SaaS if explicitly approved.

**Long-lived feature branches:** Trunk-based development is the mandated model. No release branches; no `develop` branch. All work merges to `main` within two working days. Feature flags (Unleash) replace long-lived feature branches as the mechanism for incomplete-feature isolation.

**Direct database access in CI:** CI workflows access the database only through Atlas (for migration) and the shadow validator. No ad-hoc psql connections with broad credentials. Database credentials are scoped to the migration role with `ALTER TABLE`, `CREATE INDEX`, `DROP CONSTRAINT` privileges; not owner-level.

**Amending or force-pushing commits on shared branches:** Prohibited. Conventional commit fixups land as new commits (`revert:` or `fix:` type). release-please handles the version bump based on the cumulative commit history.

---

## 7. Implementation Sequence

### Phase 1: Foundation (Weeks 1–4)

**Goal:** ARC runners operational; Nexus and Gradle cache serving artifacts; first 5 pilot services on reusable workflows.

| Task | Owner | Week |
|---|---|---|
| Deploy ARC scale set controller (Helm) on K8s | Platform Eng | 1 |
| Build and publish custom runner image to Harbor | Platform Eng | 1 |
| Configure ARC scale sets: `build`, `e2e`, `scan` namespaces | Platform Eng | 1 |
| Deploy Nexus Repository OSS 3 on K8s; configure proxy repos | Platform Eng | 2 |
| Deploy Gradle Build Cache Node; configure runner image `gradle.properties` | Platform Eng | 2 |
| Create 10 core reusable workflows in meta-repo | Platform Eng | 2–3 |
| Validate reusable workflows with 5 pilot backend services | Platform Eng + 5 service teams | 3–4 |
| Deploy Unleash server + Unleash Edge on K8s | Platform Eng | 3 |
| Integrate OpenFeature Java SDK into Kotlin service template | Platform Eng | 4 |
| Deploy Pact Broker on K8s | Platform Eng | 4 |

### Phase 2: Security + Release Automation (Weeks 5–8)

**Goal:** Cosign signing, SBOM, SLSA Level 2, release-please, and Atlas on pilot services.

| Task | Owner | Week |
|---|---|---|
| Integrate cosign keyless signing into `_reusable-publish-image.yml` | Platform Eng | 5 |
| Integrate Syft SBOM generation into `_reusable-sbom.yml` | Platform Eng | 5 |
| Configure SLSA Level 2 via `slsa-github-generator` reusable workflow | Platform Eng | 5 |
| Enable release-please on 10 pilot services | Platform Eng | 6 |
| Enable git-cliff changelog on meta-repo | Platform Eng | 6 |
| Deploy Atlas; migrate 5 pilot services from Flyway / manual SQL | Service teams + Platform Eng | 6–7 |
| Enable Renovate self-hosted on all 91 repos | Platform Eng | 7 |
| Enable Pact contract testing on 5 pilot service pairs | Service teams | 7–8 |
| Enable commitlint enforcement on all 91 repos | Platform Eng | 8 |

### Phase 3: Preview Environments + Air-Gap (Weeks 9–14)

**Goal:** vCluster previews operational; first air-gap bundle delivered and validated.

| Task | Owner | Week |
|---|---|---|
| Deploy vCluster Platform (Helm); configure sleep mode | Platform Eng | 9 |
| Implement `_reusable-e2e.yml` with vCluster + Playwright | Platform Eng | 9–10 |
| Validate E2E workflow on 2 frontend packages + 2 backend services | Platform Eng + teams | 10–11 |
| Implement `_reusable-air-gap-bundle.yml` | Platform Eng | 11 |
| Produce first test air-gap bundle (platform v2026.1-test) | Platform Eng | 11 |
| Validate bundle at simulated air-gap site (network-isolated K8s namespace) | Platform Eng | 12 |
| Implement `_reusable-preview-env.yml` (per-PR vCluster lifecycle) | Platform Eng | 12–13 |
| Enable per-PR previews for all frontend packages | Platform Eng | 13–14 |
| HIPAA audit pipeline: verify end-to-end (deploy → OTel → Loki → WORM) | Platform Eng + Compliance | 14 |

### Phase 4: Full Rollout + Stabilization (Weeks 15–20)

**Goal:** All 91 services on reusable workflows; Atlas migrations fully adopted; first stable platform release.

| Task | Owner | Week |
|---|---|---|
| Roll out release-please to all 91 services | Platform Eng | 15–16 |
| Roll out Atlas migrations to all services (non-FHIR boundary) | Service teams | 15–17 |
| Enable per-PR vCluster previews for all cross-service integration targets | Platform Eng | 16 |
| Complete Backstage TechDocs integration; enable docs lint gate for all services | Platform Eng | 17 |
| Run first full stable platform release (`platform-manifest.json` v2026.1) | Platform Eng | 18 |
| Deliver first customer air-gap bundle (v2026.1 stable) | Platform Eng + Customer Success | 18–19 |
| HIPAA audit trail review with compliance team | Compliance + Platform Eng | 19 |
| Plan Develocity Edge migration (Gradle Build Cache Node EOL by 2026-12-31) | Platform Eng | 20 |
| Retrospective: cache hit rates, runner utilization, release cadence metrics | Platform Eng | 20 |

---

## 8. Definition of Done

This ADR is operationally complete when all of the following are verified:

**CI/CD Platform:**
- [ ] All 18 reusable workflows are deployed and passing on the pilot service set (≥5 services).
- [ ] ARC runner scale sets are autoscaling (0 → N → 0) in `build`, `e2e`, and `scan` namespaces.
- [ ] Caller workflow lint gate (`_reusable-lint-ci.yml`) rejects a caller file > 50 lines.
- [ ] Action SHA pinning is enforced at the organization level (GitHub Actions policy, GA Aug 2025).

**Build Cache:**
- [ ] Gradle Build Cache Node is operational; cache hit rate > 60% on warmed runs measured by `setup-gradle` action output.
- [ ] BuildKit `type=registry` cache in Harbor is configured; cold-start image build time is < 3 minutes; warm build time is < 60 seconds (measured on the most complex service image).

**Artifact Registry:**
- [ ] Nexus Repository OSS 3 is serving Maven artifacts for all 91 services (SNAPSHOT + release repos).
- [ ] Proxy repos for Maven Central and Gradle Plugin Portal are operational; builds succeed with no outbound internet access (validated in isolated test namespace).

**Feature Flags + Release Channels:**
- [ ] Unleash server + Unleash Edge are operational in all three environments (canary, beta, stable).
- [ ] OpenFeature Java SDK is integrated in the Kotlin service template and validated in two production services.
- [ ] Canary rollout strategy is exercised for one feature flag: gradual rollout from 0% → 10% → 50% → 100% across canary environment, with flag state recorded in HIPAA audit event at each promotion step.

**Versioning + Changelog:**
- [ ] release-please is cutting releases for all 91 services on merge to main.
- [ ] git-cliff is generating CHANGELOG.md for all service repos and the meta-repo.
- [ ] changesets is managing versioning for all frontend Bun workspace packages.

**Schema Migration:**
- [ ] Atlas manages schema migrations for all non-FHIR databases; zero Flyway or manual SQL migration processes remain in any service CI.
- [ ] Atlas `migrate lint` destructive-change detection is enforced on every PR touching `db/` in all services.
- [ ] Shadow validation job is operational and has caught at least one migration issue in testing.
- [ ] HAPI FHIR boundary is enforced: the `_reusable-lint-ci.yml` check verifies that FHIR services do not reference `_reusable-schema-migrate.yml`.

**Multi-Repo Coordination:**
- [ ] Renovate self-hosted is active on all 91 repos with dependency dashboard operational in the meta-repo.
- [ ] Renovate auto-merge is functional for patch updates (green CI → auto-merge without human review).
- [ ] Submodule SHA-pin workflow is operational; at least one SHA-pin update has gone through the full pipeline (service release → contract test → auto-merge in meta-repo).

**SBOM + Signing:**
- [ ] Every build produces a cosign-signed image digest verifiable via `cosign verify`.
- [ ] Every build produces a CycloneDX SBOM attested to the image digest verifiable via `cosign verify-attestation --type cyclonedx`.
- [ ] SLSA Level 2 provenance is verifiable for at least 10 production-deployed services via `cosign verify-attestation --type slsaprovenance`.
- [ ] SLSA Level 3 upgrade plan is documented and scheduled (target: platform release 2026.7 or later).

**Air-Gap Delivery:**
- [ ] First complete air-gap bundle is produced, signed (cosign + GPG), and transferred to the simulated air-gap site.
- [ ] Full installation (images + Helm + migrations + flags) is validated in the simulated air-gap site with zero outbound internet access.
- [ ] Cosign offline verification (`--bundle`) works against all bundle artifacts without reaching Rekor or Fulcio.

**Integration Testing:**
- [ ] Testcontainers integration is operational in all 91 services using the `@ServiceConnection` pattern (Spring Boot 3.x).
- [ ] vCluster E2E environments are operational for at least 5 cross-service integration targets.
- [ ] Pact Broker is operational; at least 5 service consumer-provider pairs have active contract verification in CI.
- [ ] `can-i-deploy` check is enforced in `_reusable-promote.yml` for all services with active Pact contracts.

**Preview Environments:**
- [ ] Per-PR vCluster preview environments are operational for all frontend packages (React, Flutter, Astro).
- [ ] Sleep mode is verified: idle vCluster consumes 0 CPU and < 150 MB RAM.
- [ ] Preview URL is posted to PR comment automatically; Playwright E2E tests run against the preview URL.

**HIPAA Audit:**
- [ ] Deploy, schema-migrate, SBOM-signed, and flag-change audit events are verified end-to-end: GitHub Actions step → OTel collector → Grafana Loki (queryable) AND S3 WORM bucket (object lock COMPLIANCE mode, KMS encrypted).
- [ ] Compliance team has reviewed and approved the audit trail format and retention configuration.
- [ ] WORM bucket access logging is operational (audit of audit access).

**Documentation:**
- [ ] Backstage TechDocs renders documentation for all services; all services have `docs/index.md`, `catalog-info.yaml`, and `mkdocs.yml`.
- [ ] Docs lint gate (`_reusable-lint-ci.yml`) is enforced on all service repos; at least one build has failed due to missing docs and been remediated.

**Operational Risk Mitigation:**
- [ ] Gradle Build Cache Node EOL migration plan to Develocity Edge is documented, scheduled for Q3 2026, and tracked in the platform roadmap.
- [ ] Nexus OSS active-passive HA with PV snapshot BCDR is operational and tested (restore drill completed).

---

## Appendix A — Workflow Reference Skeletons

### A.1 Minimal JVM Caller Workflow (≤50 lines)

```yaml
# <service-repo>/.github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build:
    uses: curaos-workspace/.github/workflows/_reusable-build-jvm.yml@main
    with:
      service_name: identity-service
      gradle_tasks: "build test"
    secrets: inherit

  deploy-canary:
    needs: build
    if: github.ref == 'refs/heads/main'
    uses: curaos-workspace/.github/workflows/_reusable-deploy-canary.yml@main
    with:
      service_name: identity-service
      version: ${{ needs.build.outputs.version }}
    secrets: inherit

  migrate-schema:
    needs: deploy-canary
    uses: curaos-workspace/.github/workflows/_reusable-schema-migrate.yml@main
    with:
      service_name: identity-service
      environment: canary
    secrets: inherit
```

### A.2 Promotion Workflow (meta-repo)

```yaml
# curaos-workspace/.github/workflows/promote-to-beta.yml
name: Promote to Beta

on:
  schedule:
    - cron: '0 2 * * 1'  # Every Monday at 02:00 UTC
  workflow_dispatch:
    inputs:
      service_name:
        required: true
        description: "Service to promote (or 'all' for platform release)"

jobs:
  promote:
    uses: ./.github/workflows/_reusable-promote.yml
    with:
      from_env: canary
      to_env: beta
      service_name: ${{ github.event.inputs.service_name || 'all' }}
    secrets: inherit
```

---

## Appendix B — Platform Manifest Schema

```json
{
  "$schema": "https://curaos.io/schemas/platform-manifest/v1",
  "platform_version": "2026.5",
  "channel": "stable",
  "released_at": "2026-05-24T00:00:00Z",
  "released_by": "platform-release-workflow",
  "workflow_run_url": "https://github.com/curaos-workspace/actions/runs/12345",
  "attestation_uri": "https://rekor.sigstore.dev/api/v1/log/entries?logIndex=...",
  "services": {
    "identity-service": {
      "version": "3.4.1",
      "image": "harbor.internal/curaos/identity-service",
      "digest": "sha256:abc123...",
      "chart": "harbor.internal/charts/identity-service",
      "chart_version": "3.4.1",
      "sbom_hash": "sha256:def456...",
      "slsa_level": 2
    },
    "workflow-service": {
      "version": "2.1.0",
      "image": "harbor.internal/curaos/workflow-service",
      "digest": "sha256:ghi789...",
      "chart": "harbor.internal/charts/workflow-service",
      "chart_version": "2.1.0",
      "sbom_hash": "sha256:jkl012...",
      "slsa_level": 2
    }
  },
  "frontend": {
    "curaos-shell": {
      "version": "4.2.0",
      "image": "harbor.internal/curaos/shell",
      "digest": "sha256:mno345...",
      "sbom_hash": "sha256:pqr678..."
    }
  },
  "infrastructure": {
    "postgres_version": "17",
    "kafka_version": "3.9",
    "redis_version": "7.4",
    "keycloak_version": "25.0"
  },
  "compatibility": {
    "min_kubernetes_version": "1.30",
    "min_helm_version": "3.15"
  }
}
```

---

## Appendix C — HIPAA Audit Event Schema

```json
{
  "$schema": "https://curaos.io/schemas/audit-event/v1",
  "event_id": "<UUIDv7>",
  "event_type": "cicd.deploy | cicd.schema_migrate | cicd.secret_rotate | cicd.flag_change | cicd.sbom_signed | cicd.bundle_delivered",
  "timestamp": "<ISO8601 UTC>",
  "actor": {
    "type": "github_actions_workflow",
    "workflow": "<workflow name>",
    "workflow_ref": "<workflow_ref (job_workflow_ref from OIDC token)>",
    "run_url": "<https://github.com/.../actions/runs/N>",
    "triggered_by": "<github login of human who triggered or merged PR>",
    "oidc_subject": "<sub claim from OIDC token>"
  },
  "artifact": {
    "service": "<service name>",
    "version": "<semver>",
    "image_digest": "<sha256:...>",
    "sbom_hash": "<sha256 of CycloneDX SBOM JSON>",
    "chart_version": "<helm chart semver>",
    "nexus_coordinates": "<groupId:artifactId:version>"
  },
  "environment": "canary | beta | stable | on-prem-<tenant-id> | air-gap-<tenant-id>",
  "slsa_level": 2,
  "attestation_uri": "<Rekor log URI or 'offline-bundle:<hash>'>",
  "flag_state": {
    "flag_name": "<unleash flag name>",
    "strategy": "<rollout strategy>",
    "rollout_pct": 100,
    "environment": "canary"
  },
  "migration": {
    "migration_hash": "<sha256 of migration SQL files>",
    "migrations_applied": ["V001__create_patients.sql", "V002__add_index.sql"],
    "rollback_script_hash": "<sha256 of rollback SQL>"
  },
  "outcome": "success | failure | dry-run",
  "detail": "<human-readable summary>",
  "retention_class": "HIPAA-7Y"
}
```

All audit events are:
1. Forwarded to OTel Collector → Grafana Loki (searchable, 90-day hot retention).
2. Written to S3 WORM bucket in Object Lock COMPLIANCE mode (immutable for 7 years).
3. Encrypted at rest with SSE-KMS using a customer-managed KMS key stored in Vault.
4. The S3 bucket itself has access logging enabled; access logs go to a separate WORM bucket.

---

## Appendix D — Known Operational Risks

| Risk | Severity | Mitigation | Deadline |
|---|---|---|---|
| Gradle Build Cache Node EOL 2026-12-31 | High | Migrate to Develocity Edge (self-hosted) by Q3 2026. Develocity Edge is the same cache service, repackaged. Budget for Develocity license if required. | Q3 2026 |
| ARC legacy mode deprecated in v0.10.0 | Medium | Already using scale set mode (this ADR mandates scale set mode). No action needed; verify ARC version on upgrade to confirm legacy mode is not accidentally used. | Ongoing |
| Nexus OSS lacks native HA | Medium | Deploy active-passive with PV snapshots (nightly). Nexus Pro or Nexus Repository Manager (commercial) provides cluster HA. Budget review for Pro if OSS recovery time (< 15 min) proves insufficient. | Q2 2026 |
| Unleash Server single point of failure | Medium | Unleash Edge caches flags locally; flag evaluation continues if Unleash Server is down. Flag changes do not propagate until Server recovers. Acceptable for release-channel use case; not acceptable for kill-switch latency. Mitigate: Unleash Server deployed with K8s Deployment replicas=2 + PG HA. | Phase 1 |
| Atlas declarative migration on complex schemas | Low | Atlas handles 98%+ of DDL automatically. The remaining 2% (complex partitioning, custom operators, exotic extensions) requires manual migration scripts alongside declarative definitions. Document known exceptions in `schema/manual-exceptions.md` per service. | Ongoing |
| 91 SHA-pin PRs overwhelming reviewers | Medium | Renovate grouping + auto-merge for patches. Minor/major require review. Dependency Dashboard gives single pane of glass. If PR volume is still high after 60 days, implement a PR queue manager. | Q3 2026 review |
| vCluster capacity exhaustion during high-PR-volume periods | Low | Resource limits and max-simultaneous-vCluster limits enforced at namespace level. Queue-based provisioning: if limit is reached, new PR waits for a slot. Alert fires at 80% capacity. | Phase 3 |
| Sigstore public infrastructure unavailability during signing | Low | GHA OIDC → Fulcio → Rekor outage would prevent keyless signing. Mitigation: key-based signing fallback configured (offline key in Vault, activated by manual workflow input). Air-gap sites always use key-based signing. | Phase 2 |
| Atlas schema drift in HAPI FHIR boundary | Low | Drift detection only runs on CuraOS-owned schemas. HAPI FHIR schema drift is not monitored by Atlas; this is intentional. Document clearly: FHIR schema drift is HAPI FHIR's operational responsibility. | Ongoing |
| Renovate self-hosted GitHub App token rotation | Low | The Renovate GitHub App token is a long-lived token. Rotate on a 90-day schedule via Vault. Renovate has a built-in retry mechanism for transient auth failures. | Q4 2026 |

---

## References

- [Actions Runner Controller — GitHub](https://github.com/actions/actions-runner-controller)
- [ARC Docs — GitHub](https://docs.github.com/en/actions/concepts/runners/actions-runner-controller)
- [ARC Autoscaling — oneuptime.com (2026)](https://oneuptime.com/blog/post/2026-02-09-github-actions-self-hosted-runners-k8s/view)
- [Atlas vs Flyway/Liquibase — atlasgo.io](https://atlasgo.io/atlas-vs-others)
- [Atlas declarative workflow — atlasgo.io](https://atlasgo.io/use-cases/modernize-database-migrations)
- [Bytebase schema tool evolution 2026 — bytebase.com](https://www.bytebase.com/blog/top-database-schema-change-tool-evolution/)
- [SLSA Level 3 with GitHub Actions — github.blog](https://github.blog/security/supply-chain-security/slsa-3-compliance-with-github-actions/)
- [Supply chain security 2025 — faithforgelabs.com](https://faithforgelabs.com/blog_supplychain_security_2025.php)
- [Cosign offline verification — some-natalie.dev](https://some-natalie.dev/blog/cosign-disconnected/)
- [Harbor as universal OCI hub — goharbor.io](https://goharbor.io/blog/harbor-as-universal-oci-hub/)
- [Helm OCI signing guide — devopsie.com (2025)](https://devopsie.com/2025-10-14/goodbye-index-yaml-hello-oci-a-hands-on-helm-guide-to-pushing-and-signing-your-charts.html)
- [OpenFeature feature flags comparison 2026 — flagshark.com](https://flagshark.com/blog/open-source-feature-flag-tools-compared-2026/)
- [Unleash self-hosted — getunleash.io](https://www.getunleash.io/)
- [Unleash trunk-based development guide — docs.getunleash.io](https://docs.getunleash.io/guides/trunk-based-development)
- [vCluster preview environments — vcluster.com](https://www.vcluster.com/blog/ephemeral-pr-environment-using-vcluster)
- [vCluster GitHub Actions integration — vcluster.com](https://www.vcluster.com/docs/vcluster/third-party-integrations/github-actions/preview-environments)
- [Testcontainers with Spring Boot and Kotlin — rieckpil.de](https://rieckpil.de/testing-spring-boot-applications-with-kotlin-and-testcontainers/)
- [vCluster + GitOps + Testkube — testkube.io](https://testkube.io/blog/ephemeral-test-environments-with-vcluster-gitops-testkube)
- [Renovate vs Dependabot 2026 — appsecsanta.com](https://appsecsanta.com/sca-tools/dependabot-vs-renovate)
- [Renovate monorepo — dev.to](https://dev.to/alex_aslam/renovate-vs-dependabot-which-bot-will-rule-your-monorepo-4431)
- [Nexus vs Artifactory — sonatype.com](https://www.sonatype.com/compare/sonatype-nexus-versus-jfrog-artifactory)
- [release-please vs semantic-release vs changesets — oleksiipopov.com](https://oleksiipopov.com/blog/npm-release-automation/)
- [Develocity Build Cache Node EOL — docs.gradle.com](https://docs.gradle.com/build-cache-node/)
- [Develocity 2026.1 — gradle.com](https://gradle.com/develocity/releases/2026.1)
- [GitHub Actions cache 10 GB — orgs/community discussion](https://github.com/orgs/community/discussions/66699)
- [Syft + Grype SBOM — medium.com](https://medium.com/@0xdele/securing-your-software-pipeline-generating-sboms-and-scanning-for-vulnerabilities-in-github-4703f0049ac1)
- [SBOM supply chain security 2025 — medium.com](https://medium.com/@bhpuri/github-actions-series-41-github-actions-for-software-supply-chain-security-and-sbom-18ff7f998a49)
- [GitHub Actions 2026 security roadmap — github.blog](https://github.blog/news-insights/product-news/whats-coming-to-our-github-actions-2026-security-roadmap/)
- [GitHub Actions security best practices — stepsecurity.io](https://www.stepsecurity.io/blog/github-actions-security-best-practices)
- [Pact contract testing Spring Boot — frugaltesting.com](https://www.frugaltesting.com/blog/how-pact-is-integrated-with-spring-boot-the-unique-guide)
- [Pact + Testcontainers — prgrmmng.com](https://prgrmmng.com/contract-testing-with-testcontainers-and-pact)
- [Backstage TechDocs + Kubernetes — medium.com](https://medium.com/codetodeploy/i-built-a-self-service-microservice-platform-with-backstage-argocd-github-actions-2037f46a3b50)
- [Backstage TechDocs architecture — backstage.io](https://backstage.io/docs/features/techdocs/architecture/)
- [Feature flags + trunk-based development 2025 — featbit.co](https://www.featbit.co/articles2025/trunk-based-development-feature-flags-2025)
- [SLSA Level 3 build provenance K8s — oneuptime.com (2026)](https://oneuptime.com/blog/post/2026-02-09-slsa-level3-build-provenance/view)
- [Flyway vs Atlas 2026 — toolradar.com](https://toolradar.com/blog/best-database-migration-tools)
