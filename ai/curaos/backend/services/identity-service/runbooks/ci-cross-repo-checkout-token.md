# Runbook: CI cross-repo checkout token (WORKSPACE_CHECKOUT_TOKEN)

**Fixes:** `curaos-ai-workspace#201` — identity-service CI fails at *"Checkout CuraOS parent workspace"* with `Not Found - get-a-repository`, blocking the required check on every PR. Also fixes #213 (builder-core CI sibling-package resolution). #202 unblocked. Staging unaffected (fully local, no token needed).

**Applies to:** any submodule CI that checks out the private `curaos` parent workspace — currently `identity-service/.github/workflows/ci.yml` and `builder-core-service/.github/workflows/publish-sdk.yml` (both use the `WORKSPACE_CHECKOUT_TOKEN || GITHUB_TOKEN` pattern as of 2026-05-29).

## Why the default token fails

`actions/checkout` with `repository: your-org/curaos` uses `secrets.GITHUB_TOKEN` by default. That token is **scoped to the workflow's own repo only** — it has no read access to the *separate, private* `curaos` parent (or its recursive submodules). So the checkout 404s (`Not Found`) before typecheck/test run, and the required check fails on every PR. Local `bun run` is unaffected (it has the parent on disk); this is CI-only.

## Fix (workflow side — DONE)

The parent-checkout step now uses an org-wide read token with a safe fallback:

```yaml
token: ${{ secrets.WORKSPACE_CHECKOUT_TOKEN || secrets.GITHUB_TOKEN }}
```

If the secret is set it is used; if not, it falls back to the old behaviour (still fails loudly, no silent regression).

## Action required (user — ~2 min, one-time, org-level)

The token + secret are a **user-only action** (needs GitHub admin + a token you generate). Two options:

### Option A — Fine-grained PAT (simplest)

1. GitHub → Settings → Developer settings → **Fine-grained personal access tokens** → Generate new token.
2. **Resource owner:** `your-org` (the org).
3. **Repository access:** All repositories (or at minimum `curaos` **plus every submodule** `curaos` pulls via `submodules: recursive` — All repositories is far simpler given 100+ submodules).
4. **Permissions:** Repository permissions → **Contents: Read-only** (that is all `actions/checkout` needs).
5. **Expiration:** pick a rotation cadence (e.g. 90 days) and set a reminder, or use Option B to avoid rotation.
6. Add it as an **organization secret** so every submodule CI inherits it:
   ```bash
   gh secret set WORKSPACE_CHECKOUT_TOKEN --org your-org --visibility all --body "<the-PAT>"
   ```
   (Or per-repo: `gh secret set WORKSPACE_CHECKOUT_TOKEN -R your-org/identity-service --body "<PAT>"`.)

### Option B — GitHub App token (no rotation; more robust long-term)

1. Create a GitHub App in the org with **Contents: Read-only**; install it on all repos.
2. Store `WS_APP_ID` + `WS_APP_PRIVATE_KEY` as org secrets.
3. Swap the checkout to mint a short-lived token via `actions/create-github-app-token` (a follow-up workflow edit — ask and I'll wire it across the submodule CIs). Preferred if PAT rotation is a burden.

> **Recommendation:** Option A (org secret `WORKSPACE_CHECKOUT_TOKEN`, All-repositories, Contents:read) clears #201 fastest. Move to Option B later if rotation becomes a chore — file it as foresight.

## Verify (after the secret is added)

Re-run the identity-service CI (push a trivial commit or re-run the failed check):
```bash
env -u GITHUB_TOKEN gh run list -R your-org/identity-service --workflow ci.yml --limit 1
# the "Checkout CuraOS parent workspace" step should succeed; typecheck/test then run
```
Once green, close `curaos-ai-workspace#201`; the M9-S2 changeValues lane's identity-service PRs unblock.

## Security note

Contents:read is the least privilege that satisfies `actions/checkout`. Do NOT grant write/admin. An org secret is readable by every repo's Actions — acceptable for a read-only checkout token; do not reuse this secret for anything that mutates.
