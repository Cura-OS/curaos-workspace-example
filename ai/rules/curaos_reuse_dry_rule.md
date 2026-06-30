---
name: curaos-reuse-dry-rule
title: Reuse + DRY for code and docs
description: Reuse first; one canonical owner per reusable behavior/decision/rule/contract/template/workflow; duplicate only with a named owner + removal trigger
metadata:
  node_type: rule
  type: feedback
---

# CuraOS Reuse + DRY Rule

Canonical rule: reuse first, duplicate only with an explicit removal path.

## The Rule

CuraOS code and docs must keep one canonical owner for each reusable behavior, decision, rule, contract, template, and workflow.

Before adding code or docs:

1. Search for an existing owner.
2. Reuse or extend the owner when the need is the same.
3. Create a new owner only when the responsibility is genuinely different.
4. Link to the owner instead of copying canonical text.
5. If duplication is temporary, add the removal trigger and owner path in the same change.

## Applies To Code

- Shared behavior goes into the responsible service/package, not copied into each consumer.
- Cross-service contracts belong in TypeSpec/event schemas/shared SDKs, not local DTO clones.
- Tenant, auth, audit, observability, validation, and error handling use shared CuraOS helpers.
- Frontend apps reuse `@curaos/ui`, generated clients, design tokens, and shared workflow/builder primitives.
- Vertical overlays extend neutral services by reference, event, adapter, or plugin; they do not fork neutral logic.
- Generated code is regenerated from the source contract; never patch generated output as the canonical fix.

## Applies To Docs

- `ai/rules/curaos_*.md` is canonical for cross-cutting behavior.
- ADRs hold decision history and rationale; they link to current rules when rules supersede implementation guidance.
- `Requirements.md` states module-specific requirements; it does not copy full workspace rules or full ADR text.
- `CONTEXT.md` maps current integration, data flow, producers/consumers, and failure modes; it links to canonical rules/ADRs.
- `AGENTS.md` stays short and operational; put large detail in linked sections or canonical rules.
- Repeated module boilerplate is acceptable only as a stable schema marker. Repeated policy text is not.

## Required Checks

When adding or materially editing code:

- Search for existing implementation, helper, package, service contract, generated client, and ADR/rule owner.
- Prefer changing the canonical owner and all consumers together over adding local variants.
- Run the owning package/service tests plus boundary checks.

When adding or materially editing docs:

- Link to rules/ADRs instead of duplicating their text.
- Run `bun scripts/check-doc-graph.js --write`.
- Run `bash scripts/check-docs.sh`.
- Confirm the new/changed doc remains reachable from root `AGENTS.md`.

## Banned

- Copy-pasted business logic across services or apps.
- Local DTO/event/schema copies that drift from the source contract.
- Repeating full rule text inside ADRs, Requirements, CONTEXT, or module AGENTS docs.
- Adding a new helper/package/service when an existing owner can be extended cleanly.
- Creating parallel docs that explain the same current decision without linking and declaring precedence.

<!-- fold: rationale, non-binding -->

## Allowed Duplication

- Generated output from a canonical source.
- Short schema headings repeated across module docs.
- Local examples that demonstrate a canonical rule in a module-specific context.
- Transitional duplication with a named owner and removal trigger.

## How It Satisfies CuraOS Rules

- Supports generic-before-vertical by keeping neutral reusable owners.
- Supports event-led contracts by making schemas and generated clients canonical.
- Supports the doc graph rule by replacing copied policy text with explicit relationships.
- Supports agentic CLI work by giving agents one owner path to inspect and modify.

## Agentic-Tool Friendliness

Agents should answer "where is the owner?" before editing. If no owner exists, create the smallest canonical owner and wire consumers to it. If more than one owner appears valid, follow precedence: rules first, ADRs second, then module docs.
