# Org Webhook -> Homelab Listener (event-driven convergers)

RP-54. One org-level GitHub webhook (events: `issues`, `pull_request`,
`pull_request_review`, `label`, `project_v2_item`) delivers to the existing Hetzner
Caddy front (session-30c pattern: Caddy terminates TLS, reverse-proxies to a
loopback-bound Bun listener). Convergers run on-event; the launchd polling timer is
demoted to a 6-hour safety net AFTER cutover. This properly activates foresight #549.

The agent-authorable half is the listener: `scripts/webhook-listener` (entrypoint) +
`scripts/lib/webhook-listener.js` (verification pipeline + converger dispatch) +
`scripts/lib/webhook-listener.test.js` (security suite). **Webhook registration and
secret provisioning are OPERATOR-ONLY steps** (the foresight rule forbids agents
registering webhooks); the agent prepares code, tests, and this runbook only.

## Architecture and trust boundaries

```
GitHub org webhook
  -> https://curaos-hooks.example.com/hooks/curaos-tracker   (Caddy, TLS, public)
  -> http://127.0.0.1:9444/hooks/curaos-tracker               (this listener, loopback)
  -> converger sweeps (scripts/sweep-*) + RP-38 board-snapshot invalidation
```

TLS/proxy assumptions (binding contract, enforced in code):

- Caddy terminates TLS on the public vhost. The listener itself speaks plain HTTP and
  **binds 127.0.0.1 only**; `createServer` throws on a non-loopback bind unless
  `CURAOS_WEBHOOK_ALLOW_NONLOOPBACK=1` is set deliberately.
- The listener trusts ONLY the local proxy hop. No `X-Forwarded-*` header participates
  in any auth decision; authentication is the HMAC signature alone.
- The Cloudflare Origin Cert on this box is a SINGLE-level wildcard (`*.example.com`,
  session-30d): the hook host must be single-level (`curaos-hooks.example.com`), never
  `hooks.curaos.example.com`.

## Security model (grill checklist GRILL-008)

| Control | Implementation |
|---|---|
| HMAC verify | `X-Hub-Signature-256` (sha256 over the RAW body) compared via `crypto.timingSafeEqual` on fixed-length sha256 digests of both signature strings (constant time AND constant length) |
| Replay/timestamp window | HTTP `Date` header must be within 300s past / 120s future; missing or unparseable `Date` rejected (fail-closed). HONEST LIMIT: GitHub signs the body, not headers, so this bounds naive replays and redelivery floods only; the authoritative replay defense is the next row |
| Delivery-id idempotency | `X-GitHub-Delivery` recorded in `.cache/webhook-deliveries.json` (mode 0600) BEFORE dispatch; a replayed or redelivered id runs a converger at most once; ledger retention (24h) must exceed the replay window (enforced) |
| Event allowlist | Only the five subscribed event types are processed; everything else (including the registration `ping`) is dropped with a log line and a 2xx so GitHub does not mark the hook failing |
| Payload size bounds | Default 1 MiB cap enforced twice: `Content-Length` precheck + mid-stream byte-count abort in the server, and again in the handler BEFORE any JSON parse |
| Secret storage | `CURAOS_WEBHOOK_SECRET_FILE` (preferred, vault-mounted path) or `CURAOS_WEBHOOK_SECRET` env; never in the repo, never on disk via this module, never in any log or error message; empty/missing secret refuses to start (fail-closed, exit 1) |
| Log redaction | Structured log lines carry ONLY `{ts, deliveryId, event, action, decision, reason}`; never the payload, headers, signatures, or secret; `redactForLog` additionally scrubs accidental secret/signature occurrences |

## Running the listener (agent-verifiable locally)

```bash
# Fail-closed check (expect exit 1, no secret in output):
env -u CURAOS_WEBHOOK_SECRET -u CURAOS_WEBHOOK_SECRET_FILE scripts/webhook-listener

# Local run:
CURAOS_WEBHOOK_SECRET_FILE=/path/to/secret scripts/webhook-listener
# env knobs: CURAOS_WEBHOOK_PORT (9444) CURAOS_WEBHOOK_BIND (127.0.0.1)
#            CURAOS_WEBHOOK_PATH (/hooks/curaos-tracker)
#            CURAOS_WEBHOOK_MAX_BODY (1048576) CURAOS_WEBHOOK_WINDOW_SEC (300)

# Security suite:
bun test scripts/lib/webhook-listener.test.js
```

Converger map (event -> sweeps; board snapshot invalidated first per RP-38):

| Event | Convergers |
|---|---|
| `issues` | `sweep-closed-issue-labels`, `sweep-foresight-staging` |
| `pull_request`, `pull_request_review` | `sweep-pr-notifications` |
| `label` | `sweep-label-seed` |
| `project_v2_item` | `sweep-project-status`, `sweep-roadmap-milestone-fields` |

## OPERATOR-ONLY runbook (registration + secret provisioning)

Agents MUST NOT perform these steps. Each is a one-time manual action on the Hetzner
box (`ssh user@100.77.0.1`; shell is fish, wrap scripts in `bash -lc`).

1. **Generate the secret** (on the box, never in a repo or chat):
   `openssl rand -hex 32 > /etc/curaos/webhook-secret && chmod 600 /etc/curaos/webhook-secret`
2. **Install + start the listener** (systemd unit pointing at the workspace checkout):
   `ExecStart=<bun> <checkout>/scripts/webhook-listener` with
   `Environment=CURAOS_WEBHOOK_SECRET_FILE=/etc/curaos/webhook-secret`,
   `Restart=on-failure`, a non-root user, and journal output. Confirm the startup log
   line shows `bind=127.0.0.1` and the five allowlisted events.
3. **Add the Caddy vhost** (mirror of the session-30c mirror-webhook block):
   `curaos-hooks.example.com { reverse_proxy 127.0.0.1:9444 }` using the existing
   `*.example.com` Origin Cert pair; reload Caddy. Add the single-level DNS record via
   the box-local Cloudflare token (the box token is DNS-scoped).
4. **Register the org webhook** (org `your-org` settings -> Webhooks):
   payload URL `https://curaos-hooks.example.com/hooks/curaos-tracker`, content type
   `application/json`, secret = contents of `/etc/curaos/webhook-secret`, events:
   Issues, Pull requests, Pull request reviews, Labels, Project v2 items.
5. **Verify the ping**: GitHub sends a `ping` delivery on registration. Expected
   listener behavior is a 204 with log reason `event-not-allowlisted` (the drop IS the
   success signal; GitHub records the 2xx).
6. **Live acceptance (RP-54)**: change a label on a test issue; confirm via
   `journalctl -u curaos-webhook` that the converger ran within the event window, and
   via the gh-call-ledger that zero polling calls were spent.
7. **Demote the polling timer to the 6-hour safety net** (ONLY after step 6 passes):
   reinstall the sweep daemon with `StartInterval` 21600 (see the integration-queue
   entry for the exact `com.curaos.sweep-notifications.plist.template` diff). The timer
   stays installed: it is the safety net for listener downtime (foresight #549 class).
8. **Redelivery drill** (optional but recommended): use the webhook's Recent
   Deliveries -> Redeliver button; expect a 200 with reason `duplicate-delivery` and no
   second converger run.

Rotation: regenerate the secret file, update the org webhook secret, restart the
listener (step 1 + 4 + `systemctl restart`). The listener has no cached copy beyond
process env, so restart completes the rotation.

## Failure modes

- **Listener down**: GitHub retries deliveries and surfaces failures under Recent
  Deliveries; the 6-hour timer safety net converges anything missed. Foresight #549
  (listener not running goes unnoticed) is closed by the timer plus delivery-failure
  visibility.
- **Secret file lost/empty**: listener exits 1 at startup and systemd keeps it failed
  (fail-closed); deliveries queue on GitHub's side until the operator restores the
  secret.
- **Converger failure**: logged as `converger failed` with the script path only; other
  convergers for the same event still run; the next event or the timer retries.

Related: `docs/agents/gh-app-token.md` (same agent-half/operator-half split),
`docs/agents/issue-tracker.md` (the tracker the convergers serve),
`docs/agents/local-state-retention.md` (state-file hygiene for `.cache/`).
