---
name: curaos-triplet-split-rule
title: Triplet split (personal/business variants only for named divergent subject ownership + downstream consumer)
description: Decide when a neutral capability needs personal/business variants; no blanket triplet scaffolding without a named divergent subject and downstream consumer
metadata:
  node_type: rule
  type: feedback
---

# CuraOS Triplet Split Rule

Canonical rule: split a neutral capability into `personal-*` and/or `business-*` variants only when the variant owns genuinely different subject data or domain behavior.

## The Rule

A domain gets an individual variant only when both conditions are true:

1. A named downstream vertical or product needs an individual-as-data-owner subject.
2. That subject needs divergent domain logic or protected storage that cannot be represented as a party-scoped reference in the neutral core.

A domain gets a business variant only when the organization/enterprise behavior is not already the natural scope of the core service.

Do not create blanket `personal-*` / `business-*` services just because the workspace charter names the eventual three-way shape. The charter is a target capability model; this rule decides when each variant becomes real tracker work.

## M11 Baseline

The M11 triplet research at `ai/curaos/docs/research/2026-06-02-m11-triplet-split-domain-analysis.md` sets the current baseline:

| Domain | Disposition |
|---|---|
| HR | `personal-hr-service` is approved tracker work. |
| CRM | `personal-crm-service` is approved tracker work. |
| Donation | Defer unless a fundraising vertical becomes active. |
| Commerce, Accounting, Documents, E-Sign, Sales, Procurement, Inventory, Geospatial, Fleet, Conversion, Event, Integrations, Site | Core-only until a named downstream consumer proves divergent subject ownership. |

HR and CRM are approved because HealthStack and adjacent personal-relationship workflows need individual-owned credentials and contacts with behavior distinct from org-owned records.

Donation remains deferred because it has an individual donor subject but no named active M12-M13 consumer. If a fundraising vertical becomes active, re-evaluate and promote through the normal tracker gate.

## Tracker Implications

- Approved variants are not scaffolded directly from a rollup. Create atomic `ready-for-agent` issues with exact module, allowed paths, event map, dependency direction, and codegen path.
- Future variants start staged with `foresight` + Project `Status=Backlog`; once their target milestone is active, their target version is in the current working set, or a current issue declares `blocked-by` or `requires` them, triage evaluates them like normal work.
- Neutral cores stay source-of-truth unless the variant owns protected schema or divergent behavior.
- No `-v2`, `-next`, or provenance/phase names. Variants use responsibility names only.

## References

- `ai/curaos/docs/research/2026-06-02-m11-triplet-split-domain-analysis.md`
- `ai/rules/curaos_foresight_rule.md`
- `ai/rules/curaos_reuse_dry_rule.md`
- `ai/rules/curaos_rolling_update_rule.md`
