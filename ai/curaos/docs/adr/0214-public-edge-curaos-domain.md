# ADR-0214 — Public edge for CuraOS (curaos.example.com)

**Status:** Accepted
**Date:** 2026-06-07
**Amends:** [ADR-0213](0213-m15-ga-verification-infra-topology.md) (adds a public-edge profile to the otherwise NetBird-internal topology)
**Research:** [public website deploy](../research/2026-06-07-public-website-deploy-cloudflare-hetzner.md) · [live demo-slice public exposure](../research/2026-06-07-live-demo-slice-public-exposure.md)
**Rules:** [[curaos-rolling-update-rule]] (forward profile, no `-v2`), [[curaos-local-vs-3rdparty-rule]], [[curaos-orchestration-rule]], [[curaos-generator-evolution-rule]] (demo-slice charts), [[curaos-healthstack-vision]] (no real PHI)

## Context

User wants public, clickable URLs under `example.com`:
1. The **CuraOS marketing/brochure site** (`curaos-website`, #515 — Bun-native static, already built).
2. Eventually a **live product demo** of the CuraOS demo-slice.

Existing proven edge at `example-homelab/` (Hetzner CX43, 8 vCPU / 16 GB): **Caddy** on :80/:443 with a **15-year Cloudflare Origin Cert** (wildcard `*.example.com`), strict CSP/HSTS, a **push-webhook mirror** (`services/example-mirror`: adnanh/webhook + HMAC → `git pull --ff-only` → `caddy reload`) serving `home.example.com` from `/srv/sites/example/site/dist`, **Pocket-ID** OIDC at `auth.example.com`, and **NetBird** mesh. Cloudflare DNS via `scripts/provision-cloudflare.mjs` + `secrets/cf-token`.

## Decision

### D1 — Edge mechanism: reuse Caddy + Origin Cert. NO cloudflared tunnel.
Homelab `DECISIONS.md` #1 already evaluated and **rejected** cloudflared for this box (proxied DNS → Caddy on origin :443, origin-IP leakage mitigated by ufw CF-IP allowlist). Adding a tunnel would contradict a recorded decision and create parallel infra ([[curaos-rolling-update-rule]] spirit). The wildcard Origin Cert **already covers `curaos.example.com`** — zero new cert work.

### D2 — Website (`curaos.example.com`): static, shippable NOW.
One Caddy vhost (copy of the `home.example.com` block, importing `(cloudflare-origin)` + a tightened `(curaos-headers)` snippet) + one proxied A DNS record (→ Hetzner IP) + one `deploy-curaos-website` hook appended to the existing single webhook listener. Build on-box: `git pull --ff-only` → `bun install --frozen-lockfile` → `bun run build` (→ `./site/`, per the repo's `scripts/build.sh`) → `caddy reload`. Zero new daemons.

### D3 — Live demo-slice: runs on build-host, exposed via APISIX → Caddy-over-NetBird → CF. M16-gated.

Operational run source: use `build-host:/home/mkh/workspace/example-homelab` for Caddy, DNS, Pocket ID, NetBird, APISIX exposure, and secret-bearing live-run work before declaring a blocker. ADR-0213 owns the topology; [[curaos-live-ops-substrate-rule]] owns the binding host-selection rule.
The 16 GB Hetzner box cannot hold the ~22-pod / 5–7 GB slice alongside its current load. The slice runs on **build-host** (46 GB, the charter §4 data-plane). Exposure path: the slice's existing **APISIX** gateway bound to a host-port on build-host's NetBird node → **Caddy on Hetzner** `reverse_proxy 100.77.0.2:<port>` over the NetBird mesh → CF Origin Cert → `curaos.example.com` (or `demo.curaos.example.com`). Every CuraOS Service stays ClusterIP. This is charter §4 Hybrid (vendor edge + customer data-plane) made public.

### D4 — Demo-slice posture: auth-gated, synthetic-only.
Public demo sits behind **Pocket-ID OIDC** (APISIX `openid-connect` plugin) + `limit-req` rate-limit + scheduled `demo-seed` reset. Data is 100% watermarked-synthetic with the fail-closed Presidio PHI gate (#511) — **no real PHI by construction**. Matches Medplum/Supabase sandbox posture. The air-gap zero-egress policy does NOT apply (public demo needs egress); the slice runs on `cluster-onprem`, not `cluster-airgap`.

### D5 — `values-demo-public.yaml` forward profile (NOT a `-v2` fork).
ADR-0213 / `values-demo.yaml` froze the demo-slice as "internal-only, no public IP, no Cloudflare." The public demo adds a **sibling forward profile** `values-demo-public.yaml` (APISIX `openid-connect` + ingress host + rate-limit overlay on the same chart) per [[curaos-rolling-update-rule]] — never a `values-demo-v2`. This ADR amends ADR-0213's internal-only invariant to allow the public profile.

### D6 — Critical path: M16 chart-emitter first, then demo-first subset.
The demo-slice needs real Helm charts (M16 #537 emitter → #538 umbrella → a scoped #539′ regenerating just the ~16 demo services). Hand-authoring 16 charts is forbidden ([[curaos-generator-evolution-rule]]). Sequence: #537 → #538 → #539′(16) → `helm install values-demo-public` on build-host → APISIX+Pocket-ID expose → Caddy/DNS edit. #540 (full zarf) + remaining 71 services + #541 follow.

## Consequences
- Website is publishable immediately (no M16 dependency) — the quick win.
- Demo-slice public URL is gated on M16 chart-generator + the public profile + an `example-homelab` edit (separate repo, live Hetzner box — operator step).
- `curaos.example.com` apex → static brochure; `demo.curaos.example.com` (or a path) → live demo behind Pocket-ID.
- Two repos touched: `curaos-website` (build), `example-homelab` (Caddy vhost + DNS + webhook). The demo path also touches `curaos/ops/zarf` (public profile) + the M16 codegen.
- ufw CF-IP allowlist + Pocket-ID gate keep the public surface minimal.

## Public-edge map

| Surface | URL | Serves | Where | Gate |
|---|---|---|---|---|
| Brochure | `curaos.example.com` | static `curaos-website/site/` | Hetzner Caddy | public |
| Live demo | `demo.curaos.example.com` | demo-slice APISIX | build-host cluster-onprem, via NetBird | Pocket-ID OIDC |
| (existing) | `auth.example.com` | Pocket-ID OIDC IdP | Hetzner | — |
