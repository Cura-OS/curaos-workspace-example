# personal_tasks — Agent Context

## Quick facts
- **Web:** React 19 + Next.js 15 App Router (`ui.react-next`, ADR-0153)
- **Mobile:** React Native + Expo (pending build-out)
- **Offline:** in-memory + localStorage write queue (`src/api/offline-queue.ts`); Expo SQLite for native pending
- **Status:** Web wired to tasks-core-service contract (ADR-0219 P1-P4, #770)

## Wiring map (#770, ADR-0219)
- **Data plane:** `src/api/admin-fetch.ts` `adminRequest` -> live (`NEXT_PUBLIC_API_BASE_URL`) or the `src/api/mock-data.ts` mock plane offline. The `personal-tasks` mock route is projected from the rich domain seed (`src/domain/seed.ts`).
- **Wired writes:** `src/actions/tasks-service.ts` (`createTask` / `updateTask` / `deleteTask` / `scheduleReminder`) are `"use server"` actions that re-validate against `src/schemas/tasks-service.ts` then `adminRequest`. `scheduleReminder` POSTs to `/notify` (notify-service).
- **Optimistic store:** `src/state/task-store.ts` (zustand) applies each mutation locally for instant feedback, then persists through the wired actions. On failure: offline -> enqueue for reconnect-sync; online -> rollback + `lastError`. `pendingSync` drives the workspace sync indicator; `syncNow` drains on the `online` event.
- **Reads:** `useTaskList` / `useTask` hooks (`src/api/admin-hooks.ts`) wire the flagship list to the same live-or-mock path the generic CRUD screens use.
- **i18n:** `src/i18n/LocaleProvider.tsx` (en + ar, reflects `lang`/`dir` onto `<html>`; ar = rtl) + `LocaleSwitcher` in the topbar; bundles in `messages/{en,ar}.json`.
- **E2E:** `e2e/smoke.spec.ts` + `playwright.config.ts` (`bun run e2e`). Covers health, the task create -> complete happy path (mock-session-backed), and the locale -> RTL flip.
- **Generator:** all shell + i18n + e2e files come from `tools/codegen` `ui-app-emit` (regen `bun run gen:ui-app personal-tasks --write`, idempotent / skip-existing). The flagship task domain (store, actions, schema, mock seed, widgets) is the per-app layer atop it.

## Architecture notes
- Web: `/tasks` (inbox), `/tasks/board` (kanban), `/tasks/[id]` (detail sheet as slide-over).
- Board view: kanban columns defined by task status; drag-drop via @dnd-kit.
- Time-blocking: integrates with personal_calendar; creates a calendar event with task reference.
- Mobile: Expo Router; `/(tabs)/tasks` inbox, swipe actions for quick complete/snooze.
- Offline: optimistic writes; background sync queue; conflict = server wins with local notification.

## Agent rules
- No advanced portfolio dashboards; business project management packages handle those.
- No clinical checklists in base package; HealthStack overlay adds those.
- Attachment upload: delegate to storage-core-service presigned URL upload; UI shows progress.
- Generator-first: fold any recurring gap into `tools/codegen` `ui-app-emit`, then regen; per-app hand edits only for genuinely singular task-domain logic.
- App gates (run in the app dir): `bun run build`, `bun run typecheck`, `bun run test` (scoped to `test/`), `bun run e2e` (Playwright).
