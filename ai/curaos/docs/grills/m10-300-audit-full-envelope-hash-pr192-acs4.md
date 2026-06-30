# Grill Report: M10 #300 — Audit Full-Envelope Hash

**PRs grilled (as one atomic change):**
- `curaos#192` (codegen mold), commit `96fc87e`, closes `curaos-ai-workspace#300`
- `audit-core-service#4` (hand-written validator), commit `6b208ab`

**Harness:** Codex reviewing Claude code (cross-harness adversarial T2)  
**Effort:** high  
**Date:** 2026-06-02  
**Verdict:** BLOCK

---

## Summary verdict

**BLOCK.**

---

## Executive summary

- New canonical helper is byte-identical across codegen core/personal/business and audit-core: SHA-256 `75d2c01cb0190f97121d57810c5450f61f4539d4fce8a49ffeea153ef63355f9`.
- New generated producers and new audit-core validator agree on field order and hash material.
- Merge/deploy is unsafe unless both PRs land atomically and audit-core is not activated against old producers.
- Current tree still has 12 old-shape service publishers. Backfill doc says they MUST be backfilled before emitting to a new validator, but these PRs do not enforce that.
- Tests are behavioral, but audit-core validator coverage omits `changeValues` tamper.

---

## Findings by attack vector

### AV1: Producer↔Validator Agreement

```ts
// codegen 96fc87e:.../audit-chain-hash.ts.hbs:101-115
return [
  material.eventId,
  material.occurredAt,
  material.tenantId,
  material.actorId,
  material.action,
  material.outcome,
  material.resourceType,
  material.resourceId,
  changeReference(material),
  material.previousHash ?? '',
].join(FIELD_SEP);
```

```ts
// audit-core 6b208ab:src/audit/audit-chain-hash.ts:101-115
return [
  material.eventId,
  material.occurredAt,
  material.tenantId,
  material.actorId,
  material.action,
  material.outcome,
  material.resourceType,
  material.resourceId,
  changeReference(material),
  material.previousHash ?? '',
].join(FIELD_SEP);
```

```ts
// codegen producer 96fc87e:.../audit-publisher.service.ts.hbs:269-281
const hash = auditChainHash({
  eventId, occurredAt, tenantId: input.tenantId, actorId: input.actorId,
  action: input.action, outcome: input.outcome, resourceType,
  resourceId: input.resourceId, changedFields: input.changedFields,
  changeValues: input.changeValues, previousHash,
});
```

```ts
// audit-core validator 6b208ab:src/consumer/audit-chain-validator.service.ts:124-126
function recomputeHash(envelope: AuditEventEnvelope): string {
  return auditChainHash(envelope);
}
```

No AV1 blocker for newly generated producers.

**P3 AV1** — stale comment in validator prose at `src/consumer/audit-chain-validator.service.ts:24-26` still quotes old material.  
Impact: operator/reviewer confusion.  
Remediation: update docblock to full-envelope material.

---

### AV2: changeValues Canonicalization

```ts
// both implementations: stableStringify lines 50-63
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((v) => stableStringify(v)).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const entries = keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`);
  return `{${entries.join(',')}}`;
}
```

```ts
// audit-core schema 6b208ab:src/audit/audit-event.schema.ts:172-177
changeValues: z
  .partialRecord(
    ChangeValueKeySchema,
    z.array(ChangeReferenceValueSchema).min(1).max(32),
  )
  .optional(),
```

**P2 AV2** — canonicalizer contract is broader than validated data. `AuditChainHashMaterial.changeValues?: unknown` accepts arbitrary nested objects, `undefined` members, functions, symbols, BigInt, etc.; emitted envelopes only allow a closed partial record of arrays of reference strings. Arbitrary JS values can false-break across JSON wire round-trip (e.g. `{ role: undefined }` hashes differently before/after JSON serialization; BigInt throws before schema validation).  
Impact: schema-clean envelopes are deterministic, but future misuse can cause false broken events or runtime throws.  
Remediation: narrow `changeValues` type to the schema type, parse before hashing in publishers, and add invalid runtime-input tests.

---

### AV3: Separator Injection / Delimiter Collision

```ts
// both implementations: lines 40-42,104-115
const FIELD_SEP = '|';
const CHANGE_REF_SEP = '~';
return [
  material.eventId,
  material.occurredAt,
  material.tenantId,
  material.actorId,
  material.action,
  material.outcome,
  material.resourceType,
  material.resourceId,
  changeReference(material),
  material.previousHash ?? '',
].join(FIELD_SEP);
```

```ts
// audit-core schema 6b208ab:src/audit/audit-event.schema.ts:142-152
eventId: z.string().uuid(),
occurredAt: z.string().datetime(),
actorId: z.string().uuid(),
tenantId: z.string().uuid(),
resourceType: z.string().min(1).max(96),
resourceId: z.string().uuid(),
action: z.enum(AUDIT_ACTIONS),
outcome: z.enum(AUDIT_OUTCOMES),
```

No demonstrated second-preimage for current schema-clean envelopes: UUIDs/enums/hex/closed `changeValues` constrain most delimiter-bearing slots. `resourceType` is free-form, but adjacent fields are constrained enough to prevent a concrete collision.

**P3 AV3** — raw delimiter design remains fragile.  
Impact: future schema widening can create delimiter ambiguity.  
Remediation: use canonical JSON array or length-prefixed fields; constrain `resourceType` to delimiter-free identifiers.

---

### AV4: Null/Undefined/Empty Handling

```ts
// both implementations: lines 85-95
function changeReference(material: AuditChainHashMaterial): string {
  const fields =
    material.changedFields === undefined
      ? ''
      : JSON.stringify(material.changedFields);
  const values =
    material.changeValues === undefined
      ? ''
      : stableStringify(material.changeValues);
  return `${fields}${CHANGE_REF_SEP}${values}`;
}
```

```ts
// codegen producer 96fc87e:.../audit-publisher.service.ts.hbs:295-300
...(input.changedFields !== undefined ? { changedFields: input.changedFields } : {}),
...(input.changeValues !== undefined ? { changeValues: input.changeValues } : {}),
```

Top-level omitted optional equals explicit `undefined`; explicit empty array/object stays distinct (`[]~`, `~{}`). No AV4 blocker.

---

### AV5: Atomicity / Transition-Window Hazard

```ts
// old validator 6b208ab^:src/consumer/audit-chain-validator.service.ts:121-126
return createHash('sha256')
  .update(
    `${envelope.eventId}|${envelope.occurredAt}|${envelope.resourceType}|${envelope.resourceId}|${envelope.previousHash ?? ''}`,
  )
  .digest('hex');
```

```ts
// new codegen producer 96fc87e:.../audit-publisher.service.ts.hbs:269-281
const hash = auditChainHash({
  eventId, occurredAt, tenantId: input.tenantId, actorId: input.actorId,
  action: input.action, outcome: input.outcome, resourceType,
  resourceId: input.resourceId, changedFields: input.changedFields,
  changeValues: input.changeValues, previousHash,
});
```

**P1 AV5** — one-sided merge/deploy breaks validation. Either PR alone changes exactly one side of producer/validator material.  
Impact: old/new boundary events become `hash mismatch` and emit `chain.broken.v1`.  
Remediation: enforce atomic merge plus deployment ordering, or support both material versions by explicit version/cutover field.

---

### AV6: Backfill / Migration Break

```ts
// current org-core old producer:
// curaos/backend/services/org-core-service/src/audit/audit-publisher.service.ts:226-230
const hash = createHash('sha256')
  .update(
    `${eventId}|${occurredAt}|${input.resourceId}|${previousHash ?? ''}`,
  )
  .digest('hex');
```

```ts
// new audit-core material 6b208ab:src/audit/audit-chain-hash.ts:104-115
return [
  material.eventId,
  material.occurredAt,
  material.tenantId,
  material.actorId,
  material.action,
  material.outcome,
  material.resourceType,
  material.resourceId,
  changeReference(material),
  material.previousHash ?? '',
].join(FIELD_SEP);
```

```ts
// audit-core consumer 6b208ab:src/consumer/kafka-audit-consumer.ts:103-107
await this.consumer.connect();
await this.consumer.subscribe({
  topic: AUDIT_TOPIC,
  fromBeginning: true,
});
```

```md
// ai/curaos/tools/codegen/audit-full-envelope-hash-300-backfill.md:6-8
Already-scaffolded services still carry the OLD material and MUST be
backfilled before they emit onto the shared `curaos.core.audit.event.v1`
topic in an environment where `audit-core` re-validates with the NEW material.
```

**P1 AV6** — 12 current service publishers still inline old `createHash('sha256')`:
`org-core`, `patient-core`, `storage`, `search`, `settings`, `healthstack-patient`, `identity-service`, `calendar-core`, `notify`, `party-core`, `tasks-core`, `reports`.  
Deploying new audit-core validator against old producers or retained topic history causes false `chain.broken.v1` at platform scale.  
Remediation: backfill all producers in same release, or add hash-material version/cutover support, or prevent `fromBeginning` replay over pre-cutover old-material history.

---

### AV7: Trio Symmetry

Template file SHA-256 fingerprints confirm byte-identical content across core/personal/business:

```
audit-chain-hash.ts.hbs       core/personal/business:
  75d2c01cb0190f97121d57810c5450f61f4539d4fce8a49ffeea153ef63355f9

audit-publisher.service.ts.hbs core/personal/business:
  6a82d7988a44c24fc18b10b52b6a58718be298a57a7804d2ad043582ef986729

audit-chain-e2e.test.ts.hbs    core/personal/business:
  7984679a42667c2465aa9c7fcfce886ce288fe2569ace7c6ec591b628c110e04
```

Template snapshots include `src/audit/audit-chain-hash.ts` in core/personal/business. **AV7 passes.**

---

### AV8: Test Quality

```ts
// codegen 96fc87e:tools/codegen/__tests__/templates/audit-full-envelope-hash-300.test.ts:83-95
const mutations = [
  { actorId: '44444444-4444-4444-8444-444444444444' },
  { action: 'DELETE' },
  { outcome: 'failure' },
  { changedFields: ['tampered'] },
  { changeValues: { role: ['guest'] } },
  { resourceType: 'Other' },
  { resourceId: '55555555-5555-4555-8555-555555555555' },
  { tenantId: '66666666-6666-4666-8666-666666666666' },
];
```

```ts
// audit-core 6b208ab:test/integration/audit-consumer-e2e.test.ts:207-214
const immutableMutations = [
  ['actorId', { actorId: '33333333-3333-4333-8333-333333333333' }],
  ['action', { action: 'DELETE' }],
  ['outcome', { outcome: 'failure' }],
  ['changedFields', { changedFields: ['tampered_field'] }],
];
```

**P2 AV8** — audit-core behavior test misses `changeValues` tamper. Codegen helper test covers it, but audit-core's actual `AuditChainValidator.validate()` tamper loop does not.  
Impact: future validator-side regression around `changeValues` could pass audit-core integration tests.  
Remediation: add `['changeValues', { changeValues: { role: ['guest'] } }]` to audit-core immutable mutation table and assert `hash mismatch` + fail-closed.

---

## P0 findings

None.

---

## P1 findings (must fix before merge)

| # | AV | Finding | Impact |
|---|---|---|---|
| P1-1 | AV5 | One-sided merge/deploy breaks validation — either PR alone creates old↔new mismatch | Every boundary event emits `chain.broken.v1` |
| P1-2 | AV6 | 12 old-shape service publishers + `fromBeginning` replay cause false `chain.broken.v1` under new validator | Platform-scale false chain breaks |

---

## P2 findings (must fix before GA)

| # | AV | Finding | Impact |
|---|---|---|---|
| P2-1 | AV2 | `changeValues?: unknown` type broader than schema-closed type | Future misuse can false-break or throw |
| P2-2 | AV8 | audit-core validator tamper loop omits `changeValues` mutation | Missed regression coverage |

---

## P3 observations

| # | AV | Finding |
|---|---|---|
| P3-1 | AV1 | Stale validator docblock at `src/consumer/audit-chain-validator.service.ts:24-26` quotes old hash material |
| P3-2 | AV3 | Raw delimiter concatenation (`\|`, `~`) is fragile; future `resourceType` widening can create collision |

---

## Merge recommendation

**Do not merge as deployable audit-integrity change yet.**

Helper implementation is correct for newly generated producers. Rollout is unsafe:

1. The new validator will reject old-material events from all 12 currently scaffolded services still carrying inline `createHash('sha256')`.
2. `fromBeginning: true` replay means historical old-material events will be re-validated with the new hash shape and emit `chain.broken.v1` for every pre-cutover event.

Merge only after a hard gate exists: pair both PRs atomically, prevent audit-core validator activation until producer backfills are complete, or implement explicit hash-material version/cutover support (e.g. `hashVersion: 'v2'` field validated before recompute).

## Re-grill verification (2026-06-02, post-5f99f3a/286fe33)

**Verdict: BLOCK** — P1-1 CLOSED, P1-2 PARTIAL (still release-blocking).

- **P1-1 (atomicity/dual-read routing): CLOSED.** Schema accepts absent/1/2; validator recomputes exclusively via `auditChainHashForVersion(envelope, hashVersion)`; dispatcher maps absent/1→v1, >=2→v2; producer stamps v2. No misrouting path.
- **P1-2 (backfill / 3 legacy shapes): PARTIAL — STILL OPEN.** The v1 helper reproduces ONLY Shape B (`eventId|occurredAt|resourceType|resourceId|previousHash` — the git-confirmed pre-#300 audit-core material). Coverage 1/3:
  - Shape B (covered): settings-service, audit-core.
  - **Shape A NOT covered** (+tenantId): storage, search, calendar-core, notify, tasks-core, reports — confirmed live.
  - **Shape C NOT covered** (no tenantId, no resourceType): org-core, party-core, patient-core, healthstack-patient, identity-service — confirmed live.
  Shape A + C existing chains still false-break under `fromBeginning` replay.
- **A3 downgrade attack (P2, new):** an attacker who can set `hashVersion:1` on a v2 event makes the validator use the weaker v1 material, bypassing tamper-evidence for tenantId/actorId/action/outcome/changedFields/changeValues. Acceptable only if envelope ingress is authenticated + producer-owned (NOT verified). P2 → P1 if any unauthenticated ingress path exists.
- **A4 trio symmetry: CLOSED** (3 templates updated); but tests cover Shape B only — no Shape A/C replay test.
- **A5 non-regression (#294/#260/#295): CLOSED.**

**Required before APPROVE:** (1) add Shape-A + Shape-C v1 helpers (or per-shape dispatch); (2) replay tests for all 3 shapes (RED without the matching helper); (3) confirm/guard the downgrade ingress-trust invariant.

## Re-grill verification cycle 2 (2026-06-02, post-8dbc245/5c76e33)

**Verdict: BLOCK** — P1-2 false-break CLOSED, but the multi-shape matcher introduced a NEW P1 structural false-accept.

- **P1-2 (3-shape false-break): CLOSED.** Shape A/B/C helpers byte-correct vs live publisher source (storage/calendar = A +tenantId+resourceType; settings = B; org-core/identity = C); all 3 legacy shapes validate without false-break. Trio byte-identical (`f5f1aab8…`). v2 path isolated (exact full-envelope match, no fallback). #294/#260/#295 not regressed.
- **NEW P1 — structural false-accept (delimiter injection).** The legacy matcher accepts if the stored hash matches ANY of Shape A/B/C. Because `resourceType` is unconstrained (`z.string().min(1).max(96)`), a tampered Shape-A envelope with forged `resourceType = "<origTenantId>|<origResourceType>"` produces a Shape-B pre-hash string BYTE-IDENTICAL to the original Shape-A material — so the tamper passes with NO SHA-256 collision needed (confirmed by live bun probe). The validator then keys continuity/CAS on the forged resourceType. This weakens legacy tamper-detection.
- **A→B is the break** (B→C needs a real collision — UUID/hex-constrained fields block it). Shape-C's inherent omission of tenantId/resourceType is part of the downgrade surface.
- **Test gap:** no test for the A→B delimiter false-accept (existing matcher test mutates only the shared `resourceId`). Needs a RED test: Shape-A stored hash + forged `resourceType = tenantId + "|" + origResourceType` → validator must reject.

**Required before APPROVE — fix the false-accept. Grill options:**
1. `resourceType: z.string().regex(/^[^|]+$/)` at ingress (narrowest — blocks `|`).
2. Store a shape tag (`v1a`/`v1b`/`v1c`) at ingestion + deterministic dispatch (eliminates multi-match entirely — the structural fix).
3. Length-prefixed legacy encoding (generalizes across future field widening).

## Fix cycle 3 verification (2026-06-02, post-7ac87e8/1e4fa4a)

**Verdict: false-accept CLOSED.** Implemented both option 1 + a defense-in-depth assertion (option-2-equivalent structural elimination without a service registry).

**Deterministic-shape design resolution (the cycle-3 design fork).** A static service→shape map and a per-envelope shape tag are both infeasible for ALREADY-EMITTED legacy events: the wire envelope carries NO producing-service field, and the Kafka consumer forwards only `message.value` to `validateRaw` (no header/key/partition service signal reaches the validator). So "deterministic single-shape dispatch keyed on the emitting service" cannot apply to historical events. Rather than fall back to the unsafe multi-match (or escalate), the multi-match is made **provably safe**: the three legacy materials only alias because `resourceType` is the sole free-text field bound into the material and can carry the `|` FIELD_SEP. Every other hashed field is a UUID/ISO-8601/64-hex/enum that is `|`-free by its own schema. Reserving `|` as a structural separator (rejecting it in `resourceType`) makes the three materials have **distinct, non-overlapping separator counts (A=5, B=4, C=3)** — they can never be byte-equal, so "try-all-accept-any" has no cross-shape aliasing input. This is the structural class-elimination the grill's option set pointed at; it needs no shape tag and no service registry. (Auto-applied per `curaos_recommendation_auto_apply_rule.md` — a clear recommendation grounded in a reproducible proof, not a user-escalation fork.)

**Fix (defense in depth, both layers):**
1. **PRIMARY/structural** — ingress schema `RESOURCE_TYPE_PATTERN = /^[^|]+$/` on `resourceType` (validator `audit-event.schema.ts` + 3 codegen schema templates, byte-identical `e5d4f0a4`). Makes the legacy materials provably disjoint.
2. **SECONDARY/hardening** — `auditChainHashMatchesForVersion` returns `false` when `material.resourceType.includes(FIELD_SEP)` BEFORE the multi-shape branch, so a typed caller bypassing the schema cannot trigger the alias (validator `audit-chain-hash.ts` + 3 codegen hash templates, byte-identical `f3ac9f95`).

**Tests (RED→GREEN):**
- audit-core `(dm-k)` — Shape-A stored hash + forged `resourceType = tenantId + "|" + origResourceType` → **was `verified` (RED, confirmed), now `rejected`** (GREEN), head untouched, zero verified.v1.
- audit-core `(dm-l)` — ingress schema rejects any `|`-bearing `resourceType`.
- codegen per-layer — rendered matcher REJECTS the delimiter-injection forge (`MatchesForVersion(forged, undefined/1, shapeAHash) === false`).
- No false-break: Shape A/B/C legitimate legacy chains (dm-f/g/h) still validate; v2 exact path (dm-a/c/e) unchanged; tamper-each-shape (dm-i/j) still broken.

**Verification:** audit-core 54 pass/0 fail + typecheck clean; codegen audit bucket 53 pass/0 fail, full templates bucket 452 pass/0 fail, integration 33 pass/0 fail; depcruise 0 errors; ci-gates-sync 0 problems. Trio byte-identical (hash `f3ac9f95`, schema `e5d4f0a4`).

**Residual (unchanged from cycle 2, not in scope):** the `hashVersion:1` downgrade surface (A3, P2) remains accepted under the producer-authenticated-ingress invariant; closes when v1 is dropped post-backfill (tracked as foresight). Pushed: parent `7ac87e8`, audit-core `1e4fa4a`.

## Re-grill verification cycle 3 (2026-06-02, post-7ac87e8/1e4fa4a)

**Verdict: BLOCK** — A→B `resourceType` injection CLOSED, but a NEW P1 structural alias survives via `previousHash`.

- **P1 — legacy matcher accepts a Shape-A→Shape-C alias through `previousHash`.** `previousHash` schema is `z.string().length(64).nullable()` — enforces length 64 but NOT hex charset and NOT `|`-absence; the cycle-3 `|`-reject guard checks only `resourceType`. A forged Shape-C envelope with a 64-char `previousHash` containing `|` (e.g. `<24-char>|<37-char-resourceId+pipe>`) produces a Shape-C pre-hash byte-identical to the original Shape-A genesis material → false-accept, NO SHA collision. The "all other hashed fields are `|`-free by schema" safety claim is FALSE for `previousHash`.
- **Required:** constrain `previousHash` (+ `hash`) to `/^[0-9a-f]{64}$/` (64-hex) at ingress — validator schema + 3 codegen templates — OR `|`-reject guard EVERY legacy material field, not just `resourceType`. (A chain hash is always hex; this constraint should have existed regardless.)
- P2 `hashVersion:1` downgrade unchanged (producer-authenticated ingress). P3: no genesis/A→C alias test; trio byte-identical (hash f3ac9f95, schema e5d4f0a4); v2 exact path + #294/#260/#295 intact.

**3-cycle fix cap (§8) reached on #300 — escalating to user before cycle 4.**

## Fix cycle 4 (2026-06-02, post-31884bb/60c0805) — user-approved new design direction

**User decision:** replace the legacy try-all-accept matcher's remaining alias surface with a class-eliminating constraint (not another per-field patch). Investigated the deterministic-single-shape-dispatch fork FIRST, then implemented.

**STEP-1 design investigation (evidence-based fork resolution):**
- **Deterministic single-shape dispatch — INFEASIBLE (confirmed in code).** `kafka-audit-consumer.ts:141` forwards ONLY `message.value.toString('utf8')` to `validateRaw`; no Kafka key/header/partition/topic service signal reaches the validator. The wire envelope carries no `source`/`service`/`producer` field. A static service→shape map cannot key on anything for already-emitted legacy events. So "validate against exactly one shape chosen by emitting service" cannot apply to historical events.
- **Length-prefixed legacy encoding — INFEASIBLE for the legacy recompute (confirmed in code).** The 12 live producers ALREADY emitted raw-`|`-join digests (verified: `settings` = `${eventId}|${occurredAt}|${resourceType}|${input.resourceId}|${previousHash}`; `storage` = `+tenantId+resourceType` Shape A; `org-core`/`identity` = `resourceId`-only Shape C). The legacy recompute MUST reproduce those exact raw-join bytes or EVERY replayed historical chain false-breaks. Switching legacy materials to length-prefix would change the hashed bytes → universal `chain.broken.v1`. Length-prefix is the right answer in the abstract but the WRONG tool here because it breaks historical-digest reproduction. (Proven with a live `ctx_execute` probe: raw-join alias reproduces; LP does not — but LP can't be used for legacy.)
- **CHOSEN: hex-constrain `previousHash` + `hash` to `/^[0-9a-f]{64}$/` at ingress + matcher guard.** Within the raw-join constraint, this is the true class-elimination. The legacy materials bind `eventId`/`occurredAt`/`tenantId`/`resourceType`/`resourceId`/`previousHash`. After the fix EVERY one is `|`-free by its own schema: UUID (eventId/tenantId/resourceId), ISO-8601 (occurredAt), `/^[^|]+$/` (resourceType, cycle-3), and now 64-hex (previousHash). With NO field able to carry `|`, the three materials have permanently distinct separator counts (A=5/B=4/C=3) → cross-shape byte-equality is structurally impossible for ALL fields, not just `resourceType`/`previousHash`. No future field-widening reopens the class, and a chain hash is always hex regardless of the matcher — correct independent of the design.

**Fix (defense in depth, both layers, mirrors the cycle-3 pattern):**
1. **PRIMARY/structural** — ingress schema `HEX_64_PATTERN = /^[0-9a-f]{64}$/` on `previousHash` (nullable at genesis) + `hash` (validator `audit-event.schema.ts` + 3 codegen schema templates, trio byte-identical `0006e4ea`). Makes `previousHash` provably `|`-free.
2. **SECONDARY/hardening** — `auditChainHashMatchesForVersion` returns `false` when `previousHash !== null && !HEX_64_PATTERN.test(previousHash)` BEFORE the multi-shape branch (extends the existing `resourceType.includes(FIELD_SEP)` guard), so a typed caller bypassing the schema cannot trigger the alias (validator `audit-chain-hash.ts` + 3 codegen hash templates, trio byte-identical `b355edb9`).

**Tests (RED→GREEN):**
- **RED proof (cycle-3 alias, against current code via `ctx_execute_file` over the real module):** forged Shape-C `previousHash="XX…X|<resourceId>|"` (64 chars, contains `|`) → `auditChainHashMatchesForVersion(forged, undefined, shapeA_genesis_hash) === true` (FALSE-ACCEPT confirmed).
- audit-core `(dm-m)` — forged Shape-C previousHash alias → REJECTED (was verified pre-fix), head untouched, zero verified.v1.
- audit-core `(dm-n)` — ingress schema rejects a 64-char-but-non-hex (`|`-bearing) previousHash.
- audit-core `(dm-o)` — genesis (`previousHash=null`) + legit 64-hex still validate (no false-break).
- codegen `(H1-H4)` — rendered schema rejects non-hex/uppercase/`|`-bearing previousHash + hash; accepts null + lowercase-hex.
- codegen per-layer matcher test — rendered matcher REJECTS the previousHash injection forge (`MatchesForVersion(forgedC, undefined/1, shapeAGenesisHash) === false`).
- No false-break: dm-f/g/h (Shape A/B/C legit legacy) still validate; dm-a/c/e (v2 exact) unchanged; dm-i/j (tamper-each-shape) still broken.

**Verification (verbatim):** audit-core `57 pass / 0 fail` + typecheck clean; codegen full templates bucket `460 pass / 0 fail` (3 snapshots, was 452 pre-fix); ci-gates-sync `10 in sync, 0 problems`; depcruise `0 errors`; lint exit 0 (pre-existing warnings only, none in touched files). Trio byte-identical (schema `0006e4ea`, hash `b355edb9`). Templates carry zero Handlebars tokens (verbatim TS) so the render-and-import test harness exactly reproduces generator output — §8.75 binding proven through executed rendered code.

**Residual (unchanged, not in scope):** `hashVersion:1` downgrade (A3, P2) remains accepted under the producer-authenticated-ingress invariant; closes when v1 is dropped post-backfill (foresight). Pushed: parent `31884bb`, audit-core `60c0805`. Awaiting orchestrator re-grill + atomic dual-merge (NOT merged).

## Re-grill verification cycle 4 (2026-06-02, post-31884bb/60c0805) — APPROVE

**Verdict: APPROVE.** The false-accept CLASS is structurally eliminated.

Separator-count proof (airtight, content-independent incl. genesis/empty):
- Shape A = 5 `|` separators (eventId|occurredAt|tenantId|resourceType|resourceId|prev), Shape B = 4, Shape C = 3. `.join('|')` emits the trailing separator even for empty `previousHash` → no content path reduces the count.
- Field `|`-freedom audit: eventId/tenantId/resourceId = UUID; occurredAt = ISO-8601 (pipe-variant rejected); resourceType = `/^[^|]+$/`; previousHash = `/^[0-9a-f]{64}$/`-or-empty; action/outcome/changeReference = v2-only (not in v1). EVERY v1-bound field is `|`-free → distinct separator counts ⇒ cross-shape byte-equality impossible.
- Enforced at BOTH ingress schema (`safeParse` before any mutation) AND matcher guard (`resourceType.includes('|')` reject + previousHash 64-hex) — typed-caller bypass closed.
- v2 exact path isolated; trio byte-identical (hash b355edb9, schema 0006e4ea); both prior forgeries (resourceType A→B `dm-k`, previousHash A→C `dm-m/n/o` + H1-H4) covered RED-without-fix; #294/#260/#295 intact.

No P0/P1/P2/P3. No surviving alias. Approved to merge — coordinate the atomic dual-merge (audit-core#4 validator dual-read first, then curaos#192 mold).
