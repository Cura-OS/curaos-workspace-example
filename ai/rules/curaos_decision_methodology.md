---
name: curaos-decision-methodology
title: Decision methodology (interview funnel)
description: "How to drive CuraOS stack decisions - language-agnostic first, generic high-level questions before tactical, no premature commitments"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 957dade0-7133-4262-addf-0595f6326c47
---

User correction on 2026-05-24 during ADR-0100 interview:

**The rule:** When interviewing about stack decisions, start at the most generic level possible. Do NOT bias options toward a stack (e.g., JVM, Kotlin) before the user has decided that's the layer of question. Every ADR's "decision" should be tentative until validated via higher-level conversation.

**Why:** I picked Kotlin+Spring (Option A "confirmed") in ADR-0100 without first asking the user: do you even want JVM? do you want statically typed? do you want compiled? do you want a multi-paradigm vs functional vs OO language? The interview then offered JVM-flavored team-scale options ("hire Java devs" / "hire Kotlin+Spring devs") - also biased. The user called this out: "the questions are not high level and not really asking me generic questions to decide these."

**How to apply:**

1. **Interview funnel - start broadest, narrow per answer.** Per ADR:
   - Level 1: paradigm questions ("do you want one runtime everywhere, or right-tool-per-service?")
   - Level 2: family questions ("compiled vs interpreted vs hybrid? typed vs dynamic? concurrency model preference?")
   - Level 3: candidate-set questions ("of {JVM, Go, Rust, Node, Python, .NET}, which family?")
   - Level 4: tactical questions ("within JVM: Spring vs Quarkus vs Micronaut vs Ktor?")
   - Only proceed to next level after current level is answered.

2. **ADRs do not auto-confirm current commitments.** Acknowledge what exists, but recommendation section stays TENTATIVE until user interview validates. Treat current Kotlin+Spring etc. as "what was started" not "what we picked."

3. **Charter constraints persist throughout funnel:**
   - Airgap-tight
   - Edge-cost-aware
   - Self-hosted first
   - Multi-tenant SaaS+on-prem+hybrid+airgap
   - HIPAA+GDPR
   - These constraints apply at every level - they NARROW options at each funnel step, they don't disappear.

4. **Two-mode-always for runtime topology:** CuraOS MUST support both:
   - Microservices mode (one service per bounded context, independently deployable)
   - Modular monolith mode (single deployable composing many modules)
   - Same codebase, runtime mode flag picks topology. This is non-negotiable per user.

5. **Generic code-generation requirement:** CuraOS needs first-class code-gen platform with:
   - Forward engineering: API/type/event/DB schema → CRUDs + services + bindings
   - Backward engineering: existing DB/API → models/types/events
   - Interceptor paradigm for adding business logic + tenant-specific customization
   - Tie-in to BPM (Flowable/Temporal) for workflow customization
   - Generated code must remain editable + diff-able + regen-safe

6. **Initial dev model:** Solo user + AI agent swarm (200+ agents, 24/7). Stack must work well with AI agent automation - predictable patterns, strong typing helps agents, good test infra essential. Hiring more humans is phase 2.

7. **Behavior change:** From now on, before launching enrichment + interview cycle for any ADR, START the interview with paradigm-level questions. Only deepen to tactical after paradigm answered. Update ADR recommendation only after full funnel completes.

8. **ADRs 0100-0115 were baseline-aligned by ADR-0150** (`0150-baseline-alignment-rules.md`). Per-ADR current status is in `ai/curaos/docs/adr/RESOLUTION-MAP.md`. For any still-open ADR in that range, add: "Status: Open (pending funnel validation per [[curaos-decision-methodology]]; see RESOLUTION-MAP.md)."
