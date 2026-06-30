# personal_calendar — Agent Context

## Quick facts
- **Web:** React 18 + Next.js 14 App Router
- **Mobile:** React Native + Expo
- **Calendar lib:** react-big-calendar (web); react-native-calendars (native)
- **Forms:** `@curaos/forms` for booking form schema

## Architecture notes
- Web: `/availability` (editor), `/booking/[slug]` (public booking, unauthenticated), `/bookings` (management).
- Public booking page is a public Next.js route — no auth required; theming from tenant branding token.
- Booking form schema edited via `@curaos/forms`; stored in personal-calendar-service.
- Mobile: Expo Router; `/(tabs)/bookings`, `/(tabs)/availability`.
- Offline: Expo MMKV stores last-fetched bookings; shows stale indicator.

## Agent rules
- No clinical triage forms; HealthStack overlay handles those.
- Public booking route must not expose any PHI or other user's booking details.
- Video conferencing: link-out only (no embedded WebRTC in v1).
- Run `turbo run build lint test` before marking done.
