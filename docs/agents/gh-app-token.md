# GitHub App Installation Token (REST ceiling raise)

RP-43. One org GitHub App raises the REST rate ceiling from the 5,000/hr user-token
budget to the installation budget: ~5,000/hr base plus 50/hr per repo above 20, capped
at 12,500/hr (this org sits around 10k+/hr). The agent-authorable half is the token
helper at `scripts/gh-app-token` (logic + tests in `scripts/lib/gh-app-token.js`); the
App registration itself is an OPERATOR step and is never performed by an agent.

## Using the helper

```bash
# Uniform call site; works before AND after the App is registered:
GH_TOKEN=$(scripts/gh-app-token) gh api rate_limit

scripts/gh-app-token --status         # token-free JSON snapshot
scripts/gh-app-token --check          # config + key permission preflight, mints nothing
scripts/gh-app-token --force-refresh  # ignore cache, mint fresh
```

Behavior:

- **App configured** (all three `CURAOS_GH_APP_*` core vars set): mints an installation
  token via an RS256 App JWT, caches it, and reuses it for at most 55 minutes
  (installation tokens live 60 minutes; the helper refreshes 5 minutes before expiry so
  callers always hold usable lifetime).
- **App not configured**: graceful fallback to `gh auth token` executed WITHOUT
  `GITHUB_TOKEN`/`GH_TOKEN` in the child env, i.e. the keyring auth. This is the same
  posture as the historical `env -u GITHUB_TOKEN gh` workaround (the narrow env token
  lacks project scope; the keyring auth has it), so adopting
  `GH_TOKEN=$(scripts/gh-app-token)` is safe everywhere today and silently upgrades to
  the raised ceiling once the operator registers the App. Scripts that still spawn
  `env -u GITHUB_TOKEN gh` directly keep working; new call sites should prefer the
  helper so the ceiling raise applies without further edits.

Configuration (env-driven):

| Variable | Required | Meaning |
|---|---|---|
| `CURAOS_GH_APP_ID` | yes (App mode) | numeric App ID |
| `CURAOS_GH_APP_INSTALLATION_ID` | yes (App mode) | numeric org installation ID |
| `CURAOS_GH_APP_PRIVATE_KEY_PATH` | yes (App mode) | PEM path, mode 0600 or 0400 |
| `CURAOS_GH_APP_TOKEN_CACHE` | no | cache file (default `~/.cache/curaos-gh-app/token.json`) |
| `CURAOS_GH_APP_AUDIT_LOG` | no | audit log (default `~/.cache/curaos-gh-app/audit.log`) |
| `CURAOS_GH_APP_API_URL` | no | API base (default `https://api.github.com`) |

## Security posture (GRILL-007: credentials get the full credential treatment)

- **Private key**: store at `~/.config/curaos/gh-app/private-key.pem`, `chmod 600`.
  The helper STAT-checks the file before every mint and refuses (exit 2) when any
  group/other permission bit is set, when the path is missing, or when it is not a
  regular file. An OS keychain is an acceptable alternative store; export to a 0600
  temp file only for the duration of a mint if you use one.
- **Token cache**: written 0600 inside a 0700 directory, atomically (tmp + rename),
  with an explicit `chmod` after write so the umask cannot widen it. A cache file
  found with group/other bits is treated as invalid and re-minted. Tests assert the
  file mode after mint.
- **No token logging**: stdout is the single delivery channel (same contract as
  `gh auth token`). Every diagnostic line, audit entry, and error message passes
  through redaction against the live secret set (minted token, App JWT, key PEM);
  tests grep captured stderr, the audit log, `--status` output, and thrown error
  messages for a sentinel token and assert absence.
- **Audit trail**: every `mint`, `refresh`, and `fallback_keyring` event appends a
  timestamped JSON line (app id, installation id, expiry, cache path; never a token)
  to the audit log, itself kept 0600.

## OPERATOR runbook: registering the App (ready-for-human; agents never do this)

Agents prepare the helper, tests, and docs only. The registration below requires org
admin authority and is tracked as a `ready-for-human` issue.

1. Org settings for `your-org` -> Developer settings -> GitHub Apps ->
   New GitHub App. Name: `curaos-roadmap-automation`. Homepage: the workspace repo URL.
   Webhook: DISABLED (the helper only mints tokens; the webhook pilot is RP-54's scope).
2. Permissions (minimized; each scope justified):

   | Permission | Level | Justification |
   |---|---|---|
   | Issues | Read and write | issue queue mutations: labels, comments, close, sub-issue wiring |
   | Projects (organization) | Read and write | CuraOS Roadmap board reads + Status/Milestone field sync |
   | Pull requests | Read | PR verification reads (reviews, threads, merge state); merges stay on operator-blessed auth |
   | Metadata | Read | mandatory baseline for any App |

   Nothing else. No Contents write, no Actions, no Administration. If a future item
   needs more, it amends this table in its own PR with its own justification.
3. Install the App on ALL repositories of the org (the per-repo bonus above 20 repos is
   what raises the ceiling).
4. Generate a private key (App settings -> Private keys -> Generate). Move it to
   `~/.config/curaos/gh-app/private-key.pem` and `chmod 600` it. Delete the browser
   download copy.
5. Read the installation ID from the installation URL
   (`.../settings/installations/<id>`) or `gh api /app/installations` with an App JWT.
6. Export the env vars (shell profile or direnv `.envrc`, NOT committed):

   ```bash
   export CURAOS_GH_APP_ID=<app-id>
   export CURAOS_GH_APP_INSTALLATION_ID=<installation-id>
   export CURAOS_GH_APP_PRIVATE_KEY_PATH=~/.config/curaos/gh-app/private-key.pem
   ```

7. Verify and paste evidence into the tracking issue:

   ```bash
   scripts/gh-app-token --check
   GH_TOKEN=$(scripts/gh-app-token) gh api rate_limit --jq .resources.core
   ```

   The `limit` field must show the raised ceiling (>5,000). That pasted output is the
   acceptance evidence for the ceiling-raise issue.

## Key rotation procedure

1. App settings -> Private keys -> Generate new key (GitHub allows two live keys, so
   rotation is zero-downtime).
2. Replace `~/.config/curaos/gh-app/private-key.pem` with the new PEM, `chmod 600`.
3. `scripts/gh-app-token --check` then `scripts/gh-app-token --force-refresh >/dev/null`
   to prove the new key mints.
4. Delete the OLD key in App settings (this revokes it).
5. Wipe the token cache: `rm -f ~/.cache/curaos-gh-app/token.json`. Outstanding minted
   tokens expire within 60 minutes on their own; no further revocation is needed.

Rotate on any suspicion of exposure, and routinely at most every 90 days.

## Relationship to the `env -u GITHUB_TOKEN` workaround

The keyring workaround (see `docs/agents/github-roadmap-project.md` Setup Commands and
[[curaos-gh-project-sync-env-workaround]]) exists because the narrow env token lacks
project scope. This helper subsumes it: fallback mode IS the workaround (token-var-free
`gh auth token`), and App mode replaces it with a higher-ceiling credential. Cleanup of
remaining direct `env -u GITHUB_TOKEN gh` call sites can proceed incrementally by
switching them to `GH_TOKEN=$(scripts/gh-app-token)`.
