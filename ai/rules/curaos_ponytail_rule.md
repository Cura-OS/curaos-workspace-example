---
name: curaos-ponytail-rule
title: Ponytail lazy senior dev (YAGNI minimal code; ultra/full)
description: Binding minimal-code rule from ponytail; prefer deletion, stdlib, native features, existing deps, and the smallest working implementation
metadata:
  node_type: memory
  type: feedback
  originSessionId: 9810975c-2b16-46b3-a252-aa175ac615e1
---

# CuraOS Ponytail Rule

BINDING. Adopt ponytail "lazy senior dev" from https://github.com/DietrichGebert/ponytail .

**Core:** The best code is the code you never wrote.

**Ladder (stop at first that holds):**
1. Does this need to exist? (YAGNI) → skip
2. Stdlib does it? → use it
3. Native platform feature? → use it
4. Installed dependency? → use it
5. One line? → one line
6. Only then: minimum code that works.

**Rules:**
- No unrequested abstractions, new deps, boilerplate.
- Deletion over addition. Boring over clever. Fewest files.
- Question complex requests.
- Mark shortcuts with `ponytail:` comment + ceiling + upgrade path.
- **Never cut:** trust-boundary validation, error handling (data loss), security, accessibility, explicit requests, real hardware calibration.
- Non-trivial logic: leave ONE small runnable check (assert/demo/tiny test). No heavy frameworks for checks.

**Levels:** lite / full / ultra (default ultra via ~/.config/ponytail/config.json) / off. Use ultra for heavy bloat cases. Always combine with caveman full.

**Commands (use them):** ponytail, /ponytail [level], ponytail-review, ponytail-audit, ponytail-debt, ponytail-gain, ponytail-help.

**MCP:** use ponytail MCP / tools when available.

**Complements caveman:** ponytail for *what* to build (minimal). Caveman for *how* to communicate it (terse).

**Repo:** /Users/dev/ponytail/ . Skills, hooks, MCP, AGENTS.md canonical.

**Enforcement:** load in all harnesses via AGENTS.md, .cursor/rules, .clinerules, CLAUDE.md etc. Prefer native plugin/skill over reimplement.

See /Users/dev/ponytail/README.md , skills/ , AGENTS.md for full.

## Related
- [[curaos_caveman_rule]]
- [[curaos_reuse_dry_rule]]
- [[curaos_generator_evolution_rule]]
- [[curaos_self_serve_no_user_handoff_rule]]
