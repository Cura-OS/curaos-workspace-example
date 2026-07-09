# CuraOS Workspace Example

[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)
[![Exposure: Open](https://img.shields.io/badge/exposure-Open-brightgreen)](#license)
[![Module: Example](https://img.shields.io/badge/module-Example-informational)](#what-is-in-here)

A sanitized example of a multi-agent engineering workspace. It shows the rules, docs, checks, and workflow shape that coordinate agents around a codebase. It does not include CuraOS product code, private specs, customer data, infrastructure, or roadmap internals.

## At a Glance

| Field | Detail |
|---|---|
| Audience | Engineering teams adopting multi-agent workspace governance. |
| Homepage | [docs.curaos.abualruz.com](https://docs.curaos.abualruz.com) |
| Exposure | Open sanitized example. |
| License | MIT. |
| Security | No secrets, product code, customer data, or private infrastructure are included. |

## Quick Links

- [Setup](SETUP.md)
- [Agent contract](AGENTS.md)
- [Rules catalog](ai/rules/README.md)
- [Example project context](ai/example/CONTEXT.md)
- [Security](SECURITY.md)
- [Contributing](CONTRIBUTING.md)

## What is in here

| Path | What it is |
|---|---|
| `AGENTS.md` | Top-level agent contract for this example. |
| `ai/rules/` | Cross-CLI rules that can be adapted into another workspace. |
| `ai/example/` | Small project-specific agent docs mirror. |
| `docs/agents/` | Operational guides and workflow examples. |
| `scripts/` | Lightweight checks for docs, links, and workflow shape. |

## The ideas worth stealing

- Keep agent context separate from product code.
- Put cross-cutting policy in linkable rule files.
- Track agent work outside chat before it disappears.
- Use repeatable checks for doc links, rule sync, and workflow shape.
- Publish only sanitized examples, not the product blueprint.

## Using it as a template

1. Read [SETUP.md](SETUP.md).
2. Rename `ai/example/` to your project name.
3. Keep only the rules that fit your team.
4. Add your own code tree outside this sanitized example.
5. Run `python3 scripts/check-public-docs.py` before publishing.

## What was removed before publishing

- Product code.
- Private implementation docs.
- Git history.
- Submodule links.
- Private infrastructure.
- Customer data.
- Internal roadmap and pricing detail.
- Generator templates and product-specific automation.

## License

MIT. See [LICENSE](LICENSE).
