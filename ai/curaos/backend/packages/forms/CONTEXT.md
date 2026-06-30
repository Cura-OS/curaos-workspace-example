# @curaos/forms — Agent Context

## Quick facts
- Schema formats: JSON Schema (primary) + FHIR Questionnaire (HealthStack)
- Field types: text, number, date, select, multi-select, checkbox, file, signature, section, repeat-group
- RN: NativeFormRenderer supports subset (no file/signature in v1 RN)
- Validation: Zod + JSON Schema; async validation hooks

## Key files
- `src/web/FormRenderer.tsx` — web form renderer
- `src/web/FormBuilder.tsx` — visual form schema editor
- `src/native/NativeFormRenderer.tsx` — RN form renderer
- `src/hooks/useFhirQuestionnaire.ts` — FHIR Questionnaire hook
- `src/schema/` — FormSchema types + Zod schemas
- `src/validation.ts` — validateForm
- `src/fields/` — per-field-type components

## Agent rules
- FHIR Questionnaire support lives in `src/fhir/`; neutral form logic must not import FHIR types directly.
- Signature capture: never transmit raw canvas blob in form data; always convert to base64 before submit.
- Run `bunx turbo run build lint test storybook:build` before marking done.
