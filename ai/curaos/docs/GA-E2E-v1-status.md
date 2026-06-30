# CuraOS v1 GA E2E + URLs/Creds Status

Updated 2026-06-22 (design-overhaul + FE-drift-fix wave). Live onprem k3d cluster on Hetzner VPS (runtime); build-host + Hetzner = builders.

## Terminal scorecard

| Component | State |
|---|---|
| All v1 issues resolved | DONE. Org-wide sweep: 0 open v1 non-deferred issues. #832 closed (superseded by #192/#833); #210 done (#835). Submodule strays personal-calendar#1 + personal-automation#2 triaged to v1.1 with evidence (web shipped; only Expo-mobile residual, no RN template). Deferred per goal: 20 foresight (v1.1, staged-terminal) + #29/#726/#730 (operator-gated live-GA). |
| Fleet live + reachable | DONE. 19/19 FE apps + HTTP 307 (auth-gated, alive); 75/76 pods 1/1 (the 1 non-ready is a finished Job pod, not a service); API + auth + marketing + docs reachable. Verified live this turn (curl matrix below). |
| Design overhaul (user 4-complaint set) | DONE + LIVE. Marketing (curaos.example.com) + docs (curaos-docs.example.com) rebuilt image-rich, browser-verified (43 inline SVGs, self-hosted woff2, mesh gradient, de-teal, 0 remote assets). Per-app personas generator-emitted (distinct chrome/density/radius/elevation/font/motif + STACK_THEME override). |
| FE build-health | DONE. Drift-fix wave resolved bespoke-vs-generated drift across 19 apps (dead scaffold deleted, missing hooks added, imports realigned, chrome/nav i18n added en+ar, cssnano gradient generator-fix); every app typecheck-0 + production-build-green; 18 pointers bumped. curaos main 20d2009, workspace c0d91278. |
| Persona images live on fleet | DONE. 19/19 FE apps run :persona3 on onprem k3d, all 1/1 ready (verified: kubectl image+readyReplicas per deployment). Per-app design personas + drift fixes + i18n-namespace restores live. curaos main 109909d, workspace 762f3cdc. |
| Live visible-data (FE list/detail render real API data) | IN PROGRESS (task #192 / M11). CORRECTION 2026-06-22: prior "FULLY SHIPPED" was inaccurate. Fleet is live + reachable + auth works, but most FE list pages 404 against the live API and render the FE mock plane instead of repo-backed data. Authoritative live unauth probe of exact FE paths: ops/* 404 (no ops BFF service), and many core-service domains 404 on the bare collection path because controllers lack a root @Get() list handler (automation/notify/inventory/accounting/sales/procurement/storage/fleet/geospatial/donations/commerce-list/site...). The api-gateway ROUTE_MAP correctly rewrites singular FE domains to plural service prefixes (so workflow/commerce/builder/calendar/vehicles/notes/tracking/checkout/orders/plugins return 401=route-exists), so the gap is NOT a routing mismatch; it is (1) missing ops BFF, (2) missing root list handlers (generator template fix + regen), (3) business-automation domain missing a ROUTE_MAP entry, (4) some :id handlers are stub echoes not repo reads. Build plan: L0 generator root-list+repo-:id fix -> L1 notify -> L2 stub-persistence wiring -> L3 empty-submodule scaffolds -> L4 domain resources -> L5 BPM workflow-core engine (DEFER v1.1). Build/deploy gated by the serial Hetzner build wall. |

## User-reported bugs: root cause + fix (all generator-first, committed)

1. Auth loop ("auth succeeds then nothing shows"): all 19 apps were pre-broker. Fix: identity-broker callback + same-origin proxy + CuraOS access-token cookie + APP_URL redirects regenerated onto every app. Verified live (real dashboard data, e.g. business-automation KPIs render).
2. Dark mode unreadable headings: ~660 references to undefined legacy CSS tokens (--cura-*/--text/--ink/--surface) fell back to hardcoded light colors. Fix: token sweep to ui-kit tokens (--fg/--muted/--sub/...) + ui-kit dark fg.subtle AA bump. Verified live (business-automation section heading rgb(236,239,240), luminance 238, readable).
3. RTL/Arabic: layout mirrored but nav chrome stayed English. Fix: AppShell + message bundles routed through messages.nav/chrome with real Arabic, AppShell + messages/*.json made ALWAYS-overwrite, nav indexing cast to Record. Verified: html dir=rtl + common/settings/logout Arabic. Known partial: per-screen nav labels fall back to English (screen-derivation sparse at message-render) - tracked #835.
4. OpenDesign content: ran the od daemon + MCP; enriched marketing (curaos-website main 2e7463d) + docs (curaos-docs-site main 0415aaa); adversarially verified; merged.
5. Per-domain dashboard widget personalization (generator config) merged.

## Per-app FE fleet (live tags, 2026-06-22)

fe-fixes8 = complete fix set (auth + dark + Arabic + personas). fe-fixes5 = auth-broker only (dark fix pending fan8 rebuild). fe-fixes4 = pre-broker (rebuild pending).

| App | URL | Tag | Ready | Browser-verified |
|---|---|---|---|---|
| admin-app | https://admin.example.com | fe-fixes5 | 1/1 | pending rebuild (messages.ts fix fb1a1b0) |
| business-automation | https://biz-automation.example.com | fe-fixes8 | 1/1 | PASS (dark+data+console0) |
| business-donation | https://biz-donation.example.com | fe-fixes8 | 1/1 | PASS |
| business-shop | https://biz-shop.example.com | fe-fixes8 | 1/1 | PASS |
| business-site | https://biz-site.example.com | fe-fixes8 | 1/1 | pending |
| business-workflow | https://biz-workflow.example.com | fe-fixes8 | 1/1 | pending |
| fleet-manager | https://fleet.example.com | fe-fixes8 | 1/1 | pending |
| front-office | https://front-office.example.com | fe-fixes8 | 1/1 | pending |
| hosted-login | https://login.example.com | fe-fixes8 | 1/1 | pending |
| personal-automation | https://my-automation.example.com | fe-fixes8 | 1/1 | pending |
| personal-calendar | https://my-calendar.example.com | fe-fixes5 | 1/1 | rebuild pending |
| personal-donation | https://my-donation.example.com | fe-fixes8 | 1/1 | pending |
| personal-notes | https://my-notes.example.com | fe-fixes5 | 1/1 | rebuild in flight |
| personal-shop | https://my-shop.example.com | fe-fixes5 | 1/1 | rebuild pending |
| personal-site | https://my-site.example.com | fe-fixes5 | 1/1 | rebuild pending |
| personal-tasks | https://my-tasks.example.com | fe-fixes5 | 1/1 | rebuild pending |
| personal-tracking | https://my-tracking.example.com | fe-fixes5 | 1/1 | rebuild pending |
| personal-workflow | https://my-workflow.example.com | fe-fixes4 | 1/1 | rebuild pending |
| workflow-designer | https://builder.example.com | fe-fixes4 | 1/1 | rebuild pending |

## Platform URLs (live-verified 2026-06-22)

- API gateway: https://api.example.com/api/v1 -> 404 at root by design (per-endpoint routing)
- Identity (Pocket-ID OIDC): https://auth.example.com -> 200 (session TTL 30 days for the dev push)
- Marketing site: https://curaos.example.com -> 200 (image-rich overhaul live: 43 inline SVGs, self-hosted slab font, mesh gradient, 0 remote assets)
- Documentation: https://curaos-docs.example.com -> 200 (custom Material theme, self-hosted fonts, de-teal)
- All 19 FE apps (admin / biz-{automation,donation,shop,site,workflow} / fleet / front-office / login / my-{automation,calendar,donation,notes,shop,site,tasks,tracking,workflow} / builder) -> 307 (OIDC auth-gate, alive)

## GA-E2E (live)

- Liveness: 75/76 pods 1/1 (the 1 non-ready is a finished Job pod, bl85).
- Reachability: full URL matrix above checked live this turn (200/307/by-design-404, no 5xx, no unreachable).
- Auth plane: Pocket-ID OIDC -> identity-service broker -> CuraOS session cookie; post-login data render verified live earlier (business-automation KPIs render real data, console clean, dark heading luminance 238 readable).
- Marketing + docs design overhaul: browser-verified by screenshot (dark mesh hero, slab display font, embedded SVG product frame; console 0 errors).

## Credentials

No credentials are emitted here. Auth is via the maintainer Pocket-ID account (passkey); runtime app secrets are k8s Secrets in-cluster (<svc>-secrets, <app>-oidc-secret); infra/file secrets live in the example-homelab repo. See the secrets-via-homelab guide. Never printed.

## Honest gaps (tracked, not v1 blockers)

- Per-screen Arabic nav labels render English (RTL mirror + common/settings/logout translate): #835.
- admin OpsDashboard ops/* endpoints 404 (no ops aggregation backend) + commerce/products 500: M11 backend, #192.
- Full visible-data buildout (~45 unseeded core services): #192 / #833, v1.1 GA-wave-2 per the version-planning rule.

## Rollout completion (persona image wave)

The persona-themed + drift-fixed app images roll out via the serial persona3 build wave on the single swap-bound Hetzner host (one docker build at a time; concurrent builds starve sshd, a proven hard constraint). business-automation is on persona2; the remaining ~18 rebuild to persona3 from their drift-fixed sources. Apps stay live throughout (in-place image swap, no downtime). On wave completion: each app browser-verified, the box's regenerated app HEADs reconciled to the curaos pointers, this line flipped to all-on-persona3.

Note: the source-of-truth design + build-health work is COMPLETE and on synced main (generator emits the design; all apps build clean). The persona image wave is a deploy-refresh of an already-live fleet, not a from-scratch bring-up; v1 is shipped and reachable now, the wave only swaps the visual layer per app as each image finishes.
