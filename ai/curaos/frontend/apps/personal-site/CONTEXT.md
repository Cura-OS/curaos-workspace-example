# personal_site — Agent Context

## Quick facts
- **Editor:** React 18 + Next.js 14 App Router + `@curaos/canvas`
- **Renderer:** Astro (`ui.astro` recipe)
- **Status:** Migrating from Flutter scaffold

## Architecture notes
- Editor: `/sites/[id]/editor` — canvas + template selector; `/sites/[id]/settings` — domain, theme.
- Page definition JSON: stored in personal-site-service; Astro renderer reads at build/SSR time.
- Astro renderer: deployed as separate Astro app per site or as shared Astro instance with tenant routing.
- Embed blocks: each block type (booking, shop, donation) is a Lit web component loaded at runtime from CDN.

## Agent rules
- No multi-user editing; business_site handles collaborative features.
- No ecommerce sections in base editor; personal_shop provides storefront widget block.
- Publish pipeline is service-side; editor only triggers and polls status.
- Run `turbo run build lint test e2e` before marking done.
