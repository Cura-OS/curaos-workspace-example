# event-interceptors — Agent Context

## Status

M1 stub scaffolded 2026-05-25. Full impl per [ai/curaos/docs/HANDOVER.md](../../../docs/HANDOVER.md) (M2 event infrastructure milestone).

## Intent

NestJS `@Injectable()` interceptors for CuraOS event bus integration. Owns correlation-ID propagation, tenant-header injection, and outbox pattern wiring across NestJS services. Consumed by every backend service that publishes or consumes durable events.
