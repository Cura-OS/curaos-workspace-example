---
name: curaos-image-build-rule
title: Image build (BuildKit dev/CI + Buildah air-gap)
description: Container image build - BuildKit via docker buildx for dev + GitHub Actions CI; Buildah for in-cluster ephemeral builds + air-gap on-prem (daemonless rootless); same OCI Dockerfile both; cosign signing + SBOM (syft) mandatory; Kaniko banned (Google archived June 2025)
metadata:
  node_type: memory
  type: feedback
  originSessionId: 957dade0-7133-4262-addf-0595f6326c47
---

User decision (2026-05-25, after Decision-9 walkthrough - grounded in D0 orchestration + research 06 §13 Kaniko archive):

## The rule

**Hybrid image build: BuildKit (`docker buildx`) for dev + GitHub Actions CI; Buildah for in-cluster ephemeral builds + air-gap on-prem. Same OCI Dockerfile works both. Kaniko BANNED.**

| Context | Tool |
|---|---|
| Local dev (per [[curaos-orchestration-rule]] Pattern 4 Compose+Bun) | **BuildKit** via `docker buildx` (Docker Desktop / Colima / Lima) |
| GitHub Actions CI (cloud runners w/ Docker available) | **BuildKit** via `docker/build-push-action` |
| In-cluster ephemeral build (K8s Job pod; per [[curaos-orchestration-rule]] D0 K3s) | **Buildah** (daemonless rootless container) |
| Air-gap on-prem CI (no Docker daemon access) | **Buildah** |
| Multi-arch builds (amd64 + arm64) | both (BuildKit `buildx --platform`; Buildah `manifest`) |
| Image signing | **cosign** sign before push (both tools) |
| SBOM emission | **syft** (CycloneDX format) (both tools) |
| Cache for Bun deps | `--mount=type=cache,target=/root/.bun/install/cache` works both |

## Banned

- **Kaniko** (Google archived June 2025; Chainguard fork uncertain)
- **Docker build (legacy `docker build` without buildx)** - missing BuildKit features (cache mounts, multi-arch)
- **Privileged build containers in K8s** (Buildah rootless mandatory)
- **Unsigned image push** (cosign sign mandatory; admission controller rejects unsigned at deploy)
- **Missing SBOM** (syft attestation mandatory)
- **Hardcoded secrets in Dockerfile** (use `--mount=type=secret` or env at runtime)
- **`COPY . .` w/o .dockerignore** (massive context bloat → slow builds; per-service .dockerignore mandatory)

<!-- fold: rationale, non-binding -->

## Why this hybrid (not pure BuildKit or pure Buildah)

| Capability | BuildKit | Buildah |
|---|---|---|
| Dev experience (`docker buildx`) | seamless | own `buildah build` CLI |
| GitHub Actions integration | first-class action (`docker/build-push-action`) | works but less mature |
| In-cluster K8s Job rootless | needs BuildKit daemonset (heavier) | runs as plain container (lighter) |
| Daemon requirement | yes (daemonset OR Docker socket) | no |
| Air-gap on-prem fit | needs Docker mirror + daemon | single binary; minimal install |
| Multi-arch | excellent (`buildx --platform`) | excellent (`manifest`) |
| Agent training data 2025-2026 | very high | high |
| Cache mounts for Bun deps | yes | yes |

Conclusion: BuildKit's dev experience + GHA action maturity wins for dev/cloud-CI; Buildah's daemonless + lighter footprint wins for in-cluster + air-gap. Same Dockerfile produces same image; consumers don't care which tool built it.

## Dockerfile pattern (works both tools per [[curaos-bun-primary-rule]])

```dockerfile
# Bun-first base per curaos_bun_primary_rule
FROM oven/bun:1-alpine AS deps
WORKDIR /app
COPY package.json bun.lock ./
# Cache mount accelerates bun install across builds
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile --production

FROM oven/bun:1-alpine AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile
COPY . .
RUN bun build src/main.ts --target=node --outdir=dist

FROM oven/bun:1-alpine AS runtime
WORKDIR /app
# Non-root user per security hardening
RUN addgroup -S app && adduser -S -G app app
USER app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
EXPOSE 8080
HEALTHCHECK --interval=10s CMD bun --eval "fetch('http://localhost:8080/health').then(r => process.exit(r.ok ? 0 : 1))"
CMD ["bun", "run", "dist/main.js"]
```

## Why Kaniko is banned

- **Google archived June 2025** (per research 06 §13)
- Chainguard fork exists but stewardship uncertain long-term
- BuildKit + Buildah cover all Kaniko's use cases (rootless in-cluster build)
- Any service still referencing Kaniko in CI must migrate to Buildah

## Multi-arch build pattern

```bash
# BuildKit (dev / GHA)
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  --tag harbor.curaos-ops.svc.cluster.local/services/identity-service:v1.2.3 \
  --push \
  .

# Buildah (in-cluster)
buildah build --platform linux/amd64,linux/arm64 \
  --manifest harbor.curaos-ops.svc.cluster.local/services/identity-service:v1.2.3 \
  .
buildah manifest push --all \
  harbor.curaos-ops.svc.cluster.local/services/identity-service:v1.2.3
```

ARM64 mandatory for:
- Apple Silicon dev boxes (per [[curaos-orchestration-rule]] dev pattern)
- AWS Graviton / GCP Tau T2A / Azure Ampere cost optimization
- Future RPi/edge-device deployments

## Mandatory signing + SBOM in CI

Per AGENTS.md §8 security gates + [[curaos-local-vs-3rdparty-rule]] supply-chain trust:

```bash
# After build, before any registry push:

# 1. SBOM via syft (CycloneDX format)
bunx -p @cyclonedx/cdxgen cdxgen -o sbom.cdx.json
# or
syft <image-ref> -o cyclonedx-json > sbom.cdx.json

# 2. Push image first
docker push <image-ref>

# 3. Sign image w/ cosign
cosign sign --yes <image-ref>

# 4. Attach SBOM as cosign attestation
cosign attest --yes --predicate sbom.cdx.json --type cyclonedx <image-ref>
```

Verify on deploy (per [[curaos-orchestration-rule]] D0 K3s) - admission controller policy rejects unsigned images.

## Bun cache mount (perf-critical)

BuildKit + Buildah both support `--mount=type=cache,target=<path>` - persistent across builds. For Bun:

```dockerfile
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile
```

Without cache mount: 96 services × 30-60s `bun install` = 50-100 min CI wall-clock.
With cache mount: subsequent builds ~5-15s per service. Critical for sane CI throughput.

## CI workflow template (GitHub Actions)

```yaml
# .github/workflows/build-and-push.yml (per service)
on:
  push:
    branches: [main]
    paths:
      - 'backend/services/<svc>/**'
jobs:
  build:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write  # for cosign keyless OIDC
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: harbor.curaos-ops.svc.cluster.local
          username: ${{ secrets.HARBOR_USER }}
          password: ${{ secrets.HARBOR_TOKEN }}
      - uses: docker/build-push-action@v6
        with:
          context: ./backend/services/<svc>
          platforms: linux/amd64,linux/arm64
          push: true
          cache-from: type=registry,ref=harbor.curaos-ops.svc.cluster.local/cache:<svc>
          cache-to: type=registry,ref=harbor.curaos-ops.svc.cluster.local/cache:<svc>,mode=max
          tags: harbor.curaos-ops.svc.cluster.local/services/<svc>:${{ github.sha }}
      - uses: anchore/sbom-action@v0
        with:
          image: harbor.curaos-ops.svc.cluster.local/services/<svc>:${{ github.sha }}
          format: cyclonedx-json
      - uses: sigstore/cosign-installer@v3
      - run: |
          cosign sign --yes harbor.curaos-ops.svc.cluster.local/services/<svc>:${{ github.sha }}
          cosign attest --yes --predicate sbom.cdx.json --type cyclonedx \
            harbor.curaos-ops.svc.cluster.local/services/<svc>:${{ github.sha }}
```

## In-cluster Buildah job template

```yaml
# K8s Job spec for in-cluster Buildah build (air-gap or per-tenant build)
apiVersion: batch/v1
kind: Job
metadata:
  name: build-identity-service-v1.2.3
  namespace: ci-builds
spec:
  template:
    spec:
      restartPolicy: Never
      containers:
        - name: buildah
          image: quay.io/buildah/stable:latest
          securityContext:
            privileged: false  # rootless mode
            capabilities:
              add: ["SETUID", "SETGID"]
          command:
            - /bin/sh
            - -c
            - |
              cd /workspace
              buildah build --platform linux/amd64,linux/arm64 \
                --manifest harbor.curaos-ops/services/identity-service:v1.2.3 \
                /workspace/backend/services/identity-service
              buildah manifest push --all \
                harbor.curaos-ops/services/identity-service:v1.2.3
              cosign sign --yes harbor.curaos-ops/services/identity-service:v1.2.3
          volumeMounts:
            - name: workspace
              mountPath: /workspace
      volumes:
        - name: workspace
          emptyDir: {}
```

## How it satisfies CuraOS rules

| Rule | Compliance |
|---|---|
| AGENTS.md §3 charter self-hosted first | BuildKit + Buildah OSS; Harbor self-hosted registry |
| AGENTS.md §4 air-gap | Buildah in-cluster daemonless; Harbor mirror; Zarf-bundled per D0 |
| AGENTS.md §8 security gates | cosign signing + SBOM attestation mandatory |
| [[curaos-orchestration-rule]] (D0) | In-cluster Buildah job pattern; same Dockerfile across dev/CI/cluster |
| [[curaos-bun-primary-rule]] | Multi-stage Dockerfile w/ oven/bun:1-alpine; --mount=type=cache for bun install |
| [[curaos-local-vs-3rdparty-rule]] | Local Harbor default; 3rd-party registry (GHCR/quay/Docker Hub) per tenant via env var |
| [[curaos-modulith-standalone-rule]] | Per-service Dockerfile works standalone (single service build) + monorepo (Turborepo cache) |
| [[curaos-ai-mirror-rule]] | Per-service Dockerfile lives in curaos/<area>/<svc>/Dockerfile; mirrored under ai/curaos/<area>/<svc>/CONTEXT.md docs build process |
| [[curaos-orm-rule]] | Image runs Drizzle migrations at startup via `bun run migrate` before main; no Prisma binary headache (Prisma off-default per D1) |

## Agentic-tool friendliness

Why this hybrid wins for AI agents specifically:
- `docker buildx` is dominant 2025-2026 corpus → agents author Dockerfiles confidently
- Same Dockerfile across dev + CI + cluster → no agent confusion about "which tool needs what"
- Cache mount syntax is standard → agents won't hallucinate alternatives
- cosign + syft are well-documented; agents append signing steps to CI workflows
- `kubernetes-mcp-server` (per D0) inspects Buildah Job status during in-cluster builds
- Predictable image refs (harbor.curaos-ops/services/<svc>:<sha>) → agents reason about deploys

## How to apply

- Every service has `Dockerfile` at service root (multi-stage; oven/bun:1-alpine base; cache mount for bun deps)
- Service AGENTS.md frontmatter declares:
  ```yaml
  build:
    tool: buildkit  # dev/CI; or 'buildah' if service spec says in-cluster only
    image_base: oven/bun:1-alpine
    platforms: [linux/amd64, linux/arm64]
    cache_mount_bun: true
    signing: cosign
    sbom: cyclonedx
  ```
- Codegen Engine recipe (per ADR-0123) emits Dockerfile + .github/workflows/build-and-push.yml template
- Harbor self-hosted registry per cluster profile (decision pending; folds into D-future)
- Cosign keyless OIDC w/ GitHub Actions; cosign w/ KMS key for in-cluster Buildah jobs
- AI-doc per service `ai/curaos/backend/services/<svc>/CONTEXT.md` documents build target + cache pattern

## ADRs queued

Per digest §6:
- **ADR (NEW, image build + supply chain)** - number TBD (0144 unverified in RESOLUTION-MAP; use next free number ≥0212): full version w/ Harbor registry pick; this rule = short form
- **ADR-0099 (charter)**: amend §8 security-gates subsection to link this rule + SBOM + signing
- **ADR (GitOps queued D0)** - number TBD (0136 unverified in RESOLUTION-MAP; use next free number ≥0212): ArgoCD deploys signed images verified by admission controller
