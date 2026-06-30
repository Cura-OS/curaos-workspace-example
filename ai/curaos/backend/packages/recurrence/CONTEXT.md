# @curaos/recurrence — Agent Context

## Quick facts
- Pure computation; zero external runtime deps
- RFC 5545 RRULE subset; timezone-aware
- Used by personal-calendar, business-workflow SLA scheduling

## Key files
- `src/parse.ts` — parseRRule
- `src/generate.ts` — generateRRule
- `src/expand.ts` — expandOccurrences + nextOccurrence
- `src/types.ts` — RecurrenceRule
- `src/hooks/useRecurrence.ts` — React hook

## Agent rules
- No external date library dependency; use native Date or Temporal polyfill only.
- Expand occurrences must impose a hard upper limit (default 1000) to prevent infinite loops.
- Run `bunx turbo run build lint test` before marking done.
