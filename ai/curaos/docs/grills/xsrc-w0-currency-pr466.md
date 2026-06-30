# Codex grill - XSRC W0 currency PR your-org/curaos#466

GRILL-VERIFIED-SHA: be8e3ab4ea840b21bb57fc754ff0531a6d8cf508

## Verdict: BLOCK

## P0 findings (block merge)

None.

## P1 findings (must address before merge)

1. New package is missing required ai mirror docs.
   - **Where:** ai/curaos/backend/packages/currency/
   - **What:** the new `backend/packages/currency` package has no paired `AGENTS.md`, `CONTEXT.md`, or `Requirements.md` under the ai mirror.
   - **Why P1:** workspace rules require module owners, dependencies, and Done criteria for new modules before merge.
   - **Fix:** add the mirrored module docs and refresh the doc graph if the repo generator requires it.

2. FX rate dates are compared as strings without strict date validation.
   - **Where:** backend/packages/currency/src/fx.ts:57 and backend/packages/currency/src/fx.ts:81
   - **What:** `FxRateFeed` accepts malformed `asOf` values such as `2026-2-01`, then uses lexicographic comparison for rate selection.
   - **Why P1:** malformed dates can silently miss valid rates or produce incorrect as-of behavior.
   - **Fix:** reject non-`YYYY-MM-DD` dates in feed entries and query parameters, then add regression tests.

## P2 findings (followups acceptable)

1. `just ci-service @curaos/currency` is blocked by existing missing workspace dependencies and a clone-format issue before full service gate completion.
2. License provenance is declared clean-room in the README, but no source-level comparison against Odoo was performed in this grill.

## What the worker got right

1. Package tests passed with 26 tests.
2. Typecheck, build, and lint passed.
3. Arithmetic tests cover integer minor units, rounding, currency mismatch, inverse rates, FX precision, and gain/loss balance.
4. The lockfile diff was narrowed to the currency workspace entry and alias.

---

## Re-grill verification (2026-06-29, post-be8e3ab)

**Verdict: BLOCK**

The first currency Tier-2 grill found missing required module docs and malformed date handling in the FX feed. A resolver has been dispatched on the same lane branch.

---

## Re-grill verification (2026-06-29, post-5914ead)

**Verdict: APPROVE**

### P1 verification

- `ai/curaos/backend/packages/currency/AGENTS.md`, `CONTEXT.md`, and `Requirements.md` exist with owner, dependencies, and Done criteria.
- The DOC-GRAPH slice indexes the currency docs and package README and includes sibling links.
- `FxRateFeed` validates feed and query dates through strict calendar-date validation.
- Regression tests cover malformed dates and valid February before October ordering.

### Verification evidence

- `bun test` in `backend/packages/currency`: 28 pass, 0 fail.
- `bun run typecheck`: pass.
- `bun run build`: pass.
- `bun run lint`: pass.
- One-off date probe accepted `2024-02-29` and rejected invalid leap, month, day, and non-padded date forms.
- Changed-file em dash and en dash scan passed.

### New defects

None.

### Residual risks

- Full doc verifier could not run in the scratch checkout because the relevant scripts were absent or blocked by uninitialized submodules. Manual DOC-GRAPH slice review passed.
- License provenance remains clean-room by declaration and obvious source scan; no source-level Odoo comparison was performed.
