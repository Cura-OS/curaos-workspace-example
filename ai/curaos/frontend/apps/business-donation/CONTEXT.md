# business_donation — Agent Context

## Quick facts
- **Framework:** React 18 + Next.js 14 App Router
- **Recipe:** `ui.react-next` (ADR-0153)
- **Status:** Migrating from Flutter scaffold

## Architecture notes
- Pages: `/campaigns` (list), `/campaigns/[id]` (dashboard), `/donors` (CRM), `/payouts`, `/reports`.
- Campaign progress uses React Query polling on campaign stats endpoint.
- Donor communication center integrates with notify-service messaging API.
- Compliance reports: server-side generated via accounting-core-service; UI triggers + downloads.

## Agent rules
- No medical fundraising specifics; HealthStack overlay handles those.
- Financial data (payout amounts, donor PII) must display via API response only; never cache locally beyond session.
- Run `turbo run build lint test e2e` before marking done.
