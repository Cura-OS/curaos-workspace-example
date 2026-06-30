# curaos §2 - File Ownership Boundaries

| Location | Owner | Contains |
|---|---|---|
| `curaos/` + submodules | Code repo | Code, README.md, CHANGELOG.md, build files ONLY |
| `ai/curaos/` | Workspace (this area) | Requirements.md, CONTEXT.md, AGENTS.md, AGENTS-sections/, ADRs, specs, workflows, compositions |

**Hard rule:** never add ADR refs, workspace links, or planning docs inside `curaos/` repo or submodules. Agents reading `curaos/` see only code-level context. Planning context lives here.

See [[curaos-repo-boundary-rule]] + [[curaos-ai-mirror-rule]] for enforcement.
