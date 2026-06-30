# Codex grill — m9-269 secret-scan gate fix PR curaos#165

**Harness:** Claude→Codex (opposite-harness Tier-2 adversarial review)
**Branch:** `agent/fix-secret-scan-gate-269`
**PR:** curaos#165
**Date:** 2026-06-01
**Grill agent:** Codex (effort: high)

---

## Verdict: REQUEST-CHANGES

---

## P0 findings (block merge)

1. **Codegen templates still emit deprecated staged forms**
   - **Where:**
     - `tools/codegen/templates/service-business/lefthook.yml.hbs:11`
     - `tools/codegen/templates/service-core/lefthook.yml.hbs:11`
     - `tools/codegen/templates/service-personal/lefthook.yml.hbs:11`
     - `tools/codegen/__tests__/lefthook-emit/emit-fresh.test.ts:37`
   - **What:** All three codegen service templates still contain `gitleaks protect --staged` (or `detect --staged`) in their lefthook stubs. The emit test preserves the same deprecated form. Every newly scaffolded service will inherit the broken gate.
   - **Why P0:** The fix corrects the root repo's hooks but leaves the mold defective. All downstream scaffolded services will continue to run a gate that silently fails or crashes on gitleaks 8.30.1. Per [[curaos-generator-evolution-rule]], edge-case fixes MUST fold back into the generator — local-only hot-fixes are forbidden.

---

## P1 findings (must fix before merge)

_(none beyond P0)_

---

## P2 findings (should fix)

_(none)_

---

## Check-by-check evidence

### CHECK 1 — Call-site migration complete

**Verdict: FAIL**

Root invocation sites migrated correctly:
- `lefthook.yml:28` → `gitleaks git --staged --redact`
- `package.json:43` → `gitleaks git --staged --redact`

Repo-wide `git grep` for `gitleaks (detect|protect)` found active stragglers:
| File | Line | Content |
|---|---|---|
| `tools/codegen/templates/service-business/lefthook.yml.hbs` | 11 | `gitleaks protect --staged` (or `detect --staged`) |
| `tools/codegen/templates/service-core/lefthook.yml.hbs` | 11 | same |
| `tools/codegen/templates/service-personal/lefthook.yml.hbs` | 11 | same |
| `tools/codegen/__tests__/lefthook-emit/emit-fresh.test.ts` | 37 | snapshot preserves deprecated form |

These are outside the PR diff but are live, tracked files in the repo whose output will produce broken gates in every newly generated service.

**Migration is incomplete. P0.**

---

### CHECK 2 — Positive control is load-bearing

**Verdict: PASS**

Evidence from `scripts/secret-scan-gate.test.js`:
- `:37-39` — planted secret uses `ghp_0123456789abcdefABCDEF0123456789wXyZ`, a syntactically valid GitHub PAT shape. The `ghp_` prefix is in gitleaks' default ruleset; it is not `*EXAMPLE*` nor allowlisted in `.gitleaks.toml`.
- `:62-67` — positive-control assertion: gate exits non-zero and stdout contains `ghp_` leak report.
- `:70-75` — clean-tree assertion: gate exits 0 on a staged tree with no secrets.
- `:77-91` — regression guard: test explicitly invokes `gitleaks git --staged` and asserts the canonical form; reverting to `detect --staged` would call a non-existent flag → non-zero, causing this assertion to fail for the wrong reason. A no-op (skip) would cause exit 0 on the planted-secret case to pass when it shouldn't — the test would go RED on the positive-control assertion.
- `:138-155` — temp-repo cleanup: `rmSync(tmpDir, { recursive: true, force: true })` in `finally` block.
- `.gitleaks.toml:6-7` — `allowlist` entries use `description = "test fixture"` path, but the planted file is `config.ts` inside the temp dir — not allowlisted.

Runtime spot-check (sandbox): `gitleaks stdin --redact -c .gitleaks.toml` detected `ghp_` shape with exit 1. Clean greeting string passed with exit 0.

The token is obviously fake (synthetic, sequential hex digits). No real credential in repo.

**PASS.**

---

### CHECK 3 — No-gitleaks-installed path

**Verdict: PASS**

- `scripts/secret-scan-gate.test.js:41-45` — `which gitleaks` check at test startup; if absent, skips positive-control sub-tests via `test.skip()` (not a false-pass: the test is marked skipped, not passing).
- `:95-103` — explicit skip message logged: `"gitleaks not found — skipping positive-control checks"`.
- `lefthook.yml:28` — direct `gitleaks git --staged --redact` command; if binary absent, lefthook receives a non-zero exit from the OS (command not found = exit 127) and BLOCKS the commit. No silent pass.
- `package.json:43` — same: `bun run gitleaks` directly invokes the binary; exit 127 → non-zero → CI fails closed.
- `ci-gates.yaml:64-72` — `secret-scan` gate step runs `bun run gitleaks`; no `continue-on-error: true`. Absent binary → step fails → CI blocked.
- `scripts/ci-local.sh:220-245` / `:460-467` — CI gate for secret scan is unconditional; no "if binary present" bypass.

**PASS.**

---

### CHECK 4 — `--redact` + `.gitleaks.toml`

**Verdict: PASS**

`--redact` flag:
- Replaces matched secret values in output with `REDACTED` — affects only stdout formatting, not detection logic.
- Runtime spot check confirmed: fake `ghp_` shape still flagged with exit 1 when `--redact` present; clean content exits 0. Detection unchanged.

`.gitleaks.toml`:
- Reviewed `:1-43`. Default rules section left intact (no `[rules]` override that would disable GitHub PAT detection).
- Allowlist at `:35-43` covers only specific test-fixture paths by regex; `scripts/secret-scan-gate.test.js` uses a temp dir (`/tmp/...`), not matching any allowlist entry.
- No over-allowlisting observed. `.gitleaks.toml` does not re-introduce a false-green.

**PASS.**

---

### CHECK 5 — No new defect / scope

**Verdict: FAIL** (generator templates, see CHECK 1)

Diff files: `lefthook.yml`, `package.json`, `scripts/secret-scan-gate.test.js` — correct scope.
- `git diff --check` passed (no whitespace errors).
- Fake token at `scripts/secret-scan-gate.test.js:37-39` is synthetic.
- No unrelated refactors introduced.

However, the codegen templates (outside diff but active in repo) remain broken — a structural scope gap per [[curaos-generator-evolution-rule]]. The fix is incomplete until those templates are updated.

**FAIL** on completeness grounds.

---

## Required changes before re-grill

1. **Migrate codegen templates** — update all three `tools/codegen/templates/service-{core,personal,business}/lefthook.yml.hbs` to emit `gitleaks git --staged --redact` instead of the deprecated form.
2. **Update emit test snapshot** — `tools/codegen/__tests__/lefthook-emit/emit-fresh.test.ts:37` must assert the canonical `gitleaks git --staged` form, not the old deprecated form.

---

## Re-grill verification

_(append here after worker fixes P0 findings)_

---

## Re-grill resolution (orchestrator, 2026-06-01 — commit 6fcd029)

REQUEST-CHANGES P0 (generator-evolution gap) RESOLVED. The grill caught that the root fix missed the codegen templates → every NEW generated service (incl. the 7 M10 services about to scaffold) would inherit the broken `gitleaks protect --staged` gate. Applied in commit `6fcd029`:
- `tools/codegen/templates/service-{core,personal,business}/lefthook.yml.hbs:11` → `bun x gitleaks git --staged --redact`
- `tools/codegen/__tests__/lefthook-emit/emit-fresh.test.ts:37` snapshot → canonical form
- Verified: lefthook-emit 12 pass / 0 fail; full codegen 388 pass / 0 fail.

Independent confirmation the gate is load-bearing: `gitleaks git --staged` on a planted `ghp_<36>` PAT → "leaks found: 1" (catches it); positive-control test 5 pass / 0 fail.

### Follow-up captured (separate-repo backfill — NOT in PR #165)
7 already-generated services carry the broken `gitleaks protect --staged` in their committed `lefthook.yml` (generated pre-template-fix): personal-patient, patient-core, party-core, business-patient, org-core, healthstack-patient, audit-core. Template fix stops NEW services; these 7 need a per-repo 1-line backfill → filed as foresight (same shape as #225's party-core journal finding).

**Final verdict: APPROVE** (P0 resolved; positive-control load-bearing; no remaining straggler in the parent repo).
