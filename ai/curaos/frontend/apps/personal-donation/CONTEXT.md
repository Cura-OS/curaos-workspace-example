# personal_donation — Agent Context

## Quick facts
- **Web:** React 18 + Next.js 14 App Router
- **Mobile:** React Native + Expo
- **Status:** Migrating from Flutter scaffold

## Architecture notes
- Web: `/campaigns` (list), `/campaigns/new` (wizard), `/campaigns/[id]` (dashboard), `/supporters` (CRM).
- Campaign wizard: multi-step form using `@curaos/forms` schema.
- Embeddable widget: exported as a Lit web component (via `ui.lit-widget` recipe if needed) for embedding in external sites.
- Payout configuration: links to payment provider via personal-donation-service; no raw payment credentials in UI.

## Agent rules
- No team campaigns; business_donation handles those.
- No complex reward fulfillment in v1 (single-tier only).
- Payment credentials never stored client-side; always proxied through service.
- Run `turbo run build lint test` before marking done.
