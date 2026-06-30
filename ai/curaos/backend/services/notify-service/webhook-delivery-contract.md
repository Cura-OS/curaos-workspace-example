# Webhook Delivery-Guarantee Contract — notify-service

> Canonical published contract for notify-service's webhook channel (ADR-0201
> §3.1). This is the ONE artifact M11 webhook producers/consumers (Commerce,
> Integrations, Site) link — never copy ([[curaos-reuse-dry-rule]]).
> Resolves ADR-0120 Open Question 2 (Foundation Auth §10.2 — webhook delivery
> guarantees). See [RESOLUTION-MAP ADR-0120 row 2](../../../docs/adr/RESOLUTION-MAP.md).
>
> Decision input: [Research — Webhook Delivery-Guarantee Patterns](../../../docs/research/webhook-delivery-guarantee-patterns.md)
> (Standard Webhooks / Stripe / GitHub / Svix survey).
> Version: contract **v1**. Status: RESOLVED-ADR.

## 1. Decision (ADR-0120 Q2)

CuraOS webhook delivery is **at-least-once with caller idempotency keys**, signed
with **HMAC-SHA256** and a **versioned in-band signature header** (`v1,<sig>`).
**Exactly-once and strict ordering are deliberately NOT offered** — consumers
that need either re-fetch source state on receipt (the Stripe/Standard-Webhooks
guidance). This is the industry consensus surfaced in the research doc §2.5.

A single at-least-once correctness model covers every event class. A thin
**tier overlay** maps event classes to retry aggressiveness and DLQ disposition —
NOT to a different correctness guarantee. All tiers share the same signing,
idempotency, replay-protection, and ack semantics defined in §3.

Per [[curaos-rolling-update-rule]] this contract is a **semver bump on the
existing M10 webhook channel** (#271 — HMAC-SHA256 signed retry queue + DLQ),
NOT a `-v2`/`-next` parallel endpoint. Algorithm and signing-key rotation ride
the `v1,`/`v2,` version prefix in-band on the same endpoint (§3.2).

## 2. Per-event-type tiers

Producers tag each webhook event with a tier. Default tier when unspecified =
`T-Standard`. Final event-class → tier assignment for M11 domains is owned by the
consuming Stories (Commerce / Integrations / Site) and recorded against this
contract; the classes below are the binding defaults.

| Tier | Event classes (examples) | Guarantee | Retry max + backoff curve | DLQ disposition | Ordering |
|---|---|---|---|---|---|
| **T-Critical** | auth/security (`session.revoked`, `mfa.enrolled`), commerce payment callbacks (`payment.succeeded`, `payment.refunded`) | at-least-once + idempotency-key; long retry horizon | **12 attempts**, exponential backoff `~5s → 30s → 2m → 10m → 30m → 1h → 2h → 5h → 10h` (jittered), then DLQ | **park-for-replay** + ops alert | per-subscription best-effort; consumer re-fetches state |
| **T-Standard** | `order.status_changed`, integration sync, `document.ready` | at-least-once + idempotency-key | **8 attempts**, exponential backoff `~5s → 30s → 2m → 10m → 30m → 1h → 2h` (jittered), then DLQ | **park-for-replay** | none guaranteed |
| **T-BestEffort** | analytics, non-critical notifications, `content.published` / CDN-purge | at-least-once, short horizon (degrade-friendly) | **4 attempts**, exponential backoff `~5s → 1m → 10m → 30m` (jittered), then DLQ | **drop-with-metric** (`webhook_dlq_dropped_total{tier="best_effort"}`) | none |

Notes:
- All tiers are **at-least-once**. The tier never weakens correctness — only the
  number of retries before DLQ and what the DLQ does with an exhausted message.
- Backoff is exponential with full jitter; the curve column lists nominal
  per-attempt delays. Total horizon: T-Critical ≈ 24h, T-Standard ≈ 4h,
  T-BestEffort ≈ 40m.
- `park-for-replay` DLQ rows are retained for operator-initiated manual replay
  (admin replay endpoint scope is an M11 open point — research doc §5.4); they
  are NOT auto-redelivered after the retry horizon is exhausted.

## 3. Wire contract (all tiers)

### 3.1 Headers (request, notify-service → consumer endpoint)

| Header | Value | Purpose |
|---|---|---|
| `webhook-id` | unique message id (UUID/ULID) | **idempotency key** — consumer dedups on this; stable across all retries of the same message |
| `webhook-timestamp` | unix seconds at first send | **replay-protection** timestamp |
| `webhook-signature` | `v1,<base64-hmac>` (space-separated list allows multi-key rotation) | HMAC signature (§3.2) |
| `webhook-event-type` | dotted event name (e.g. `payment.succeeded`) | routing |
| `webhook-tier` | `critical` \| `standard` \| `best_effort` | informational; consumer MAY size its own SLA |

Header names adopt the **Standard Webhooks** naming verbatim for ecosystem fit
(`webhook-id` is the idempotency key; recommended in research doc §5.2).

### 3.2 Signature spec

- **Algorithm:** HMAC-**SHA-256** over the signed content `{webhook-id}.{webhook-timestamp}.{raw-body}`.
- **Header:** `webhook-signature`, value `v1,<base64(hmac)>`. The `v1,` prefix is
  the **in-band version**; key rotation publishes both `v1,<sigOld> v1,<sigNew>`
  (space-separated) during the overlap window, and an algorithm migration would
  ship `v2,<sig>` on the **same endpoint** — no parallel `-v2` path
  ([[curaos-rolling-update-rule]]).
- **Secret:** per-subscription HMAC secret stored in `webhook_subscriptions`
  (see CONTEXT.md data model).
- **Replay window:** consumers MUST reject a request whose `webhook-timestamp` is
  outside **±5 minutes** of receipt (tolerance window), in addition to verifying
  the signature.

### 3.3 Acknowledgement semantics (consumer response → notify-service)

| Consumer response | Meaning | notify-service action |
|---|---|---|
| **2xx** | delivered / acked | mark `delivered`, emit `curaos.webhook.delivered.v1`, stop |
| **4xx** | permanent failure (bad endpoint / rejected) | **no retry** → DLQ-**park** (or drop for `T-BestEffort`); emit `curaos.notify.failed.v1` |
| **5xx** or timeout | transient failure | **retry-eligible** per the tier's backoff curve until attempts exhausted → DLQ per tier disposition |

Timeout = no response within the per-attempt deadline (treated as 5xx-class /
retry-eligible). A `429` is treated as `5xx`-class (retry-eligible, honoring
`Retry-After` when present).

## 4. Alignment

- ADR-0201 §3.1 (notify-service charter) already mandates HMAC-SHA256 signed
  webhooks + DLQ; this contract formalises the **guarantee + tier overlay** on
  top, with **no re-architecture** of the M10 channel (#271).
- PHI boundary preserved: webhook payloads carry deep-links + non-clinical
  labels only (ADR-0201 §3.1.6), regardless of tier.
- [[curaos-reuse-dry-rule]]: this is the single canonical contract; consumers link it.
- [[curaos-rolling-update-rule]]: semver bump + in-band versioned signature header.

## 5. References

- [notify-service AGENTS.md](AGENTS.md) · [CONTEXT.md](CONTEXT.md) · [Requirements.md](Requirements.md)
- [ADR-0120 §10 Q2 (Foundation Auth)](../../../docs/adr/0120-foundation-auth.md)
- [ADR-0201 §3.1 (notify-service charter)](../../../docs/adr/0201-cluster-platform-shared-services.md)
- [Research — Webhook Delivery-Guarantee Patterns](../../../docs/research/webhook-delivery-guarantee-patterns.md)
- Standard Webhooks spec (external): https://www.standardwebhooks.com/
