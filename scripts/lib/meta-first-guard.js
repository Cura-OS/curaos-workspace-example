// Canonical meta-first guard for workflow executors (workflow-defect #508).
// Single owner consumed by scripts/check-workflow-portability.js (CI gate) AND
// scripts/workflow-truth-contract.test.js (in-suite regression guard) so the two never drift.
//
// Claude's Workflow() tool reads `export const meta` as a STATIC object literal and provides no
// process/require during metadata loading. Therefore every *.workflow.js must open with
// `export const meta = { ... }` (a PURE object literal) as its first code statement. A call,
// identifier, or any other expression RHS (e.g. `export const meta = buildMeta()`) defeats the
// loader contract and would ReferenceError at load if it touched process/require.

// The first code statement of a workflow source, with leading line/block comments + blank lines
// stripped. Returns up to 120 chars so callers can inspect both the `export const meta =` head and
// the first non-whitespace char of the RHS.
function firstCodeStatement(text) {
  let i = 0;
  const n = text.length;
  while (i < n) {
    // skip whitespace
    while (i < n && /\s/.test(text[i])) i += 1;
    if (i >= n) break;
    // skip line comment
    if (text[i] === "/" && text[i + 1] === "/") {
      while (i < n && text[i] !== "\n") i += 1;
      continue;
    }
    // skip block comment
    if (text[i] === "/" && text[i + 1] === "*") {
      i += 2;
      while (i < n && !(text[i] === "*" && text[i + 1] === "/")) i += 1;
      i += 2;
      continue;
    }
    break;
  }
  return text.slice(i, i + 120);
}

// Classify a workflow source against the meta-first contract.
// "" = ok; "meta-not-first" = the first statement is not `export const meta =`;
// "meta-rhs-not-literal" = meta is first but its RHS is not a pure object literal (`{`).
function metaFirstProblem(text) {
  const head = firstCodeStatement(text);
  const metaDecl = head.match(/^export\s+const\s+meta\s*=\s*/);
  if (!metaDecl) return "meta-not-first";
  if (head[metaDecl[0].length] !== "{") return "meta-rhs-not-literal";
  return "";
}

module.exports = { firstCodeStatement, metaFirstProblem };
