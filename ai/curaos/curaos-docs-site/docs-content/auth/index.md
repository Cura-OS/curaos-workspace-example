# Auth setup

CuraOS authenticates through OpenID Connect (OIDC). The reference deployment uses
**Pocket-ID** as the identity provider, with the **Authorization Code flow plus
PKCE**. This page covers the flow, what each app and the API expect, and how to
wire up your own provider.

## The flow

All public web apps and the API gateway speak the same OIDC flow:

1. The user opens an app and is redirected to Pocket-ID (the live IdP is at
   `auth.example.com`).
2. The app starts an **Authorization Code + PKCE** request (a public client, no
   client secret in the browser; PKCE protects the code exchange).
3. The user authenticates at Pocket-ID and is redirected back to the app with an
   authorization code.
4. The app exchanges the code (with the PKCE verifier) for an ID token and an
   access token.
5. The app calls the API gateway with the access token as a bearer token.

```
User -> App -> Pocket-ID (auth.example.com)   [authorize + PKCE]
     <- code <-
App  -> Pocket-ID  [token exchange + PKCE verifier]
     <- id_token + access_token <-
App  -> API gateway (api.example.com)  [Authorization: Bearer <access_token>]
```

## Why PKCE

The apps are browser-based public clients. PKCE (Proof Key for Code Exchange)
binds the authorization code to the client that requested it, so an intercepted
code cannot be redeemed by anyone else. This is the current best practice for
single-page and native clients and is required by the apps; there is no
client-secret flow in the browser.

## What the API expects

The API gateway accepts the access token Pocket-ID issues:

```bash
curl https://api.example.com/api/v1/tenancy \
  -H "Authorization: Bearer ${ACCESS_TOKEN}"
```

Tokens are scoped per tenant and per role. RBAC (with optional ABAC) decides what
a token may do. Audit records are tamper-evident, and privileged actions follow
an approval path with a logged break-glass option.

## Wiring up your own provider

For a self-hosted install, stand up an OIDC provider and configure each app and
the gateway against it.

1. **Run an OIDC provider.** The reference uses Pocket-ID. Any standards-
   compliant OIDC provider that supports Authorization Code + PKCE will work.

2. **Register the clients.** Register each app as a public client with PKCE
   enabled, and set its redirect URI to the app's callback. The apps share the
   `login.example.com` sign-in surface in the reference; you can mirror that or
   register per-app redirect URIs.

3. **Configure issuer and audience.** Point the apps and the gateway at the
   provider's issuer URL, and set the expected audience for the access token so
   the gateway validates tokens correctly.

4. **Map roles.** Map provider groups/claims onto CuraOS roles so RBAC applies.

!!! tip "Air-gap"
    Pocket-ID self-hosts cleanly with no external dependency, which keeps the
    OIDC path viable in an offline or air-gap install. Host the IdP inside the
    same cluster or network as the rest of CuraOS.

## Troubleshooting

- **Redirect URI mismatch.** The redirect URI registered with the provider must
  exactly match the app's callback, including scheme and host.
- **Token rejected by the gateway.** Check that the gateway's expected issuer and
  audience match what the provider puts in the token.
- **Health check works but authenticated calls fail.** Health endpoints
  (`/api/v1/<domain>/healthz`) are unauthenticated by design; a 401 on a real
  endpoint means the token is missing, expired, or out of scope.

Next: [Operations](../operations/index.md) for day-2 runbooks.
