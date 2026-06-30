# Symphony Source Intake Notes

Status: source ledger for adoption planning
Research: [../../ai/curaos/docs/research/2026-06-27-symphony-orchestration-alignment.md](../../ai/curaos/docs/research/2026-06-27-symphony-orchestration-alignment.md)

## Upstream repository

- Repo: `openai/symphony`
- License: Apache-2.0
- Default branch: `main`
- Root files checked: `README.md`, `SPEC.md`, `LICENSE`, `NOTICE`, `.codex/skills/`, `elixir/WORKFLOW.md`

## Upstream spec sections used

- Normative language and implementation-defined behavior.
- Goals and non-goals.
- Workflow specification and front matter schema.
- Prompt template contract.
- Dispatch preflight validation.
- Orchestration state machine.
- Polling, candidate selection, concurrency, retry, and reconciliation.
- Workspace management and safety.
- Agent runner protocol.
- Tracker writes boundary.
- Prompt construction and context assembly.
- Logging, status, and observability.
- Security and operational safety.
- Test and validation matrix.
- Implementation checklist.

## Upstream example behaviors used carefully

Adopt:

- Repository-owned workflow file with front matter and prompt body.
- Persistent workpad concept.
- Reproduce and plan before implementation.
- Status routing by current tracker state.
- PR feedback sweep before handoff.
- Acceptance and validation checklist as completion bar.

Do not adopt as generic policy:

- Linear-specific tracker operations.
- Codex-only app-server settings.
- Permissive network and approval defaults.
- AI attribution commit trailers.
- GitHub write-heavy progress comments.

## Local adoption stance

CuraOS imports the design pattern, not the upstream tracker or runner stack. The spec becomes a conformance lens over existing CuraOS workflow owners.
