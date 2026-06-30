# front_office — Agent Context

## Quick facts
- **Web desk:** React 18 + Next.js 14 App Router (primary)
- **Tablet:** React Native + Expo (patient-facing check-in kiosk mode)
- **Forms:** `@curaos/forms` for workflow-driven intake forms
- **Status:** Migrating from Flutter scaffold; HealthStack overlay

## Architecture notes
- Web: `app/(front-office)/` routes — queue dashboard, appointment booking, billing.
- Tablet/kiosk: Expo app in kiosk mode for patient self-check-in; minimal UI surface.
- Intake form: `@curaos/forms` renders schema from workflow-service API; form submission triggers workflow step completion.
- Queue dashboard: polling or WebSocket on scheduling-service for real-time queue updates.
- Consent: renders consent form PDF/HTML from healthstack-consent-service; signature captured as base64 → POST back.

## Agent rules
- Sensitive financial/clinical data behind service APIs; UI never stores insurance IDs or PHI locally.
- Analytics + telemetry hooks must integrate with healthstack-consent-service before emitting any patient-identifiable events.
- Role-based access: `front-desk` role claim required; `billing` role required for billing screens.
- EducationStack/ERP reuse: dynamic forms + workflow templates drive content; no hardcoded clinical labels in base components.
- Run `turbo run build lint test e2e` before marking done.
