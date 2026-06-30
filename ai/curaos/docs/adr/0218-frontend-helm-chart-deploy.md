# ADR-0218: Frontend web apps ship a per-app Helm chart on the same k3d/APISIX/zarf path as backend services

Status: Accepted (2026-06-16)
Target Version: v1
Extends: ADR-0216 (web app-fleet build-out), ADR-0217 (RN native recipe), ADR-0153 (codegen recipe coverage), ADR-0106 (frontend).

## Context

ADR-0216 made `gen:ui-app` emit production-depth Next.js 15 web apps, and M16 (the chart-generator, ADR/Epic line) made every backend service ship a per-app Helm chart so it deploys on the k3d / APISIX / zarf path with a digest-pinned GHCR image. The web apps had no such chart: the emitter shipped a multi-stage `Dockerfile` (Next `output: standalone`) but nothing to package + run that image on the cluster. So a generated web app was "fully built" as source + image but NOT "fully shipped" - it could not be installed alongside the services it administers (#730).

A web app is NOT a backend service - it has an HTTP listener on port 3000 (Next standalone server, not a Nest tcpSocket), its runtime config is the browser-exposed `NEXT_PUBLIC_*` set plus the identity-service URL (not a `DATABASE_URL`), and its one confidential value is the OIDC client secret. But it deploys through the same substrate (k3d in dev, APISIX gateway for exposure, zarf for air-gap), so it should reuse the established backend chart mold rather than invent a parallel one.

## Decision

1. **Generator owns the chart.** `gen:ui-app` (ADR-0153 `ui.react-next`) emits a `chart/` subtree into every generated web app, added to the emitted file list (`tools/codegen/src/ui-app-emit.ts`). A hand-authored chart would be wiped on the next regen, so the chart comes from the mold per [[curaos-generator-evolution-rule]]; every chart edge case folds back into the emitter.

2. **Mirror the backend chart mold.** The chart reuses the backend service chart shape (`backend/services/<svc>/chart/`, the M16-S1 template + `charts-all-emit.ts`): the same `_helpers.tpl` naming + label grammar, the same image repository/tag/digest resolution (digest pin wins, `repository:tag` fallback for dev per [[curaos-version-pinning-rule]]), the same ConfigMap (non-secret) + Secret-ref (credential) split, the same hardened pod + container security contexts, `serviceaccount.yaml`, `service.yaml`, `NOTES.txt`, and `.helmignore`. The web helpers live in the `curaos-web.*` namespace (distinct from the backend `curaos-service.*`) so a web chart and a service chart never collide when both are vendored under one umbrella.

3. **Tailored to a Next standalone web app.** `containerPort` is 3000 (the Next standalone server default). The runtime env block is the app's PUBLIC config (`NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_OIDC_ISSUER`, `NEXT_PUBLIC_OIDC_CLIENT_ID`, `NEXT_PUBLIC_APP_URL`, `CURAOS_IDENTITY_SERVICE_URL`) plus `NODE_ENV=production`, rendered into the ConfigMap and consumed via `envFrom`. Liveness/readiness/startup probes are `httpGet` on a health path (`/api/health`, overridable via `values.healthPath`) because a web app serves a real HTTP surface, unlike the backend mold's `tcpSocket` probe.

4. **The OIDC client secret is a Secret REF, never inlined.** The confidential `OIDC_CLIENT_SECRET` is mounted as a single `secretKeyRef` env var off an EXISTING Kubernetes Secret named by `values.oidc.existingSecret` (key `values.oidc.clientSecretKey`), created out-of-band by the platform (sealed-secrets / external-secrets). The chart carries NO credential material: no `secret.yaml` manifest, no literal value in `values.yaml` or any template (charter security + PHI boundary). This is the load-bearing invariant the generator test pins.

5. **Exposure through APISIX.** An `ApisixRoute` (`apisix.apache.org/v2`) binds the public host + path to the in-cluster ClusterIP backend through the APISIX gateway, gated by `values.ingress.enabled` (default off, so a bare install stays cluster-internal). This mirrors how backend services and the demo public edge expose: the host is the only public surface, the backend is reached over ClusterIP; no LoadBalancer / NodePort is rendered.

6. **React Native apps are out of scope.** RN apps (clinician-app, patient-app; the ADR-0217 `ui.react-native` / Expo recipe) ship via the app stores / EAS, NOT Helm. There is no server-side container to package; the deploy artifact is a signed mobile binary. The `gen:ui-app-native` emitter does not emit a chart, and this ADR does not cover mobile deployment.

## Consequences

- Every generated web app is now "fully shipped": built (source + GHCR standalone image) AND deployable on the same k3d / APISIX / zarf path as the services it administers, closing #730.
- A future app or regen inherits the chart automatically; the "built but not deployable" gap is eliminated at the mold.
- `helm lint` + `helm template` pass for a freshly emitted chart (verified for admin-app); the APISIX route renders only when `ingress.enabled=true`, and the image reference uses the `@sha256` digest when `image.digest` is set, else `repository:tag`.
- The web chart and service chart share one operational mental model (labels, image pinning, ConfigMap/Secret split, probes) while diverging only where the runtime differs (HTTP probe, port 3000, NEXT_PUBLIC config, OIDC secret ref).
- The OIDC client secret must be provisioned as a named Secret before install; the chart references it but never creates or inlines it.

## Links

- Issue: #730 (frontend "fully shipped" gap - web apps had no Helm chart)
- Generator: `tools/codegen/src/ui-app-emit.ts` (chart renderers + emitted file list); test `tools/codegen/__tests__/ui-app-emit.test.ts`
- Backend chart mold reference: `backend/services/party-service/chart/`, `tools/codegen/src/charts-all-emit.ts` (M16-S1)
- ADR-0216 (web fleet), ADR-0217 (RN native recipe), ADR-0153 (recipe coverage), ADR-0106 (frontend)
- Rules: [[curaos-orchestration-rule]], [[curaos-generator-evolution-rule]], [[curaos-version-pinning-rule]], [[curaos-rolling-update-rule]]
