---
name: curaos-no-em-dash-rule
title: No em-dashes (use hyphen, comma, semicolon, colon, or parentheses; zero em/en dashes in any output, doc, commit, issue, PR, or rendered content; ci.sh grep gate on content repos)
description: No em-dashes: BINDING (user directive 2026-06-07). Never emit an em-dash or en-dash in any output, comment, doc, commit, issue, PR, marketing copy, or generated content; use hyphen-minus, comma, semicolon, colon, or parentheses. Applies especially to user-facing rendered content (curaos.example.com brochure, docs site, READMEs). Content repos (curaos-website, curaos-docs-site + site-content sources) add a `ci.sh` grep gate (`grep -P '[\x{2014}\x{2013}]'` must return nothing); reviewers flag any em/en dash in changed files as blocking.
---

# Rule: never use em-dashes

**Status:** Binding (all CuraOS agents: Claude Code, Codex, Gemini, OpenCode, Cursor, Aider).
**Added:** 2026-06-07 (user directive).

## Rule

Never emit an em-dash (the long dash) or an en-dash in any output, code comment, doc, commit message, issue, PR body, marketing copy, or generated content. Use one of these instead, whichever fits:

- a normal hyphen-minus for ranges or compound words
- a comma for a light pause
- a semicolon to join related clauses
- a colon to introduce
- parentheses for an aside

## WHEN

Every piece of generated text, always. Especially user-facing rendered content (the brochure site, docs site, READMEs) and tracker artifacts (issues, PR bodies, ADRs).

## WHY (failure mode)

User explicitly hates em-dashes; they read as AI-generated "slop" and degrade the brand voice on public surfaces (curaos.example.com, docs). A single em-dash in shipped marketing copy undoes the polish.

## INSTEAD-OF

Wrong: a sentence joined by a long dash.
Right: same sentence with a semicolon, comma, colon, or parentheses.

When editing an existing file that already contains em/en dashes in prose you are touching, replace them with correct punctuation in the same edit.

### Sweep the whole file, not just your additions (binding)

WHEN you edit any existing file that contains em/en dashes (U+2014 / U+2013), sweep EVERY dash in that file, not only the lines you added. Replace each with a hyphen, comma, semicolon, colon, or parens, whichever fits. This is the global rule "when editing existing files that contain em/en dashes in text I am already touching, replace them."

WHY: a partial fix leaves the file dirty; the next editor inherits the same dashes and the brand-voice failure persists. INSTEAD-OF fixing only your diff, leave the file dash-free.

EXCEPTION (huge accumulating single-line docs, e.g. HANDOVER): a full sweep risks corrupting dense inline content. At minimum fix every dash you introduce, then seed a separate sweep as a `foresight` issue. Do NOT silently skip; name the deferred sweep.

GATE GAP: the `curaos` code repo has NO `em-dash-gate.sh` (only the content repos curaos-website / curaos-docs-site enforce via `ci.sh`). In the code repo the discipline is on the editor; reviewer checks + opposite-harness grill are the only backstop.

## Enforcement

- Content generators (the curaos-website / curaos-docs-site renderers + their site-content sources) must contain zero em/en dashes; add a fail-closed, host-portable gate to those repos' `ci.sh` (see the shipped `scripts/em-dash-gate.sh` in curaos-website / curaos-docs-site: it probes for PCRE-capable `grep -P` and falls back to an `LC_ALL=C grep -F` byte scan against the literal U+2014/U+2013 byte sequences, never silently no-ops, and maps exit status explicitly so a found dash always fails and a grep error never passes).
- Reviewers (reviewer checks + opposite-harness grill) flag any em/en dash in changed files as a blocking nit.
