---
name: curaos-verification-stack-rule
title: Verification stack (3-tier T1/T2/T3 + cross-harness adversarial)
description: 3-tier verification stack - T1 auto every commit (git status+diff+bun run ci+gitleaks+bun audit+c7 docs); T2 auto+async-human every PR (3-lens multi-model code review subagent Security+Architecture+QA w/ per-harness tiering matrix applied per [[curaos-model-tiering-rule]]; adversarial cross-harness review ALLOWED when case requires e.g., Claude generates Codex reviews; codegraph_impact + Lost-Pixel + cosign SBOM + Langfuse trace + Stryker mutation + coverage delta + TypeSpec regen-diff); T3 blocking HITL sync (full trigger list: ai/rules/*, PHI, access-control, schema DROP/ALTER, main push, force push, prod credential, external API mutating, destructive ops, service deletion, submodule pointer bump) w/ 4 typed decisions (Approve/Edit/Reject/Respond) + audit log; verifier pattern context-isolated cross-model + 3 cycle cap; evidence-before-claims; slopsquatting via bun audit + SBOM allowlist
metadata:
  node_type: memory
  type: feedback
  originSessionId: 957dade0-7133-4262-addf-0595f6326c47
---

User decision (2026-05-25, DA6 walkthrough re-walked w/ interview):

## The rule

**Six locked principles:**

1. **T1 (every commit, auto, no human attention)** - Full sequence: git status + git diff --stat + bun run ci + gitleaks --staged + bun audit + c7 docs lookup
2. **T2 (every PR, auto + async-human)** - 3-lens multi-model code review subagent (Security + Architecture + QA) w/ per-harness tiering per [[curaos-model-tiering-rule]]; **adversarial cross-harness review allowed when case requires** (e.g., Claude generates → Codex reviews); plus codegraph_impact + Lost-Pixel + cosign SBOM + Langfuse trace + Stryker + coverage delta + TypeSpec regen-diff
3. **T3 (blocking HITL sync)** - Full trigger list w/ 4 typed decisions (Approve/Edit/Reject/Respond) + audit log
4. **Verifier pattern context-isolated** w/ cross-model verifier + 3 cycle cap
5. **Evidence-before-claims** - artifacts not assertions per task type
6. **Slopsquatting mitigation** - bun audit + SBOM allowlist + bun pm ls proof

## Evidence-before-claims (cross-cutting)

### Exercise generated output, never just parse it (BINDING)

A test or consumer profile that asserts only the INPUT LOGIC of generated output (keys present, flags set, values-file shape) can PASS while the actual RENDER is wrong. Any test that guards a generator's output MUST EXERCISE the render: run the real renderer (`helm dependency build` + `helm template`, `kustomize build`, codegen emit) and assert against the RENDERED manifest, not the values/spec file. WHY: the demo-slice profile passed its YAML-logic assertions for sessions while silently rendering all 87 services; only a real helm render caught it. INSTEAD-OF: parsing the values file and trusting that keys-present implies render-correct.

### Required evidence by task type

| Task type | Required evidence |
|---|---|
| Code change | Git diff output + test run stdout |
| API integration | Actual HTTP response body (not paraphrase) |
| TypeScript change | `bun run tsc --noEmit` exit 0 + stdout |
| Database migration | Migration file content + dry-run output |
| Config change | Rendered config + validation output |
| UI change | Screenshot OR Lost Pixel diff link |
| Dependency add | `bun pm ls` filtered output showing version pinned |
| New test | Test file path + `bun test --reporter=verbose` showing pass |
| Refactor | `codegraph_impact` output + test suite green |
| Generated/scaffolded output (chart, manifest, config, SDK, profile values) | Rendered artifact from a REAL render run (`helm dependency build` + `helm template` output, `kustomize build`, codegen emit + `git diff`), NOT the values/spec file alone. Assert against the rendered manifest. |

### Anti-pattern

Agent says "I updated the schema" without showing migration file. Orchestrator prompt MUST include:

> "Before reporting done, run `<verification command>` and include the FULL output in your response. NEVER claim done without showing the verification artifact."

## Banned

- T1 gates skipped via `--no-verify` (Fulcrum global rule)
- T2 review by same model that generated code (self-confirmation bias)
- T2 review w/ shared context from generator (defeats independence)
- T3 bypassed by automation w/o explicit human approval
- T3 approval w/ Y/N only (must be 4 typed decisions)
- Evidence-as-paraphrase (must be artifact: diff output, test stdout, screenshot)
- Generated-output test asserting only the values/spec file (keys present, flags set) without exercising the real render (must run `helm template` / `kustomize build` / codegen emit and assert the RENDERED manifest)
- Verifier loops > 3 cycles (escalate to T3)
- HITL gates w/o audit log (every approval logged w/ timestamp + reviewer + typed decision)
- HITL gates on every action (collapses throughput; automation bias)
- PR Evidence checklist treated as optional (PR template enforces per [[curaos-repo-conventions-rule]])
- T2 gates passing on mock-everything tests (Stryker mutation test detects)
- PHI fields verified by budget-tier model (escalate to Sonnet+ per [[curaos-model-tiering-rule]])
- Cross-harness review treated as auto-routed default (per-PR decision only)
- Cross-harness review of PHI w/o BAA verified for non-Claude harness

<!-- fold: rationale, non-binding -->

## Why

| Constraint | Empirical / mechanical backing |
|---|---|
| T1 full sequence | Replit Jul 2025 DROP DATABASE postmortem: prompt instruction insufficient; infrastructure-level gate mandatory |
| 3-lens parallel review | open-code-review + Codex-Verify ArXiv 2511.16708: multi-agent w/ specialized lenses finds more bugs than single agent |
| Adversarial cross-harness review allowed | Per user: cross-harness review legitimate when case requires (e.g., HealthStack PHI handler needs both Claude direct + Codex sandbox lens); explicit per-case decision, NOT auto-routing |
| 3 cycle cap (tighter than 5) | Per user preference: faster escalation to T3 human review; reduces indefinite-loop risk |
| Cross-model verifier | Same-model + same-context reproduces own bias; different model family = genuine independence |
| 4 typed HITL decisions | Y/N rubber-stamps (automation bias research); typed decision forces explicit choice + audit log |
| Full T3 trigger list | Catches all irreversible operations (Replit postmortem reinforces) |
| Slopsquatting | ~20% AI-suggested packages don't exist; attacker pre-registers w/ malware (Snyk 2026) |

## Tier 1 - every commit (full sequence)

### Mandatory pre-commit (Lefthook per [[curaos-quality-gates-rule]] when locked)

```yaml
# lefthook.yml (excerpt)
pre-commit:
  parallel: true
  commands:
    git-status-check:
      run: git status --porcelain | tee /tmp/agent-evidence-status
    git-diff-stat:
      run: git diff --stat --staged | tee /tmp/agent-evidence-diff
    bun-ci:
      run: bun run ci
    gitleaks:
      run: gitleaks protect --staged --redact
    bun-audit:
      glob: "**/package.json"
      run: bun audit
    c7-docs-lookup:
      glob: "**/package.json"
      run: 'bash -c "for pkg in $(jq -r .dependencies @ -- {staged_files}); do c7 info \"$pkg\" || echo \"WARN: $pkg not in context7\"; done"'
```

### Verification sequence (orchestrator runs after sub-agent reports done)

```bash
git status                      # → expects modified files per task spec
git diff --stat                 # → confirms scope matches declared
bun run ci                      # → tests + lint + type check exit 0
gitleaks detect --staged        # → no secrets in staged
bun audit                       # → no slopsquatted packages
c7 search <pkg>                 # → version-pinned docs (when new dep added)
git log --oneline -5            # → conventional-commit format per [[curaos-repo-conventions-rule]]
```

NO exceptions. Agent did not complete claimed work until ALL of above exit 0.

T1 LLM-judge rubric (RP-58): explicit pass/fail criteria for the T1 judge plus a 28-entry golden set curated from the grills archive live at `ai/curaos/docs/grills/golden-set/t1-judge-rubric.md`; drift runner `bun scripts/check-golden-set.js` (drift detector on judge model refreshes, not a benchmark).

## Tier 1.5 - Local deterministic review signal (cheap pre-grill triage)

The free local review signal runs at two points as a cheap filter between T1 and the expensive T2 cross-harness grill, so the grill spends its tokens on deep adversarial verification rather than obvious changed-line defects.

1. **tdd-implement local self-review** - after T1 gate, before opening PR.
2. **pr-verify-merge pre-grill signal** - first T2 gate, before lenses.

Binding policy:

- Use local deterministic tools first. Semgrep CE is the default changed-line signal; reviewdog output can be surfaced when already produced by local CI.
- High or critical findings on changed lines block with source `local-review-signal`. Lower-severity findings are advisory unless promoted by the Security, Architecture, QA lenses, or adversarial grill.
- Tool unavailability is explicit evidence, not success. The workflow records the unavailable signal and continues to the three lenses, grill, SHA binding, and reviewer-thread gate; callers that require the local signal can fail closed at their layer.
- Never call paid external review services in this tier.
- Reviewer-thread resolution remains binding and provider-neutral: a PR is `safe-to-merge-clean` only when every reviewer thread is resolved and no thread is escalated or tagged `needs-human`.

**Why layer here:** PR #205 fabrication plus the 7xP0 PHI-leak incident (2026-05-29) showed the grill is the real catch for deep defects, but it is expensive. Local deterministic review pre-filters the cheap class without adding external-service wait time or data exposure.

### Layered LOCAL review stack (CodeRabbit replacement, #705)

**Decision (2026-06-14, design PR #703 / impl #705): CodeRabbit is DROPPED as a required gate.** It fires only on GitHub webhooks, so it sits OUTSIDE the local-CI-first merge gate ([[curaos-local-ci-first-rule]]) that actually decides merges; it carries a 200-private-reviews/month cap and a GitHub-App repo-write attack surface (PwnedRabbit RCE, Aug 2025) that the self-hosted-first charter should not carry. **No future agent re-proposes CodeRabbit, Sourcery, or any webhook-only / GitHub-App SaaS reviewer.**

It is replaced by a SaaS-free, ordered fast-to-slow review stack composited INTO `curaos/scripts/ci-local.sh` (via `curaos/ci-gates.yaml` `local-only` jobs), ahead of the opposite-harness grill (kept as the deep T2 gate, unchanged):

| Layer | Job (ci-gates.yaml) | Tool | Blocking | Replaces |
|---|---|---|---|---|
| 1 policy (~5s) | `danger-policy` | `curaos/Dangerfile.ts` + `scripts/review-policies.ts` (harness-free bun runner; `danger local` is the posting adjunct) | yes (only fail-severity findings: em/en dash on changed lines, submodule pointer drift) | CodeRabbit policy nags |
| 2 diff-SAST | `semgrep-diff` | `semgrep --baseline-commit origin/main` routed through reviewdog (`-reporter=local`; `github-pr-review` only on the guarded live-PR path) | no (WARN-SKIP when tool / base ref absent) | CodeRabbit linter aggregation + SAST overlap |
| 3 semantic | `code-review` | Claude `/code-review` (opt-in `REVIEW_STACK_CODE_REVIEW=1`; the authoritative semantic review is the pr-verify-merge live-PR path + the grill) | no (WARN-SKIP) | CodeRabbit broad style/nit + PR summary |

Binding policy for the stack:

- Deterministic policies (layer 1) run via the harness-free bun runner so the gate works WITH or WITHOUT the `danger` binary installed (offline, token-free, air-gap-safe); `danger local` / `danger pr --comment` (Dangerfile.ts) is the posting-capable adjunct, NOT a gate dependency.
- Inline GitHub posting (reviewdog `github-pr-review`, `danger pr --comment`, claude `--comment`) fires ONLY when a live PR URL AND a GitHub token are both present (`scripts/review-stack.sh` enforces the guard); the default local run posts nothing.
- The opposite-harness grill is NOT touched - it stays the deep adversarial T2 gate. The stack pre-filters the cheap class so the grill spends tokens on non-trivial findings (same role CodeRabbit had).
- **Escape hatch (documented, NOT adopted):** PR-Agent / Qodo Merge OSS (self-hostable via LiteLLM, 60.1% F1 bug detection Feb 2026) is the held fallback ONLY if the Claude `/code-review` plugin regresses. It duplicates coverage the harnesses already provide, so it is not wired in by default.

## Tier 2 - every PR (3-lens code review + adversarial cross-harness allowed)

### 3-lens multi-model code review subagent (per-harness tiering matrix applied)

Spawn 3 parallel review sub-agents via Claude Code `Task` tool w/ `isolation: worktree`. Each routes to its tier per [[curaos-model-tiering-rule]] AND its harness:

| Lens | Default harness | Default tier model | Adversarial cross-harness option |
|---|---|---|---|
| **Security** | Claude Code direct | `claude-fable-5` (frontier flagship) | Codex `gpt-5.5 xhigh` if Codex sandbox needed for PHI-adjacent verification |
| **Architecture** | Claude Code direct | `claude-sonnet-4-6` (mid) | Pi opencode-go `kimi-k2.6` for second-opinion architecture review |
| **QA** | Claude Code direct | `claude-sonnet-4-6` (mid) | Codex `gpt-5.5 medium` for adversarial test-coverage review |

**Adversarial cross-harness review allowed when case requires:**
- Per user: cross-harness review is legitimate when the case demands it (different model family catches different blind spots)
- Decision is per-PR (not auto-routed); reviewer agent or orchestrator picks based on case (e.g., HealthStack PHI handler benefits from BOTH Claude direct review AND Codex sandbox review)
- Cross-harness for PHI workloads requires BAA verified for non-Claude harness per [[curaos-cli-agents-rule]] DA1

**Each lens scope:**

```
Security-lens (Fable 5 default):
  - OWASP Top 10 for LLM Applications
  - HIPAA Security Rule technical safeguards
  - gitleaks output review
  - PHI boundary check per [[curaos-postgres-rule]]

Architecture-lens (Sonnet 4.6 default):
  - dep-cruiser boundary violations per [[curaos-repo-conventions-rule]]
  - Service-to-service direct import detection
  - Pattern consistency w/ existing module conventions

QA-lens (Sonnet 4.6 default):
  - Test coverage delta
  - Mocking density (>50% mock ratio = flag per [[curaos-quality-gates-rule]] when locked)
  - Missing edge case tests
  - Integration seam test gaps
```

### Static PR-level gates (run alongside agent reviewers)

| Gate | Tool |
|---|---|
| `codegraph_impact` blast radius PR comment | codegraph MCP per [[curaos-mcp-stack-rule]] |
| Visual regression diff | Lost Pixel (self-hosted MIT) per [[curaos-quality-gates-rule]] when locked |
| SBOM generation + signing | `syft` + `cosign` per [[curaos-image-build-rule]] |
| Langfuse trace link in PR description | per [[curaos-agent-eval-obs-rule]] when locked |
| Mutation test (changed files only) | Stryker per [[curaos-quality-gates-rule]] when locked |
| Coverage delta check | c8 / Vitest V8 provider |
| Contract drift check | `bun run codegen && git diff --exit-code src/generated/` |
| Cross-submodule parity check | committed parity manifest (see below), NOT live gitlinks |

### Cross-submodule parity via a committed manifest (BINDING, issue #706 P3)

A cross-submodule parity check (e.g. producer-topic parity across services, PR #688) MUST read a CHECKED-IN parity manifest in the PARENT repo, NOT walk live submodule working trees. A wave that runs from a checkout without `git submodule update --init` cannot read inside a submodule, so a parity check that depends on live gitlinks fails closed for the wrong reason (the #688 one-tail-topic-per-cycle class; this is exactly why P5c hoists `git submodule update --init --recursive` to wave setup as a defence-in-depth pair).

Convention (generalizes the `curaos/ops/zarf/service-producer-topics.json` approach):

- The authoritative cross-submodule facts are captured into ONE committed JSON manifest in the parent repo: `{ "version": <int>, "generated_from": "<generator>", "<subject-key>": { ...parity facts } }`.
- The manifest is **regenerated by the generator that owns the fact and committed in the SAME PR** as the change, so it is always present and version-controlled (never inside a submodule the check would have to initialize).
- The parity check reads the manifest via `scripts/lib/parity-manifest.js loadParityManifest()` (fail-closed: a missing / malformed / non-object manifest throws, never silently passes the gate) and compares with `parityDrift()`.
- A drift-check regenerates the manifest and fails if it differs from the committed copy, so a stale manifest cannot pass a parity gate.

Enforced by `scripts/workflow-truth-contract.test.js` ("parity manifest reader is fail-closed + drift-aware").

### §3.7 - cross-harness grill sandbox contract (HTTP integration tests)

The Codex adversary in a Tier-2 cross-harness grill runs under `codex exec -s workspace-write`. That sandbox (macOS Seatbelt / Linux seccomp) **blocks ephemeral-port TCP bind** (`listen(0)`), so any supertest / Nest.js HTTP integration test that calls `app.listen(0)` crashes inside the sandbox with `TypeError: null is not an object (evaluating 'app.address().port')` / `Failed to start server. Is port 0 in use?` - even when the SAME test passes `0 fail` in the orchestrator shell. Running those tests under the grill produces **false-negative verdicts** and inflates the cycle count 2-3× per HTTP-test-heavy PR (issue #155; observed in M9-S2 Phase A grill cycles 2 + 3).

**Binding contract (picked mitigation - option 1, prompt-side):**

1. **The Codex adversary does STATIC SOURCE REVIEW only on HTTP/supertest integration tests.** It reads the test source + the controller/route/handler under test and reasons about correctness, coverage, edge cases, and boundary/PHI handling - it MUST NEVER execute `bun test` on a file that binds an ephemeral port (`app.listen(0)`, supertest `request(app.getHttpServer())`, or any `.listen(0)` server handoff) under the `-s workspace-write` sandbox. Unit / pure / non-HTTP tests may still be run.
2. **The orchestrator runs the HTTP integration tests locally** (no sandbox) and **pastes the raw stdout** (last 15 lines + exit code, per the §8.1 evidence discipline of `docs/agents/one-task-execution-prompt.md`) **into the PR body as the test-pass evidence of record.** The grill consumes that pasted stdout as the runtime signal for HTTP tests instead of re-running them.
3. **The grill verdict for HTTP tests is therefore source-review + orchestrator-pasted-stdout, never sandbox execution.** A grill that reports HTTP-test failures it produced by running `bun test` under the sandbox is a known false negative and MUST be disregarded for those files; the orchestrator-pasted stdout is authoritative.

This preserves the cross-harness coverage mandate (a different model family still adversarially reviews the HTTP test + handler source) without losing it to a sandbox limitation - option 4 (switch the grill harness to a no-sandbox Claude Agent) would have dropped cross-harness coverage and required a rule amendment; option 2 (`--dangerously-bypass-approvals-and-sandbox`) hands the adversary unrestricted disk access. This option does neither. The contract is mirrored into the grill-prompt template (`ai/curaos/docs/grills/README.md`) and the `opposite-harness-grill` workflow + playbook so the adversary prompt carries it on every invocation.

### Context isolation rule (verifier pattern)

Pass to verifier sub-agent:
- Original task spec
- Changed files / diff

DO NOT pass:
- Generator's scratchpad
- Generator's intermediate reasoning
- Generator's tool call results

**Cross-model verification (required):** Use different model family for verifier than generator. Examples:
- Generator Claude Sonnet 4.6 → Verifier Codex gpt-5.5 medium
- Generator Codex gpt-5.5 → Verifier Claude Sonnet 4.6
- Generator Pi opencode-go kimi-k2.6 → Verifier Claude Sonnet 4.6

Per-harness verifier routing (per [[curaos-model-tiering-rule]]):
- Within harness: stay on same stack's tier
- Cross-harness adversarial verifier: explicit user decision per-PR (NOT auto-routing); allowed for cases requiring multi-vendor scrutiny

### Iteration cap (3 cycles, tightened from 5)

Hard cap at 3 verifier cycles. Beyond cap → explicit escalation to T3 (human review queue) OR fallback to simpler implementation strategy. All iterations logged to Langfuse for postmortem.

### In-workflow delta re-grill cap + delta-scoping (BINDING, issue #706)

The 3-cycle cap is **BINDING in executor code, not prose-only**. On a grill verdict of `issues-found`, the merge-gate executors run a bounded IN-WORKFLOW fix-cycle loop instead of returning to the orchestrator for a fresh full pass:

- **3-cycle cap (BINDING).** `pr-verify-merge.workflow.js` and `milestone-wave.workflow.js` cap the in-workflow re-grill loop at `max_regrill_cycles` (default 3): `Number.isFinite(cfg.max_regrill_cycles) ? Math.max(0, cfg.max_regrill_cycles) : 3`, looped `while (grillResult.verdict === "issues-found" && regrillCycles < maxRegrillCycles)`. Beyond the cap the verdict is returned (`changes-requested`) to the orchestrator / next wave pass; it does not loop indefinitely.
- **Delta-scoping (BINDING).** Each re-grill is scoped to the DELTA since the previous grill's reviewed commit: the loop threads `diff_ref = "<prev-grill-sha>..HEAD"` into `opposite-harness-grill`, NOT the whole PR diff. Each re-grill APPENDS a `## Re-grill verification` section to the same report. A re-grill is ~2-3 min vs ~10-15 min for a full-diff run.
- **Per-cycle cache freshness.** Each cycle threads a distinct `cache_bust` (`regrill-cycle-<n>`) so the grill report cache key `(head_sha, prompt-template-hash, cache_bust)` recomputes across independent cycles instead of reusing a stale verdict.
- **Exhaustive-first first grill (BINDING).** The first grill prompt demands a COMPLETE, severity-ranked, deduplicated findings list in ONE pass (no one-finding-per-cycle). The cap + delta-scoping + exhaustive-first together collapse the 5-cycle / 2+hr PR-337 case toward 1 review + 1 batch fix + 1 delta re-grill.
- **Stale-snapshot guard (RP-03/#202).** A re-grill cycle pushes a fix, moving the PR head PAST the pre-loop snapshot. `milestone-wave` (unattended) never auto-merges a re-grilled lane on the stale snapshot this pass: its verdict is held at `changes-requested` so the next pass re-snapshots the fresh head. `pr-verify-merge` takes the head snapshot AFTER the loop, so its grill-SHA gate binds to the post-fix head.

Enforced by `scripts/workflow-truth-contract.test.js` ("in-workflow delta re-grill loop is bounded + delta-scoped in both merge paths").

## Tier 3 - blocking HITL (full trigger list + 4 typed decisions)

### Always-block triggers (full list locked)

| Trigger | Reason |
|---|---|
| Change to `ai/rules/*` | Affects every org repo via [[curaos-memory-agents-sync-rule]] |
| PHI field add/remove/rename | HIPAA boundary |
| Access control logic change (RBAC/ABAC) | Permission escalation risk |
| Schema migration w/ DROP / ALTER COLUMN | Data loss risk |
| Push to `main` / `master` | Trunk integrity |
| Force push to any shared branch | History rewrite |
| Production credential rotation | Cascading dependency risk |
| External API call mutating state (email/SMS/payment) | Customer-visible side effect |
| `rm -rf` / `git reset --hard` / `terraform destroy` | Irreversible w/o backup |
| File deletion in `curaos/backend/services/*-service/` | Service-level scope |
| Submodule pointer bump w/o backing commit verified | Submodule drift |

### 4 typed HITL decisions (Y/N banned)

1. **Approve** - execute as proposed
2. **Edit** - execute with modified arguments (agent receives the edit)
3. **Reject** - skip + inject explanation back into agent context
4. **Respond** - substitute human domain knowledge for the tool's result

**Audit log every decision** w/ timestamp + reviewer + typed decision + proposed action + full args + upstream context + risk classification.

### Automation bias prevention

HITL gates fire ONLY at irreversibility boundaries. If every action requires approval → throughput collapses + humans rubber-stamp. Gate the boundary where reversibility ends, NOT everything.

## Slopsquatting mitigation

- T1 gate: `bun audit` mandatory on every `package.json` change
- Agent MUST show `bun pm ls | grep <package>` proving real pinned version
- Approved registry allowlist via Verdaccio per [[curaos-bun-primary-rule]]
- SBOM generated + cosign-signed per [[curaos-image-build-rule]]
- Cryptographic checksums verified before install

## Agent-specific failure mode → gate map

| Failure mode | Detection gate |
|---|---|
| Silent failures (200 OK w/ wrong output) | T1: bun run ci + ground-truth eval suite per [[curaos-agent-eval-obs-rule]] |
| Partial completion (claimed done) | T1: git status mismatch w/ task spec |
| Regression in unrelated feature | T1: full test suite + coverage delta |
| Mock-everything tests | T2: Stryker mutation test per [[curaos-quality-gates-rule]] |
| Hallucinated package | T1: bun audit + SBOM check |
| API drift hallucination | T1: c7 docs lookup |
| Self-confirmation bias | T2: cross-model verifier (different model family) |
| Indefinite retry loop | T2: hard cap 3 iterations + explicit T3 escalation |
| Stale plan execution | T2: planner validates preconditions at each step |
| Tool soup / unbounded context | T2: codegraph_impact + per-task tool scoping per [[curaos-mcp-stack-rule]] |
| Destructive ops bypass | T3: HITL gate w/ 4 typed decision |
| Cross-vertical contamination | T2: dep-cruiser boundary rules per [[curaos-repo-conventions-rule]] |
| Goal drift | T2: ground-truth eval suite + LLM-as-judge per [[curaos-agent-eval-obs-rule]] |
| Context loss | T2: HANDOVER.md discipline per [[curaos-knowledge-persistence-rule]] |
| Automation bias at HITL | T3: 4 typed decisions (NOT Y/N) + audit log + full action display |

## How it satisfies CuraOS rules

| Rule | Compliance |
|---|---|
| AGENTS.md §9 Definition of Done | T1+T2+T3 enforcement; PR template Evidence checklist (per [[curaos-repo-conventions-rule]]) |
| AGENTS.md §10 trust-but-verify | Verification sequence after every sub-agent report |
| AGENTS.md §11 boundaries + approvals | T3 HITL hard-blocks at irreversible boundaries; Replit postmortem reinforces |
| [[curaos-cli-agents-rule]] | Multi-model code review uses per-harness tiering matrix; adversarial cross-harness allowed per case |
| [[curaos-mcp-stack-rule]] | codegraph_impact + c7 CLI used at T1+T2 |
| [[curaos-context-engineering-rule]] | Sub-agent isolation protocol (≤2K tokens) applied to verifier sub-agents |
| [[curaos-model-tiering-rule]] | Each lens routes within its harness's tiering; cross-harness adversarial only when case requires |
| [[curaos-repo-conventions-rule]] | PR template Evidence/Security/Scope checklists implement T1+T2 evidence |
| [[curaos-image-build-rule]] | SBOM + cosign at T2 |
| [[curaos-postgres-rule]] | PHI boundary check at T2 security-lens; schema migrations at T3 |
| [[curaos-error-tracking-rule]] | Langfuse trace link at T2 |
| [[curaos-memory-agents-sync-rule]] | ai/rules/* changes hard-blocked at T3 |

## Agentic-tool friendliness

Why 3-tier verification w/ per-harness tiering wins:

- **T1 automated** = no human attention burned on routine commits; runs in <60s
- **T2 3-lens parallel review** = catches semantic bugs static analysis misses
- **Per-harness tiering applied** = each lens uses its CLI's appropriate tier (no auto-routing)
- **Adversarial cross-harness allowed per-case** = multi-vendor scrutiny when case demands (PHI/security-critical)
- **T3 HITL only at irreversibility** = automation bias prevented
- **3 cycle cap** = faster escalation than 5-cycle; tighter loop discipline
- **Evidence-before-claims** = artifacts not assertions; eliminates ghost completion
- **4 typed HITL decisions** = audit-trail-grade decision capture (no Y/N rubber stamps)
- **codegraph_impact at T2** = blast-radius visible before merge
- **Failure mode → gate map** = explicit catalog of which gate catches which agent failure

## How to apply

- Lefthook installed at workspace root w/ T1 commands (per [[curaos-quality-gates-rule]] when locked)
- `.github/workflows/pr-verification.yml` runs T2 gates on every PR
- Branch protection rules enforce required status checks before merge
- `.claude/agents/security-reviewer.md` + `.claude/agents/architecture-reviewer.md` + `.claude/agents/qa-reviewer.md` defined w/ default-harness models + read-only tool restrictions
- `.claude/skills/verifier-pattern.md` codifies context-isolation prompt template w/ cross-model verifier requirement
- Adversarial cross-harness review: per-PR decision; orchestrator OR reviewer can elect for cases requiring multi-vendor scrutiny
- T3 triggers wired to branch protection + GitHub CODEOWNERS soft lock per [[curaos-repo-conventions-rule]]
- Langfuse spans tagged w/ verification_tier for cost rollup
- Per [[curaos-memory-agents-sync-rule]]: rule changes propagate to memory + ai/rules/ + AGENTS.md §15

## ADRs queued

Per digest §6:
- **ADR-0155 (NEW, verification stack 3-tier gate model w/ per-harness tiering)**: full version; this rule = short form
- **ADR-0099 (charter)**: amend §9 Definition of Done + §10 trust-but-verify to reference T1+T2+T3 stack
