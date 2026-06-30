# ADR-0112: Internationalization and Localization Stack

> **✅ ACCEPTED WITH ADDENDUM** — per [ADR-0150](0150-baseline-alignment-rules.md) §3: Moneta (JVM Money library) → `dinero.js` (TS Money library) for NestJS backend. Weblate + ICU MF1 + next-intl + Paraglide + flutter intl + Helsinki-NLP MT + RTL CSS logical props all stand. Local + 3rd-party rule applies (Crowdin / Lokalise / DeepL as 3rd-party options).


## Status

Proposed. Date: 2026-05-24.

---

## Context

CuraOS serves 91 backend services and ~25 frontend packages across three deployment models (cloud SaaS, on-prem, air-gap). Tenants span multiple regions and languages, including right-to-left scripts (Arabic, Hebrew, Farsi). HealthStack requires accurate clinical terminology in the user's language. EducationStack and ERP serve global institutional tenants. Each tenant may need its own legal copy, branding text, and custom email templates in its primary language.

Frontend surfaces already decided (ADR-0106): React 19 + Next.js 15 (web admin, clinician, and patient web apps), Flutter (mobile), Astro (static sites). Translation management system: Weblate 5.x (ADR-0106 reference). ICU MessageFormat named as the string-format standard.

This ADR makes all remaining i18n/localization sub-decisions concrete so that the platform can be implemented consistently across every surface, service, and tenant profile without relitigating choices at the package level.

### Scope of decisions

| # | Sub-decision |
|---|---|
| 1 | Translation Management System (TMS) — confirm or replace Weblate |
| 2 | Translation file format and format harmonization |
| 3 | Frontend i18n library per framework |
| 4 | Backend i18n / message-bundle delivery |
| 5 | Locale negotiation strategy |
| 6 | RTL handling approach |
| 7 | Locale-aware data formatting libraries |
| 8 | Money representation, library, and FX-rate source |
| 9 | Time zone storage and display strategy |
| 10 | Multi-tenant locale bundle composition |
| 11 | Translation memory, glossary, and terminology governance |
| 12 | AI-assisted translation pre-fill |
| 13 | CI integration and quality gates |
| 14 | Bidirectional UI testing strategy |
| 15 | Legal / locale-aware compliance copy |

---

## Forces and Requirements

Derived from AGENTS.md §3 (charter), §6 (NFRs), and the constraint block driving this ticket.

| Force | Implication |
|---|---|
| Self-hosted first / air-gap | TMS, MT engine, CDN bundles — all must run without external network calls |
| HIPAA | PHI must never leave the deployment boundary; no managed MT cloud service may receive clinical content |
| GDPR | Per-language privacy policy, DSAR forms, consent copy required per jurisdiction |
| RTL parity | Arabic, Hebrew, Farsi require layout mirroring at parity with LTR; not an afterthought |
| Per-tenant overlay | Each tenant may override legal text, branding copy, terminology; base stays shared |
| 91 services, 25 frontend packages | Format and toolchain must scale; per-package divergence is a maintenance disaster |
| ICU MessageFormat already committed | Backend and frontend format decisions must align with ICU MF1 (MF2 not yet production-viable) |
| HealthStack clinical terminology | SNOMED CT translations follow a separate governance path; TMS must not overwrite canonical SNOMED descriptions |
| Keycloak for identity (ADR-0101 implied) | User locale preference lives in Keycloak attributes; locale resolution must read it |
| Air-gap tzdata | TZ rule updates cannot be fetched at runtime; bundles must carry tzdata |

---

## Decision Drivers (weighted)

Weights: 3 = eliminates non-conforming options, 2 = strongly preferred, 1 = tie-breaker.

| Driver | Weight |
|---|---|
| Air-gap and self-hosted compatibility | 3 |
| HIPAA: no PHI to external MT services | 3 |
| ICU MessageFormat alignment across all layers | 3 |
| RTL support at parity with LTR | 3 |
| Per-tenant translation overlay | 3 |
| Type safety and compile-time key validation | 2 |
| Bundle size / mobile performance | 2 |
| Weblate 5.x as existing TMS (avoid re-platform) | 2 |
| Developer experience across 25+ packages | 2 |
| Clinical terminology governance (SNOMED CT) | 2 |
| CI-enforced translation coverage gates | 2 |
| GDPR compliance copy toolchain | 1 |
| Open-source license compatibility (AGPL acceptable) | 1 |

---

## Options Considered

### Sub-decision 1: Translation Management System (TMS)

**Option A — Weblate 5.x (self-hosted, AGPL)**
Mature (2012), 10,000+ GitHub stars, deployed in 2,500+ organizations. Docker Compose + Helm chart. OIDC via generic OpenID Connect (Keycloak-compatible; configurable claim for user ID in v5.17+). GitHub pull-request integration via `GITHUB_CREDENTIALS`. Machine translation via pluggable MT adapters (DeepL, Google, AWS, LibreTranslate). Air-gap: runs fully offline after image pull. 50+ file formats. Translation memory, glossary, checks built-in. Webhook allowlist for private projects (v5.17+). Requires 2 GB+ RAM for production. AGPL license requires source disclosure only for modifications to Weblate itself, not for translation content.

**Option B — Tolgee (self-hosted, AGPL core / MIT SDK)**
Modern developer-focused: in-context translation via browser extension, native SDKs for React, Next.js, Angular, Flutter. Docker-deployable (1 GB+ RAM minimum). Supports JSON, ICU, ARB, Android XML, iOS Strings. MT integration (DeepL, Google, AWS). Active growth trajectory in 2025. Weaker git-native workflow vs. Weblate; webhooks require more manual wiring. AGPL platform + MIT client SDKs.

**Option C — Lokalise (managed SaaS)**
Strong API, good developer tooling. No self-hosting. Fails air-gap requirement. Eliminated.

**Option D — Phrase (managed SaaS)**
Strong TM and QA tooling. No self-hosting. Fails air-gap requirement. Eliminated.

**Option E — Crowdin (managed SaaS / Crowdin Enterprise self-hosted)**
Crowdin Enterprise has a self-hosted option but it is enterprise-licensed (significant cost), complex to operate, and the open-source community edition does not cover required features. Fails cost + air-gap simplicity test. Eliminated.

**Option F — Mozilla Pontoon**
Designed for Mozilla's internal l10n workflow; Fluent-format-first; limited API surface; 4 GB+ RAM recommended; community support outside Mozilla is thin. Does not justify migration effort over Weblate. Eliminated.

**Option G — Git-based only (po4a, gettext, po files, PR-based review)**
Zero infrastructure cost. No reviewer UI, no TM, no MT integration, no glossary enforcement, no in-context preview. Cannot scale to 91 services with non-developer translators. Eliminated.

**Decision: Option A — Weblate 5.x.** Already referenced in ADR-0106. Feature set matches all constraints. Tolgee's in-context editing is attractive but Weblate's git-native workflow, broader format support, and maturity edge outweigh it for a 91-service platform. Tolgee's SDK coupling also creates per-framework dependencies; Weblate stays format-agnostic.

---

### Sub-decision 2: Translation File Format

**Option A — ICU MessageFormat JSON**
Key-value JSON where values are ICU MessageFormat 1 strings. Weblate supports this as the `JSON nested structure` or `JSON` component type with ICU checking enabled. Framework-agnostic; consumed by next-intl, react-i18next (with `i18next-icu` plugin), Lingui (via catalog extraction), FormatJS. Plural/gender/select handled inline. No binary format; VCS-friendly diffs.

**Option B — Gettext (.po / .pot)**
Canonical for C/Python/server ecosystems. Strong toolchain (msgfmt, poedit, Weblate native). Plural rules built in. Alien to JavaScript/Dart ecosystems; requires format bridging. Not ICU-native; plural forms differ from ICU syntax. Rejected for frontend primary format; acceptable as a secondary export for backend services that prefer it.

**Option C — Flutter ARB (Application Resource Bundle)**
Flutter's native format. JSON-based with `@` metadata annotations for type and plurals. Required for `flutter_localizations`. Not usable outside Flutter. Kept as the Flutter-specific format generated from the canonical ICU JSON source.

**Option D — Android XML / iOS .strings**
Platform-native; only relevant if React Native were in scope (it is not). Not applicable.

**Option E — YAML**
More human-readable than JSON. Not natively understood by most i18n runtimes without preprocessing. Weblate supports it. No ICU enforcement without custom checks. Rejected as primary format.

**Option F — Mozilla Fluent (.ftl)**
Modern, expressive, handles complex grammar well. Ecosystem is small: Pontoon is the primary TMS, browser adoption limited outside Firefox. Not supported by next-intl or flutter_localizations. Rejected.

**Option G — XLIFF 2.0**
XML-based interchange standard. Good for agency hand-off. Weblate can export/import XLIFF 2.0. Used as interchange format with external vendors only, not as primary storage format.

**Decision: ICU MessageFormat JSON as canonical source of truth for all surfaces.** Platform-specific outputs derived via build-time conversion:
- Flutter surfaces: canonical ICU JSON → ARB (via `intl_translation` tooling or Weblate ARB export)
- Gettext export available for any backend service that requires it
- XLIFF 2.0 export available for agency translation hand-off

One canonical format. One Weblate component per service/package. Format conversions are build-time transformations, not runtime concerns.

**On ICU MessageFormat 2.0:** MF2 reached Final Candidate in March 2025 (LDML 47/48). As of May 2026, `Intl.MessageFormat` remains at TC39 Stage 2 (blocked at Stage 2.7 pending production deployments). No major framework (FormatJS, Lingui, next-intl) has defaulted to MF2. The `i18next-mf2` plugin receives ~10 weekly downloads vs. ~300k for `i18next-icu`. Decision: **stay on ICU MF1** platform-wide. Revisit when a major downstream framework defaults to MF2 or TC39 advances to Stage 3.

---

### Sub-decision 3: Frontend i18n Library

#### 3a: React / Next.js 15 (web admin, clinician web, patient web)

**Option A — next-intl 3.x (current) / 4.x**
Purpose-built for Next.js App Router. First-class React Server Components (RSC) and streaming support with no extra setup. ICU MessageFormat native. ~14 KB gzipped. Excellent compile-time key validation. Middleware-based locale detection out of the box. Limitation: Next.js-only; if a surface moves to Remix or Vite SPA, the library changes. As of 2026, next-intl is the consensus recommendation for new Next.js projects.

**Option B — react-i18next (i18next ecosystem)**
Largest ecosystem; works in any React framework. ~25 KB gzipped (i18next core + react-i18next). ICU support via `i18next-icu` plugin (adds weight + indirection). RSC usage requires manual wiring and a separate server-side instance. Type safety achievable but requires additional plugin configuration. Plugin ecosystem covers lazy loading, CDN backends, language detection. Best choice for framework-agnostic teams or non-Next.js surfaces.

**Option C — Lingui 4 (with @lingui/macro)**
Smallest runtime (~5 KB). Compile-time macro extraction: messages are transformed at build time into pre-compiled functions; no runtime parser for known messages. Type safety excellent: TypeScript-compatible code generated automatically. RSC support exists in v4 via `@lingui/react` RSC path; requires SWC plugin for Next.js 15 (Babel plugin is deprecated). Limitation: React Compiler (Next.js 16 direction) has ordering conflicts with Lingui macros (active upstream discussion as of 2026). Best for performance-critical surfaces and teams comfortable with a build pipeline requirement.

**Option D — FormatJS / react-intl**
Reference implementation for ICU MF1 in JavaScript. Heavier bundle (~40 KB). No RSC-first design. Mature and battle-tested but not the ergonomic leader in 2026. Better fit as a low-level utility than a primary component library.

**Option E — use-intl (standalone, same author as next-intl)**
Subset of next-intl for non-Next.js React. Useful for Storybook or test environments; not a primary choice.

**Decision for React/Next.js surfaces: next-intl.** RSC support, ICU-native, excellent type safety, minimal config for Next.js 15, consensus recommendation in 2026. Use react-i18next only if a surface is built outside Next.js (e.g., a Vite-embedded micro-frontend). Lingui is held as the upgrade path for the patient mobile web surface if bundle budget becomes critical, once the React Compiler macro-ordering issue resolves.

#### 3b: Flutter (mobile — iOS, Android, clinical kiosk)

**Option A — official flutter_localizations + intl + ARB**
Flutter's first-party approach. ARB files, code generation via `flutter gen-l10n`. Compile-time safety: missing keys are build errors. IDE autocomplete. Plural and select rules via ICU-compatible ARB annotations. Long-term support guaranteed by the Flutter team. Overhead: requires code-gen step in CI; ARB format deviates from canonical ICU JSON (handled by build-time conversion, see sub-decision 2).

**Option B — slang**
Community-maintained; JSON-native input with type-safe generated Dart code. More ergonomic API than the official solution. Supports plurals, context, rich text. Active maintenance in 2025. No guarantee of Flutter team backing. JSON format aligns better with canonical ICU JSON source, reducing conversion overhead.

**Option C — easy_localization**
Runtime JSON loading without code generation. Fastest to prototype. Not recommended for production: no compile-time safety, runtime key errors are silent misses. Acceptable for internal tooling prototypes only.

**Decision for Flutter: official flutter_localizations + intl + ARB.** Compile-time guarantees and Flutter team backing are non-negotiable for clinical surfaces where a missing string is a patient-safety risk. Build pipeline converts canonical ICU JSON → ARB; Weblate's ARB export capability covers this. Slang is a valid alternative for non-clinical Flutter surfaces (e.g., ERP mobile) where the team prefers its ergonomics — evaluate per-package.

#### 3c: Astro (public sites, site-builder static output)

**Option A — Paraglide-JS + @inlang/paraglide-astro**
Compiler-based: translation messages become tree-shakable imported functions. Only messages used on a page are shipped. Benchmark: 47 KB with Paraglide vs. 205–422 KB with i18next equivalents (5 locales, 100 used / 200 total messages). Full TypeScript autocomplete and parameter checking at compile time. Compatible with Astro 5's built-in i18n routing and static content localization. Active maintenance. Uses `inlang` project format (JSON-based, compatible with ICU content).

**Option B — astro-i18next**
Based on i18next. Last commit over a year ago as of mid-2026; repository archived. Not Astro 5 compatible. Eliminated.

**Option C — Astro built-in i18n routing only**
Astro 4.0+ ships with `i18n` routing configuration natively (locale prefixes, default locale, fallback). This handles routing but not message formatting. Must be combined with a message library. Paraglide-Astro sits on top of Astro's built-in routing, making this a complementary pair, not a competing option.

**Decision for Astro: Paraglide-JS + @inlang/paraglide-astro + Astro built-in i18n routing.** Bundle size advantage is decisive for SEO-critical public sites. Tree-shaking means language bundles do not bloat static output. Type safety matches next-intl quality. astro-i18next is abandoned.

---

### Sub-decision 4: Backend i18n / Message-Bundle Delivery

**Option A — Spring MessageSource + ICU4J**
Java backend services (the implied stack for the neutral service layer). `MessageSource` provides resource-bundle loading with locale fallback. ICU4J provides full ICU MessageFormat 1 parsing, CLDR plural rules, date/number/currency formatting, BIDI text support. Compose: ICU4J `MessageFormat` as the parser; Spring `MessageSource` as the bundle loader. Bundle files stored as UTF-8 properties or JSON, loaded from classpath or a mounted config map. Air-gap compatible.

**Option B — i18n4j / Jakarta i18n proposals**
Jakarta EE i18n is not a ratified standard as of 2026. i18n4j is a thin wrapper. ICU4J directly is more capable. Eliminated as primary.

**Option C — Runtime-fetched bundles from TMS API (Weblate API)**
Services call Weblate's REST API at startup to pull current translations. Fails air-gap: Weblate may not be accessible from every service pod in an air-gapped deployment without extra routing. Adds startup latency and a hard dependency on TMS availability. Rejected for runtime fetch; bundles are baked into service images at build time.

**Option D — CDN-served bundles**
Frontend-relevant: locale JSON files served from a per-tenant CDN prefix with cache headers. Backend services do not use CDN; this option is frontend-only and adopted for web surfaces (see locale bundle composition, sub-decision 10).

**Decision for backend: Spring MessageSource + ICU4J.** Bundle files are UTF-8 ICU MF1 JSON checked into the service repo and synchronized with Weblate via git integration. Services reload bundles on config-map update (Kubernetes rolling restart); no runtime TMS dependency. For non-Java services (Go, Rust microservices in future roadmap), use ICU-compatible libraries in that language's ecosystem (e.g., `go-i18n` with ICU format, `rust-icu`).

---

### Sub-decision 5: Locale Negotiation

**Option A — Accept-Language header only**
Standard HTTP; easy to implement; does not persist across sessions; cannot be overridden per-tenant default; browser may report a locale the tenant does not support.

**Option B — URL path prefix (/en/, /ar/, /fr/)**
Makes locale explicit in URLs; good for SEO and caching; required by Astro built-in i18n; changes require redirect logic; clinician apps may not want locale in path.

**Option C — Subdomain (ar.tenant.cura.os)**
Complex DNS management per tenant, per locale; wildcard TLS certificates add ops burden. Rejected for app surfaces; acceptable only for static sites if SEO demands it (not defaulted).

**Option D — User preference stored in Keycloak attribute**
Persisted across sessions and devices; survives browser locale change; tied to authenticated identity. Limitation: unauthenticated surfaces (login page, public site) cannot read Keycloak attributes.

**Option E — Hybrid (priority chain)**
Resolution chain: (1) authenticated Keycloak `locale` attribute → (2) URL path prefix if present → (3) Accept-Language header → (4) tenant default locale → (5) platform default (en). Covers all surfaces and session states.

**Decision: Hybrid — Option E.**

Priority chain, applied consistently at every surface:

```
1. Keycloak `locale` attribute (authenticated session)
2. URL path prefix (present on Astro sites and Next.js pages — Astro always has it; Next.js App Router middleware reads it)
3. Accept-Language header (negotiated against tenant's supported-locale list)
4. Tenant default locale (configured in Tenancy service; read by middleware)
5. Platform default: en
```

Tenant-supported locale list is stored in the Tenancy service and cached at the edge. Middleware rejects locales the tenant has not activated; this prevents serving untranslated or partially-translated UI to tenants who have not onboarded a language.

---

### Sub-decision 6: RTL Handling

**Option A — CSS logical properties (margin-inline-start, padding-inline-end, inset-inline-start, etc.)**
Direction-aware by design. Write once; browser adapts to `dir="rtl"` on the document or component root. No RTL-specific override stylesheet. As of 2025, logical properties are production-ready in all modern browsers (Chrome 89+, Firefox 87+, Safari 15+). The border-radius logical sub-properties (`border-start-start-radius` etc.) have slightly narrower support (Safari 15+) but are non-critical for layout correctness.

**Option B — Explicit RTL override stylesheet (two stylesheets)**
Maintain a base LTR stylesheet and an RTL override. Common legacy pattern. Doubles maintenance surface; RTL sheet drifts behind LTR over time. Rejected for new code.

**Option C — dir attribute toggle with physical properties**
Set `dir="rtl"` on `<html>` or component; use physical CSS (`margin-left`, `margin-right`). Breaks without RTL overrides because physical properties do not flip. Requires Option B as a complement. Rejected.

**Option D — Flutter: Directionality widget + automatic mirroring**
Flutter's `Directionality` widget propagates text direction through the widget tree. Material and Cupertino widgets mirror automatically. Custom widgets must use `Directionality.of(context)` and avoid hard-coded `EdgeInsets.only(left: ...)` — use `EdgeInsetsDirectional` instead. Not a choice but a required implementation pattern for Flutter.

**Decision for web: CSS logical properties exclusively for all new layout code.** No RTL override stylesheets. The UI kit (component library) enforces this via ESLint rule (`stylelint-plugin-logical-properties` or equivalent) in CI — physical directional properties (`margin-left`, `left`, `right`) trigger a lint error in component code. Legacy screens that predate this rule carry a `/* rtl:ignore */` comment and are tracked for migration.

For Flutter: `EdgeInsetsDirectional`, `TextDirection.of(context)`, `AlignmentDirectional` — mandated in the Flutter style guide. `EdgeInsets.only(left: ...)` in widget code is a lint error (`flutter_lints` + custom lint rule).

`dir="rtl"` is set on `<html>` by the Next.js locale middleware and Astro layout based on locale. Not set per-component; document-level is correct for full mirroring.

---

### Sub-decision 7: Locale-Aware Data Formatting

#### JavaScript / TypeScript (React, Next.js, Astro)

**Option A — Intl APIs (native browser/Node.js)**
`Intl.NumberFormat`, `Intl.DateTimeFormat`, `Intl.RelativeTimeFormat`, `Intl.ListFormat`, `Intl.PluralRules`. Zero bundle cost in modern environments. CLDR-backed. Covers: numbers, currency display, dates, times, relative time, list serialization, ordinals. Limitations: `Intl.DurationFormat` is Stage 3 (needs polyfill in 2026 for Safari); relative time formatting for clinical durations needs a wrapper.

**Option B — date-fns v4 (locale-aware)**
Modular, tree-shakable, ~pure functions, no prototype mutation. 100+ locales. Works with `Intl.DateTimeFormat` under the hood in v4. Adds ~5 KB per locale. Best for date arithmetic that must stay locale-aware (e.g., fiscal periods, appointment scheduling).

**Option C — Luxon**
Moment.js successor by the same author. Wraps `Intl` natively. Good locale support. Larger bundle than date-fns. Less popular in 2025; date-fns v4 preferred.

**Option D — dayjs**
Small (2 KB core), plugin-based. Locale plugins add weight per locale. Mutable-moment API. Acceptable; less composable than date-fns v4 for server-side rendering.

**Decision for JS: native Intl APIs as the primary formatter, augmented by date-fns v4 for date arithmetic.** Relative time: `Intl.RelativeTimeFormat`. Duration: polyfill `Intl.DurationFormat` (package: `@formatjs/intl-durationformat`) until Safari ships it. Wrapped in a shared `@curaos/formatting` package to enforce consistent usage across all 25 frontend packages.

#### Java backend

**ICU4J** for all formatting: `com.ibm.icu.text.NumberFormat`, `DateFormat`, `RelativeDateTimeFormatter`, `MessageFormat`. CLDR rules. Full BIDI support. Already decided in sub-decision 4.

#### Dart / Flutter

`intl` package (`NumberFormat`, `DateFormat`, `Bidi`). ICU-backed. Required by `flutter_localizations`. No alternative needed.

---

### Sub-decision 8: Money Representation, Library, and FX Rates

#### Storage

**All monetary amounts stored as `NUMERIC(19,4)` (SQL) or `BigDecimal` (Java) with a separate `currency_code` (ISO 4217, 3-char) column.** Never floating-point. Never a plain integer of cents (insufficient for currencies like KWD which has 3 decimal places; also insufficient for crypto if ever needed). `NUMERIC(19,4)` covers all ISO 4217 currencies with 4 digits of sub-unit precision and leaves headroom.

#### Java backend money library

**Option A — Moneta (JSR-354 / javax.money)**
Reference implementation of the Java Money and Currency API. `MonetaryAmount` interface; `FastMoney` (long-backed, 5 decimal places) and `Money` (BigDecimal-backed, arbitrary precision). Standard API; portable across implementations. Actively maintained. ICU4J `CurrencyAmount` available as alternative for formatting only.

**Option B — Custom `BigDecimal` + currency code**
No additional library. Full control. More boilerplate; reinvents rounding mode selection and arithmetic safety checks. Rejected in favor of Moneta.

**Decision for Java: Moneta (`org.javamoney:moneta`) with `Money` (BigDecimal-backed) for all domain amounts; `FastMoney` only for internal high-throughput ledger summaries where 5 decimal places suffice.** Currency arithmetic must always use `MonetaryOperator` or explicit rounding context; raw `BigDecimal.divide()` without `RoundingMode` is a compile-time checkstyle error.

#### JavaScript money library

**Option A — Dinero.js v2**
Immutable, functional. Amount stored as scaled integer (`{amount: 1099, scale: 2, currency: "USD"}`). No floating-point. ICU-compatible formatting via `Intl.NumberFormat`. TypeScript-first. Actively maintained in 2025.

**Option B — currency.js**
Simple, small. Fixed 2-decimal assumption limits multi-currency support (KWD = 3, JPY = 0). Rejected for multi-currency platform.

**Option C — js-money**
Similar to Dinero but less actively maintained. Rejected.

**Decision for JavaScript: Dinero.js v2.** Store amounts as Dinero objects in domain logic; serialize to `{amount: bigint-string, scale: number, currency: ISO-4217}` for API transport. Never serialize as a floating-point JSON number.

#### PHP (if any PHP services exist in overlays)

**moneyphp/money v4** (requires BCMath extension). PHP 8.0+. Fowler Money pattern. Same `{amount: string, currency: ISO-4217}` storage convention.

#### FX Rate Source

**Option A — ECB (European Central Bank) daily XML feed**
Free, authoritative, EUR-based, daily rates. Self-hostable: cache the feed. 32 currencies covered. Suitable for reporting and display conversions.

**Option B — OpenExchangeRates**
More currencies (200+), hourly updates. Managed SaaS; requires API key; fails air-gap without a caching proxy.

**Option C — Internal static rate table**
Managed by ops; never stale in air-gap. Only viable for deployments where currency conversion is infrequent and acceptable error is high (e.g., reporting dashboards with no financial settlement).

**Decision: ECB daily feed as the default FX source, proxied through an internal `fx-rate-service` that caches the feed.** Air-gap deployments pre-load the ECB feed on a configurable schedule (default: daily, from internal mirror). The `fx-rate-service` exposes a simple REST API (`GET /rates?base=USD&target=EUR&date=2026-05-24`). For HealthStack billing (if financial settlement is required), the tenant configures their own authoritative rate source in Tenancy settings; `fx-rate-service` routes to it. No floating-point in rate storage: rates stored as `NUMERIC(18,8)` strings.

---

### Sub-decision 9: Time Zone Storage and Display

**Option A — UTC everywhere (storage and wire)**
All timestamps stored as UTC in the database (`TIMESTAMP WITH TIME ZONE` or `TIMESTAMPTZ`). All API wire formats use RFC 3339 with explicit `Z` or `+00:00` offset. Display-time conversion happens at the presentation layer (browser `Intl.DateTimeFormat` with user TZ, or server-rendered via ICU4J with user's `ZoneId`).

**Option B — LocalDateTime + stored TZ offset**
Store the local wall-clock time and the offset at time of recording. Useful for audit trails where the exact local time of an event matters (e.g., a clinical note recorded at "14:30 Riyadh time"). Does not survive DST-transition ambiguity if only the offset is stored (not the IANA timezone name).

**Option C — LocalDateTime + IANA TZ name stored separately**
Store the local time AND the IANA timezone name (e.g., `Asia/Riyadh`). Allows reconstructing both the original local time and the UTC equivalent at any future point, even after TZ rule changes. More storage. Correct for audit and scheduling use cases.

**Decision: UTC primary, with IANA TZ name stored alongside local time for audit and scheduling records.** Specifically:

- **General timestamps** (created_at, updated_at, event timestamps): `TIMESTAMPTZ` in PostgreSQL, stored as UTC. Display conversion at edge.
- **Scheduled events** (appointments, shifts, deadlines): store `UTC instant` + `IANA_timezone_id` (e.g., `Asia/Riyadh`) + `local_datetime_at_creation`. This enables correct display if TZ rules change between creation and display, and supports DST-aware scheduling.
- **Clinical observations** (HealthStack): store UTC instant + `IANA_timezone_id` of the recording site. FHIR `dateTime` elements carry explicit timezone per the FHIR spec.
- **Display**: browser-side via `Intl.DateTimeFormat(locale, {timeZone: userTZ})`; server-side via ICU4J `DateFormat.getDateTimeInstance()` with `TimeZone.getTimeZone(ianaId)`.

**Air-gap tzdata:** All container images include `tzdata` explicitly (not assumed from base image). Alpine and distroless images do not include tzdata by default — Dockerfiles explicitly `apk add tzdata` or equivalent. JVM services use ICU4J's bundled timezone data (`com.ibm.icu:icu4j` ships CLDR tzdata). Frontend: `Intl` uses the host OS's tzdata on Node.js server; browser clients use their OS tzdata. For very long-lived air-gap deployments, a tzdata update container (runs `apk upgrade tzdata` + rolling restart) is part of the ops runbook.

---

### Sub-decision 10: Multi-Tenant Locale Bundle Composition

**Pattern: shared base + per-tenant overlay, resolved at request time.**

Hierarchy (lowest to highest priority):
```
platform base (en)
  └─ language translation (ar, he, fa, fr, de, …)
       └─ tenant overlay (custom terminology, legal copy, branding text)
            └─ tenant language overlay (e.g., tenant-specific Arabic clinical terms)
```

**Implementation:**

Frontend (Next.js / Astro):
- Base locale files live in the shared `@curaos/translations` package, versioned and published to the internal package registry.
- Tenant overlay files live in the Tenancy service and are fetched at middleware initialization for the session. Overlay is a sparse JSON object (only keys the tenant has overridden).
- At request time, middleware deep-merges: `Object.assign({}, base[locale], tenantOverlay[locale])`. Result is cached per `(tenant_id, locale)` tuple with a short TTL (5 minutes) via the CDN/edge cache layer.
- Tenant overlay updates invalidate only that tenant's CDN cache entry (cache key includes `tenant_id`).

Backend (Spring MessageSource):
- Base message bundles in service classpath.
- Tenant overrides fetched from Tenancy service at startup and cached in-process. Refresh on Tenancy `locale.bundle.updated` event (Kafka topic, per ADR-0103 event-led design).
- `TenantAwareMessageSource` wrapper: resolves message key through tenant overlay first, falls back to service bundle, falls back to platform default.

Weblate structure:
- One Weblate **project** per logical domain (e.g., `identity-service`, `healthstack-encounter`).
- One **component** per file (e.g., `en.json`, `ar.json`).
- Tenant overlay files live in a separate Weblate project (`tenant-overlays`) with per-tenant write access control. Tenants (or their admins) can edit only their overlay component.

---

### Sub-decision 11: Translation Memory, Glossary, and Terminology Governance

**Weblate built-in TM:** Enabled platform-wide. Weblate's TM indexes all approved translations and suggests matches on new strings. Shared TM across all platform projects; per-project TM weights configurable.

**Glossary enforcement:** A platform-level Weblate glossary defines canonical translations for key terms (e.g., "Patient" → Arabic canonical, "Encounter" → Spanish canonical). Weblate flags segments where glossary terms appear untranslated or inconsistently rendered. Mandatory for HealthStack strings.

**Clinical terminology (HealthStack):**

SNOMED CT translations are **not managed in Weblate.** SNOMED International distributes member-country translations as part of the national release (e.g., the Spanish SNOMED CT release from SNOMEDCT-ES). The HealthStack `terminology-service` consumes SNOMED releases directly from the member's NRC (National Release Center) distribution or from a licensed FHIR Terminology Server.

Rules:
- SNOMED CT concept descriptions (display names for diagnoses, procedures, observations) must be sourced from the official SNOMED CT language refset, not from Weblate-managed strings.
- Only UI chrome (labels, buttons, section headings, error messages) in HealthStack is managed in Weblate.
- A Weblate check (custom Python check) flags any translation segment whose source string matches a known SNOMED concept FSN (Fully Specified Name) — these must not be translated in Weblate; they are runtime-resolved from the terminology service.

**Glossary → TerminologyService linkage:** The HealthStack `terminology-service` (per AGENTS.md domain map §5.2) exposes a FHIR `ValueSet/$expand` endpoint. The Weblate glossary for HealthStack terms is seeded from this endpoint for approved SNOMED display terms, ensuring that wherever a SNOMED term appears in UI copy, the glossary provides the NRC-approved equivalent. This seeding runs as a nightly job in CI.

---

### Sub-decision 12: AI-Assisted Translation Pre-Fill

**Constraint:** PHI must never leave the deployment boundary. Any MT service that receives string values from HealthStack surfaces must either be self-hosted or contractually HIPAA-covered.

**Option A — LibreTranslate (self-hosted, open-source)**
MIT license. Supports ~30 languages. Quality is below DeepL or Helsinki-NLP fine-tuned models. No PHI risk. Air-gap compatible. Sufficient for high-volume, lower-stakes strings (UI chrome, error messages).

**Option B — Helsinki-NLP Opus-MT models (self-hosted)**
Open-source NMT models (CC-BY-SA). Hugging Face distribution. Language coverage: 1,000+ language pairs. Quality varies by language pair; strong on European languages and Arabic. Runs locally via `ctranslate2` or `transformers`. Air-gap compatible after model download. GPU recommended for acceptable throughput; CPU inference is slow (minutes per batch).

**Option C — Meta NLLB-200 (No Language Left Behind, self-hosted)**
200 languages including low-resource languages relevant to HealthStack (Amharic, Somali, Swahili for African health deployments). CC-BY-NC license (non-commercial restriction — review per deployment). High quality. Air-gap compatible. Higher GPU memory requirements than Helsinki-NLP.

**Option D — DeepL API (managed SaaS)**
Achieved HIPAA compliance in May 2025 (ISO 27001, SOC 2 Type II, BAA available). Highest quality for European languages and Arabic. Not self-hosted; requires internet; fails air-gap. Acceptable for cloud SaaS tenants where a BAA is signed; not acceptable for on-prem or air-gap deployments, or for any string containing PHI regardless of deployment model.

**Option E — No MT pre-fill; human translation only**
Slowest time-to-market for new languages. Maximum quality control. Appropriate for highly regulated strings (consent forms, legal copy, clinical alerts).

**Decision: Tiered MT strategy.**

| String category | MT approach |
|---|---|
| UI chrome (labels, buttons, nav, error messages) | Helsinki-NLP Opus-MT self-hosted; Weblate MT adapter configured |
| Marketing copy / help docs (cloud SaaS non-PHI) | DeepL API (cloud SaaS only, BAA signed, no PHI content) |
| Clinical strings (HealthStack — potential PHI adjacency) | Helsinki-NLP Opus-MT self-hosted only; human review mandatory before approval |
| Legal / compliance copy | Human translation only; MT suggestions disabled for these Weblate components |
| Air-gap deployments | Helsinki-NLP only (DeepL adapter disabled at deployment config) |

All MT suggestions require human review before approval in Weblate. MT pre-fill is a suggestion, not an auto-approve. Weblate's MT adapter for Helsinki-NLP is configured via the `WEBLATE_MT_` environment variable block in the Docker Compose deployment.

---

### Sub-decision 13: CI Integration and Quality Gates

**Gates applied on every PR to a service or frontend package:**

| Gate | Tool | Action on failure |
|---|---|---|
| New source strings have ICU-valid syntax | `@formatjs/cli` `lint` on changed `.json` files | Block merge |
| No translation key removed without deprecation notice | Custom script: `diff` old/new key sets; fail if removals exceed 0 in a breaking-change-prohibited branch | Block merge |
| Missing translations in required locales | Weblate API: `GET /api/translations/{project}/{component}/{lang}/` → check `untranslated_words`; fail if > 0 for `stable` channel locales | Block release to `stable` channel; warn on `beta` |
| Pseudo-locale render test | Build app with `en-XA` pseudo-locale (accented characters, 40% text expansion, LTR markers); Playwright smoke test checks no text overflow clipping and no untranslated `{key}` placeholders visible | Block merge |
| RTL smoke test | Build app with `ar` locale; Playwright tests check `dir="rtl"` on `<html>`, no `margin-left`/`margin-right` style attribute on flexbox containers, no hardcoded `left`/`right` position values in computed style of layout components | Block merge for RTL-supported surfaces |
| Currency precision test | Unit test: all money arithmetic uses Dinero.js or Moneta; no `parseFloat(amount)` patterns in financial domain code | Block merge (semgrep rule) |
| SNOMED segment flag check | Weblate webhook: any HealthStack translation component PR that contains a SNOMED FSN match is flagged as needing clinical review | Manual approval gate |

**Pseudo-locale generation:** `pseudolocale` npm package or `@formatjs/cli` pseudo-locale output. ICU MessageFormat placeholder tokens (`{name}`, `{count, plural, ...}`) are preserved; only literal text is transformed. This ensures ICU syntax errors surface before translator time is spent.

**Channel promotion:**

```
feature branch → beta channel (missing translations warn, do not block)
beta → stable (missing translations in any activated tenant locale block promotion)
stable → on-prem release (tzdata version check added; SNOMED release version pinned)
```

---

### Sub-decision 14: Bidirectional UI Testing Strategy

**Pseudo-locale (en-XA / Accented English):**
- Replaces Latin letters with accented equivalents; adds expansion padding (~40% longer text).
- Catches: text overflow, clipped labels, hardcoded element widths, truncation bugs.
- Applied to all surfaces in CI (see sub-decision 13).

**RTL Playwright test suite:**

For each surface that has an activated RTL locale (initially: Arabic `ar`):
1. Launch app in `ar` locale.
2. Assert `document.documentElement.dir === "rtl"`.
3. Snapshot critical layout components (sidebar, navigation, data tables, form layouts, modal dialogs).
4. Assert no element has `text-align: left` in inline style (logical `start` is expected).
5. Assert flex containers that should reverse in RTL have `flex-direction: row-reverse` or are using logical CSS (verified by class presence, not inline style, since logical CSS is handled by the browser).
6. Visual regression snapshot comparison: LTR baseline vs. RTL — automated diff; human review on first introduction, then regression-guarded.

**Flutter RTL tests:**
- `flutter test --dart-define=LOCALE=ar` with `Directionality(textDirection: TextDirection.rtl)` wrapping integration tests.
- Assert `AlignmentDirectional.topStart` resolves to top-right in RTL context.
- Golden file tests for key clinical screens (encounter form, medication list, appointment calendar).

**Device coverage:**
- RTL Playwright: Chromium (primary), Firefox (secondary). Safari WebKit RTL tested in pre-release gate only (CI time budget).
- Flutter RTL: Android emulator (armeabi-v7a) + iOS Simulator (arm64) in CI.

---

### Sub-decision 15: Legal / Locale-Aware Compliance Copy

**Problem:** Privacy policy, Terms of Service, cookie consent, DSAR (Data Subject Access Request) forms, and HIPAA Notice of Privacy Practices must be served in the user's language and must reflect the jurisdiction's legal requirements — not just a translated version of the English text.

**Pattern:**

- Legal copy files live outside Weblate. They are legal documents, not software strings. Translation is by certified legal translators, not the software localization team.
- Stored as structured Markdown or HTML per `(tenant_id, locale, document_type, version)` in a `compliance-content-service` (neutral service domain).
- Versioned independently of the software release. A new GDPR ruling can require a legal copy update without triggering a software release.
- CMS-like workflow: draft → legal review → publish. No code deployment required.
- Cookie consent banner strings (short, UI-level) live in Weblate in a dedicated `compliance-ui` component; the full policy text does not.

**GDPR DSAR forms:**
- Form labels and instructions are Weblate-managed strings (UI level).
- The DSAR submission workflow is backend-driven; confirmation emails use the `notification-service` template system with locale-resolved templates (same Weblate component as notification templates).

**Tenant-specific legal text:**
- On-prem tenants provide their own jurisdiction-specific legal documents via the `compliance-content-service` admin API.
- Cloud SaaS tenants select from CuraOS-provided jurisdictional templates (EU/GDPR, US/HIPAA, MENA/personal data laws) and optionally supply tenant-specific addenda.

**Language availability gate for legal copy:**
- A locale cannot be promoted to `active` for a tenant unless the required legal documents exist in that locale for the tenant's jurisdiction. The Tenancy service enforces this at locale activation time.

---

## Decision Summary

| Sub-decision | Decision |
|---|---|
| 1. TMS | Weblate 5.x self-hosted (Docker Compose + Helm) |
| 2. Format | ICU MessageFormat 1 JSON (canonical); ARB for Flutter (build-time conversion); MF2 deferred |
| 3a. React/Next.js library | next-intl |
| 3b. Flutter library | flutter_localizations + intl + ARB |
| 3c. Astro library | Paraglide-JS + @inlang/paraglide-astro |
| 4. Backend i18n | Spring MessageSource + ICU4J; bundles in classpath, synced via Weblate git |
| 5. Locale negotiation | Hybrid: Keycloak attribute → URL prefix → Accept-Language → tenant default → en |
| 6. RTL handling | CSS logical properties (web); EdgeInsetsDirectional / AlignmentDirectional (Flutter); `dir="rtl"` at document level |
| 7. Formatting | Intl APIs + date-fns v4 (JS); ICU4J (Java); intl package (Dart) |
| 8. Money | NUMERIC(19,4) + ISO 4217 storage; Moneta/JSR-354 (Java); Dinero.js v2 (JS); ECB feed via fx-rate-service |
| 9. Timezones | UTC storage; IANA TZ name stored with scheduled/clinical events; tzdata bundled in images |
| 10. Tenant bundles | Base + per-tenant overlay; deep-merge at middleware; CDN cache keyed by (tenant_id, locale) |
| 11. TM + glossary | Weblate built-in TM + glossary; SNOMED CT from NRC releases via terminology-service; clinical terms NOT in Weblate |
| 12. MT pre-fill | Helsinki-NLP Opus-MT self-hosted (primary); DeepL API (cloud SaaS non-PHI only); human-only for legal/clinical |
| 13. CI gates | ICU lint, key-removal check, Weblate coverage API, pseudo-locale Playwright, RTL Playwright, currency semgrep |
| 14. Bidi testing | en-XA pseudo-locale + RTL Playwright (web); Flutter golden files + integration tests (mobile) |
| 15. Legal copy | compliance-content-service (versioned Markdown/HTML); Weblate for UI strings only; locale activation gate |

---

## Consequences

### Positive

- **Single source of truth:** ICU MF1 JSON in Weblate with git sync. Every surface consumes the same canonical files; format conversions are build-time, not runtime.
- **Air-gap compatible end-to-end:** Weblate, Helsinki-NLP, ECB feed proxy, tzdata — all run within the deployment boundary. No hard runtime dependency on the public internet.
- **HIPAA boundary preserved:** PHI-adjacent strings never reach managed MT services. Helsinki-NLP Opus-MT runs in-cluster. Clinical terminology is sourced from SNOMED NRC releases, not from general-purpose translation workflows.
- **RTL enforced from day one:** CSS logical properties mandated by lint; no RTL override stylesheet debt accumulates. Flutter directional widgets enforced by linter.
- **Type safety at compile time:** next-intl + Paraglide-JS both provide compile-time key validation. Missing translations are build errors on stable channel, not runtime surprises.
- **Tenant isolation:** Overlay system ensures tenants see only their custom strings; base strings do not leak private tenant overrides.
- **Clinical terminology integrity:** SNOMED CT descriptions come from NRC releases, not Weblate. A Weblate translator cannot accidentally override a canonical clinical term.

### Negative / Trade-offs

- **Weblate AGPL:** Any modification to Weblate itself must be open-sourced. Running unmodified Weblate as a hosted service does not trigger AGPL. Custom Weblate plugins developed for CuraOS (e.g., the SNOMED segment detector) are AGPL if distributed; keep them as internal-only plugins.
- **ICU JSON → ARB conversion step:** Flutter build pipelines require the conversion step. This adds CI complexity. Managed via a shared `scripts/convert-i18n.sh` in the repo toolchain.
- **Helsinki-NLP quality ceiling:** MT quality is below DeepL for some language pairs (notably Arabic, which Helsinki-NLP covers with Helsinki-NLP/opus-mt-tc-big-ar-en and inverse). Expect higher human post-edit rate for Arabic pre-fills than for European languages. Budget accordingly in localization planning.
- **ECB rate limitation:** ECB covers 32 currencies. Tenants in currencies not on ECB (e.g., some Gulf currencies pegged to USD, Nigerian Naira, Indonesian Rupiah) need their own rate source configured. The fx-rate-service supports pluggable providers; this is a configuration task, not a code change.
- **MF2 deferred:** If TC39 advances `Intl.MessageFormat` to Stage 3 within 12–18 months, a migration plan will be needed. next-intl and FormatJS are expected to follow TC39 quickly. Monitor the `messageformat` npm package weekly downloads as a leading indicator.
- **Lingui deferred for primary use:** Lingui's compile-time approach is architecturally superior for bundle size but has an unresolved macro/React Compiler ordering issue in Next.js 16. Re-evaluate for Next.js 16 upgrade cycle.

---

## Implementation Order

1. **Weblate 5.x deployment** — Docker Compose on internal infra; OIDC to Keycloak; GitHub integration for platform monorepo; configure ICU JSON component type.
2. **`@curaos/translations` base package** — seed with en.json for all services; push to Weblate via git; activate required target locales per tenant roadmap.
3. **next-intl integration** — middleware locale negotiation; Keycloak attribute reader; tenant default loader from Tenancy service; CDN cache key setup.
4. **Paraglide-JS integration** — Astro site builder template update; Astro built-in i18n routing configuration.
5. **Flutter ARB pipeline** — convert script; `flutter gen-l10n` integration; RTL golden file baseline.
6. **Spring MessageSource + ICU4J** — `TenantAwareMessageSource` implementation; Kafka listener for `locale.bundle.updated`; service-by-service rollout.
7. **Helsinki-NLP deployment** — GPU node or CPU batch worker; Weblate MT adapter configuration.
8. **fx-rate-service** — ECB feed proxy; NUMERIC(19,8) rate storage; REST API.
9. **CI gates** — pseudo-locale Playwright; RTL Playwright; ICU lint; Weblate coverage API check; semgrep currency rule.
10. **compliance-content-service** — versioned legal document store; locale activation gate in Tenancy service.
11. **SNOMED segment detector** — Weblate custom check plugin; nightly glossary seeding job from terminology-service.
12. **Tenant overlay system** — overlay CRUD in Tenancy service; deep-merge middleware; CDN cache invalidation on update.

---

## References

- ADR-0101: Identity and Tenancy (Keycloak; user locale attribute)
- ADR-0103: API and Event Architecture (Kafka `locale.bundle.updated` event; FHIR dateTime spec)
- ADR-0105: Workflow and BPM (App/Site Builder generates i18n-aware UI)
- ADR-0106: Frontend (React 19 + Next.js 15, Flutter, Astro; Weblate first reference)
- AGENTS.md §3: Charter (self-hosted first, event-led, multi-tenant)
- AGENTS.md §6: NFRs (localization, availability, GDPR/HIPAA)
- AGENTS.md §5.2: HealthStack domain — terminology-service
- Unicode CLDR / ICU MessageFormat 1 specification
- ICU MessageFormat 2.0 Final Candidate (March 2025, LDML 47/48) — deferred
- TC39 `Intl.MessageFormat` proposal — Stage 2 as of May 2026
- SNOMED International — Translation Guide and NRC distribution model
- ECB Statistical Data Warehouse — exchange rates XML feed
- JSR-354 / Moneta — Java Money and Currency API
- CSS Logical Properties and Values Level 1 — W3C CR
- WCAG 2.2 SC 1.4.4, 1.4.10 (text resize, reflow) — relevant to text expansion in translations
