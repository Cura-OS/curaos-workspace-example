# Opposite-Harness Grill: personal-crm-service#4 (event catalog + AsyncAPI + outbox wiring)

GRILL: opposite-harness (Claude -> Codex)
GRILL-HARNESS: codex
GRILL-MODEL: codex default (ChatGPT account), reasoning_effort=high
GRILL-MODE: read-only adversarial planning reviewer
GRILL-DATE: 2026-06-09
Subject: issue-4-personal-crm-event-catalog

## Plan reviewed

A. src/events/personal-crm-event-producer.ts becomes the CANONICAL home for the
   curaos.personal.crm.* catalog (move the 10 topic constants + types + builder
   there) and adds a Zod PersonalCrmEventPayloadSchema with a superRefine that
   rejects PII-shaped values + unknown keys.
B. src/crms/personal-crm-event-producer.ts becomes a thin re-export of the new
   canonical module (no topic rename, no break to lane #5 consumers or src/index.ts;
   per [[curaos-rolling-update-rule]]).
C. Payload stays strictly ids-only (no display_name), matching #3's landed code and
   the dispatch prompt; the issue-body display_name mention is documented as a
   divergence.
D. TDD: test/events/personal-crm-catalog.test.ts proving topic/map completeness,
   schema accept/reject (valid ref-only vs injected PII field / email value), and
   no-PII on every event type's serialized value.
E. AsyncAPI stays 1:1; add a parity check (YAML channel addresses vs the topic map).

## Verdict

Plan endorsed. No CRITICAL flags. All decision points carried recommendations sourced
from the landed code + research, so they are auto-applied per
[[curaos-recommendation-auto-apply-rule]] (logged in AUTO-DECISION-LOG.md); none are
genuine user-escalation candidates.

## Findings (auto-applied recommendations)

1. resource_id / user_id / tenant_id UUID + closed enums as PRIMARY proof.
   Recommendation: yes. Structural validity (z.string().uuid() + closed type and
   resource_type enums) carries the main reference-only proof; the PII regex
   superRefine is defense-in-depth, not the only gate. APPLIED.

2. Exclude occurred_at from the PII regex scan. Recommendation: yes - a DOB/date
   regex would otherwise reject every valid ISO-8601 timestamp. APPLIED (the scan runs
   over id/type fields only; occurred_at is validated by z.string().datetime()).

3. resource_type closed enum: PersonalContact, PersonalRelationship,
   PersonalContactGroup, PersonalContactMethod, PersonalContactConsent.
   Recommendation: yes. APPLIED.

4. .strict() on the payload object to reject unknown/injected keys.
   Recommendation: yes. APPLIED.

5. Stale AsyncAPI header comment still claimed a 3-topic core-only mirror.
   Recommendation: make the personal section 1:1 and fix the header. APPLIED (header
   updated to document BOTH the neutral core CRUD envelope AND the personal overlay
   catalog; the issue says "alongside the codegen CRUD envelope", so core topics stay).

## Escalation candidates -> resolved without user (recommendation existed / scope-bound)

- Keep neutral core topics in specs/crm.asyncapi.yaml? Resolved: yes. Issue #4
  Acceptance: "mirrors the 8-topic catalog 1:1 alongside the codegen CRUD envelope; no
  .v1 channel renamed." Removing core topics would be an unapproved scope change.
- Add @asyncapi/parser dev dependency? Resolved: no (out of scope). The parity test
  parses the YAML in pure TS and compares channel addresses to the topic map; no new
  dependency. spec:openapi continues to use tsp compile.
- PII heuristic breadth? Resolved: structural UUID + closed enums carry the proof; the
  regex (@-email, long digit runs) is defense-in-depth over the bounded reference-only
  field set, so false positives cannot reject a valid UUID/enum.
