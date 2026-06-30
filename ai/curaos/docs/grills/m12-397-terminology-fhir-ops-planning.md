# CDX397 Planning Grill

Issue: your-org/curaos-ai-workspace#397

Command:

```sh
claude --model sonnet --effort high -p "$(cat /tmp/curaos-terminology-grill-prompt.txt)"
```

Full output: [m12-397-terminology-fhir-ops-opposite-harness.md](m12-397-terminology-fhir-ops-opposite-harness.md)

## Implementer Resolution

- Route placement: add a dedicated FHIR controller under `/fhir`.
- Suggest placement: add `/terminology/suggest` with a minimal Coding-like
  response.
- Event replacement: replace the scaffold `TerminologyRecorded` example with
  `healthstack.terminology.valueset-updated`.
- Partition subject: use `valueSetUrl` for stable per-ValueSet ordering.
- Air-gap fallback: no external calls by default; deterministic fixture data is
  only a runtime fallback for code paths and tests, not an RF2 loader.
- Trigger semantics: explicit value-set update path emits the event; FHIR reads
  do not publish events.

## Grill Findings Summary

- Missing semantics: `valueset-updated` trigger conditions were not specified.
- Missing semantics: `/terminology/suggest` response shape was not specified.
- Hidden dependency: `$` routes need HTTP smoke tests.
- Hidden dependency: `DomainOutboxService` must be injected into
  `TerminologiesService`.
- Generator-evolution classification: replacing the scaffold domain event is
  issue-required service-specific replacement, not a reusable mold fix.
