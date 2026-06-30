# Opposite Harness Grill Blocked

GRILL: blocked-harness-unavailable
GRILL-PROBE: {"available":false,"reason":"probe exited 142","evidence":"user\nReturn exactly OK.\nhook: SessionStart\nhook: SessionStart\nhook: SessionStart Completed\nhook: SessionStart Completed\nhook: UserPromptSubmit\nhook: UserPromptSubmit Completed\ncodex\nOK\nhook: Stop\nhook: Stop\nhook: Stop Completed\nhook: Stop Completed\nsh: line 1: 93326 Alarm clock: 14         perl -e 'alarm 18; exec @ARGV' codex exec -m gpt-5.4-mini -c model_reasoning_effort=low --sandbox read-only --output-last-message /tmp/curaos-codex-grill-probe.md 'Return exactly OK.'"}
GRILL-HARNESS: codex
GRILL-AGENT: codex:codex-rescue
GRILL-TIMEOUT-MS: 20000
GRILL-REASON: probe exited 142

The opposite-harness adversarial leg failed fast and no CodeRabbit-only fallback should be treated as a completed opposite-harness grill.
Subject: M16-S2 (curaos-ai-workspace#538): umbrella-chart dependencies aggregation. Plan: add tools/codegen/src/umbrella-emit.ts that (1) discovers the 87 service slugs by parsing .gitmodules backend/services/<slug> entries (canonical registry per 2026-06-07 research; no registry file exists), (2) emits ops/zarf/charts/curaos-umbrella/Chart.yaml with real version 0.1.0 + appVersion 0.1.0 (matching per-service chart floor) + a dependencies block: one entry per slug {name: <slug>, version: 0.1.0, repository: file://../../../../backend/services/<slug>/chart}, replacing the 0.1.0-stub + M8-S3 sentinel header. Wire an umbrella subcommand into index.ts. Update tools/build/zarf-digest-check.sh guard #4 to PASS when chart has real version + non-empty dependencies, and STILL FAIL on stub reversion (0.1.0-stub or M8-S3 sentinel or empty deps). Tests: a fixture integration test that scaffolds the audit trio to a tmp dir, emits per-service charts + the umbrella into that layout, then helm dependency build + helm template the umbrella green (S3 regen of real 87 not run yet, so committed chart deps reference subcharts whose files arrive in S3 - documented). Constraints: generator-owned (deps emitted not hand-authored), no em-dashes, no new codegen suite failures (6 pre-existing in curaos#263 untouched).
