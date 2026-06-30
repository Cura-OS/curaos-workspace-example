# fleet_manager — Agent Context

## Quick facts
- **Web admin:** React 18 + Next.js 14 App Router
- **Mobile:** React Native + Expo (managed workflow)
- **Map:** Leaflet/Mapbox (web); react-native-maps (native)
- **Real-time:** WebSocket bridge from fleet-core-service / notify-service

## Architecture notes
- Web admin: `app/(admin)/fleet/` routes — vehicles, dispatch, maintenance.
- Mobile: Expo Router file-based routing; dispatch board as primary tab.
- Dispatch board: map component with real-time vehicle markers; WS connection updates position store.
- Offline: MMKV (mobile) or IndexedDB (web) for last-known vehicle/assignment state.
- EMS extension: `ems/` overlay folder can add `AmbulanceStatusPanel` to dispatch board without modifying base components.

## Agent rules
- No embedded navigation turn-by-turn; link out to OS native maps.
- No clinical payload capture in base package; EMS overlay packages handle that.
- Privacy controls required for personal tracking feeds — consent check before display.
- Run `turbo run build lint test` before marking done; mobile smoke via Expo build.
