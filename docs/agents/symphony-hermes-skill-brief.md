# Hermes Skill Brief for Symphony Alignment

Status: source brief for the active Hermes skill
Related guide: [SYMPHONY-HERMES-NATIVE-GUIDE.md](SYMPHONY-HERMES-NATIVE-GUIDE.md)

## Skill purpose

Teach Hermes to execute CuraOS Symphony-aligned workflows with native Hermes tools and without assuming Claude Workflow or Agent Workflow Kit.

## Skill trigger

Use when a user asks Hermes to plan, execute, verify, or update CuraOS agent workflows, orchestration rules, local-first tracking, or Symphony alignment.

## Required behavior

- Read the project rule and plan before edits.
- Use local ledger and `todo` for progress.
- Use `delegate_task` only for isolated reasoning or parallel review, then verify parent-side.
- Use `terminal` for commands and verification.
- Use `patch` or `write_file` for edits.
- Keep GitHub sync explicit; tracker parity checkpoints are dual-way by default.
- Record reflection before final response.

## Verification

The skill should point Hermes to the closeout checklist and the project docs rather than duplicating all policy text.
