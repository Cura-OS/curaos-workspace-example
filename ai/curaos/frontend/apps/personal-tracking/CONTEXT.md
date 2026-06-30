# personal_tracking — Agent Context

## Quick facts
- **Mobile-primary:** React Native + Expo; react-native-maps
- **Web:** React 18 + Next.js 14 App Router; Leaflet
- **Real-time:** WebSocket feed from personal-tracking-service
- **Status:** Migrating from Flutter scaffold

## Architecture notes
- Mobile: Expo Router; `/(tabs)/map` (live), `/(tabs)/history`, `/(tabs)/sharing`.
- Live map: WS connection to personal-tracking-service; updates Zustand store; renders marker overlay.
- Share session: POST to create session → generates shareable link → show QR or copy link.
- Geofence: map polygon draw mode → POST geofence definition → notify-service registers alert rule.
- Extension hooks: `ems/` overlay can inject `AmbulanceStatusLayer` onto map without modifying base component.

## Agent rules
- No dispatch console in base; fleet_manager handles that.
- No clinical telemetry; HealthStack overlay extends if needed.
- Privacy: consent check (from personal-tracking-service consent API) required before displaying any shared location.
- Location background permission requested only when user explicitly enables sharing session.
- Run `turbo run build lint test` before marking done.
