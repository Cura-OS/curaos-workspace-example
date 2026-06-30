# personal_shop — Agent Context

## Quick facts
- **Web:** React 18 + Next.js 14 App Router
- **Mobile:** React Native + Expo
- **Status:** Migrating from Flutter scaffold

## Architecture notes (as built, ADR-0219 parity, #768)
- **Data seam (single owner):** all reads/writes go through `src/api/admin-fetch.ts#adminRequest` — mock-first (seed/synthesize when `NEXT_PUBLIC_API_BASE_URL` unset), live REST when set. Live<->mock is that one env flip; no other branch.
- **Buyer storefront (existing):** `/shop`, `/shop/[id]`, `/cart`, `/checkout`, `/orders`, `/wishlist`, `/` (dashboard). Reads via `src/api/shop-hooks.ts` (real `useQuery`, page/pageSize/search threaded); buyer seed in `src/api/shop-seed.ts` + `shop-mock.ts`.
- **Checkout (P1):** `app/checkout/checkout-flow.tsx#place()` builds a session (`src/api/checkout.ts`) and POSTs commerce-core `/checkout/sessions`; confirmation is the SUCCESS CALLBACK of the resolved write (clear cart + show server reference), failure surfaces an Alert. Mock provider confirms inline (`shop-mock.ts#mockCheckoutSession`); a live result may carry a hosted-payment `redirectUrl`.
- **Creator admin (P4):** `/products` (listing CRUD + publish + sales/conversion analytics), `/storefront-preview` (device-framed published view), `/payouts` (list + request), `/messages` (buyer-seller thread). Wired to personal-shop-service contract (`backend/services/personal-shop-service/specs/shop.tsp`, base `/personal-shops/...`) via `src/api/seller-hooks.ts`; stateful offline plane in `src/api/seller-mock.ts` (create→publish→storefront actually moves data). Schemas in `src/schemas/seller.ts` (money = minor-unit decimal string, contract #369).
- **i18n (P2):** `src/i18n/LocaleProvider.tsx` (en + ar, flips `<html lang/dir>`; ar→rtl) + `LocaleSwitcher` in the AppShell topbar; bundles in `messages/{en,ar}.json`. Regenerated from the `ui-app-emit` mold (do not hand-fork — re-run the generator).
- **e2e (P3):** `playwright.config.ts` boots `next dev` (mock plane on, seeds a demo session so guarded routes render with no IdP). `e2e/checkout.spec.ts` = browse→cart→checkout→confirmed; `e2e/products.spec.ts` = create→publish. Run `bun run e2e` (use `PLAYWRIGHT_PORT` to dodge the shared :3100).
- **Mobile:** buyer-facing browse + purchase via Expo `ui.react-native` — separate lane, NOT in this web pass.

## Known issues / foresight
- `@curaos/ui` Drawer scrim z-index defect (`--z-modal` scrim over `--z-drawer` content) intercepts in-drawer pointer clicks — foresight #818. Products e2e submits the create form via Enter to route around it; remove the workaround once ui-kit is fixed.
- `@curaos/auth-sdk` is a phantom dep in package.json (app uses its own `src/auth/`); breaks standalone install — foresight #817.

## Agent rules
- No multi-team management; business_shop handles enterprise teams.
- No complex inventory/fulfillment; single-product creator model only.
- Payment credentials never stored client-side; checkout session created server-side via commerce-core-service.
- Run `turbo run build lint test` before marking done.
