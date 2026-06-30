# personal_workflow — Agent Context

## Quick facts
- **Web:** React 18 + Next.js 14 App Router + `@curaos/canvas`
- **Mobile:** React Native + Expo (run monitoring)
- **Status:** Migrating from Flutter scaffold

## Architecture notes
- Web: `/workflows` (list), `/workflows/[id]` (canvas editor), `/workflows/[id]/runs` (history).
- Canvas editor: BPMN-lite mode of `@curaos/canvas`; simpler palette than workflow_designer (personal scope).
- Publish: POST definition to personal-workflow-service; triggers execution engine via workflow-core-service.
- Mobile: Expo Router; `/(tabs)/workflows` run history; push notification on run complete/error.

## Agent rules
- No multi-user collaboration; business_workflow handles teams.
- BPMN-lite palette is a subset of workflow_designer palette; do not duplicate canvas logic — share via `@curaos/canvas`.
- Export format must be stable and documented for business_workflow import compatibility.
- Run `turbo run build lint test` before marking done.
