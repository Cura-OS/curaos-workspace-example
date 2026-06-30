# ADR-0217: gen:ui-app-native - React Native (Expo) app recipe for mobile surfaces

Status: Accepted (2026-06-16)
Target Version: v1
Extends: ADR-0106 (frontend), ADR-0153 (codegen recipe coverage), ADR-0216 (web app-fleet build-out).

## Context

v1.0 frontend includes two mobile apps - clinician-app and patient-app - specified as React Native + Expo (managed workflow, Expo Router) per their Requirements. The `gen:ui-app` generator only emits the Next.js (`ui.react-next`) recipe. There is no `ui.react-native` emitter, so both apps are empty. The web recipe's depth (per-screen list/detail/forms, mock-first render, role guards) should carry to mobile, but the rendering substrate differs entirely (RN components, not DOM; Expo Router, not Next App Router; SecureStore, not httpOnly cookie).

## Decision

Add `gen:ui-app-native` (command `bun run gen:ui-app-native <app>`), a sibling emitter to `gen:ui-app`, sharing the same screen-derivation (`parseRestScreens` over the app's Requirements integration points) but emitting an Expo app:

1. **App shell.** Expo SDK 52+ managed workflow, Expo Router (file-based routes under `app/`), TypeScript, React Native 0.77+. `app/_layout.tsx` root with providers; `app/(tabs)/` tab navigator with one tab per screen; `app/<screen>/[id].tsx` detail routes.

2. **Screens (depth parity with web).** Per REST-consumer screen: a list screen (FlatList + pull-to-refresh + search), a detail screen (field list), a create/edit form (react-hook-form + zod + RN inputs), all wired through the shared data layer. Loading/error/empty states via RN components.

3. **Data layer reuse.** Reuse `@curaos/api-client` (it is RN-capable: TanStack Query + the REST SDKs work in RN) + a generic `src/api/mock-data.ts` (the SAME mock-first seam as web, so the app renders offline on a device/simulator with no backend). `useQuery` imported directly from `@tanstack/react-query`.

4. **UI primitives.** Mobile screens use a small RN primitive set (View/Text/Pressable-based Button, Card, ListRow, StatusBadge, Field, EmptyState, Spinner) emitted into the app (or a `@curaos/ui/native` subpath later). Tokens (colors/spacing) mirror the Aqua design language values so mobile matches web. NOT shadcn/Radix (DOM-only).

5. **Auth.** OIDC via `@curaos/auth-sdk` with Expo SecureStore for the token (not an httpOnly cookie). Mock-session bypass gated by `EXPO_PUBLIC_USE_MOCK` so the app renders offline, mirroring the web mock-session.

6. **Verification bar (this environment).** `expo export` (Metro bundle) + `tsc --noEmit` exit 0 is the shippable v1 bar. Simulator/device render proof is an operator follow-up (no iOS simulator / Android emulator / full Xcode in the build environment - only Xcode CLI tools). This is stated, not hidden.

## Consequences

- clinician-app + patient-app generate from one recipe, depth-matched to the web apps, rendering offline via the same mock seam.
- The web (`ui.react-next`) and mobile (`ui.react-native`) recipes share screen derivation + the mock/data contract, diverging only at the rendering substrate.
- FHIR-specific flows (`@curaos/fhir-client`, FHIR DocumentReference/CarePlan) are generic seams in the scaffold, to be specialized once the FHIR client + service contracts land (generator-evolution).
- Device/simulator render verification is deferred to an environment that has a simulator; the Metro bundle + typecheck is the automated gate.

## Links

- Plan: `ai/curaos/docs/frontend-v1-buildout-plan.md`
- ADR-0216 (web fleet), ADR-0153 (recipe coverage), ADR-0106 (frontend)
- Rules: [[curaos-generator-evolution-rule]], [[curaos-verification-stack-rule]]
