# CuraOS public website — authored copy

Authored source of truth for the CuraOS **public brochure** site. The
`curaos-website` build (`scripts/build.sh --content-dir <this dir>`) stages this
tree into the build workspace and produces the offline, air-gap-renderable
static site.

This content lives in the workspace mirror (not the code repo) per the
[[curaos-repo-boundary-rule]], and stays doc-graph-reachable.

## Files

- [`site.json`](site.json) — the structured brochure copy: site name, tagline,
  description, value props, and the four deploy-profile cards. Consumed by
  `src/render.ts` to produce `site/index.html`.

## Linked surfaces

The rendered page links (build-time-injectable URLs, documented-placeholder defaults):

- **Documentation** — the CuraOS docs site (Story 4, `curaos-docs-site`).
- **Live demo** — the public demo tenant (Story 7, #516) — rendered "coming
  soon" until the demo lands; the operator flips `--demo-live true` + the real
  `--demo-url` once it is live.
- **Releases** — the CuraOS GitHub Releases surface (signed v1.0.0 bundles
  published by the release pipeline, Stories 1/3).
