# @curaos/currency - Agent Context

## Quick Facts

- Code path: `curaos/backend/packages/currency/`.
- Purpose: currency master data, FX rates, and gain or loss calculations.
- Provenance: model port-adapted from Odoo concepts under LGPL, fresh TypeScript.

## Agent Rules

- Do not introduce floating-point money math.
- Keep FX rates as-of-date aware.
- Preserve license provenance in docs and NOTICE material.
