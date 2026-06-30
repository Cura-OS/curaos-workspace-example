# Setup - what to create and populate

This repo ships the **governance layer** of a multi-agent workspace, not a running product. To actually *use* the paradigm, you (or your agents) fill in the slots that were intentionally stripped before publishing.

This file is the map of those empty slots: what is missing, why, where it goes, and who fills it. Nothing here is broken - it is a template waiting to be populated.

## The core idea (read this first)

The paradigm splits every project into **two parallel trees**:

```
your-workspace/
├── ai/<project>/        # INTENT: agent docs, decisions, specs   (shipped here as ai/curaos/)
└── <project>/           # CODE: the actual repo / submodules      (stripped - you create it)
```

`ai/<project>/` is a **1:1 structural mirror** of `<project>/`. Code repos stay code-only; all intent, ADRs, requirements, and context live in the `ai/` mirror. A drift-checker (`scripts/check-ai-mirror.sh`) keeps the two trees aligned. This separation is the thing that "worked wonderfully" - agents read intent from `ai/`, write code into `<project>/`, and neither pollutes the other.

Everything below is a consequence of that split, plus the runtime state the workspace generates as agents work.

---

## 1. The code tree - `curaos/` (the missing twin)

**Status:** does not exist here. Stripped (it was the real product + git submodules).

**What it is:** the mirror partner of `ai/curaos/`. For every `ai/curaos/<path>/` there is a `curaos/<path>/` holding the actual code.

**To use the paradigm, create your own code tree** named after your project (rename `ai/curaos/` -> `ai/<your-project>/` and create `<your-project>/`):

```
<your-project>/
├── README.md                 # human entry (code repo)
├── CHANGELOG.md
├── backend/{services,packages}/<kebab>/   # one dir (or git submodule) per service/package
├── frontend/{apps,packages}/<kebab>/
└── ops/
```

- Code repos hold **CODE + README + CHANGELOG + build files only**. No agent docs.
- Naming is **kebab-case**; services end in `-service`.
- `AGENTS.md` describes these as git submodules. You can use submodules **or** plain directories - the paradigm does not require submodules, it just requires the two-tree split. If you skip submodules, ignore the `.gitmodules` / pointer-bump references in the docs.

**Who fills it:** you / your agents, as real work lands.

---

## 2. Per-module `Requirements.md` (stripped from every module)

**Status:** removed everywhere (these held the original product spec).

**What it is:** each module in the mirror is supposed to ship a trio:

```
ai/<project>/<module>/
├── AGENTS.md          # SHIPPED - binding per-module rules + frontmatter
├── CONTEXT.md         # SHIPPED - integration map, decisions, rationale
└── Requirements.md    # MISSING - the module's charter / spec / Definition of Done
```

`AGENTS.md` and `CONTEXT.md` are present as worked examples. **`Requirements.md` is the one you write** when you adopt a module: what it must do, its contracts, its Done criteria. See any module's `AGENTS.md` body - it links to the `Requirements.md` that should sit beside it.

**Who fills it:** whoever owns the module, before implementation starts.

---

## 3. Runtime state - `.scratch/` (regenerated, never committed)

**Status:** absent, and `.gitignore`d on purpose.

The local-first issue tracker and orchestration lanes live here. The tracker code is shipped (`local-issues.js`, `local-issues-db.js`); the **database it manages is not**:

```
.scratch/state/symphony-work/
├── local-issues.sqlite           # the work hierarchy DB - created on first use
├── local-issues-summary.md       # rendered snapshot
└── github-parity-snapshot.json   # GitHub mirror cache
```

These are **created automatically** the first time an agent files an issue. Do not commit them. Initialize an empty DB with the tracker CLI described in `docs/agents/issue-tracker.md`.

`.scratch/` also holds orchestrator lane state during workflow runs - transient, wiped by worktree cleanup. Never write durable artifacts (like grill reports) there.

**Who fills it:** the tooling, at runtime. You just let it.

---

## 4. Research and roadmap (stripped - project-specific)

**Status:** removed (these were our actual competitive research + backlog).

The paradigm expects two more populated-as-you-go areas:

| Path | What goes here | Stripped because |
|---|---|---|
| `ai/research/` and per-module `<module>/research/` | Deep-research artifacts persisted to disk (competitor patterns, package evaluations, integration findings) | Was our own research |
| `ai/<project>/docs/ISSUE-ROADMAP.md` | Rendered roadmap of milestones + issues | Was our real backlog |

Rules reference these (e.g. the foresight + research rules in `ai/rules/`). Recreate them with your own content as you do the work. `scripts/render-issue-roadmap.js` regenerates the roadmap from the tracker DB.

**Who fills it:** agents persist research as they produce it; the roadmap renders from your tracker.

---

## 5. Dangling doc links (expected, not bugs)

Because code and specs are gone, **docs in `ai/curaos/` reference files that are not in this repo** - service source, `Requirements.md`, the `curaos/` tree, generated SDKs under `tools/codegen/`. This is intentional. The doc-graph and mirror checkers (`scripts/check-doc-graph.js`, `scripts/check-ai-mirror.sh`) will report these as missing until you populate the twin tree. That is the signal telling you what is left to fill.

---

## 6. Placeholders to swap

Every private identifier was replaced. Search-and-replace these for your own values:

| Placeholder | Was | Replace with |
|---|---|---|
| `your-org` | the GitHub org | your org / user |
| `example.com` (and `*.example.com`) | real domains | your domains |
| `dev@example.com` | maintainer email | yours |
| `/Users/dev`, `user@` | home path, ssh user | yours |
| `203.0.113.10`, `100.77.0.x` | public + VPN IPs | your infra (or keep as docs-only) |
| `curaos` / `CuraOS` | project name | your project name |

---

## Minimal path to a working workspace

1. Fork / clone this repo, rename it.
2. Swap the placeholders (section 6).
3. Rename `ai/curaos/` -> `ai/<your-project>/`; create the `<your-project>/` code tree (section 1).
4. Keep the `ai/rules/` you want, delete the rest.
5. Let the tracker create `.scratch/` state on first run (section 3).
6. Write `Requirements.md` per module as you adopt it (section 2).
7. Run the doc-graph + mirror checkers; fill what they flag.

The rules in `ai/rules/`, the agent contracts (`AGENTS.md` files), and the orchestration workflows (`*.workflow.js`) work as-is - they are the reusable core. Everything in this file is the project-specific shell you grow around them.
