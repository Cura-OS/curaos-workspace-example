# Install (self-host)

CuraOS is self-hosted first: it is designed to run on your own infrastructure
with no managed-cloud lock-in. This page describes the real deployment shape and
the prerequisites. The exact commands depend on your environment; treat the
snippets as the target flow.

!!! note "Pre-1.0"
    The self-host story is hardening along the roadmap. The live reference
    deployment runs on a single-node Kubernetes (k3d) cluster. Multi-node and
    full air-gap installs are supported by design and validated incrementally.

## Deployment models

CuraOS targets four models from one codebase. All are meant to ship from the
same artifacts.

| Model | Tenancy | Notes |
| --- | --- | --- |
| Cloud SaaS | Per tenant (schema or DB) | Vendor managed, horizontal scale |
| On-prem | Single tenant | Your infrastructure, overlays opt-in. This is how the live reference runs. |
| Hybrid | Vendor control plane + your data plane | Audit and secrets stay on your infrastructure |
| Home lab / air-gap | Single tenant, offline | Same artifacts, zero external calls |

## Prerequisites

The reference runtime uses:

- **Kubernetes**: a conformant cluster. The reference uses k3d (k3s in Docker).
- **PostgreSQL**: provisioned by the CloudNativePG (CNPG) operator, one database
  per tenant.
- **Valkey**: for caching and ephemeral state (a Redis-compatible store).
- **Ingress**: an ingress controller (ingress-nginx in the reference) to route
  in-cluster traffic.
- **Public edge** (optional): Caddy plus Cloudflare in front of the ingress for
  TLS and a public hostname. Not required for a private or air-gap install.
- **Container images**: the service and migrator images, pulled from your
  registry (the reference publishes signed images to GHCR).

## Install order

The platform comes up in layers. The neutral core first, then any overlays.

1. **Cluster and operators.** Stand up the cluster, then install the CNPG
   operator (PostgreSQL) and the messaging operator. These own the stateful
   backends every service depends on.

2. **Datastores.** Create the per-tenant PostgreSQL clusters via CNPG and bring
   up Valkey. Tenant data isolation starts here: each tenant gets its own
   database.

3. **Neutral core services.** Deploy the core capability services (identity,
   tenancy, party, audit, notify, search, storage, and the rest). These have no
   vertical assumptions.

4. **Overlays (opt-in).** Deploy only the overlays a tenant needs: HealthStack,
   EducationStack, or ERP. Overlays depend downward on the core.

5. **Frontend apps.** Deploy the app surfaces. Each app is a generated frontend
   wired to the API gateway and to OIDC.

6. **Edge and auth.** Point your ingress and (optionally) the public edge at the
   apps and the API gateway, and wire up Pocket-ID for OIDC. See
   [Auth setup](../auth/index.md).

```bash
# Illustrative of the target flow; adapt to your cluster + registry.
git clone https://github.com/your-org/curaos
cd curaos

# Install the umbrella chart (neutral core); add overlays per tenant.
helm install curaos ./ops/charts/umbrella   # illustrative

# Confirm a core service is healthy through the gateway.
curl -i https://<your-host>/api/v1/identity/healthz
```

## Verifying the install

Once the core is up, the unauthenticated health endpoints are the fastest check:

```bash
curl -s https://<your-host>/api/v1/identity/healthz   # 200 when identity is up
curl -s https://<your-host>/api/v1/tenancy/healthz    # 200 when tenancy is up
```

Then open the admin app, sign in through Pocket-ID, and confirm a tenant loads.
The [API reference](../api/index.md) lists the service path prefixes you can probe.

## Air-gap

CuraOS is designed for zero-egress, fully offline installs (the same artifacts,
no external calls). The platform's own infrastructure and the public website and
docs are already proven zero-egress. A full product tenant air-gap install is on
the roadmap rather than proven at scale today; the design ships images and charts
that contain no remote dependencies so the offline path stays viable.

Continue with [Auth setup](../auth/index.md) and [Operations](../operations/index.md).
