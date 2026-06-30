# M17 — Public Edge: Atomic Story Breakdown

**Date:** 2026-06-07
**Parent Epic:** M17 (to seed) — public clickable URLs under `example.com`
**Governing decision:** [ADR-0214](../adr/0214-public-edge-curaos-domain.md) (amends [ADR-0213](../adr/0213-m15-ga-verification-infra-topology.md))
**Research:** [website deploy](../research/2026-06-07-public-website-deploy-cloudflare-hetzner.md) · [demo-slice exposure](../research/2026-06-07-live-demo-slice-public-exposure.md)

> **Status:** BREAKDOWN + SPEC. Maps the public-edge goal onto the existing `example-homelab` Caddy/CF/NetBird edge + the M16 chart-generator. Splits each story into **(A) agent-authorable** (config/manifests/scripts, verified by `shellcheck`/`bun build`/`helm template`/dry-run) and **(B) orchestrator live-run** (DNS + Caddy edit on the live Hetzner box + `helm install` on build-host — operator steps over SSH).

## Two independent tracks

| Track | Gate | Outcome |
|---|---|---|
| **W1 — Brochure site** | NONE (shippable now) | `curaos.example.com` serves `curaos-website` static build |
| **W2 — Live demo** | M16 chart-generator (#536) | `curaos-demo.example.com` serves the demo-slice, Pocket-ID-gated |

W1 has zero M16 dependency — ship it first. W2 is the GA-to-public payoff, gated on M16.

## Infra (ADR-0214)

| Surface | URL | Where | Edge | Gate |
|---|---|---|---|---|
| Brochure | `curaos.example.com` | Hetzner `/srv/sites/curaos-website/site` | Caddy + CF Origin Cert | public |
| Live demo | `curaos-demo.example.com` | build-host cluster-onprem (APISIX) | Caddy `reverse_proxy 100.77.0.2:<port>` over NetBird → CF | Pocket-ID OIDC |

**No cloudflared** — reuse Caddy + the 15-yr wildcard Origin Cert (already covers `curaos.example.com`). Homelab `DECISIONS.md` #1.

## Stories

### W1 — Brochure site (ready-for-agent, NO M16 dep)

#### S1 — curaos-website build verification + Caddy/webhook config artifacts (A)
**(A) authorable** (touches `example-homelab` repo + verifies `curaos-website` build):
- Confirm `curaos-website` build: `bun install --frozen-lockfile && bun run build` → `./site/` (per `scripts/build.sh`); `index.html` at root, relative assets.
- Author the `curaos.example.com` Caddy vhost (copy of `home.example.com` block: `import cloudflare-origin`, a tightened `(curaos-headers)` snippet, `root * /srv/sites/curaos-website/site`, `try_files`, `file_server`, immutable-asset cache — verify the hashed-asset prefix against the renderer, drop `@immutable` if N/A).
- Author the `deploy-curaos-website` hook (append to the existing single `example-mirror` listener — NOT a 2nd daemon) + a deploy script (`git pull --ff-only` → `bun install --frozen-lockfile` → `bun run build` → `sudo systemctl reload caddy`).
- Add `{type:"A", name:"curaos", content:vpsIp, proxied:true}` to `scripts/provision-cloudflare.mjs` `desired[]`.
**Local verify:** `caddy validate --config Caddyfile`; `bun run build` produces `site/index.html`; `shellcheck` deploy script; `node --check provision-cloudflare.mjs`. Paste verbatim.
**(B) orchestrator live-run (Hetzner):** clone curaos-website to `/srv/sites/curaos-website`; run `provision-cloudflare.mjs` (DNS A record); install the vhost + hook; `caddy reload`; curl `https://curaos.example.com` → 200 + correct CSP. Register the GitHub push webhook on curaos-website → Hetzner `/_hooks/`.
**blocked-by:** none. **dispatch:** now.

### W2 — Live demo (M16-gated)

#### S2 — values-demo-public.yaml forward profile (A) [blocked-by M16 #538]
**(A) authorable** (`curaos/ops/zarf/values/values-demo-public.yaml`): forward profile overlaying the demo-slice chart with APISIX `openid-connect` (Pocket-ID) + `limit-req` rate-limit + a public ingress host (`curaos-demo.example.com`). NOT a `-v2` fork — sibling profile per [[curaos-rolling-update-rule]]. **Local verify:** `helm template -f values-demo-public.yaml` renders the OIDC + rate-limit plugins + no real-PHI path; ClusterIP services unchanged. **blocked-by:** M16 #538 (real umbrella chart). **dispatch:** after M16 chart-emitter.

#### S3 — demo-slice public-exposure runbook + APISIX-over-NetBird wiring (A)
**(A) authorable** (`curaos/ops/ga-acceptance/` or `ai/curaos/docs/`): the runbook + the Caddy `curaos-demo.example.com` vhost (`reverse_proxy 100.77.0.2:<apisix-nodeport>` over NetBird) + the Pocket-ID OIDC client registration steps. **Local verify:** `caddy validate`; `shellcheck`; the runbook dry-run logic test. **blocked-by:** none for the config; live run needs S2. **dispatch:** parallel with S2.

#### S4 — demo-slice public live-run (B, orchestrator) [blocked-by S2, S3, M16 #539′]
**(B) orchestrator:** on build-host — `helm install -f values-demo-public.yaml` to cluster-onprem (needs real charts from M16 #539′ for the ~16 demo services), run demo-seed, register Pocket-ID OIDC client, expose APISIX NodePort over NetBird, add the Caddy vhost + DNS on Hetzner, curl `https://curaos-demo.example.com` → Pocket-ID redirect → demo. Schedule demo-seed reset. **blocked-by:** S2, S3, M16 #539′ (scoped 16-service regen). **dispatch:** after those.

## Dispatch order
```text
NOW (W1, no gate):
  S1-A curaos-website Caddy/webhook/DNS config  →  S1-B live publish (Hetzner)  →  curaos.example.com LIVE
GATED ON M16 (W2):
  M16 #537 chart-emitter → #538 umbrella → #539′ (16 demo services)
  S2-A values-demo-public.yaml  ‖  S3-A exposure runbook + Caddy demo vhost
  → S4-B helm install + Pocket-ID + APISIX-over-NetBird + Caddy/DNS  →  curaos-demo.example.com LIVE
```

## Per-story DoD addendum
(A): `caddy validate`/`bun build`/`helm template`/`shellcheck`/`node --check` green, pasted per [[curaos-local-ci-first-rule]]; ai-docs mirror; doc-graph. (B): orchestrator pastes the live `curl`/`kubectl`/`caddy reload` output as §8.1 evidence + closes. `example-homelab` edits land in that repo (separate from curaos); curaos changes (public profile) land in curaos.

## Repos touched
- `curaos-website` (build verification only)
- `example-homelab` (Caddy vhost + DNS + webhook hook + deploy script) — **live Hetzner box, operator-gated**
- `curaos/ops/zarf` (values-demo-public.yaml, S2)
- M16 codegen (chart emitter — prerequisite for W2)
