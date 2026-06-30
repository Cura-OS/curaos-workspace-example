# clinician_app — Agent Context

## Quick facts
- **Mobile/tablet:** React Native + Expo; Expo Router
- **Web:** React 18 + Next.js 14 App Router
- **FHIR client:** `@curaos/fhir-client` (ADR-0209)
- **Status:** Migrating from Flutter scaffold; HealthStack overlay

## Architecture notes
- Mobile: Expo Router tabs — `/(tabs)/schedule`, `/(tabs)/tasks`, `/(tabs)/docs`, `/(tabs)/messages`.
- Web: Next.js App Router — `app/(clinical)/` routes with role guard requiring `clinician` claim.
- FHIR resources fetched via `@curaos/fhir-client`; translated to UI model by adapter layer in `src/adapters/fhir/`.
- PHI cache: Expo SQLite with SQLCipher encryption (mobile); no PHI in web sessionStorage.
- Specialty plug-ins: settings-service returns specialty preset JSON; rendered as additional navigation items and form templates.
- Audit events: published on every FHIR read/write via audit-core-service client in `src/lib/audit.ts`.

## Agent rules
- Clinical logic in overlay adapters (`src/adapters/`); generic packages (ui_kit, api_client) remain unaware of medical terminology.
- PHI handling: encrypted storage + session timeout + audit trail are non-negotiable — not opt-in.
- No direct database connections; all data via service APIs.
- Feature flags via settings-service; do not hardcode specialty logic.
- Run `turbo run build lint test e2e` (web) + Expo build + security checklist before marking done.
