# Opposite Harness Grill Blocked

GRILL: blocked-harness-unavailable
GRILL-PROBE: {"available":false,"reason":"opposite-harness grill report missing","evidence":"{\"verdict\":\"pass\",\"issues\":[],\"report_path\":\"\"}"}
GRILL-HARNESS: claude
GRILL-AGENT: codex-plugin-claude-rescue-agent
GRILL-TIMEOUT-MS: 600000
GRILL-REASON: grill-result-report-path-missing-or-mismatched

The opposite-harness adversarial leg failed fast and no CodeRabbit-only fallback should be treated as a completed opposite-harness grill.
Subject: m12-healthstack-phi-boundary-pr503

## Native Claude fallback adversarial review (2026-06-05)

VERDICT: needs-attention

The research recommendation is sound on scope: close only the real
`terminology-service` payload, skip the four scaffold-only service catalogs, do
not bless generated `display_name` producers, and avoid a new runtime dependency.

Blocking correction applied before implementation:

- `ValueSetUpdatedPayload.updated_by` is currently typed as arbitrary `string`.
  The old shape heuristic rejected `updated_by` structurally because it is not
  `*_id`, `*_ref`, `*_url`, or metadata-shaped.
- A naive closed exact-key schema would have to allow the `updated_by` key and
  would then rely only on the PHI regex. That would miss single-token usernames,
  all-caps names, and non-ASCII names.
- `updated_by` must therefore be constrained as an opaque actor reference
  value, not just an allowed key. Accept UUID or allowlisted typed UUID
  references; reject free-text labels such as `jsmith`, `JANE DOE`, and
  `Jane Doe`.
- Skipped service schemas must be a distinct `skipped` state, never a silent
  `ok/pass`, so future real payloads cannot stay unvalidated by accident.

Implementation must update tests to prove both corrections.

## Native Claude fallback re-grill (2026-06-05)

VERDICT: needs-attention

Second review found two remaining PHI-leak paths in the implementation draft:

- `updated_by` object/array nesting bypassed the actor-reference constraint
  because the first draft only checked primitive leaf values.
- Sibling allowed fields such as `version`, `value_set_id`, and `value_set_url`
  relied on the shared ASCII-only name regex, so non-regex-catchable free-text
  values such as `jsmith`, all-caps names, lowercase names, or non-ASCII names
  could pass.

Applied remediation:

- Closed-schema keys now reject object/array values; constrained fields must be
  primitive.
- The terminology schema now constrains all values: exact event type, UUID ids,
  ISO timestamp, opaque ValueSet UUID/reference, `/ValueSet/<uuid>` HTTP(S) URL,
  numeric release-version shape, and opaque actor reference.
- Regression tests cover `updated_by` nesting and non-regex-catchable values in
  sibling fields.

## Native Claude fallback final re-grill (2026-06-05)

VERDICT: needs-attention

The third review confirmed the `updated_by` nesting fix and skipped-service
state, then found a remaining claim/code mismatch: the first sibling-field
constraints still allowed name tokens behind valid-looking slugs or alpha
versions (`2026-Smith`, `vs-smith`, `/ValueSet/jane.doe`).

Applied remediation:

- `version` is now numeric CalVer/SemVer shaped only.
- `value_set_id` is now an opaque UUID or `ValueSet:<uuid>`.
- `value_set_url` is now an HTTP(S) `/ValueSet/<uuid>` URL.
- Regression tests cover `2026-Smith`, `2026-OBrien`, `vs-smith`, and
  `/ValueSet/jane.doe`.
- The real `terminology-service` producer and AsyncAPI contract now reject the
  unsafe slug/free-text forms before publish, so the harness no longer diverges
  from the producer reality.

## Native Claude fallback final verification (2026-06-05)

VERDICT: approve

Final review found no surviving PHI/name-token blocker in the focused fields:
`updated_by`, `version`, `value_set_id`, and `value_set_url`.

Verified:

- `updated_by` accepts only UUID or allowlisted typed UUID references.
- `value_set_id` and `value_set_url` use opaque ValueSet UUID references.
- `version` is numeric release-version shaped only.
- Object/array nesting under closed-schema keys is rejected.
- Skipped service schemas are `status: "skipped"` and `ok:false`, never pass.
- The real `terminology-service` producer and the harness now agree, with the
  producer stricter on `value_set_url` because the URL UUID must equal
  `value_set_id`.

Non-blocking hardening applied after final review:

- `null` / `undefined` under closed-schema keys now fail as invalid reference
  values instead of silently passing.
