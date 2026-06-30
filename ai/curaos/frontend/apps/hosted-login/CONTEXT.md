# hosted_login — Agent Context

## Status: DEPRECATED

Superseded by CuraOS Auth portal (ADR-0120). Do not add features or fix bugs here.

## Agent rules
- Reject any change that adds code to this package.
- For login issues, redirect work to `auth-portal` (identity-core-service team).
- Track migration via Requirements.md Done criteria.
- On final cutover: delete package directory, update workspace `package.json`, update AGENTS.md module list.
