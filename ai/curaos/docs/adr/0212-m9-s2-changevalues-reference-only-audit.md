---
adr-id: 0212
title: M9-S2 — reference-only changeValues on the Diamond audit envelope
status: Accepted
date: 2026-05-29
supersedes: []
superseded-by: null
amends: [0210]
tags: [identity, audit, phi, schema, m9, foundation, security]
parent-adrs: [0200, 0210]
amends-decision: M7-D5 (ai/curaos/docs/m7-user-decisions.md §D5, bound 2026-05-27 via §3.6 escalation funnel)
issue: your-org/curaos-ai-workspace#200
coordinates-with: your-org/curaos-ai-workspace#202
spike: ai/curaos/docs/research/2026-05-29-adr-0212-changevalues-constraint-design.md
authorized-by: user (2026-05-29) — explicit authorization to reopen the binding M7-D5 reference-only audit-envelope decision
---

# ADR-0212 — M9-S2: Reference-only `changeValues` on the Diamond audit envelope (amends M7-D5 / ADR-0210)

> **Status:** Accepted (pre-implementation — no `0212-*` schema code on disk; `changeValues` appears today only in the divergence consumer, never in the schema or the 6 codegen templates).
> **Authorization:** This ADR reopens **M7-D5**, a binding decision. The user explicitly authorized the reopening on 2026-05-29 (issue #200 comment). This is an **explicit, doc-synced amendment**, not a silent refinement.

## Adversarial provenance (why this design, not the first draft)

This ADR was produced through a research + cross-harness adversarial pass (workflow `wf_f5f6bcfe-fd9`). The **first-pass** constraint design — an open lowercase-kebab role-code regex (`/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/`) plus an open `TYPE:<kebab>` typed-reference — was **REJECTED**. The PHI-leak red-team compiled that exact snippet against the service's real Zod 4.4.3 and got **18 PHI payloads to VALIDATE** (`hiv-positive`, `schizoaffective-disorder`, `john-smith`, `Patient:<uuid>`, `Condition:diabetes-mellitus-type-2`, `jane-doe-dob-19800512`, kebabbed email/address, name-as-key, …). Root defect: **syntactic shape (lowercase-kebab) ≠ semantic class (an RBAC role)** — lowercased/kebabbed clinical text, names, and contact data all satisfy a kebab regex and dodge the ASCII superRefine (which only catches Capitalized "First Last", dashed `YYYY-MM-DD`, and 9-digit SSN shapes). This ADR therefore adopts a **closed-enum value domain**, PHI-safe by construction, not by reviewer trust. The charter red-team independently returned **PROCEED** (reference-only narrowing is legitimate, not sophistry) **iff** seven guardrails (§6) hold.

---

## 1. Context

### 1.1 The divergence-checker value-blindness

The Diamond model (ADR-0210) writes party/org/identity facts down two paths and runs an **audit-divergence-checker** (#195 / identity-service PR #38) to prove both legs agree. The checker normalizes each side into `FieldChange { field, values[], valuesKnown? }` (`identity-core/divergence/normalized-audit-fact.ts:68-85`).

The production Diamond audit envelope is **reference-only** per M7-D5: it carries `changedFields` (NAMES) but **never values**. So every live Diamond fact normalizes with `valuesKnown:false`, and the checker can only compare field-name *presence*, not field *values*. The caveat at `normalized-audit-fact.ts:71-84` states verbatim:

> "Full value-aware parity requires a Diamond-side schema change tracked as a `priority=critical` follow-up (it cannot land here without re-opening the M7-D5 reference-only PHI-boundary decision)."

**That follow-up is this ADR.** The consumer is already wired: `audit-normalizers.ts:160` calls `diamondChanges(changedFields, event.changeValues, event.resourceId)` and line 176 reads `changeValues?.[field]` — but `changeValues` **exists nowhere in the schema and is never populated by the publisher**. The value-aware gate is structurally blind in production: it always takes the `valuesKnown:false` fallback. Without this ADR, **#99 Phase D's live signal `auth-diamond-divergence == 0` can never read green** — every live Diamond event fail-closes to RED for lack of comparable values, not because the migration diverged.

### 1.2 The M7-D5 tension

M7-D5 ("Audit envelope for PHI events") is **binding**. Its intent is explicitly **PHI-free**, not value-free:

- Headline: *"No PHI value in `audit-core-service` storage — references only."*
- Its hard rule + CI acceptance test are a **PHI scan** over `JSON.stringify(event)` — DOB `\d{4}-\d{2}-\d{2}`, SSN `\b\d{3}-?\d{2}-?\d{4}\b`, SSN-keyword `ssn|social[\s-]*security`, NAME `[A-Z][a-z]+\s[A-Z][a-z]+` — NOT a blanket "no string values of any kind."
- The "never values" clause is scoped to the **`changedFields` field contract** (`changedFields?: string[]; // FIELD NAMES ONLY — never values`) — it describes what `changedFields` carries; it is not a charter ban on every value-bearing field in the envelope.

RBAC role-codes (`tenant-admin`, `clinician`, `break-glass-admin`, …) and opaque UUIDs are **not** among the 18 HIPAA identifiers (§160.103) and are not individually-identifiable health information. Carrying them is consistent with **IHE BALP v1.1.4** — the cited M7-D5 precedent — which records changed-resource references and permits tagged value pairs in `entity.detail`.

---

## 2. Decision

Add ONE new **optional**, **reference-only**, **PHI-safe-by-construction** field — `changeValues` — to the Diamond audit envelope beside `changedFields`, with a **closed-enum value domain**, a **closed key domain**, and the M7-D5 **PHI CI gate extended to scan it**.

### 2.1 Schema — closed-domain `changeValues`

Land in `curaos/backend/services/identity-service/src/identity-core/audit/audit-event.schema.ts`, beside `changedFields`. **Reuse** the existing `RBAC_ROLES` const (`rbac/rbac-types.ts:1` — already used as `z.enum(RBAC_ROLES)` at `rbac/rbac-policy.service.ts:31`); do NOT redefine ([[curaos-reuse-dry-rule]]).

`RBAC_ROLES` = `['tenant-admin', 'user', 'clinician', 'support-agent', 'auditor', 'break-glass-admin']`.

```ts
import { RBAC_ROLES } from '../../rbac/rbac-types';

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

// Closed allowlist of ACCESS-CONTROL resource types this envelope may reference.
// Patient/clinical resource types are intentionally NOT here (verdict-1 P0:
// a denylist is unsafe; only an allowlist closes the channel).
const REF_RESOURCE_TYPES = [
  'ActorMembership',
  'PractitionerRole',
  'Credential',
  'Policy',
  'Org',
] as const;
const REF_RESOURCE_RE = new RegExp(`^(?:${REF_RESOURCE_TYPES.join('|')}):`);

const RoleEnum = z.enum(RBAC_ROLES);

// A change value is ONE of:
//   (a) an RBAC role-code from the CLOSED enum
//   (b) an opaque UUID (membership/credential/policy/org id)
//   (c) <AllowlistedType>:<uuid>
//   (d) <AllowlistedType>:<role-enum-member>   (e.g. PractitionerRole:clinician — ADR-0210)
// NO open kebab branch. NO arbitrary TYPE prefix. NO free-form string.
// ASCII-only is LOAD-BEARING — the PHI superRefine is ASCII-only; i18n role
// labels MUST NOT widen this to a Unicode-letter class (verdict-1 P2).
const ChangeReferenceValueSchema = z
  .string()
  .min(1)
  .max(128)
  .refine((v) => {
    if (RoleEnum.safeParse(v).success) return true;          // (a)
    if (UUID_RE.test(v)) return true;                        // (b)
    if (REF_RESOURCE_RE.test(v)) {                           // (c)/(d)
      const ref = v.slice(v.indexOf(':') + 1);
      return UUID_RE.test(ref) || RoleEnum.safeParse(ref).success;
    }
    return false;
  }, 'changeValues entries must be an RBAC role-code (closed enum), an opaque UUID, or <AllowlistedType>:<uuid|role-code> — never a free-form or PHI value.');

// keys: CLOSED allowlist of audited access-control column names — NOT an open
// identifier regex (which would admit `johnsmith` / `patient_jane_doe` as keys —
// verdict-1 P0 second channel).
const CHANGE_VALUE_KEYS = [
  'role',
  'status',
  'membership_id',
  'credential_id',
  'policy_id',
  'org_id',
] as const;
const ChangeValueKeySchema = z.enum(CHANGE_VALUE_KEYS);
```

Field, inside the envelope `z.object({...})`:

```ts
    // changeValues: PHI-safe reference map (M7-D5 amendment / ADR-0212).
    // OPTIONAL + publisher-omitted-when-undefined → backward-compatible; existing
    // reference-only events and all non-opted-in trio services stay byte-identical.
    // MUST remain inside the superRefine PHI scan (§2.2) — it carries VALUES.
    changeValues: z
      .record(
        ChangeValueKeySchema,
        z.array(ChangeReferenceValueSchema).min(1).max(32),
      )
      .optional(),
```

### 2.2 The EXTENDED CI PHI gate (the spirit of M7-D5)

`changeValues` carries VALUES, so the existing superRefine PHI scan is its **mandatory backstop** on top of the structural allowlist. The current code:

```ts
const { changedFields, occurredAt, ...rest } = event;   // a new field lands in ...rest
const serialized = JSON.stringify(rest);                 // and is scanned BY DEFAULT — correct
```

**Binding constraint (must appear verbatim in the schema header comment):** `changeValues` MUST stay inside the `...rest` superRefine scan. Do **NOT** add it to the `{ changedFields, occurredAt, ... }` destructure exclusion. No superRefine code change is needed — default-scan is the desired behavior; the test below locks it. (Adding it to the exclusion — the way `changedFields` is excluded — would silently disable M7-D5's only PHI gate on the one field that carries values. This is the single most dangerous regression.)

Extend the literal-decision CI test `curaos/tools/codegen/__tests__/templates/audit-event-schema-changedfields-scope.test.ts` with these cases:

| # | Payload | Expected | Catches |
|---|---|---|---|
| N1 | `changeValues: { role: ['1980-05-12'] }` | REJECT | DOB regex + allowlist |
| N2 | `changeValues: { role: ['123-45-6789'] }` | REJECT | SSN regex + allowlist |
| N3 | `changeValues: { role: ['John Smith'] }` | REJECT | NAME regex + allowlist |
| N4 | `changeValues: { 'social_security': ['clinician'] }` | REJECT | closed-key enum + SSN-keyword |
| N5 | `changeValues: { role: ['hiv-positive'] }` | REJECT | **closed enum** (superRefine alone misses — verdict-1 P0) |
| N6 | `changeValues: { role: ['john-smith'] }` | REJECT | **closed enum** (lowercase dodges NAME regex — verdict-1 P0) |
| N7 | `changeValues: { role: ['Patient:<uuid>'] }` | REJECT | **resource-type allowlist** (Patient not allowlisted — verdict-1 P0) |
| N8 | `changeValues: { dx: ['Condition:diabetes-mellitus-type-2'] }` | REJECT | **closed key enum + allowlist** (verdict-1 P0) |
| N9 (positive) | `changeValues: { role: ['clinician','break-glass-admin'], membership_id: ['<uuid>'] }` | ACCEPT | real `RBAC_ROLES` members + UUID |
| N10 (positive) | `changeValues: { role: ['PractitionerRole:clinician'] }` | ACCEPT | ADR-0210 typed ref |
| N11 (compat) | event with `changeValues` omitted | ACCEPT | `.optional()` backward-compat |
| N12 (defense) | non-ASCII role-ish string (Cyrillic `сlinician`) | REJECT | ASCII-only enum (verdict-1 P2 future-i18n hole) |

> Positive cases use the REAL `RBAC_ROLES` members (`clinician`, `break-glass-admin`) — the original brief's `admin`/`staff` are NOT members of this service's enum and would (correctly) be rejected.

---

## 3. Constraints

1. **Closed value domain.** `z.enum(RBAC_ROLES)` OR UUID OR `<allowlisted-type>:<uuid|role-enum>`. No open kebab branch, no arbitrary `TYPE:`, no free-form string. (verdict-1 P0)
2. **Closed key domain.** `z.enum(CHANGE_VALUE_KEYS)` — actual access-control column names. NOT an open `FIELD_NAME_PATTERN` identifier regex. (verdict-1 P0)
3. **superRefine backstop retained.** `changeValues` stays inside the `...rest` scan. Two orthogonal gates — structural allowlist (PHI cannot fit a closed enum/UUID by construction) + PHI superRefine (catches any slip). Both present; neither alone trusted.
4. **`display_name` / all free-text fields OUT OF SCOPE for `changeValues`.** Identity UPDATE `display_name` is free-text, would trip `NAME_PATTERN`, and audit-publish failures are **swallowed silently** (`actors.service.ts:434` `catch {}` — "audit fan-out failures must not roll back the user-facing CRUD"). A tripped guard would lose the event with no signal. The `resourceId` + `valuesKnown:false` fallback already covers free-text fields. Unit-test enforced.
5. **Optional + backward-compatible.** `.optional()`; publisher omits the key when undefined. Existing reference-only events + all non-opted-in trio services (party-core, org-core, audit-core) stay byte-identical and valid. Per [[curaos-rolling-update-rule]]: add new field alongside old; no `-v2`/parallel envelope path.
6. **ASCII-only forever.** PHI superRefine is ASCII-only; i18n role labels MUST NOT widen the value domain to a Unicode-letter class. Comment the WHY in-code.

---

## 4. Consequences

**Positive**
- Closes the divergence-checker value-blind spot: opted-in Diamond facts normalize with real `valuesKnown:true` reference values, so #99 Phase D's live signal can actually reach green when the migration is correct, and catches a value-only divergence (M3 grants `clinician`, Diamond grants `auditor`) it was previously blind to.
- **Strengthens, not erodes, M7-D5:** the PHI CI gate now *also* scans the one value-bearing field, with a structural allowlist on top.
- RBAC/membership/credential/policy audit events become value-aware while staying HIPAA-safe.

**Negative / risk**
- One more field in the envelope contract → must land byte-identical across the trio templates (§5) or the byte-identical-trio test fails (the intended lockstep guard).
- Residual risk: a free-form role string carrying a name. Defended by the closed enum (a name cannot impersonate an enum member) + superRefine. Verdict-1's 18 PHI breaks are all closed by the enum redesign.
- Silent audit-publish failure (`actors.service.ts:434`) means a wrongly-tripped guard loses the event quietly → constraint #4 keeps free-text out of `changeValues` entirely.

**Neutral**
- Non-opted-in trio services gain the optional field but emit nothing new (publisher-omitted) → byte-identical envelopes until they opt in. No unwanted field, no migration.

---

## 5. Codegen-fold plan (trio symmetry — [[curaos-generator-evolution-rule]])

The 3 `service-{core,personal,business}` audit templates are **byte-identical today** (4773B each; `diff -q` IDENTICAL, verified on disk). There is **no separate healthstack overlay template tree** — healthstack regenerates from the same trio, so "trio + overlay symmetry" = "keep the 3 templates byte-identical." The fold is **one edit applied 3×**, locked by the byte-identical-trio test. Local-only hot-fix to identity-service alone is **FORBIDDEN**.

**EXACT file list (all in ONE PR):**

```
# customised service outputs
curaos/backend/services/identity-service/src/identity-core/audit/audit-event.schema.ts        # add changeValues field + closed schemas
curaos/backend/services/identity-service/src/identity-core/audit/audit-publisher.service.ts   # populate changeValues for RBAC/membership ops; omit when undefined
curaos/backend/services/identity-service/src/identity-core/actors/actors.service.ts           # route role/membership refs (NOT display_name) into changeValues
curaos/backend/services/identity-service/src/identity-core/divergence/normalized-audit-fact.ts # update the :71-84 fail-closed caveat → parity lands per ADR-0212

# codegen templates — trio × 2 (byte-identical edit applied 3×)
curaos/tools/codegen/templates/service-core/src/audit/audit-event.schema.ts.hbs
curaos/tools/codegen/templates/service-personal/src/audit/audit-event.schema.ts.hbs
curaos/tools/codegen/templates/service-business/src/audit/audit-event.schema.ts.hbs
curaos/tools/codegen/templates/service-core/src/audit/audit-publisher.service.ts.hbs
curaos/tools/codegen/templates/service-personal/src/audit/audit-publisher.service.ts.hbs
curaos/tools/codegen/templates/service-business/src/audit/audit-publisher.service.ts.hbs

# extended literal-decision test (N1-N12, §2.2)
curaos/tools/codegen/__tests__/templates/audit-event-schema-changedfields-scope.test.ts
```

The divergence consumer `audit-normalizers.ts:160,176` is **unchanged** — it already reads `changeValues`; this ADR makes the producer populate it. `actors.service.ts` does NOT fold into the actors-service codegen template (that template is a neutral stub); there are no Diamond membership/credential publish sites in the codegen path (those are M3-path in `src/auth/`).

---

## 6. Guardrails (7, all binding — from the adversarial pass)

1. **KEEP `changeValues` inside the superRefine scan.** Negative tests N1-N3 prove a DOB/SSN/Name in a `changeValues` value is REJECTED.
2. **EXTEND the M7-D5 acceptance CI test** — N1-N12 (§2.2). Structural allowlist = gate 1; PHI superRefine = mandatory backstop.
3. **Closed POSITIVE value allowlist** — `z.enum(RBAC_ROLES)` OR UUID OR `<allowlisted-type>:<uuid|role-enum>`, max 128, array `min(1).max(32)`. Free-form REJECTED. (verdict-1 P0 — supersedes the open-kebab draft.)
4. **Closed key allowlist** — `z.enum(CHANGE_VALUE_KEYS)`, NOT an open identifier regex. (verdict-1 P0.)
5. **`display_name` / free-text OUT OF SCOPE** — named explicitly; unit-test enforced.
6. **FOLD-BACK byte-identical into all 3 trio templates in the SAME PR** — byte-identical-trio test = lockstep guard.
7. **FRAME as an explicit, doc-synced M7-D5 amendment** — (a) cite M7-D5 + ADR-0210; (b) state the narrowed rule precisely; (c) add a resolution-pin row to `RESOLUTION-MAP.md`; (d) update the M7-D5 §D5 interface in `m7-user-decisions.md` + the `audit-event.schema.ts` header so binding text + code do not drift. Doc-graph + ai-mirror checks must pass.

**The narrowed rule (precise):** *"`changedFields` lists names only — never values. `changeValues` may carry RBAC role-codes from the closed `RBAC_ROLES` enum + opaque UUID references + allowlisted typed refs (`<ActorMembership|PractitionerRole|Credential|Policy|Org>:<uuid|role-code>`) only — never PHI — enforced by the closed structural allowlist AND the existing PHI superRefine, which continues to scan `changeValues`."*

---

## 7. Coordination with #202

#202 is the **consumer side** of the same gap; ADR-0212 is the **producer side**.

- **Already wired, awaiting producer:** `audit-normalizers.ts:160` calls `diamondChanges(changedFields, event.changeValues, event.resourceId)`; line 176 reads `changeValues?.[field]`. The `FieldChange` shape (`normalized-audit-fact.ts:68-85`) already exists. #202's consumer code dead-ends on the absent producer field.
- **This ADR populates it:** once the schema carries `changeValues` and the publisher emits it for RBAC/membership ops, the `diamondChanges` path lights up — `valuesKnown` flips to `true` for opted-in facts; absent/non-opted facts keep `valuesKnown:false` (fail-closed preserved).
- **Caveat resolution:** the `normalized-audit-fact.ts:71-84` block must be updated to point at this ADR (the `priority=critical` follow-up it names is now resolved) and note value-aware parity lands for `changeValues`-bearing events while name-only events stay `valuesKnown:false`.
- **#202's own PHI boundary** (durable ledger reference-only) shares this exact value domain — the persisted ledger stores the same closed-enum/UUID references, never PHI. Land the same allowlist on both sides.

---

## 7.1 Cross-path role-grant comparison contract (amendment, 2026-05-30 — canonical)

> **Added 2026-05-30** after a cross-harness grill (`grills/m9-s2-slice3-pr43.md`, BLOCK) + design pass (`wf_72304d5f-9f8`) found the §7 "value-aware parity" claim **cannot reach green for role grants as originally framed** — two independent defects: a value-domain mismatch AND a pairing-key mismatch, plus the fact that **no Diamond `ActorMembership` role-grant producer exists yet**. User chose **Option 3 (structured pair)** as the canonical comparison domain (2026-05-30). This subsection is the binding contract.

The divergence checker compares the auth M3 path against the Diamond path for `role-grant`. Both paths MUST converge on a single canonical comparison domain, **assembled in the NORMALIZER** — never on the wire and never by widening the closed-enum `changeValues` schema.

**Canonical role value (structured pair, serialized).** For each granted role, both normalizers MUST emit the identical token `membership:<targetUserId-UUID>#<rbac-role-code>` (e.g. `membership:33333333-3333-4333-8333-333333333333#clinician`) as a member of the `role` `FieldChange.values` set. Multi-role grants emit one token per role; `sameStringSet` (`audit-divergence-checker.ts:493-498`) then gives correct set semantics. The structured `{target, role}` pair is recoverable by splitting on `#`. `FieldChange.values` stays `string[]`; **no schema or fact-shape change**.
  - **M3** (`m3Changes`, `audit-normalizers.ts:125-139`): split `resource_id` (`${targetUserId}:${role}`, `auth-audit-publisher.ts:143`) on the first `:` and emit `membership:<target>#<role>`. Non-role fields (credential/membership) keep `values:[resourceId]` unchanged.
  - **Diamond** (`diamondChanges`, `audit-normalizers.ts:170-188`): combine the bare role-code(s) from `changeValues.role` with the target UUID (carried in `correlationId` — see pairing alignment) into the same token. The `changeValues` wire value stays a bare RBAC role-code from the closed enum — **the target is NEVER placed in `changeValues`** (that would break the N1-N12 PHI gate). The `valuesKnown:false` fallback for absent `changeValues` is unchanged (fail-closed preserved).

**Pairing alignment (load-bearing).** Value alignment alone is insufficient. The **live** pairing key is `(tenantId, correlationId)` (`audit-divergence-checker.ts:176-180`; `operationType` is INTENTIONALLY excluded per the PR #38 grill fix P0-6) — NOT the 3-tuple `(tenantId, operationType, correlationId)` documented in `normalized-audit-fact.ts:88-91` (that doc is stale and is corrected in this pass). M3 sets `correlation_id = targetUserId` (`auth-audit-publisher.ts:146`). Therefore the Diamond role-grant producer MUST set the audit envelope `correlationId = targetUserId` (the granted actor's UUID) **for `ActorMembership` role events specifically** — diverging from the request-scoped `correlationId` used on CRUD-on-`Actor` publishes (`actors.service.ts` / `actors.controller.ts:148-149`). Without this, the two facts never share a pairing bucket and both sit in `pending` (`pendingCount()>0` → `isGreen()===false`) as an unpaired failure that never reaches `diffChanges`. `tenantId` MUST be UUID-shaped and byte-identical on both paths (Diamond schema forces `z.string().uuid()`); the `targetUserId` component MUST be the same id-space UUID on both paths.

**PHI invariant (binding).** `changeValues` remains the closed-enum reference-only domain (§2.1): bare RBAC role-code, opaque UUID, or `<AllowlistedType>:<uuid|role-code>`. The `membership:<uuid>#<role>` comparison token is a **NORMALIZER-INTERNAL** construct over identifiers + RBAC codes only (no PHI) and never appears on the wire or in the persisted ledger. The M3 `${targetUserId}:${role}` composite is NEVER emitted as a Diamond `changeValues` value (it is schema-rejected and would be a second channel). The `#99` Phase D keystone `auth-diamond-divergence == 0` can read green for role grants ONLY once all three hold: (1) the canonical token, (2) `correlationId=targetUserId` pairing, (3) UUID `tenantId`.

**Known RED-bias (documented, not a defect).** `correlationId=targetUserId` is collision-prone: two grants to the same `targetUserId` (clinician then auditor) share `correlation_id`, colliding on `pairKey`; `audit-divergence-checker.ts:213-233` fails-closed (`recordUnresolved`, RED-biased over-count). Acceptable for the no-false-green invariant; rapid repeated grants to one user can over-count divergences.

**Producer gap.** No Diamond `ActorMembership` role-grant producer exists today (`actors.service.ts` emits only `resourceType:'Actor'` CRUD). Building it is net-new work (re-scoped curaos#115) — it must emit `resourceType:'ActorMembership'`, `changedFields:['role']`, `changeValues:{role:['<code>']}`, `resourceId:<membership/target UUID>`, `correlationId:targetUserId`. Until it lands, value-aware parity can only be exercised with hand-shaped facts (false-green risk — do NOT close curaos#40/#39 on a hand-shaped test).

> **Resolution note (forward-guard timing, [identity-service#73](https://github.com/your-org/identity-service/issues/73)).** This section specifies WHAT a Diamond producer must emit, but did not codify *when* the Diamond leg MUST be built relative to its M3 counterpart. That timing is now enforced by the contract test `test/identity-core/divergence/diamond-producer-coverage.test.ts`: any new M3 op in `M3_ACTION_TO_OPERATION` (or any phantom `membership-change` / `credential-update` op that gains a real M3 emitter) MUST ship its Diamond producer in the SAME PR, else CI fails. The two phantom operations are explicitly allowlisted (`PHANTOM_NO_PRODUCER_YET`) so the guard does not false-positive against today's 2-producer state. Durable contract: `ai/curaos/backend/services/identity-service/CONTEXT.md` ## Diamond producer contract.

---

## 8. References

- M7-D5: `ai/curaos/docs/m7-user-decisions.md` §D5 (bound 2026-05-27, §3.6 funnel)
- Parent: [`ADR-0210`](0210-m9-diamond-model-party-org-identity.md)
- Numbering convention (preserve numbers; corrections as resolution-pin rows): `RESOLUTION-MAP.md` (ADR-0164 row 6, 2026-05-28)
- Gap site: `curaos/backend/services/identity-service/src/identity-core/divergence/normalized-audit-fact.ts:68-85`
- Consumer: `curaos/backend/services/identity-service/src/identity-core/divergence/audit-normalizers.ts:160,176`
- Schema target: `curaos/backend/services/identity-service/src/identity-core/audit/audit-event.schema.ts`
- `RBAC_ROLES` (reuse): `curaos/backend/services/identity-service/src/rbac/rbac-types.ts:1`; precedent `z.enum(RBAC_ROLES)` at `rbac/rbac-policy.service.ts:31`
- Silent audit-publish swallow: `curaos/backend/services/identity-service/src/identity-core/actors/actors.service.ts:434`
- Research: [`…-changevalues-phi-precedent.md`](../research/2026-05-29-adr-0212-changevalues-phi-precedent.md) · [`…-changevalues-codegen-fold.md`](../research/2026-05-29-adr-0212-changevalues-codegen-fold.md) · [`…-changevalues-constraint-design.md`](../research/2026-05-29-adr-0212-changevalues-constraint-design.md)
- Adversarial provenance: workflow `wf_f5f6bcfe-fd9` (PHI-leak red-team: 8 breaks, 7×P0 against the first draft; charter red-team: PROCEED + 7 guardrails)
- Rules: [[curaos-generator-evolution-rule]] · [[curaos-verification-stack-rule]] · [[curaos-rolling-update-rule]] · [[curaos-reuse-dry-rule]] · [[curaos-validation-rule]] · [[curaos-bun-primary-rule]]
- Precedent: IHE BALP v1.1.4 (`entity.detail` tagged value pairs); HIPAA §164.312(b); §160.103 (role-codes/opaque UUIDs not among the 18 PHI identifiers)
