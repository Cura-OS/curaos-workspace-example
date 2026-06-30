// lens-review - one lens (Security|Architecture|QA) of the T2 3-lens code review. Read-only atomic.
// Contract: docs/agents/workflows/lens-review.md
export const meta = {
  name: "lens-review",
  description: "One lens of the T2 multi-model code review (Security|Architecture|QA)",
  phases: [{ title: "Review", detail: "single-lens read-only review of a diff/PR" }],
};

const CONTRACT = {
  name: "lens-review",
  kind: "atomic",
  version: "0.1.0",
  inputs: {
    lens: { type: "string", required: true, description: "Security | Architecture | QA" },
    pr: { type: "string", required: false, description: "owner/repo#N PR, if reviewing a PR" },
    diff_ref: { type: "string", required: false, description: "git ref/range to diff (default working tree)" },
  },
  outputs: {
    lens: { type: "string", description: "the lens reviewed" },
    findings: { type: "array", description: "issues found by this lens" },
    verdict: { type: "string", description: "pass | changes-requested | block" },
  },
  guarantees: { idempotent: true, determinism: "control-flow-only", side_effects: "none" },
  verification: "T2",
  models: { review: "opus" },
  composes: [],
};

const ROOT = ".";
function parseArgs(a) {
  if (a && typeof a === "object") return a;
  if (typeof a === "string" && a.trim()) { try { return JSON.parse(a); } catch { return {}; } }
  return {};
}

const LENS_FOCUS = {
  Security: "auth, input handling, PHI boundary (HealthStack), secrets, OWASP-class bugs (SSRF/SQLi/unsafe eval), tenant isolation. Use semgrep where useful.",
  Architecture: "pattern compliance, dependency direction (vertical→neutral never reverse), coupling, premature abstraction, contract/API integrity, codegraph_impact for blast radius.",
  QA: "test coverage gaps, weak assertions, brittle implementation-coupled tests, missing edge cases, mutation-survivability.",
};

phase("Review");
const cfg = parseArgs(typeof args !== "undefined" ? args : undefined);
if (!cfg.lens || !LENS_FOCUS[cfg.lens]) throw new Error(`lens-review: args.lens must be one of ${Object.keys(LENS_FOCUS).join("|")}`);

const diffCmd = cfg.pr
  ? `gh pr diff ${cfg.pr}`
  : (cfg.diff_ref ? `git diff ${cfg.diff_ref}` : "git diff HEAD");

const result = await agent(
  `You are the ${cfg.lens} reviewer in the CuraOS T2 3-lens code review. Work from ${ROOT}. Review the diff via \`${diffCmd}\` (Bash). Read-only - do NOT edit.
FOCUS (${cfg.lens}): ${LENS_FOCUS[cfg.lens]}
Per [[curaos-verification-stack-rule]]. Report only real, evidenced issues (quote file:line). Verdict: "block" for an exploitable/correctness/boundary violation; "changes-requested" for fixable issues; "pass" if clean for this lens.
Return: lens="${cfg.lens}", findings (each {file, severity, problem, fix}), verdict.`,
  { label: `lens:${cfg.lens}`, phase: "Review", model: CONTRACT.models.review, schema: {
    type: "object",
    required: ["lens", "findings", "verdict"],
    properties: {
      lens: { type: "string" },
      findings: { type: "array", items: { type: "object", required: ["file", "severity", "problem", "fix"], properties: {
        file: { type: "string" }, severity: { type: "string", enum: ["critical", "high", "medium", "low"] }, problem: { type: "string" }, fix: { type: "string" } } } },
      verdict: { type: "string", enum: ["pass", "changes-requested", "block"] },
    },
  } }
);

return result;
