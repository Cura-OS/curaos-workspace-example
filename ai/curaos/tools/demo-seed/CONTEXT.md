# CONTEXT — tools/demo-seed (`@curaos/demo-seed`)

Integration map + design rationale for the M15-S2 (#511) watermarked synthetic demo-tenant seed. Mirror of `curaos/tools/demo-seed/`.

## What it is

An in-repo `tools/*` workspace package (sibling of `tools/codegen`, `tools/generators`) — NOT a submodule (Story 2 creates none). It generates a deterministic JSON manifest describing one synthetic demo tenant across three domains, with a watermark + PHI gate that fails closed.

## Module layout

```
curaos/tools/demo-seed/
├── package.json                # @curaos/demo-seed (private, type:module, bin: curaos-demo-seed)
├── tsconfig.json               # extends @curaos/tsconfig/base.json
├── README.md
├── fixtures/fhir-r4/
│   └── synthea-sample-bundle.json   # committed Synthea-shaped FHIR R4 sample (env-gate default)
├── src/
│   ├── index.ts                # barrel + CLI entry (import.meta.main guarded)
│   ├── watermark.ts            # visible + machine-readable synthetic watermark primitives
│   ├── gate.ts                 # watermark/PHI/cross-domain gate (REUSES phi-boundary)
│   ├── types.ts                # demo entity + manifest shapes
│   ├── fhir-types.ts           # minimal local FHIR R4 subset (no global @types/fhir)
│   ├── seed.ts                 # buildDemoSeed orchestrator + assertManifestSafe
│   └── producers/
│       ├── health.ts           # Synthea FHIR → watermarked HealthStack records
│       ├── education.ts        # faker + fishery → course/enrollment/activity/assessment
│       └── commerce.ts         # faker + fishery → catalog/order/invoice/payment/stock
└── __tests__/                  # gate / seed / health / cli
```

## Data flow

```
SYNTHEA_BUNDLE_DIR (env-gated) ─┐
                                ├─► importSyntheaBundle ─► watermarked health records ─┐
fixtures/fhir-r4 (default) ─────┘                                                       │
faker.seed + fishery ─► produceEducationSeed ─► watermarked education records ──────────┤
faker.seed + fishery ─► produceCommerceSeed ──► watermarked commerce records ───────────┤
                                                                                        ▼
                                                          buildDemoSeed → DemoSeedManifest
                                                                                        │
                            assertManifestSafe (every entity watermarked + PHI-free) ◄──┤
                            assertCrossDomainLinkPhiFree (reference-only links) ◄────────┘
                                                                                        ▼
                                                    JSON manifest (stdout / --out file)
```

## The load-bearing gate design (grill correction)

A RAW `scanForPhi` over a synthetic patient would FALSE-REJECT the watermarked name/DOB (a
synthetic "Ada Synthetic" still matches the canonical NAME heuristic). So the gate:

1. asserts the machine-readable watermark envelope is present (fail closed if absent);
2. asserts every PII-shaped field is VISIBLY watermarked;
3. scans for real PHI **only on UNVOUCHED leaves** — a value carrying a visible synthetic marker
   (or a bare ISO date under a date-shaped key inside an already-watermarked entity) is proven
   synthetic and EXEMPT from the residue scan. A leaf that lacks the watermark AND trips the
   detector is genuinely real-looking → REJECT.

`assertReferenceOnlyEnvelope` / `checkReferenceOnlyEnvelope` is applied ONLY to cross-domain
link payloads (which must be PHI-free), never to the PHI-bearing health entities.

## Integration points (must-not-break)

- **`@curaos/healthstack-phi-boundary`** — REUSED for the PHI vocabulary (`scanForPhi`,
  `InMemoryPresidioScrubber`, `scrubEgressOrThrow`, `checkReferenceOnlyEnvelope`). Single
  PHI-vocabulary owner; never forked here. If that package's patterns evolve, this seed inherits them.
- **Consumers** (downstream stories): onboarding wizard (S5 #514) for the guided tour; public demo
  tenant (S7 #516); docs-site tutorials (S4 #513); GA acceptance E2E (S8 #517). They load the
  manifest through their own service contracts and STRIP the `__synthetic`/`__watermark` envelope
  at the import boundary (strict service DTOs reject unknown keys).
- **PHI boundary** — health entities carry synthetic PHI-shaped values; they are NEVER cross-linked
  into neutral/education/commerce. Links use opaque refs only.

## Decisions (auto-applied — see AUTO-DECISION-LOG 2026-06-06 row)

- Home `tools/demo-seed`; generator-not-loader (JSON manifest, no DB writes).
- Determinism via `faker.seed` + `setDefaultRefDate`.
- Live Synthea env-gated; committed small fixture is the CI default.
- Local minimal FHIR subset instead of global `@types/fhir` (avoids ambient-type collisions).
- `subject`/free-text categorical strings are visibly watermarked so the name heuristic does not
  false-reject controlled-vocabulary values like "Computer Science".

## Generator-Evolution gate

**Does NOT fire.** This package is hand-authored tooling; it is not emitted by `tools/codegen`
(no `codegen.source` marker, no `codegen scaffold` initial commit). No template/emitter feedback required.
