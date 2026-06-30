# @curaos/events — Agent Context

## Quick facts
- Server-side: full publish/subscribe via broker (Kafka or NATS per deployment)
- Browser: typed schemas + SSE/WS hooks only; no broker connection
- Schema versioning: Zod schemas per event type + version

## Key files
- `src/client.ts` — EventClient (Node.js only)
- `src/schemas/` — typed event schemas per domain
- `src/hooks/useEventSubscription.ts` — React hook (browser)
- `src/sse.ts` — SSE reconnection helper

## Agent rules
- Never include broker SDK in browser bundle; tree-shaking must exclude Node.js EventClient.
- Schema changes to existing events require new schema version; old version handled for backward compat.
- Run `bunx turbo run build lint test` before marking done.
