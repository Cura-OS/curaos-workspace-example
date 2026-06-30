// workflow-common - SINGLE owner of the micro-helpers every workflow executor copies inline
// (RP-21: reuse-DRY canonical owners; the KEEP-IN-SYNC inline copies are the drift class,
// extraction is the guard - same mechanism as triage-status.js / merge-hygiene.js from RP-20).
//
// Families consolidated here:
//   - parseArgs            (19 inline copies; 16 byte-identical, 2 cosmetic variants normalized)
//   - parseFrontmatter     (4 copies: lib/issue-spec.js canonical + roadmap-project-item-sync.js
//                           + gh-issue-triage + wave-prioritize; issue-spec semantics win)
//   - isTransientGithubFailure (5 byte-identical copies: gh-project.js, dep-graph.js,
//                           gh-issue-triage, context-load, milestone-active-scan)
//   - externalFailureKind  (5 copies in 3 behavior families, each kept as its own named export:
//                           externalFailureKind = GraphQL/Projects flavor [pm-triage-gate,
//                           gh-project-sync, milestone-wave], externalIssueFailureKind =
//                           gh-issue-triage flavor, externalRestFailureKind = context-load
//                           flavor. The flavors return DIFFERENT kind vocabularies on purpose;
//                           merging them into one function would change retry/fail-closed
//                           routing in the consumers.)
//
// Consumption modes (dual-runtime constraint, workflow-defect #508):
//   - default-export executors lazy-require this module via createRequire(import.meta.url)
//     inside the function body - a DIRECT import, no inline copy.
//   - Claude-style top-level bodies run under `new Function` harnesses where neither require()
//     nor import.meta exists, so they keep INLINE copies. Those copies MUST stay byte-identical
//     to the functions below (modulo the function NAME for the flavor variants);
//     scripts/workflow-truth-contract.test.js pins the equality (extractFunction) and executes
//     the behavior from THIS module.
//
// Pure functions, no side effects - safe to require from any workflow executor or script.

// Workflow args arrive as an object (native harness) or a JSON string (CLI / cross-harness).
// Anything unparsable coerces to {} so every executor starts from a defined config shape.
function parseArgs(a) {
  if (a && typeof a === "object") return a;
  if (typeof a === "string" && a.trim()) { try { return JSON.parse(a); } catch { return {}; } }
  return {};
}

function unquote(value) {
  const v = String(value || "").trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) return v.slice(1, -1);
  return v;
}

function parseFrontmatterValue(value) {
  const parsed = unquote(value);
  return parsed === "[]" ? [] : parsed;
}

// Issue-body YAML frontmatter subset: `key: scalar`, `key: []`, and block lists
// (`key:` followed by `  - item` lines). Scalar "[]" maps to an empty array; list ITEMS are
// unquoted strings (a literal "- []" item stays the string "[]" - issue-spec semantics).
// Total function: any input (including no/unclosed fence) returns an object, never throws.
function parseFrontmatter(body) {
  const match = String(body || "").match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  const out = {};
  let listKey = null;
  for (const raw of match[1].split(/\r?\n/)) {
    const line = raw.trimEnd();
    const keyMatch = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (keyMatch) {
      listKey = null;
      const key = keyMatch[1];
      const value = parseFrontmatterValue(keyMatch[2]);
      out[key] = value;
      if (keyMatch[2].trim() === "") {
        out[key] = [];
        listKey = key;
      }
      continue;
    }
    const itemMatch = line.trim().match(/^-\s*(.*)$/);
    if (listKey && itemMatch) out[listKey].push(unquote(itemMatch[1]));
  }
  return out;
}

function isTransientGithubFailure(text) {
  return /(?:\bhttp\s*5\d\d\b|\bstatus\s*5\d\d\b|\bnon-200\s+status\s+5\d\d\b|gateway timeout|bad gateway|service unavailable|github\s+service|github.*unicorn|unicorn.*github)/i.test(String(text || ""));
}

// GraphQL/Projects-API flavor (pm-triage-gate, gh-project-sync, milestone-wave): classifies a
// failure message for the project-sync retry/fail-closed routing. Kind vocabulary:
// "github-graphql-quota" | "github-project-api-transient" | "" (= not external, do not retry).
function externalFailureKind(message) {
  if (/unknown owner type/i.test(message)) return "github-graphql-quota";
  if (/(?:graphql|api).*(?:rate limit|quota)|(?:rate limit|quota).*(?:graphql|api)/i.test(message)) return "github-graphql-quota";
  if (/github-project-api-transient|\bhttp\s*5\d\d\b|\bstatus\s*5\d\d\b|\bnon-200\s+status\s+5\d\d\b|gateway timeout|bad gateway|service unavailable|github\s+service|github.*unicorn|unicorn.*github/i.test(message)) return "github-project-api-transient";
  return "";
}

// Issue-ops flavor (gh-issue-triage): same quota rules, transient routes to the generic
// "github-api-transient" kind. The inline copy keeps the name `externalFailureKind`; the
// truth-contract pins body-equality after a name swap.
function externalIssueFailureKind(message) {
  if (/unknown owner type/i.test(message)) return "github-graphql-quota";
  if (/(?:graphql|api).*(?:rate limit|quota)|(?:rate limit|quota).*(?:graphql|api)/i.test(message)) return "github-graphql-quota";
  if (isTransientGithubFailure(message)) return "github-api-transient";
  return "";
}

// REST flavor (context-load): classifies the deterministic REST prefetch failures. NOTE
// (preserved behavior, not a fix site): the 40[134] rule precedes the 404 rule, so a message
// carrying "404" yields "github-rest-unavailable"; "github-rest-not-found" is reachable only
// via digit-free "not found" text. The inline copy keeps the name `externalFailureKind`.
function externalRestFailureKind(message) {
  if (/(?:rest|api).*(?:rate limit|quota)|(?:rate limit|quota).*(?:rest|api)/i.test(message)) return "github-rest-quota";
  if (/\b(?:http\s*)?40[134]\b|authentication|unauthorized|forbidden|permission|resource not accessible/i.test(message)) return "github-rest-unavailable";
  if (/\b(?:http\s*)?404\b|not found/i.test(message)) return "github-rest-not-found";
  if (isTransientGithubFailure(message)) return "github-api-transient";
  return "";
}

module.exports = {
  parseArgs,
  unquote,
  parseFrontmatterValue,
  parseFrontmatter,
  isTransientGithubFailure,
  externalFailureKind,
  externalIssueFailureKind,
  externalRestFailureKind,
};
