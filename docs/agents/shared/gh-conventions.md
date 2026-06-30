# Shared: gh + Script Invocation Conventions

Canonical conventions for every `gh`/script invocation in the orchestration prompts ([milestone](../milestone-orchestration-prompt.md), [one-task](../one-task-execution-prompt.md)). One statement lives here; the prompts carry one-line pointers per [[curaos-reuse-dry-rule]].

## gh invocation convention (binding)

A narrow `GITHUB_TOKEN` env var lacks Project scope. When it is set, run EVERY tracker/Project/label/claim/merge `gh` command as `env -u GITHUB_TOKEN gh ...`. Prompt examples omit the prefix for readability; apply it whenever the env token is present.

## Script-path convention (binding)

Every `bash scripts/<name>` in the prompts resolves from the workspace repo root (the main curaos-workspace checkout). Workers and any agent in an external worktree must use the absolute form `bash "$WORKSPACE_ROOT/scripts/<name>"`, where `WORKSPACE_ROOT` is the main workspace checkout, NOT the worktree; resolve it once from the dispatch brief or `git worktree list`.

## GitHub API quota routing (binding)

Follow `ai/rules/curaos_roadmap_workflow_rule.md` section "GitHub API quota routing" (canonical):

- REST first for issue/PR lists, labels, comments, timelines, dependencies, sub-issues, PR reviews/comments, commit status, PR create/merge, and notifications.
- GraphQL ONLY for ProjectV2 item/field reconciliation, unresolved review-thread proof/resolution, and parent reverse links that REST + issue-body backlinks cannot prove.
- Check `gh api rate_limit --jq '.resources.graphql'` before broad GraphQL reads. On low quota keep REST-supported work running and mark only the GraphQL-only leg `blocked: github-graphql-quota`.
- Run REST reads at normal safe concurrency; throttle GraphQL-backed triage reads to ~4 concurrent; serialize mutations against the same Project; never run broad Project reads inside loops.
- A REST-supported tracker mutation failure (auth/network) is fail-closed: do not dispatch; `STATUS: blocked`, `BLOCKER: tracker-mutation-unavailable`.

## GitHub Search 1000-result cap (RP-78)

The Search API exposes AT MOST 1000 results per query even with `--paginate` - any page past the 1000th result comes back empty while `total_count` still reports the larger true total (the cap is on accessible results, independent of page size). Treat `total_count > 1000` (or exactly 1000 items returned) as a fail-closed truncation signal, NOT a complete scan. Sharded per-repo fallback: enumerate repos via `gh repo list your-org --limit 200 --json name`, then run the same paginated search per repo (`-f q='repo:your-org/<name> is:issue is:open'`) - each shard stays far below the cap - and union the results.
