# pocket-id -> CuraOS own IdM cutover plan

Retire the self-hosted pocket-id (OIDC/passkey broker that identity-service brokers to) by standing up our own multi-tenant OIDC/OAuth2 provider + user/org/entitlement platform. Generator-first, person/tenant-centric, self-hosted + BYO duality.

## Cutover
```json
{
  "title": "Retire pocket-id: stand up CuraOS-native OIDC/OAuth2 provider in identity-service and switch the broker to our own issuer",
  "current_state_summary": "identity-service is a strong AUTHENTICATION service (login, password+argon2+HIBP, WebAuthn/passkey, DPoP, refresh-sessions in Valkey+PG, break-glass, MFA factors, recovery codes, consents, data-export/deletion self-service, RBAC admin) that signs ES256 first-party CuraOS tokens. It is NOT an OIDC/OAuth2 PROVIDER: no /authorize, no /.well-known/openid-configuration, no exposed JWKS endpoint, no OAuth client registry, no consent-screen flow, no /token grant_type machinery, no /userinfo, no introspection/revocation. The 19-22 FE apps log in against pocket-id (auth.example.com) and the broker (src/auth/oidc-broker/*) only VALIDATES pocket-id id_tokens and re-mints CuraOS tokens. pocket-id is therefore the relying-party-facing OIDC PROVIDER we must replace; the broker is the bridge we must repoint at our own provider then delete.",
  "recommended_provider_core": "node-oidc-provider (Logto's fork choice; pure TS, fits Bun+NestJS) wrapped as a NestJS module inside identity-service, backed by a Drizzle/Postgres adapter (Citus tenant-scoped via nid column). Logto is the closest stack-fit corpus: mine packages/core/src/oidc/* (adapter.ts, grants/*, scope.ts, extra-token-claims.ts, resource.ts, init.ts) as the port-adapt template. Ory-Hydra-as-service is the fallback if certification risk demands it (it is the cleanest 'no user management, headless provider' separation - identity-service already speaks its challenge/verifier pattern via login/consent accept), but it is a Go service-boundary add that breaks the single-stack/single-binary Bun-compile charter, so it is the alternative-in-ADR, not the default.",
  "parity_checklist": [
    {
      "capability": "OIDC discovery (/.well-known/openid-configuration) + JWKS endpoint (/.well-known/jwks.json)",
      "pocket_id_has": true,
      "local_maturity": "partial",
      "evidence": "ES256 key handling + JWKS-capable key material exists in login-token.service.ts (importJWK/exportJWK/calculateJwkThumbprint, kid in protected header) but NO public discovery or JWKS HTTP endpoint is exposed; platform-bearer-verifier reads a static CURAOS_JWT_ES256_PUBLIC_JWK env, not a published JWKS.",
      "work_to_parity": "Add provider well-known + JWKS routes via node-oidc-provider; expose the existing ES256 keyset; add key-rotation window. Generator-first: emit the discovery/JWKS contract in auth.tsp.",
      "owner": "identity-service (new oidc-provider module)"
    },
    {
      "capability": "Authorization endpoint (/authorize) - code flow + PKCE (mandatory for public), id_token response types",
      "pocket_id_has": true,
      "local_maturity": "absent",
      "evidence": "No /authorize route anywhere in src/ (grep confirmed); login is a direct POST /auth/login returning tokens, not a browser authorization redirect flow.",
      "work_to_parity": "Add node-oidc-provider authorization handler; bridge its interaction (login+consent) to the existing login-user.service + webauthn + MFA. hosted-login renders the interaction pages.",
      "owner": "identity-service + hosted-login"
    },
    {
      "capability": "Token endpoint (/token) - authorization_code, refresh_token, device_code, client_credentials",
      "pocket_id_has": true,
      "local_maturity": "partial",
      "evidence": "Token MINTING (ES256, DPoP cnf binding, refresh-session rotation) is fully built in login-token.service.ts + refresh-session.service.ts, but it is NOT exposed as an OAuth /token endpoint with grant_type dispatch; refresh is a bespoke POST /auth/refresh.",
      "work_to_parity": "Wire node-oidc-provider token grants to reuse the existing token-signing + refresh-session store as the adapter backend. Add device_code + client_credentials grants. Keep DPoP.",
      "owner": "identity-service"
    },
    {
      "capability": "Userinfo endpoint + token introspection (RFC 7662) + revocation (RFC 7009)",
      "pocket_id_has": true,
      "local_maturity": "absent",
      "evidence": "No /userinfo, /introspect, /revoke routes. Account profile exists at /account/profile but is not the OIDC userinfo claim shape.",
      "work_to_parity": "node-oidc-provider provides all three; map claims from existing user model + @curaos/policy roles via a claims/scope mapper (mine Logto scope.ts + extra-token-claims.ts).",
      "owner": "identity-service"
    },
    {
      "capability": "End-session / RP-initiated logout (+ front/back-channel logout)",
      "pocket_id_has": true,
      "local_maturity": "partial",
      "evidence": "POST /auth/logout + session revocation exist but as first-party session kill, not OIDC end_session with id_token_hint or back-channel logout to clients.",
      "work_to_parity": "Add OIDC end-session handler; cascade to refresh-session revocation; add backchannel_logout_uri per client.",
      "owner": "identity-service"
    },
    {
      "capability": "OIDC client (relying-party) management - CRUD, secret rotation, PKCE flag, callback/logout URLs, skip-consent, group restriction",
      "pocket_id_has": true,
      "local_maturity": "absent",
      "evidence": "No OidcClient model, no /oidc/clients routes, no client secret hashing. admin.controller.ts only manages users + roles.",
      "work_to_parity": "New oidc_clients table + CRUD admin routes + secret hashing (argon2, reuse password-hasher). Seed the 19-22 FE apps + the broker consumer as clients. Generator-first: emit per-client registration into the contract.",
      "owner": "identity-service (new pkg @curaos/oidc-clients or in-service)"
    },
    {
      "capability": "Device authorization flow (RFC 8628) - device_code + user_code + verification UI",
      "pocket_id_has": true,
      "local_maturity": "absent",
      "evidence": "No device endpoints.",
      "work_to_parity": "node-oidc-provider device flow + a verification page in hosted-log
```

## Coverage statement

Target beats pocket-id and matches-or-exceeds the top-3 self-hosted IdPs (Keycloak, Zitadel, authentik) and top-3 CIAM platforms (Logto, Ory, supertokens) on every capability, both 1:1 and stacked, while staying person/tenant-centric with zero feature loss and a self-hosted + BYO duality.

BEATS pocket-id (1:1): the backlog covers every pocket-id capability - OIDC discovery/JWKS, /authorize+PKCE, /token grants (incl. device_code + client_credentials), /userinfo, introspection (RFC 7662), revocation (RFC 7009), end-session + back/front-channel logout, OIDC client CRUD with secret rotation + group gating, device flow (RFC 8628), PAR, private_key_jwt client auth, WebAuthn/passkey (already HAVE, plus rename/label), user model + groups + per-user/per-group custom claims, one-time-access + signup tokens with usage limits, email verification, passkey-based initial admin setup, API keys (PATs), geo-enriched tamper-evident audit, LDAP sync, SCIM config+trigger (we ship FULL SCIM 2.0, exceeding pocket-id), OAuth2 session store, app-config KV, admin console, account console, full login/signup/consent/device UI, and rate limiting. CuraOS additionally EXCEEDS pocket-id on GDPR (data-export + deletion-request + security-overview + recommendations + activity), DPoP sender-constrained tokens, and tamper-evident hash-chain audit - none of which pocket-id has.

MATCHES/EXCEEDS top-3 IdPs + top-3 platforms (stacked superset): the capability map mined Keycloak (SAML core, LDAP/kerberos federation, Organizations, composite roles, admin REST v2, SCIM, authz/UMA), Zitadel (Instance->Org->Project, machine accounts, lifecycle state machine, event-sourced audit, Action flows, connectRPC v2), authentik (Flow+Stage engine, LDAP/SCIM/SAML outposts, event sanitization), Logto (Organizations + org-roles/scopes/invitations + JIT email-domain SSO, connector-kit, sign-in-experience, TS SAML, console+account React apps), Ory (Hydra grant/flow correctness + token hooks, Kratos flow state-machines + AAL model, Keto/OPL ReBAC), and supertokens (account-linking primary-user, rotating-refresh theft detection, dashboard). The plan delivers the UNION: OIDC/OAuth2 provider (IDM-1..12), B2B Organizations superset (IDM-13/14), social+LDAP+SAML+SCIM federation (IDM-15/19/20/21), MFA+AAL step-up (IDM-16), ReBAC/Zanzibar entitlements (IDM-22), session theft-detection + full OAuth2 session store (IDM-23), token-claims hooks via event-led outbox + BPM (IDM-25), admin + account consoles (IDM-17/18). No single source has all of these; CuraOS stacked covers each one.

PERSON/TENANT-CENTRIC (dominant lens, per PERSON-CENTRIC-LENS.md): every item carries a dual surface - a person-facing journey (account console owns profile/credentials/sessions/consents/exports/deletion/authorized-clients/API-keys/linked-identities; person-centric consent screen shows exactly what each client receives; passkey/email recovery keeps the person unlocked; multi-org membership + org-switch + JIT-domain-join are person-journey actions) AND a management surface (org-admin-scoped, never god-mode: clients/groups/claims/audit limited to the admin's own org). Two tenancy layers are honored: @curaos/tenancy = deployment isolation boundary (PHI never crosses), Logto-style Organizations = the B2B grouping the person belongs to. Resource-ownership ReBAC tuples make the person the default owner of their records; sharing is an explicit person-driven grant. No feature is lost: every mined business/management/compliance capability is preserved or filed forward (SCIM/LDAP/SAML/ReBAC to v1.1), simplification means re-centering and automation, never capability removal.

SELF-HOSTED + BYO DUALITY: provider issuer/JWKS are per-deployment with zero external discovery calls (air-gap viable per the charter); the single Bun+NestJS stack + single-binary Bun-compile is preserved (no Go service-boundary unless the documented Hydra/OpenFGA escape-hatches are triggered by benchmark/certification pressure). BYO is first-class: the repurposed oidc-broker federates BYO-external-OIDC, @curaos/identity-federation binds BYO-LDAP/AD and BYO-SAML per org, and customers keep their own directories with no cloud lock-in. Generator-first throughout: every surface lands in auth.tsp/auth.asyncapi.yaml FIRST, regenerates @curaos/identity-sdk, and is wired by emitServiceLive/emitUiApp per the generator-evolution-rule."

## Stacked statement (tool research)

Adopting this stack lets CuraOS IdM beat each source 1:1 and beat all of them stacked, while staying generator-first, security-weighted, and person/tenant-centric.

ONE-TO-ONE (we beat each source on its own turf):
- vs node-oidc-provider (panva): we get its FAPI-certified AS protocol surface verbatim, but mount it generator-first behind a Drizzle+Citus tenant-scoped adapter and run it as a Node sidecar (identity-oidc-service) so the Bun-primary plane is preserved. Source gives a single-instance, single-DB engine; we add per-tenant issuer routing + codegen adapter the source never ships.
- vs Logto/Zitadel (full CIAM): they hand you an opaque schema + second runtime + flat org-RBAC template. We keep Drizzle-owned identity data, per-org role divergence via @curaos/policy, Citus DB-per-tenant isolation, and PHI inside overlay schemas. We take their org/JIT/invite UX as a reference design, not a black box.
- vs @simplewebauthn: already in-tree at v13.3.1; we bump to v13.3.2 and wrap it in a generated PasskeyModule with per-tenant rpID (eTLD+1) + Related Origin Requests for BYO-domain tenants. Source is a library; we make it tenant-aware and generator-emitted.
- vs jose/openid-client/oauth4webapi (panva): shared in-tree dep graph (jose already pinned). We get FAPI-2.0 RP-certified primitives and emit SET/RISC/CAEP builders + DPoP guards from codegen rather than hand-wiring per service.
- vs ldapts/SCIMMY/SCIMGateway: each is a niche leaf; we wrap them in generated, Filter.escape-safe, bearer-guarded, TLS-1.3-tested, Postgres-plugin (never LokiJS) modules with mandatory tenant-scoped tokens the libraries leave to the caller.
- vs OpenFGA: we take Zanzibar graph traversal for the cross-resource B2B-org-inheritance cases ONLY, pinned >=v1.17.1 + Helm-hardened, while @curaos/policy stays the primary in-process RBAC/ABAC plane (zero CVE cadence, no sidecar) for the 80% case.
- vs Ory Polis / Better Auth / SuperTokens / Cerbos-WASM / SpiceDB / immudb: rejected or referenced because each fails a binding CuraOS constraint (better-sqlite3+TypeORM Bun blocker, global-email-uniqueness wontfix, EE paywall on self-hosted IdP role, Hub-gated air-gap break, ~2-month correctness-advisory cadence, BSL redistribution). We harvest their DESIGN (org model, flow state machine, tamper-proof schema, policy DSL) without inheriting their runtime/license poison.

STACKED (we beat the union of all sources):
No single source gives you: (a) a FAPI-certified AS, (b) Drizzle+Citus DB-per-tenant identity data ownership, (c) Bun-primary runtime, (d) passkey-first WebAuthn with per-tenant rpID + ROR, (e) one authorization plane (@curaos/policy) with OpenFGA only for graph cases, (f) HMAC-keyed app-layer audit chain + pgaudit DB-layer + optional immudb high-assurance anchor, (g) person-centric dual surfaces (patient/customer self-service + clinician/admin management) over the SAME contract, and (h) every artifact emitted from a single TypeSpec/codegen toolchain so the trio (core/personal/business + healthstack overlay) stays symmetric. Each source covers a slice and forces a runtime, schema, or license compromise on the rest. CuraOS composes the certified protocol cores + audited crypto primitives we IMPORT with the tenancy, policy, audit, and person-centric surfaces we OWN and GENERATE - so we inherit the security pedigree of the best-in-class engines while keeping the data model, runtime, and journey design under our own generator. The net: every required management/compliance/back-office feature is preserved (no_loss), every capability gets a person-facing journey surface AND a management surface from one data+contract spine, and the whole IdM plane is reproducible from codegen rather than hand-assembled from nine incompatible vendors.