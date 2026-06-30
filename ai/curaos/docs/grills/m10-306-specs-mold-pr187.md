# Grill: M10-306 Specs Mold Hardening — PR #187

**PR:** your-org/curaos#187  
**Closes:** curaos-ai-workspace#306  
**Branch:** `agent/m10-306-specs-mold-hardening-claude-3b06e3f4`  
**Commit:** b89653d  
**Grill date:** 2026-06-02  
**Griller:** Codex (cross-harness adversarial; Claude authored)  
**Mode:** READ-ONLY  

---

## Verdict: APPROVE

Network fetch of `gh pr diff 187` failed (no GitHub connectivity in sandbox). Review grounded entirely in local commit `b89653d` compared as `origin/main..b89653d` against `agent/m10-306-specs-mold-hardening-claude-3b06e3f4`.

---

## P0 Findings

None

---

## P1 Findings

None

---

## P2 Findings

None

---

## P3 Findings

**P3-A — Runtime parser acceptance unverified (static analysis only)**  
The test suite (`tools/codegen/__tests__/templates/typespec-contract-emission-303.test.ts:170-176`, `:223-240`) uses `Bun.YAML.parse` for structural assertions, not `@asyncapi/parser`. The local checkout does not have `@asyncapi/parser` installed, so the claim of "0 diagnostics" is not exercised by this test file. This does not block merge — the emitted YAML is structurally correct — but the claim is unverified at the parser layer.

**P3-B — Nullable/CI assertions cover core only in test file**  
Nullable assertions at lines `167-240` and package-CI assertions at lines `289-306` target the `core` layer only. Personal and business checks at lines `252-270` verify route prefix only. All three templates received the identical fix (confirmed by diff), so this is not a template defect, but a future layer-local regression in personal/business could pass undetected.

**P3-C — Comment overstates AsyncAPI 3.0 schema dialect**  
Template comments at `service-core/specs/{{kebabCase name}}.asyncapi.yaml.hbs:96-99`, personal `:95-98`, business `:95-98` and test comments at `:223-228` state "AsyncAPI 3.0.0 uses JSON Schema 2020-12". AsyncAPI 3.0.0's Schema Object is documented as a JSON Schema Draft 07 superset, not strictly 2020-12. This is cosmetically misleading but does not affect correctness — both dialects permit `type` arrays; `nullable: true` was the OpenAPI 3.0 extension, not standard JSON Schema in any dialect.

---

## Evidence Summary

**JSON Schema 2020-12 array-form type is correct:**  
Per https://json-schema.org/draft/2020-12/json-schema-validation#section-6.1.1, `type` may be a string or an array of unique strings; an instance is valid if its type matches any listed string. `type: [string, "null"]` parses under Bun YAML as `{"type":["string","null"]}` — unquoted `string` and quoted `"string"` are semantically identical in YAML flow sequences. Verdict: correct form.

**Trio symmetry confirmed:**  
All three layers received the identical nullable fix:  
- Core `display_name` union: `:95-100`; `deleted_at` union: `:103-107`; required fields `:75-82`  
- Personal `display_name` union: `:94-99`; `deleted_at` union: `:102-106`; required fields `:74-81`  
- Business `display_name` union: `:94-99`; `deleted_at` union: `:102-106`; required fields `:74-81`  
No layer left on `nullable: true`.

**No other nullable fields missed:**  
`git grep nullable` across all three template files at b89653d returns zero hits.

**Cardinality unchanged:**  
`display_name` and `deleted_at` remain listed in `required:` in all three layers. The change from `type: string` + `nullable: true` → `type: [string, "null"]` does not alter required-ness. Null is now explicitly in the type union rather than a side-channel flag; semantics are equivalent or stricter (explicit rather than implicit null).

**CI gate present in all three layers:**  
`spec:openapi` script present at line `26` of all three `package.json.hbs`; `ci` script includes `bun run spec:openapi` before `bun run test` at line `27` — confirmed by `git grep 'spec:openapi'` across all three layer templates.

**Snapshot quality — parsed shape, not text grep:**  
`typespec-contract-emission-303.test.ts:229-240` asserts: type is an array, contains `'string'`, contains `'null'`, does NOT contain `'nullable'`. This would go RED on `nullable: true` (not array) and RED if `'null'` is absent. Gate quality is adequate for the core layer.

---

## Recommended Actions

No blocking fixes required.

**Optional improvements (not blocking):**
1. Add `@asyncapi/parser` to dev deps and assert 0 error diagnostics on emitted core/personal/business specs — proves runtime parser acceptance that the current test does not.
2. Loop nullable and package-CI snapshot assertions across `core`, `personal`, `business` layers in the test file to catch future per-layer drift.
3. Soften template/test comments from "AsyncAPI 3.0.0 uses JSON Schema 2020-12" to "JSON Schema type-union (both 2020-12 and Draft 07 permit type arrays; nullable: true was an OpenAPI 3.0 extension)".

