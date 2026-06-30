# CONTEXT.md - ops/manifests

## Role

Mirror docs for Kubernetes manifests under `curaos/ops/manifests`.

## Guardrails

- Manifests are applied only after local gates pass.
- API gateway manifests are source-of-truth for live route rewrites.
- Generated manifest drift must fold back into the owning generator.
