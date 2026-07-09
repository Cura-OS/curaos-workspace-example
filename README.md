# CuraOS Workspace Example

[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)
[![Exposure: Open](https://img.shields.io/badge/exposure-Open-brightgreen)](#license)
[![Module: Example](https://img.shields.io/badge/module-Example-informational)](#what-is-in-here)


A **sanitized, real-world example** of how a multi-agent (Claude Code / Codex / Gemini / OpenCode / Cursor / Aider) software workspace can be organized, governed, and driven. Shared as lessons-learned and a starting template - take what is useful, ignore the rest.

This is **not** a runnable product. It is the *workspace management layer*: the rules, agent contracts, doc graph, local-issue tracking, and orchestration workflows that sit *around* a codebase and coordinate AI agents working on it. The actual product code, specs, and private infrastructure have been removed.

## At a Glance

| Field | Detail |
|---|---|
| Audience | Engineering teams adopting multi-agent workspace governance. |
| Homepage | [docs.curaos.abualruz.com](https://docs.curaos.abualruz.com) |
| Exposure | Open sanitized example. |
| License | MIT. |
| Security | No secrets, product code, customer data, or private infrastructure are included. |

## What is in here

| Path | What it is |
|---|---|
| `AGENTS.md` | The top-level agent contract: workspace charter, layout rules, operating rules every agent reads first. The keystone file. |
| `ai/rules/` | ~60 cross-CLI canonical decision rules (stack picks, naming, gates, generator-evolution, verification, no-em-dash, etc.). One file per rule, slug-linked. |
| `ai/templates/` | Scaffolding templates (service skeletons, etc.). |
| `ai/curaos/` | The agent-docs "mirror": per-module `AGENTS.md` + `CONTEXT.md` showing how each service/app documents its intent, integration points, and decisions separately from its code. ADRs live under `ai/curaos/docs/adr/`. |
| `docs/agents/` | Operational guides: issue tracker, triage labels, roadmap project, workflow library. |
| `*.workflow.js` + paired `*.md` | Deterministic multi-agent orchestration workflows (milestone wave, TDD implement, PR verify+merge, opposite-harness adversarial grill, context-load, breakdown). Playbook (`.md`) + executor (`.js`). |
| `local-issues*.js` | A local-first SQLite issue tracker - the work hierarchy that keeps agent work from becoming invisible chat-only work. |
| `scripts/` | Doc-graph checks, mirror checks, roadmap rendering, workflow sync. |
| `.githooks/`, `lefthook.yml` | Pre-commit gates (secret scan, doc-graph sync, em-dash gate). |

## The ideas worth stealing

- **Agent docs live beside, not inside, the code.** `ai/curaos/` is a 1:1 structural mirror of the (removed) `curaos/` code tree. Code repos stay code-only; intent/ADRs/specs live in the mirror. A drift-checker keeps them aligned.
- **Rules as canonical, linkable files.** Cross-cutting policy is one file per rule under `ai/rules/`, referenced by slug everywhere instead of copy-pasted. ADRs link to rules rather than restating them.
- **Local-first issue hierarchy.** Every task/blocker/follow-up gets a tracker row before it disappears into chat. Worker lanes bundle compatible work; splits are recorded with a reason.
- **Deterministic orchestration workflows.** Fan-out / verify / synthesize structured as scripts (playbook + executor pairs), not ad-hoc model improvisation.
- **Cross-harness adversarial verification.** One harness grills another's output before it merges (`opposite-harness-grill`).
- **A doc graph that must stay connected.** Every markdown file stays reachable from the root `AGENTS.md`; CI enforces it.

## Adopting it yourself

Code, specs, and runtime state were stripped, leaving empty slots in the paradigm. **[SETUP.md](SETUP.md)** documents every slot: the missing `curaos/` code twin, per-module `Requirements.md`, the `.scratch/` tracker state, research/roadmap dirs, and the placeholders to swap. Start there to stand up your own workspace.

## What was removed / changed before publishing

This snapshot was scrubbed so it leaks nothing private:

- **Removed:** all git history (`.git`), submodule links (`.gitmodules`), the actual product code (`curaos/`), `Requirements.md` / `PRODUCT.md` / `DESIGN.md` / issue-roadmap files, research artifacts, build caches, worktrees, `node_modules`, and scratch dirs.
- **Replaced with placeholders:** the GitHub org name (`your-org`), all real domains (`example.com`), the developer email (`dev@example.com`), home-directory paths (`/Users/dev`), the ssh user (`user@`), and real server / VPN IPs (`203.0.113.10`, `100.77.0.x` - RFC-5737 / CGNAT placeholders).

Because specs and code are gone, **some docs reference files that no longer exist here**. That is expected - the value is in the *patterns and rules*, not in a working build.

## Using it as a template

1. Read `AGENTS.md` top to bottom - it is the entry point.
2. Skim `ai/rules/README.md` for the rule catalog; keep the rules that fit your stack, delete the rest.
3. Adapt `ai/curaos/` into your own `ai/<project>/` mirror, or drop it and keep only `ai/rules/` + the workflows.
4. Swap every placeholder (`your-org`, `example.com`, etc.) for your own values.
5. `git init` your own repo - this one ships with no history on purpose.

## License

MIT - see [LICENSE](LICENSE). Provided as-is, as an example. No warranty, no support.
