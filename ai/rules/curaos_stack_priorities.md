---
name: curaos-stack-priorities
title: Stack priorities
description: "Cross-cutting priorities for CuraOS stack decisions - paradigm, protocols, comfort zone, weighting"
metadata: 
  node_type: memory
  type: project
  originSessionId: 957dade0-7133-4262-addf-0595f6326c47
---

User-stated priorities for CuraOS stack decisions (2026-05-24 interview round):

**Topology preference (per-cluster runtime):**
- **Preferred:** Two-tier - one default runtime for ~90% of services, one specialist for hot-path/unique (e.g., DICOM, ML inference, real-time streaming).
- **Allowed:** Free-for-all per service (option 3) is acceptable if justified, but prefer consolidation.

**Mandatory protocol coverage** (must all be supported by the picked stack/ecosystem):
- Events (Kafka/NATS - per ADR-0102)
- REST
- GraphQL
- gRPC
- tRPC
- "Check latest stable version that satisfies needs, not current as-is" - research-driven version pick at decision time.

**Language constraints (NOT preferences - these are filters):**
- Fastest route to high quality
- High performance
- Strong security posture
- Low RAM footprint
- DDD + SOLID + DRY discipline non-negotiable (integration/contract validation enforces)
- Picks language whose ecosystem makes those easy

**User's comfort-zone languages (in declining preference):**
1. Go
2. Rust
3. Kotlin
4. Java
5. TypeScript
6. PHP
7. C#
8. Python (least preferred but acceptable)

**Concurrency model:** "pick best-performing easiest+fastest+safest with AI agent help" - no rigid preference; follow language idiom.

**Decision weights (AI agent friendliness):**
- AI agents can generate + modify code reliably (strong types, predictable patterns, fast tests): **5.0**
- Solo dev + agents tight loop (DX, hot-reload, fast feedback): **4.8**
- Mainstream stack for future human hiring pool: **3.6**

**How to apply:**
- All stack decisions in the 0100-range ADRs must filter through these. No JVM bias unless JVM scores best on the weighted criteria.
- Per ADR, evaluate candidates across user's 8 comfort-zone languages + check protocol coverage + perf/RAM/security profile.
- Final pick = highest weighted score, not "what was started" in the repo.
- See `ai/curaos/docs/adr/RESOLUTION-MAP.md` for current ADR status; ADRs in the 0100-range remain DRAFT until re-validated through this priority lens (some may now be resolved-by-rule).

**Initial dev model:** Solo + 200+ AI agent swarm 24/7. Mainstream hiring is phase 2.
