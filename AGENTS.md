# AGENTS.md - Workspace Example

This repository is a sanitized example of a multi-agent engineering workspace. It shows the governance layer around a product repo, not the product itself.

## Layout

```text
.
├── AGENTS.md
├── README.md
├── SETUP.md
├── ai/
│   ├── example/
│   │   ├── AGENTS.md
│   │   └── CONTEXT.md
│   └── rules/
├── docs/
│   └── agents/
└── scripts/
```

## Rules

- Read this file before making project-specific changes.
- Keep product code out of this example.
- Keep secrets, customer data, private domains, private infrastructure, and internal roadmap details out of this repo.
- Store reusable agent rules under `ai/rules/`.
- Store project-specific agent context under `ai/example/`.
- Keep Markdown links local and valid.
- Do not add em dash or en dash characters.

## Agent Workflow

1. Read `README.md` and `SETUP.md`.
2. Read `ai/rules/README.md`.
3. Read the nearest project context under `ai/example/`.
4. Make the smallest change that keeps the example useful and sanitized.
5. Run the documented checks before committing.

## Checks

```bash
python3 scripts/check-public-docs.py
gitleaks detect --no-banner --redact
```
