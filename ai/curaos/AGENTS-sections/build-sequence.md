# curaos §4 - Foundation Product Build Sequence (Phase 3)

Implementation order is locked (ADR-0099 §12) with one tracking gate before implementation:

```
M1.5 GitHub issue seeding → roadmap for the active version's milestone set (per [[curaos-version-planning-rule]]) + atomic ready-for-agent issues
M2   Shared libs          → @curaos/tenancy + audit-sdk + providers + event-interceptors
M3   Auth (ADR-0120)      → NestJS shell + Better Auth + tenant routing
M4   Builder (ADR-0121+)  → NestJS shell + GrapesJS + Payload + @xyflow/react
M5   Workflow (ADR-0122)  → NestJS shell + Temporal TS SDK + Activepieces
M6   Codegen (ADR-0123)   → NestJS engine + cookbook + Phase 1 recipes (57)
M7   First mold output    → one downstream service proves the mold works
```

Before any post-M1 implementation, verify GitHub Issues exist for the current milestone and its atomic tasks. If `HANDOVER.md` says GitHub issue seed is deferred, that is the next action even when M2 code stubs already exist.

Do not start downstream cluster services (ADR-0200+) until at least Auth reaches v0.
