# business_site — Agent Context

## Quick facts
- **Admin shell:** React 18 + Next.js 14 App Router
- **Published renderer:** Astro (`ui.astro` recipe, ADR-0153)
- **Status:** Migrating from Flutter scaffold
- **Collaboration:** WebSocket presence via notify-service

## Architecture notes
- Admin routes: `/sites/[id]/pages/[pageId]` — canvas editor; `/sites/[id]/settings` — SEO/localization.
- Presence: WebSocket connection to notify-service; displays avatar stack for concurrent editors.
- Approval flow: on "Request Publish" → creates approval task in workflow-core-service; editor polls for resolution.
- Published site output: Astro generates static/SSR output from site definition JSON stored in business-site-service.

## Agent rules
- No headless-only mode in v1; visual builder is the primary interface.
- No PHI pages; HealthStack overlay handles gating for clinical content.
- Collaborative edits must be conflict-aware; if conflict resolution is complex, serialize via optimistic locking on business-site-service.
- Run `turbo run build lint test e2e` before marking done.
