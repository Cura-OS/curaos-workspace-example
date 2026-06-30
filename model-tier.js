// model-tier - derive the Claude Code model tier for the IMPLEMENTATION agent from the
// resolved issue_spec, per [[curaos-model-tiering-rule]] + the user's OPUS-BIAS policy
// (2026-05-29): default Opus (fewer iterations, cheaper net than a Sonnet loop); downgrade to
// Sonnet ONLY when the task is proven-simple; Haiku ONLY for pure-mechanical. Escalate to
// OPUS for architecture-defining work: XL effort AND ADR-involved (a wrong structural call cascades).
//
// Used by context-load (to emit recommended_model) + tdd-implement (opus-default fallback).
// Pure function, no side effects - safe to require from any workflow executor.

const MECHANICAL_VERB_RE = /\b(rename|reformat|format|lint|sort imports|bump version|typo|whitespace)\b/i;

// RP-21: the LOGICAL model-tier catalog, single source. Workflow contracts speak these tiers
// only (never raw model ids - non-Claude harnesses map tiers to their own native models, and
// raw ids passed cross-harness produce schema-default no-op results, workflow-defect #508).
// tdd-implement's impl_model whitelist and any tier validation MUST match this list;
// ai/rules/curaos_model_tiering_rule.md links here instead of carrying its own copy.
const MODEL_TIERS = ["opus", "sonnet", "haiku"];

/** True iff value is one of the logical tiers in MODEL_TIERS. */
function isModelTier(value) {
  return MODEL_TIERS.includes(value);
}

/**
 * Pick the implement-agent model tier.
 *
 * OPUS by default. Downgrade to SONNET only when ALL proven-simple signals hold:
 *   effort === "S" AND owned_paths.length <= 1 AND adr_refs.length === 0
 *   AND the acceptance reads as a literal apply-as-is checklist (no design latitude).
 * Downgrade to HAIKU only when the scope is pure-mechanical (rename/format/lint, no new logic).
 * Keep OPUS for architecture-defining work: effort === "XL" AND adr_refs.length > 0.
 * When ANY signal is missing or uncertain → OPUS (the user bias).
 *
 * @param {object} issueSpec  resolved issue_spec from context-load: { effort, owned_paths[], acceptance[], adr_refs[] }
 * @param {string} [scopeHint] optional free-text scope hint
 * @returns {"opus"|"sonnet"|"haiku"}
 */
function pickImplementModel(issueSpec, scopeHint) {
  const spec = issueSpec || {};
  const owned = Array.isArray(spec.owned_paths) ? spec.owned_paths.filter(Boolean) : [];
  const adrs = Array.isArray(spec.adr_refs) ? spec.adr_refs.filter(Boolean) : [];
  const acceptance = Array.isArray(spec.acceptance) ? spec.acceptance : [];
  const effort = typeof spec.effort === "string" ? spec.effort.trim().toUpperCase() : "";
  const hint = `${scopeHint || ""} ${acceptance.join(" ")}`.trim();

  // Pure-mechanical → haiku. ONLY when the scope is clearly mechanical AND tiny AND no ADR.
  const mechanical = MECHANICAL_VERB_RE.test(hint);
  if (mechanical && effort === "S" && owned.length <= 1 && adrs.length === 0) {
    return "haiku";
  }

  // Proven-simple → sonnet. ALL must hold; any miss/uncertainty falls through to opus.
  const provenSimple =
    effort === "S" &&
    owned.length <= 1 &&
    adrs.length === 0 &&
    acceptance.length > 0; // an explicit apply-as-is checklist exists (no design latitude)
  if (provenSimple) {
    return "sonnet";
  }

  // Architecture-defining stays on opus, the strongest available live tier.
  if (effort === "XL" && adrs.length > 0) {
    return "opus";
  }

  // Default: OPUS (architecture/multi-file/ADR-involved/uncertain - the user bias).
  return "opus";
}

/**
 * The recommended_model field context-load emits - same derivation, exposed for the resolver.
 * @returns {"opus"|"sonnet"|"haiku"}
 */
function recommendImplementModel(issueSpec, scopeHint) {
  return pickImplementModel(issueSpec, scopeHint);
}

module.exports = { MODEL_TIERS, isModelTier, pickImplementModel, recommendImplementModel };
