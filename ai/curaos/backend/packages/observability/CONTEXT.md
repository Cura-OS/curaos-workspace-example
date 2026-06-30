# @curaos/observability - Agent Context

## Quick facts
- OTel SDK: @opentelemetry/sdk-trace-web (browser) + @opentelemetry/sdk-trace-node (Node.js)
- OTLP exporter; configurable endpoint
- Structured logs include tenantId, correlationId, traceId, spanId
- Error tracking seam is Sentry-compatible and dependency-free; consumers pass the Sentry or GlitchTip-compatible client.
- Error tracker init reads `ERROR_TRACKER_DSN`, falling back to `SENTRY_DSN`.

## Key files
- `src/index.ts` - initErrorTracking + scrubTelemetryPayload
- `src/tracing.ts` - initTracing + withTracing
- `src/hooks/useTrace.ts` - React hook
- `src/logger.ts` - structured logger
- `src/metrics.ts` - recordMetric
- `src/propagation.ts` - traceparent header injection

## Agent rules
- Do not log PHI in any observability output; log IDs + action codes only.
- Platform-split: browser-safe OTel imports in `src/web/`; Node.js in `src/node/`.
- Run `bunx turbo run build lint test` before marking done.
