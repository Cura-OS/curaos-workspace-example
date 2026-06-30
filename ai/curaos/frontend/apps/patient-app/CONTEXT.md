# patient_app — Agent Context

## Quick facts
- **Mobile-primary:** React Native + Expo; Expo Router; Expo SecureStore
- **Web portal:** React 18 + Next.js 14 App Router
- **Auth:** `@curaos/auth-sdk` + Expo LocalAuthentication (biometric)
- **FHIR client:** `@curaos/fhir-client` (ADR-0209)
- **Status:** Migrating from Flutter scaffold; HealthStack overlay

## Architecture notes
- Mobile: Expo Router tabs — `/(tabs)/home`, `/(tabs)/appointments`, `/(tabs)/care-plan`, `/(tabs)/messages`, `/(tabs)/billing`.
- Web: `app/(patient)/` routes behind OIDC session check.
- FHIR resources (Patient, Appointment, CarePlan, Task) fetched via `@curaos/fhir-client`; adapter layer in `src/adapters/fhir/` maps to UI models.
- Offline: Expo SQLite + SQLCipher; care plan summaries + next 7 days appointments cached; TTL 24h.
- White-label: `app.config.ts` reads `TENANT_ID` env var; builder automation pipeline patches name/icon/colors per tenant at CI build time.
- Biometric unlock: Expo LocalAuthentication; fallback to PIN screen; OIDC token stored in SecureStore.

## Agent rules
- PHI encrypted at rest is non-negotiable; no plain AsyncStorage for PHI fields.
- Consent preferences must be checked before any analytics event emission.
- Feature toggles from settings-service drive which tabs/sections appear; no hardcoded clinical labels in base components.
- White-label customization must not require code changes; config + asset injection only.
- Run `turbo run build lint test e2e` (web) + Expo build + security checklist before marking done.
