# Integration

CuraOS is event-led: durable messaging is the primary integration path, and
versioned synchronous APIs are secondary. Integrate through the published
extension points and data contracts rather than reaching into a service's
internals.

## The two integration surfaces

Events (primary)
:   Durable, versioned event schemas with stable topic naming, published using
    the outbox pattern. Subscribe to events to react to what happens in the
    platform without coupling to a service's request path. This is the preferred
    way to integrate cross-service or external systems.

APIs (secondary)
:   Versioned HTTP APIs through the gateway, with deprecation sunset dates and
    backward-compatible migrations. Use these for queries and commands where
    request/response latency matters. See the [API reference](../api/index.md).

## Contracts are the source of truth

Captured request/response pairs and the event schemas are the source of truth for
integration, and they are exercised in CI. Build against the published contract,
not against a service's current behavior, and your integration stays valid across
the contract's versioned deprecation window.

- **API contracts**: OpenAPI for the HTTP surface.
- **Event contracts**: AsyncAPI for the durable event schemas. The event model,
  delivery guarantees, and how to consume topics are described in
  [Event contracts](../events/index.md).
- **Versioning**: every contract carries a semantic version; all active versions
  are honored until deactivated.

## Connecting an external system

A typical integration:

1. **Authenticate.** Obtain an OIDC access token from Pocket-ID (Authorization
   Code + PKCE for interactive clients). See [Auth setup](../auth/index.md).

2. **Read or write through the gateway.** Call the relevant domain under its
   versioned API gateway path
   (`https://api.example.com/api/v1/<domain>/...`) with the bearer token.

3. **React to events.** Subscribe to the durable event topics for the domains you
   care about, so your system reacts to changes without polling.

4. **Use the automation core for low-code wiring.** Where you do not want to
   write a service, the automation core provides connectors, actions, and
   scheduling to wire integrations declaratively.

## Extension points

CuraOS publishes its seams and treats them as a contract:

- **Workflow / BPM** definitions are the seam for changing process behavior.
- **The app / site builder** is the seam for new surfaces.
- **Domain contracts** (API + event schemas) are the seam for data exchange.
- **Configuration hooks** let you adjust behavior per tenant without forking.

## Tenant data isolation

When integrating, remember the boundary: PHI and PII live in overlay schemas, and
neutral services hold references and metadata only. An integration that touches
protected data goes through the relevant overlay, under that tenant's isolation,
never through the neutral core.

Next: the [API reference](../api/index.md) for the synchronous surface,
[Event contracts](../events/index.md) for the durable event surface, and
[Operations](../operations/index.md) for running the deployment.
