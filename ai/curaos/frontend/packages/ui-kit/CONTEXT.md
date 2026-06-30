# ui_kit — Agent Context

## Quick facts
- **npm name:** `@curaos/ui`
- **Dual export:** web (React/Radix/Tailwind) + native (RN/NativeWind)
- **Storybook:** v8; Chromatic for visual diffing
- **Token source:** design JSON → generated CSS vars + RN StyleSheet

## Architecture notes
- `src/web/` — React components; `src/native/` — RN components; `src/shared/` — shared hooks/utils.
- `src/tokens/` — `tokens.css` (web) + `tokens.native.ts` (RN); built by token script from `design-tokens.json`.
- `package.json` `exports` map directs bundlers to platform-correct entry.
- Radix UI used as base for Dialog, Popover, Select, Tabs, Tooltip on web — never rewrite ARIA from scratch.
- NativeWind v4 for RN styling; class names mirror web Tailwind where possible for token parity.

## Agent rules
- Propose new components to owner before adding; keep catalogue within maintained scope.
- No business logic or API calls inside components.
- Every new component requires: Storybook story + unit test + ARIA audit note.
- Web components must not import React Native; native must not import DOM APIs.
- Run `turbo run build lint test storybook:build` before marking done.
