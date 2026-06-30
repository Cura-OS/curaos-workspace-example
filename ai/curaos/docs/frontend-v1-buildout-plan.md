# Frontend v1.0 Build-out Plan

Status: ACTIVE (2026-06-15). Owner: frontend platform. Target Version: v1.

Goal (user directive 2026-06-15): every frontend app functional and shipped for v1.0, driven by the code generator (`gen:ui-app`), not per-app hand-work. Every issue hit by hand folds back into the generator (generator-evolution rule [[curaos-generator-evolution-rule]]).

## 1. App fleet (22 surfaces)

| App | Kind | v1.0 state | Path to done |
|---|---|---|---|
| admin-app | Next | DONE (renders live, OIDC + mock) | reference gold-standard |
| builder-studio | Next | hand-built | keep; align theme |
| business-automation/donation/shop/site/workflow (5) | Next | generated, builds green | commit + render-verify + theme |
| personal-automation/calendar/donation/notes/shop/site/tasks/tracking/workflow (9) | Next | generated, builds green | commit + render-verify + theme |
| workflow-designer | Next | generated, builds green | commit + render-verify + theme |
| front-office, fleet-manager | Next | generated, builds green | commit + render-verify + theme |
| clinician-app | React Native (Expo) | EMPTY | needs RN generator recipe (ADR-0153 `ui.react-native`) |
| patient-app | React Native (Expo) | EMPTY | needs RN generator recipe |
| hosted-login | Next (auth surface) | EMPTY | login/consent surface app |

Net: 19 web apps with code + building; 17 newly fanned out from the deepened generator; 3 empty (2 RN + hosted-login).

## 2. Generator capabilities shipped (the mold)

`gen:ui-app` (Next.js, ADR-0153 `ui.react-next`) now emits per REST-consumer screen:
- list route + sortable DataTable + Pagination + filter toolbar + row->detail
- `[id]` detail route + DescriptionList + Breadcrumb + role-gated Edit/Delete
- create/edit form (react-hook-form + zod) in a Drawer + per-entity zod schema
- `"use server"` actions (create/update/delete) through a client-free `config.ts` seam
- loading/error/empty states (shared QueryState)
- role guards (`src/auth/can.ts`)
- KPI dashboard root + i18n seam (LocaleProvider + messages/en.json)
- **mock-first render**: generic schema-seeded `src/api/mock-data.ts` + `mockSession` bypass gated by `NEXT_PUBLIC_USE_MOCK`, so every app renders offline with no backend (kills the "all loading" class)
- working OIDC code-exchange callback + jose/decoded session + dev CSP (unsafe-eval) + self-hosted Inter font (font-src data:)

`@curaos/ui`: token-driven + dark-mode + RTL component set incl. Form/FieldError/DescriptionList/Timeline. Built with `"use client"` banner.
`@curaos/api-client`: REST (TanStack Query over per-service SDKs) + GraphQL (Apollo), `"use client"` banner, providers declared client.

## 3. Issues fixed -> folded into generator/packages (generator-evolution)

| Issue hit | Root | Fixed in |
|---|---|---|
| "all loading / white page" | no offline render path | emitter emits mock-data + mock-session |
| stuck Loading (EvalError) | dev CSP missing unsafe-eval | emitter dev CSP |
| serif font | Inter not loaded + font-src | emitter @fontsource + CSP data: |
| login loop | callback read `?jwt` not `?code` | emitter OIDC code-exchange |
| detail/forms missing | list-only stubs | emitter full CRUD depth |
| `"use server"` -> api-client useState build fail | actions dragged client barrel into server graph | emitter pure `config.ts` split; api-client `"use client"` banner + provider directives |
| fan-out stale apps | idempotent `--write` skipped pre-fix files | re-emit api/auth layer for affected apps |

Operator-only (not generator): never prod-`build` against a live dev server's `.next` (corrupts dev manifest -> white page). Stop dev or use a separate build dir.

## 4. Work plan (phases)

- **P1 Commit green state** (durable): branch each of 17 fanned apps off main, commit generated app, push; commit + push ui-kit + api-client package fixes; bump parent submodule pointers.
- **P2 Render-verify sample** live (mock on) across app families (business, personal, ops) to confirm depth renders, not just compiles.
- **P3 RN recipe**: stand up `gen:ui-app` React Native (Expo) path (ADR-0153 `ui.react-native`) for clinician-app + patient-app. Mock-first parity.
- **P4 hosted-login**: emit/handle the dedicated login + consent surface.
- **P5 Design language cascade**: apply the core design language (Aqua) + per-app overrides across the fleet (OpenDesign track), folded into emitter theming where generic.
- **P6 Live wiring**: replace mock with live gateway per app (M16-deploy-gated; mock-first is the v1 functional bar).

## 5. Definition of done (per app)

1. `bun run typecheck && bun run build` exit 0.
2. Renders offline (mock on): list + detail + create form + role-gated controls + theme/font.
3. On a feature branch, committed (no secrets, no build artifacts), pushed; parent pointer bumped.
4. Requirements.md integration points reflected in the screens.
5. Theme aligned to the core design language.

## 6. Tracking

Epic + per-phase stories in the tracker (curaos-ai-workspace). Target Version = v1. See `ISSUE-ROADMAP.md`. Grills (cross-harness Tier-2) for the generator changes per [[curaos-verification-stack-rule]].
