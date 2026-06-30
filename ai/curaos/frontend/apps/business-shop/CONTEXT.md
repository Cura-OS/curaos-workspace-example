# business_shop — Agent Context

## Quick facts
- **Framework:** React 18 + Next.js 14 App Router
- **Recipe:** `ui.react-next` (ADR-0153)
- **Status:** Migrating from Flutter scaffold

## Architecture notes
- Pages: `/catalog`, `/catalog/[id]`, `/orders`, `/orders/[id]`, `/inventory`, `/analytics`.
- Catalog uses optimistic React Query mutations for product CRUD.
- Order fulfillment state machine rendered as step progress component from `@curaos/ui`.
- Analytics charts: ECharts (full charts) / Recharts (sparklines) per ADR-0113; do not add a second charting lib.

## Agent rules
- No POS UI; deferred to future extension.
- Not a marketplace aggregator; single-tenant shop management only.
- Storefront embedding uses business-site-service; do not render storefront HTML in admin shell.
- Run `turbo run build lint test e2e` before marking done.
