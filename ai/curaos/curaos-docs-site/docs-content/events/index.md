# Event contracts

CuraOS is **event-led**: durable, versioned events are the primary cross-service
contract, and synchronous APIs are secondary. If you are integrating across
services or with an external system, events are usually the right surface. This
page explains the event model, the contracts, and how to consume them.

!!! note "When to use events versus the API"
    Use the [HTTP API](../api/index.md) for queries and commands where
    request/response latency matters. Use events to **react** to what happens in
    the platform without coupling to a service's request path. A good integration
    reads and writes through the API and subscribes to events for change
    notification.

## The event model

Events in CuraOS are durable, versioned, and reliably published:

Durable
:   Events are persisted, not fire-and-forget. A consumer that is offline when an
    event is published can still receive it when it comes back.

Versioned
:   Every event schema carries a semantic version. All active versions are
    honored until they are deactivated, so a consumer built against a current
    version keeps working through the deprecation window.

Stable topic naming
:   Topic and stream names are stable, so subscriptions do not break under
    refactoring. A topic name identifies the domain and the event.

Outbox pattern
:   Services publish through the transactional outbox pattern: the event is
    written in the same transaction as the state change, then relayed to the
    broker. This guarantees that a state change and its event are never out of
    sync, and the inbox pattern on the consumer side makes processing idempotent.

## Reliability guarantees

The event path is built to fail safely:

- **At-least-once delivery** with idempotent consumers (inbox pattern), so a
  redelivered event does not double-apply.
- **Retries with backoff** for transient consumer failures.
- **Dead-letter handling** for poison messages, so one bad event does not stall a
  stream.
- **Correlation IDs** threaded through the event, the logs, and the traces, so a
  cross-service flow can be reconstructed end to end.

## Contracts are the source of truth

The event schemas are the contract, and they are exercised in CI. Build against
the published schema, not against a service's current behavior.

- **Event contracts**: AsyncAPI describes the durable event schemas (topics,
  payload shape, and versions).
- **API contracts**: OpenAPI describes the HTTP surface (see
  [Integration](../integration/index.md)).
- **Captured request/response and event pairs** are treated as the source of
  truth and are replayed in CI, so a contract change that would break a consumer
  is caught before it ships.

## Consuming events

A typical event-driven integration:

1. **Identify the domains you care about.** Each domain (commerce, calendar,
   donation, fleet, the HealthStack clinical domains, and so on) publishes events
   for the things that happen in it. The owning service is listed in the
   [Services catalogue](../services/index.md).

2. **Read the AsyncAPI contract** for those domains to learn the topic names,
   payload shapes, and versions.

3. **Subscribe** to the durable topics. Because delivery is at-least-once, make
   your consumer idempotent (the inbox pattern): key on the event id and ignore a
   duplicate.

4. **Respect versions.** Pin to a schema version you understand and migrate
   within the deprecation window when a new version ships.

## Tenant isolation on the event bus

The data-isolation boundary applies to events too: events carry references and
metadata, and protected data (PHI and PII) stays inside the overlay that owns it.
An event from a neutral service does not carry protected data; an integration
that needs protected detail follows up through the overlay's API under that
tenant's isolation. See [Security and compliance](../security/index.md).

## Low-code alternative

If you do not want to write an event consumer, the automation core
(`automation-core-service`) can react to events declaratively: a trigger on an
event, a set of actions, and optional scheduling. This is the low-code path for
the same change-notification use case. See [Workflow & builder](../builder/index.md).

Next: [Integration](../integration/index.md) for the end-to-end integration flow,
and the [API reference](../api/index.md) for the synchronous surface.
