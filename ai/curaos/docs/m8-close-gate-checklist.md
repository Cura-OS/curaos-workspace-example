# M8 Close-Gate Checklist

Date: 2026-05-28

Milestone: [#22](https://github.com/your-org/curaos-ai-workspace/issues/22)

## Verification Command

```bash
bash curaos/scripts/m8-verify.sh
```

Expected close-gate: `FAIL: 0`; at most one warning for unavailable live cluster tooling is acceptable in local non-air-gap runs.

## Current Evidence

- Product PR: [curaos#108](https://github.com/your-org/curaos/pull/108) merged at `791507ee20d09a3bf1fbcec3825df26fc50ae658`.
- `bash curaos/scripts/m8-verify.sh` completed with `PASS: 36`, `FAIL: 0`, `WARN: 1`.
- Zarf deploy order guard passes.
- Redpanda air-gap storage values are pinned with Tiered Storage disabled.
- Cosign offline keyed policy is present.
- Zero-egress static guard passes and the live Hubble wrapper exists.
- Doc graph and AI mirror checks pass.

## Live Deploy Limitation

No live k3d/Zarf/Hubble air-gap cluster is claimed in this checklist. The close gate verifies deterministic repository wiring. A prepared air-gap cluster run must capture `scripts/assert-zero-egress.sh` evidence before a release artifact is promoted.
