# personal_automation — Agent Context

## Quick facts
- **Web editor:** React 18 + Next.js 14 + `@curaos/canvas`
- **Mobile:** React Native + Expo (run history + push config)
- **Status:** Migrating from Flutter scaffold

## Architecture notes
- Web: `/automations` list, `/automations/[id]` canvas editor, `/marketplace` connector config.
- Node editor delegates to `@curaos/canvas` node-graph mode; no custom DnD from scratch.
- Connector secrets entered in UI are proxied through automation-core-service — never stored client-side.
- Mobile: Expo Router; `/(tabs)/history` shows run log; push notification prefs in settings.

## Agent rules
- No enterprise governance in personal package; business_automation handles that.
- Secrets entry UI must proxy through service; never accept raw API keys for client-side storage.
- Export format must be documented and stable for business_automation import compatibility.
- Run `turbo run build lint test` before marking done.
