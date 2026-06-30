---
name: curaos-self-serve-no-user-handoff-rule
title: Self-serve, never hand the user work the agent can do
description: BINDING. The agent does EVERY task it has any path to accomplish itself (register accounts/OIDC clients, generate + persist credentials, run admin CLIs/APIs, click through admin UIs via browser automation). It NEVER asks the user to perform an action as a precondition. It only ESCALATES the irreducible minimum (a credential/secret that exists nowhere it can reach, a physical/legal/payment act, or an explicit destructive-op/scope approval), and even then it first exhausts every self-serve path. After doing the work it REPORTS what was done + which credentials to use.
metadata:
  type: feedback
  binding: true
---

# Self-serve: never hand the user work the agent can do

**User directive (2026-06-15, verbatim intent):** "Add a rule never ask me to do shit I can't help you, you have to help me, and you have to register and write it and save an auth, all you do is report to me what was done and what creds to use."

## The rule (BINDING)

1. **Do it yourself.** For ANY task with a reachable path - admin API, CLI, config file, a token/secret already on disk (e.g. `~/workspace/example-homelab/secrets/`), a bootstrap admin, SSH to the host, or browser automation against an admin UI - the agent performs it. Registering an OIDC client, creating a DB/user, provisioning a record, generating a keypair, seeding an admin, flipping a setting: the agent does all of it.

2. **Generate + persist credentials.** When a task needs a credential that does not yet exist, the agent CREATES it (random secret, keypair, client registration), PERSISTS it to the project's secret store (the homelab `secrets/` vault, a k8s Secret, the documented location), wires it into the consuming config, and verifies the result live.

3. **Report, do not delegate.** After the work: report (a) what was done, (b) which credentials/IDs to use, (c) where they are stored (path/secret name), (d) how it was verified. The user's role is to be INFORMED, not to execute steps.

4. **Escalate only the irreducible minimum, and only after exhausting self-serve.** Legitimate escalation = a secret/credential that exists NOWHERE the agent can reach and cannot be self-created (e.g. a third-party API key the user holds privately), a physical/legal/payment act, or a destructive-op / unapproved-scope / public-exposure approval per [[curaos-no-silent-block-rule]] + §11. Before escalating, the agent MUST have tried: existing secret stores, admin CLIs/APIs, bootstrap-admin paths, browser automation of the admin UI, and SSH-to-host. "It needs an admin login" is NOT a valid handoff if the agent can reach that admin surface.

5. **An AskUserQuestion that asks the user to GO DO an action (register X, create Y, log into Z and click) is a rule violation.** Convert it to: do the action, then report. Questions are reserved for genuine DECISIONS (which approach, approve-public-expose, approve-destructive-op) - not for offloading executable work.

## Why
The user is the accountable owner + decision-maker, not a task executor. Handing them executable work the agent could do (especially "log in and create a client/account") is the exact friction this rule kills. Pairs with [[curaos-no-silent-block-rule]] (escalate blockers with the exact unblock ask) and [[curaos-recommendation-auto-apply-rule]] (take the clear action, do not re-ask).

## How to apply
- Faced with "this needs an admin action" -> find the admin surface (API token in the vault, CLI, bootstrap creds, browser automation) and DO it.
- Need a client/secret -> create it, save it to the vault + the consuming k8s Secret/config, verify, report the IDs + storage location.
- Only escalate the single credential/approval that is genuinely unreachable, after proving the self-serve paths are exhausted.
