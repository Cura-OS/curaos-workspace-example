# ADR-0121a — CuraOS Sites (Standalone Product)

**Status:** Accepted
**Date:** 2026-05-24
**Parent:** [ADR-0099](0099-charter-priorities-vision.md), [ADR-0100](0100-foundation-platform-runtime.md), [ADR-0121 Builder Suite](0121-foundation-builder.md), [ADR-0106 Frontend](0106-frontend.md), [ADR-0150 Baseline](0150-baseline-alignment-rules.md)

---

## 1. Context

**CuraOS Sites** = one of 5 sellable Builder Suite products (per ADR-0121). Maximum-scope: marketing + docs + e-commerce + community/forum sites. Replaces Webflow/Squarespace + Docusaurus/GitBook + Shopify/WooCommerce + Discourse/Circle in a single composable product.

Per ADR-0121 4-product split: Sites authored via Builder IDE canvas (GrapesJS OSS), published as Lit Web Components + Astro/Next + plain HTML bundles. Hosted CuraOS-managed OR exported to customer infra OR mirrored to customer S3-compatible storage.

---

## 2. Decision summary

| Concern | Pick |
|---|---|
| **Scope (v1)** | Marketing + Docs + E-commerce + Community/Forum sites in ONE product |
| **Canvas** | GrapesJS OSS (BSD-3) via Builder IDE per ADR-0121 |
| **CMS backbone** | Payload CMS (MIT) per ADR-0121 |
| **Publish targets (per-page choice)** | Lit Web Components (default, max portability) + Astro 5 (SSR/SEO) + Next 15 (interactive) + plain HTML/CSS/JS bundle (zero-framework fallback) |
| **Hosting (per-tenant choice)** | CuraOS-managed (default) + Customer-exported bundle + Customer-mirrored S3 bundle |
| **Custom domain + SSL** | cert-manager (per ADR-0108) + Let's Encrypt / step-ca (air-gap) |
| **CDN** | Self-hosted nginx + reverse proxy (default) OR Cloudflare/Fastly/Bunny (BYO per ADR-0150 §2) |
| **Forms** | CuraOS Forms (ADR-0121e) embedded as Lit Web Components |
| **Auth-gated content** | CuraOS Auth (ADR-0120) — per-page access policy via OPA + Cerbos |
| **Comments / UGC** | Custom NestJS module + Yjs/Hocuspocus for real-time + OpenSearch (per ADR-0101) for search |
| **Community / forum** | Custom NestJS module (Discourse-class threading, replies, reactions, moderation) — built on shared CuraOS primitives |
| **E-commerce** | Custom NestJS module (product catalog, cart, checkout) wraps existing OSS where possible (Medusa.js MIT; or Vendure MIT; or Saleor BSL-review — pick later) |
| **Payment-gated content + subscription billing** | Payment integration ADR (deferred, separate ADR) — likely Stripe (BYO) + open-source payments (Lemonway / Stripe Connect alternatives via plugin) per ADR-0150 §2 |
| **Page analytics** | Plausible self-hosted (AGPL — needs legal review for SaaS) OR Umami (MIT) — TBD per ADR-0107 alignment |
| **Search** | OpenSearch (per ADR-0101) self-hosted + Algolia / Meilisearch (BYO per ADR-0150) |
| **i18n** | next-intl (Next) + Weblate (per ADR-0112) for translation management |
| **Multi-tenant isolation** | Per-tenant Payload schema + per-tenant domain + per-tenant theme + per-tenant component overlay |

---

## 3. Architecture

```
┌───────────────────────────────────────────────────────────────┐
│  Tenant designer in CuraOS Builder IDE (React+Next)           │
│  - GrapesJS canvas with Sites-specific block library          │
│  - Pages, content models, themes, components, forms           │
│  - Per-page publish target picker (Lit/Astro/Next/HTML)       │
│  - AI fill via Vercel AI SDK + LiteLLM                        │
└────────────────────────────┬──────────────────────────────────┘
                             │
                             │ Save → Payload CMS schema + draft
                             │
                             ▼
┌───────────────────────────────────────────────────────────────┐
│  Sites Build Service (NestJS sidecar)                         │
│  - Loads design from Payload                                  │
│  - Invokes per-target builder:                                │
│    * Lit Web Components compiler                              │
│    * Astro 5 SSR build                                        │
│    * Next 15 static export / SSR                              │
│    * Plain HTML/CSS/JS bundler (esbuild + lightningcss)       │
│  - Output: signed bundle in Harbor OCI registry               │
└────────────────────────────┬──────────────────────────────────┘
                             │
              ┌──────────────┼──────────────────────┐
              │              │                      │
              ▼              ▼                      ▼
   ┌──────────────────┐ ┌────────────┐  ┌──────────────────────┐
   │ CuraOS-managed   │ │ Customer   │  │ Customer-mirrored    │
   │ hosting          │ │ export     │  │ S3-compatible bundle │
   │ (Next/Astro on   │ │ (download  │  │ (push to tenant's    │
   │  K3s/Talos +     │ │  bundle,   │  │  SeaweedFS / S3 /    │
   │  nginx + cert-   │ │  deploy    │  │  R2 / etc.)          │
   │  manager)        │ │  anywhere) │  │                      │
   └──────────────────┘ └────────────┘  └──────────────────────┘
```

---

## 4. Dynamic feature modules

### 4.1 Forms (via ADR-0121e)
- Embed CuraOS Forms as Lit Web Components on any page
- Submissions stored in Payload CMS + routed to NestJS form-handler service
- Webhook delivery + email notification via notify-service

### 4.2 Auth-gated content
- Per-page access policy declared in Payload CMS schema
- Site Build Service emits gating client code (Lit/React) that calls Auth introspection endpoint
- OPA + Cerbos policy decision per request (per ADR-0120)
- Three gates: public / authenticated / role-based / subscription-paid

### 4.3 Comments / reactions / UGC
- NestJS `sites-community` module
- Comment thread per page (Payload CMS collection)
- Real-time updates via SSE (per ADR-0103)
- Moderation queue (admin UI in Builder)
- Per-tenant policy: anonymous / authenticated / verified-email only
- Audit per moderation action

### 4.4 Community / forum
- NestJS `sites-forum` module (Discourse-class threading)
- Topics, replies, reactions, mentions, notifications
- Trust levels (lurker → regular → leader → moderator → admin)
- Full-text search via OpenSearch
- Email digests (daily/weekly)
- Per-tenant categories + tags

### 4.5 E-commerce
- NestJS `sites-commerce` module
- **Wrap existing OSS:** Medusa.js (MIT) preferred — TS-native, NestJS-friendly architecture
- Product catalog stored in Payload CMS + Medusa
- Cart + checkout (custom or Medusa-driven)
- Inventory + fulfillment hooks to ADR-0115 HealthStack (if e-commerce ships medical supplies) OR generic procurement-service
- Local + 3rd-party: Medusa self-hosted (default) OR Shopify Storefront API (BYO)

### 4.6 Payment-gated content + subscription billing
- Payment integration ADR (deferred — separate ADR-XXXX needed)
- v1 stub: Stripe Connect integration (BYO tenant Stripe account); webhook-driven subscription state to Auth
- Subscription metadata in Auth user record → OPA/Cerbos policies gate paid content
- Open-source payment alternatives: TBD (Stripe is dominant; OSS alternatives weaker)

---

## 5. Multi-tenant + product packaging

| Tier | Includes | Pricing model |
|---|---|---|
| **Sites Free** | 1 site, marketing-only, CuraOS subdomain | Free up to N visitors/mo |
| **Sites Starter** | 3 sites, marketing + docs, custom domain | Per-tenant flat fee |
| **Sites Pro** | Unlimited sites, all dynamic features (forms/auth-gated/comments) | Per-tenant + per-pageview overage |
| **Sites Enterprise** | All Pro + community/forum + e-commerce + dedicated infra | Custom contract + per-pageview |
| **Sites Air-Gap / On-Prem** | Full v1 features, customer-hosted | One-time license + support |

---

## 6. Local + 3rd-party rule applied

| Area | Local default | 3rd-party (BYO) |
|---|---|---|
| Hosting | CuraOS-managed (NestJS Next/Astro on K3s/Talos) | Vercel / Netlify / Cloudflare Pages / customer K8s |
| CDN | Self-hosted nginx reverse proxy | Cloudflare / Fastly / Bunny CDN |
| Custom domain SSL | cert-manager + Let's Encrypt (default) / step-ca (air-gap) | Customer-supplied cert |
| Search | OpenSearch self-hosted | Algolia / Meilisearch Cloud / Typesense Cloud |
| Page analytics | Plausible / Umami self-hosted | Google Analytics / Mixpanel / Amplitude (BYO) |
| E-commerce backend | Medusa.js self-hosted | Shopify / WooCommerce (BYO via plugin) |
| Payment processor | (none default — payment is regulated, no local OSS replaces Stripe) | Stripe / Adyen / Square / Lemon Squeezy (BYO) |
| Email delivery | Self-hosted Postfix + notify-service | SendGrid / Postmark / Mailgun (BYO) |
| Comment moderation | Custom NestJS + OpenAI moderation API self-hosted (LLM Local per ADR-0114) | Akismet / Perspective API (BYO) |
| Forum migration import | Discourse import scripts + Lemmy import | Tenant-supplied JSON export |

---

## 7. Build sequence

| Milestone | Deliverable |
|---|---|
| M1 | Sites Build Service NestJS sidecar + Payload schema for pages/content/themes |
| M2 | Lit Web Components publish target |
| M3 | Astro 5 publish target |
| M4 | Next 15 publish target |
| M5 | Plain HTML/CSS/JS bundle target |
| M6 | Custom domain + cert-manager + nginx routing |
| M7 | Forms integration (per ADR-0121e) |
| M8 | Auth-gated content + OPA/Cerbos policy gates |
| M9 | Comments + reactions (custom NestJS module) |
| M10 | Community / forum module (Discourse-class) |
| M11 | E-commerce — Medusa.js integration |
| M12 | Payment-gated + subscription billing (Stripe + webhook → Auth) |
| M13 | Page analytics (Plausible / Umami self-hosted) |
| M14 | Customer-export bundle (download all assets + Next/Astro source) |
| M15 | Customer-mirror bundle (push to tenant S3-compatible) |
| M16 | AI fill / suggest (Vercel AI SDK 6 → LiteLLM) |
| M17 | Multi-tenant isolation + per-tenant theme overlay |
| M18 | Performance + security + accessibility audit + air-gap install |
| M19 | v1 GA — sellable standalone |

---

## 8. Open questions

1. **Medusa.js vs Vendure** — Medusa is more JS-native; Vendure has GraphQL-first API. Decide during M11.
2. **Plausible vs Umami** for page analytics — Plausible AGPL (legal review for SaaS), Umami MIT (cleaner). Likely Umami.
3. **Forum import sources** — Discourse JSON + Lemmy ActivityPub + phpBB? Minimum v1: Discourse JSON.
4. **Payment processor scope** — Stripe-only v1, or also Adyen/Square via plugin? Likely Stripe + plugin SDK.
5. **PWA mode for tenant sites** — emit service worker by default? Likely yes for Sites Pro+ tier.
6. **A/B testing + experiments** — defer to v2; could integrate Unleash (per ADR-0110) for feature flags first.

---

## 9. References

- [ADR-0121 Builder Suite umbrella](0121-foundation-builder.md)
- [ADR-0106 Frontend](0106-frontend.md)
- [ADR-0150 Baseline Alignment](0150-baseline-alignment-rules.md)
- Astro 5: https://astro.build/
- Medusa.js: https://medusajs.com/
- Vendure: https://www.vendure.io/
- Plausible: https://plausible.io/ (AGPL)
- Umami: https://umami.is/ (MIT)
- Discourse: https://www.discourse.org/
- Lit Web Components: https://lit.dev/
- Lemmy: https://join-lemmy.org/
