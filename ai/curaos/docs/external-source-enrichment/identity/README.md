# Identity / User-Management (own multi-tenant IdM, replace pocket-id)

Build our own multi-tenant CIAM/IdP + full user lifecycle + B2B org-management + fine-grained entitlements, retiring the self-hosted pocket-id. Same XSRC treatment: whole-system mining (pocket-id + Zitadel/Keycloak/Authentik + Ory[Kratos/Hydra/Keto] + Logto/SuperTokens + OpenFGA) + online tool research (importable packages/SDKs/components/background-services). Generator-first, person/tenant-centric, self-host + BYO duality.

## Read first
- [CUTOVER-PLAN.md](CUTOVER-PLAN.md) - pocket-id -> own IdM cutover + coverage + stacked statement

## Plan (machine-readable)
- [plan/idm-capability-map.json](plan/idm-capability-map.json) - 19-capability map + 12 gaps + 6 decisions + cutover
- [plan/idm-backlog.json](plan/idm-backlog.json) - 29 backlog items + license register
- [plan/idm-tool-research-register.json](plan/idm-tool-research-register.json) - 82 candidates, adopt/service/reference/reject + 18 backlog enrichments
- [plan/idm-source-index.json](plan/idm-source-index.json) - 10 source systems + licenses

## ADRs (proposed, 0237-0242)
- [0237-oidc-provider-lib-node-oidc-provider-wrapped-in-nestjs-.md](../../adr/0237-oidc-provider-lib-node-oidc-provider-wrapped-in-nestjs-.md) - ADR-0237: OIDC-PROVIDER-LIB: node-oidc-provider wrapped in NestJS as the CuraOS OIDC/OAuth
- [0238-rebac-engine-extend-curaos-policy-with-a-postgres-zanzi.md](../../adr/0238-rebac-engine-extend-curaos-policy-with-a-postgres-zanzi.md) - ADR-0238: REBAC-ENGINE: extend @curaos/policy with a Postgres Zanzibar tuple model + Check
- [0239-org-tenant-model-two-layers-curaos-tenancy-isolation-bo.md](../../adr/0239-org-tenant-model-two-layers-curaos-tenancy-isolation-bo.md) - ADR-0239: ORG-TENANT-MODEL: two layers - @curaos/tenancy isolation boundary + Logto-style 
- [0240-self-service-flow-engine-no-declarative-flow-engine-for.md](../../adr/0240-self-service-flow-engine-no-declarative-flow-engine-for.md) - ADR-0240: SELF-SERVICE-FLOW-ENGINE: no declarative flow engine for v1 (provider interactio
- [0241-user-federation-curaos-identity-federation-on-our-stack.md](../../adr/0241-user-federation-curaos-identity-federation-on-our-stack.md) - ADR-0241: USER-FEDERATION: @curaos/identity-federation on our stack (LDAP polling-sync + r
- [0242-cutover-seam-reversible-pocket-id-cutover-via-the-oidc-.md](../../adr/0242-cutover-seam-reversible-pocket-id-cutover-via-the-oidc-.md) - ADR-0242: CUTOVER-SEAM: reversible pocket-id cutover via the oidc-broker issuer-flip

## GitHub issues (under epic #849)
- [#862](https://github.com/your-org/curaos-ai-workspace/issues/862) Own OIDC/OAuth2 provider
- [#863](https://github.com/your-org/curaos-ai-workspace/issues/863) ReBAC entitlements
- [#864](https://github.com/your-org/curaos-ai-workspace/issues/864) B2B org/tenant
- [#865](https://github.com/your-org/curaos-ai-workspace/issues/865) Self-service flows+MFA
- [#866](https://github.com/your-org/curaos-ai-workspace/issues/866) SAML/LDAP/SCIM federation
- [#867](https://github.com/your-org/curaos-ai-workspace/issues/867) pocket-id cutover
- [#868](https://github.com/your-org/curaos-ai-workspace/issues/868) Admin+account console

## Tracking
Local: 57 rows in local-issues.sqlite (parent XSRC-IDM / XSRC-IDM-TOOLS, target_phase v1.1). GitHub: 7 lanes #862-868 wired under epic #849.
