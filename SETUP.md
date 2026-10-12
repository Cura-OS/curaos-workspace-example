# Setup

This repo is a pattern, not a runnable product. Use it as a starting point for a multi-agent workspace.

## 1. Choose Names

Replace example names:

| Placeholder | Replace with |
|---|---|
| `ai/example/` | `ai/<your-project>/` |
| `example.com` | Your public docs or support domain |
| `your-org` | Your GitHub organization |

## 2. Add Your Code Tree

Create a code tree beside `ai/`:

```text
.
├── ai/<your-project>/
└── <your-project>/
```

Keep code in `<your-project>/`. Keep needed code documentation and runbooks in `ai/<your-project>/`. Create working tasks, specs, research, decisions and links in Rice.

## 3. Keep The Mirror Small

Start with:

```text
ai/<your-project>/
├── AGENTS.md
└── CONTEXT.md
```

Add deeper module docs only when real modules exist.

## 4. Pick Rules

Read [ai/rules/README.md](ai/rules/README.md). Keep the rules that prevent real mistakes in your workspace. Delete rules that only describe CuraOS-specific decisions.

## 5. Verify Before Publishing

Run:

```bash
node scripts/check-public-docs.js
gitleaks detect --no-banner --redact
```

The first command checks Markdown links and banned dash characters. The second checks secrets.

## 6. Bind the maintained runtime

Use the [Rice toolkit consumer](docs/agents/rice-toolkit.md) to persist existing
workspace/client/profile references. Both Codex and Claude use installed Rice
project tooling and native harness capabilities. Keep only this reference glue
in the template; do not copy a workflow runtime, issue database or planner into it.
