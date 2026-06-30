# org-service §7 - Forbidden Actions

- Do NOT import `@healthstack/*` or FHIR-typed packages.
- Do NOT call OpenFGA or Cerbos directly.
- Do NOT hard-delete `org_memberships` rows (soft-remove only).
- Do NOT use ORM for ltree column operations; use raw queries only.
- Do NOT skip path recalculation atomicity on `moveOrgUnit`.
- Do NOT call party-service gRPC to validate `party_id` at membership create; accept caller-provided value.
- Do NOT use raw DB clients directly outside `src/persistence/ltree.repository.ts`.
