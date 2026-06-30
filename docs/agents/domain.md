# Domain Docs

Engineering skill consumption rules for workspace domain docs.

## Layout: multi-context

**Multi-context** workspace. 91 submodules total under `curaos/backend/services/*` + `curaos/frontend/{apps,packages}/*` (see `curaos/.gitmodules` for the exact backend/frontend split - counts change as submodules are added). Each submodule owns a `CONTEXT.md` under the `ai/curaos/` mirror path. No root-level `CONTEXT.md`.

```
curaos-workspace/
├── AGENTS.md                              ← workspace contract
├── ai/curaos/
│   ├── AGENTS.md                          ← curaos repo contract (split via AGENTS-sections/)
│   ├── CONTEXT.md                         ← curaos repo context
│   ├── Requirements.md
│   ├── docs/
│   │   ├── adr/                           ← workspace-wide ADRs (0096-archived → 0209)
│   │   ├── rfcs/                          ← forward-looking (some superseded - see archival banners)
│   │   ├── specs/                         ← per-feature specs
│   │   ├── workflows/                     ← workflow definitions
│   │   └── compositions/                  ← builder composition blueprints
│   ├── backend/services/<kebab-service>/  ← per-service AGENTS.md + CONTEXT.md + Requirements.md
│   ├── backend/packages/<kebab>/          ← per-lib
│   ├── frontend/apps/<kebab>/             ← per-app
│   ├── frontend/packages/<kebab>/         ← per-package
│   └── ops/<area>/                        ← AGENTS.md + CONTEXT.md + Requirements.md
└── curaos/                                ← submodules (code only, no ai-docs)
```

## Read order before exploring

1. `/Users/dev/workspace/curaos-workspace/AGENTS.md` - workspace contract.
2. `/Users/dev/workspace/curaos-workspace/ai/curaos/AGENTS.md` - curaos contract.
3. Module's `AGENTS.md` + on-demand sections in `AGENTS-sections/` (per [[curaos-agents-md-schema-rule]]).
4. Module's `CONTEXT.md` (e.g. `ai/curaos/backend/services/identity-service/CONTEXT.md`).
5. `/Users/dev/workspace/curaos-workspace/ai/curaos/docs/adr/` for area-relevant ADRs:
   - `0096-0099` - archived research + charter
   - `0100-0199` - foundation runtime + platform products + cross-cutting baseline
   - `0200-0299` - Wave 1 lite cluster decisions
6. Module's `Requirements.md` for canonical spec.

If step 3-6 file missing: **proceed silently**. Producer skill (`/grill-with-docs`) creates lazily.

## Repo + submodule boundary

`curaos/` submodules = code + README + CHANGELOG + build files ONLY. Agent docs (CONTEXT.md, Requirements.md, AGENTS.md, ADRs) under `ai/curaos/<mirror-path>/`. Never write agent docs into submodule. Per workspace `AGENTS.md` §1 + [[curaos-repo-boundary-rule]].

## Glossary inside CONTEXT.md

Every module's `CONTEXT.md` SHOULD have `## Domain Glossary`:

```markdown
## Domain Glossary

- **<Term>** - definition. Avoid: synonyms to NOT use.
```

Workspace glossary (cross-module: Tenant, PHI, BPMN, Foundation) → `ai/curaos/CONTEXT.md`. Per-module glossary = module-unique terms (e.g. `healthstack-orders-service/CONTEXT.md` defines ServiceRequest, OrderSet, CDS Hook).

Missing glossary → **proceed silently**. `grill-with-docs` populates on first term-resolving decision.

## Use glossary vocabulary

Output naming domain concept (issue title, refactor proposal, hypothesis, test name) → use term as defined in most-specific applicable `CONTEXT.md`. No drift to glossary-avoid synonyms.

Concept not in any glossary = signal: inventing project-foreign language (reconsider) OR real gap (note for `/grill-with-docs`).

## Flag ADR conflicts

Output contradicts existing ADR → surface explicitly, not silently override:

> _Contradicts ADR-0099 §4 (each-service-is-a-product) - but worth reopening because…_

## Cluster ADR reference

| Cluster | Range | Topic |
|---|---|---|
| Archived research | 0096-0098 | Pre-charter research |
| Charter | 0099 | Charter + injection-molding + each-service-is-product |
| Foundation runtime | 0100-0123 | NestJS + Auth + Builder + Workflow + Codegen |
| Sub-products | 0121a-e | Sites + Apps + Widgets + Workflow Canvas + Forms |
| Cross-cluster baseline | 0150-0162 | Coherence rules + finding resolutions |
| Cluster ADRs (Wave 1 lite) | 0200-0209 | Per-cluster cross-service decisions |
