# CuraOS Frontend Design Language

Durable home for the CuraOS design-system program (Epic [v1] Frontend Product Buildout, curaos-ai-workspace#726). All design intent + prompts + retrieved artifacts live here under `ai/curaos/` per the AI-mirror rule (code repos stay code-only; `curaos/frontend/packages/ui-kit/` holds the IMPLEMENTED `@curaos/ui`, this dir holds the design SOURCE + prompts).

## The OpenDesign -> DesignSync loop

There is no OpenDesign MCP in the agent session; the reachable design tool is **DesignSync** (claude.ai/design, project "Design System" = `1c1d6624-a84f-4e3a-a05a-ade9d07a3429`). Workflow:

1. Agent writes an OpenDesign prompt -> `opendesign-prompts/NN-*.md`.
2. User pastes it into the OpenDesign app, generates the prototype.
3. User exports the result into the claude.ai "Design System" project (or saves files locally + tells the agent where).
4. Agent pulls via `DesignSync get_file` / `list_files`, saves the consumable artifact under `artifacts/`, and wires it into `@curaos/ui` (curaos-ai-workspace#729) + the `gen:ui-app` generator (#727) so every emitted app inherits the design language.

## Layout
- `opendesign-prompts/` - the prompts handed to OpenDesign (numbered, durable).
- `proposals/` - exploratory mockups / brand-direction candidates (rendered HTML cards).
- `artifacts/` - retrieved OpenDesign output (tokens + component preview HTML) ready to wire into ui-kit.

## Phases (per Epic #726, design-led)
- **Phase A (core, FIRST):** core design language - tokens (light/dark) + ~25 core widgets + app-shell. User decision: fresh-modern palette; core-first then cascade. Prompt: `opendesign-prompts/01-core-design-language.md`.
- **Phase B:** per-app designs + overrides for all 22 apps (one prompt per app, derived from each app's `ai/curaos/frontend/apps/<app>/Requirements.md`).
- **Phase C:** full marketing revamp (curaos.example.com).
- **Phase D:** docs hydration + expansion + reality-alignment (curaos-docs).

## Locked stack (ADR-0106)
React 19 + Next.js 15; @curaos/ui = shadcn/ui (Radix) + Ant Design 5 + Style Dictionary W3C tokens + Tailwind (toggleable); light/dark + RTL + per-tenant token-swap overrides; WCAG AA+.
