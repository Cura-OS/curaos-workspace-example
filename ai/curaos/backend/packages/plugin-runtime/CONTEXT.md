# @curaos/plugin-runtime — Agent Context

## Quick facts
- Iframe sandbox primary execution model; Web Worker as alternative for headless plugins
- Permission model enforced at install time + message-passing level
- PluginContext = strict subset of CuraOS APIs; no raw DOM access

## Key files
- `src/host/PluginHost.ts` — host orchestrator
- `src/guest/PluginGuest.ts` — guest bridge
- `src/manifest.ts` — PluginManifest schema + validator
- `src/context.ts` — PluginContext interface
- `src/hooks/usePlugin.tsx` — React hook

## Agent rules
- Plugin isolation: crash in plugin must not propagate to host. Use error boundaries around plugin slots.
- No plugin may access host token or tenant credentials directly; proxied via PluginContext only.
- Manifest permissions must be explicitly declared; deny-by-default.
- Run `bunx turbo run build lint test` before marking done.
