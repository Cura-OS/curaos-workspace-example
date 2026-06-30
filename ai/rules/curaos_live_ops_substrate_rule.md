---
name: curaos-live-ops-substrate-rule
title: Live ops substrate (build-host + example-homelab)
description: BINDING (user directive 2026-06-12). CuraOS deployment, live-server, public-demo, image-publish, signing, DNS, Caddy, Pocket ID, NetBird, APISIX, k3d, kubectl, zarf, Docker, cosign, GHCR, and VPS work runs from build-host before any blocker is declared. If the agent is not already on build-host, SSH there. example-homelab is the private live-ops and secret-bearing repo, not just config.
---

# Live Ops Substrate Rule

## Binding

For CuraOS deployment, live-server access, public demo exposure, image publishing, signing, DNS, Caddy, Pocket ID, NetBird, APISIX, k3d, kubectl, zarf, Docker, cosign, GHCR, and VPS work, `build-host` is the normal execution substrate.

Agents MUST NOT declare this work blocked because the local machine lacks credentials, Docker state, Kubernetes access, GHCR auth, provider tokens, signing keys, or server access until the `build-host` path was tried and recorded.

## Host Selection

1. Check `hostname`.
2. If already on `build-host`, run the live operation there.
3. If not on `build-host`, SSH there and run the operation remotely.
4. Use `bash -lc` for remote compound commands because the login shell may not be Bash.

```bash
ssh build-host 'bash -lc "cd /home/mkh/workspace/example-homelab && hostname && pwd && git status --short --branch"'
```

Before accepting a live blocker, record redacted evidence: `hostname`, `pwd`, `git status --short --branch`, the exact command attempted, and the non-secret failure output.

## Deployment Topology (BINDING, user directive 2026-06-21)

Two hosts, two distinct roles. Do NOT collapse them onto one box; do NOT run the heavy cluster on the small edge.

| Host | Role | Specs (verified 2026-06-21) | Reach |
|---|---|---|---|
| **Hetzner VPS** (`100.77.0.1`, public v4 `203.0.113.10`) | **RUNTIME / deploy target.** The k3d cluster `curaos` LIVES here. Public edge (Caddy + Pocket-ID + NetBird) lives here. | 15Gi RAM, 8 vCPU, 150G disk, **no swap by default** (add 16G swapfile). fish login shell. | Public IPv4 + CF DNS `*.example.com` |
| **build-host** (`100.77.0.2` netbird) | **BUILDER only.** Builds all images (NestJS services + Next FE apps). NOT a deploy target going forward. | 15GB build-VM (not the physical box), fish login shell, jobs>4 saturates it. | netbird-only, no public IP |

**Why this split:** Hetzner has the public IP (apps must be reachable); build-host has the build muscle but no public IP. Edge + runtime co-located on Hetzner removes the netbird proxy hop AND the build-host single-point (apps stay up even if pc is off). build-host keeps being the builder because Hetzner's 15Gi can't both build AND run 70 pods.

**Image flow (registry-less, proven path):** pc `docker build` -> `docker save` -> stream over netbird (`ssh`/`scp`) -> Hetzner `k3d image import -c curaos`. No GHCR creds needed (GHCR push was the recurring session-45 wall; avoid it for the homelab live path). FE apps MUST build with `--build-arg NEXT_PUBLIC_API_BASE_URL=https://api.example.com/api/v1` (+ the other 5 `NEXT_PUBLIC_*` per PR #433) so the client bundle hits the live gateway, not localhost.

**RAM discipline on Hetzner:** 70 pods steady-state ~12-18Gi against 15Gi total. Mandatory: 16G swapfile (disk-backed, cheap insurance) AND/OR per-pod memory requests+limits. No swap + over-subscribe = hard OOM-kill, not slowdown.

**Disk discipline on Hetzner:** building-on-Hetzner attempts leave huge dangling-image garbage in `/var/lib/docker` + k3s `/var/lib/containerd` (session-45 left 140GB dangling + 15GB build cache). Periodically `docker image prune -af && docker builder prune -af && journalctl --vacuum-size=200M`. Do NOT build on Hetzner; that is what fills the disk.

**The proven mechanics** (per-service DB+migrate+secret+helm chain, FE build chain, edge wiring) are NOT restated here. They live in [[curaos-deploy-build-doctrine]] and the recipe memories it indexes. This rule owns only the host-role decision; the doctrine memory owns the how.

## example-homelab Relationship

Primary checkout: `build-host:/home/mkh/workspace/example-homelab`.

Local reference checkout: `/Users/dev/workspace/example-homelab`.

`developer/example-homelab` is the private operations repo for Mo's homelab and personal web estate. Prefer the `build-host` checkout for live operations because it has host context, service reachability, tools, auth, and private material.

The repo owns:

- Homelab VPS bootstrap, provisioning, workspace sync, and update scripts.
- Caddy edge config for `example.com`, `home.example.com`, CuraOS demo exposure, and related routes.
- Cloudflare, Hetzner, NetBird, Pocket ID, Caddy origin cert, GHCR, and signing secret material.
- Pocket ID, NetBird, mirror webhook, systemd, and Docker Compose service manifests.
- Personal website source, assets, design material, audits, localization guidance, and deploy workflow.
- CuraOS demo and brochure exposure glue for live verification lanes.

It is not a CuraOS product repo and must not become canonical for CuraOS product code or architecture decisions.

## Secret Handling

`example-homelab/secrets/` intentionally contains plaintext secrets in the private repo. Agents may list secret filenames to prove availability, but MUST NOT print values, copy secrets into CuraOS repos, paste them into GitHub issues or PRs, or mirror them into public logs.

Run secret-bearing commands on `build-host` and report only redacted evidence.

## Labels

- `ready-for-agent`: scoped work the agent can perform now.
- `ready-for-human`: product, legal, irreversible, authority, or genuinely non-agent decisions.
- `blocked`: agents tried the correct substrate and are stopped by an external dependency, failed provider authorization, missing remote credential, failed infrastructure state, or unresolved upstream issue.

Do not use `ready-for-human` merely because work needs SSH, server access, deployment credentials, secrets, Docker, Kubernetes, GHCR, cosign, Cloudflare, Hetzner, NetBird, Pocket ID, Caddy, or APISIX.
