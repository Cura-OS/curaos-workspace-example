// scripts/lib/workflow-properties.test.js
// RP-59: fast-check property tests for the pure workflow function families:
//   1. label state machine (triage-status.js: statusFromTriage / projectFieldsForSync)
//   2. filter predicates (workflow-common.js failure classifiers, merge-hygiene.js
//      grillShaMismatch / mergeCleanVerdict, parseArgs)
//   3. frontmatter parsers (workflow-common.js parseFrontmatter / unquote)
// Each property runs 100 adversarial cases (NUM_RUNS). A deliberately seeded predicate bug at
// the bottom proves the properties have teeth (fc.check must FAIL it).
// Runner: bun test (just ci -> test-js). Dependency: fast-check (exact-pinned, package.json).
const { test, expect } = require("bun:test");
const assert = require("node:assert/strict");
const fc = require("fast-check");

const { statusFromTriage, projectFieldsForSync } = require("./triage-status.js");
const common = require("./workflow-common.js");
const { grillShaMismatch, mergeCleanVerdict } = require("./merge-hygiene.js");

const NUM_RUNS = 100;
const runs = { numRuns: NUM_RUNS };

// ---- arbitraries ----

const stateLabelArb = fc.constantFrom(
  "ready-for-agent", "ready-for-human", "needs-triage", "needs-info", "wontfix",
  "", "bug", "enhancement", "foresight", undefined
);

const triageArb = fc.record(
  {
    has_blocked_marker: fc.constantFrom(true, false, undefined, "yes"),
    blocker_kind: fc.constantFrom("real", "speculative", "", undefined),
    state_label: stateLabelArb,
    has_foresight_marker: fc.constantFrom(true, false, undefined),
    project_fields: fc.option(
      fc.dictionary(fc.constantFrom("Priority", "Effort", "Milestone", "Status", "Kind"), fc.string()),
      { nil: undefined }
    ),
  },
  { requiredKeys: [] }
);

// hex alphabet noise: cannot spell any classifier trigger phrase ("gateway", "http", "status",
// "unknown owner type", "rate limit"... all need letters outside 0-9a-f or spaces), so wrapping
// a known trigger in hex noise must never change the classification.
const hexNoiseArb = fc.string({ unit: fc.constantFrom(..."0123456789abcdef".split("")), maxLength: 24 });

const sha40Arb = fc.string({ unit: fc.constantFrom(..."0123456789abcdef".split("")), minLength: 40, maxLength: 40 });

const gateArb = fc.record({
  lensBlock: fc.boolean(),
  lensChanges: fc.boolean(),
  grillVerdict: fc.constantFrom("merge-ok", "issues-found", "block", "skipped-harness-unavailable"),
  grillBlockedHarnessUnavailable: fc.boolean(),
  grillShaBlocked: fc.boolean(),
  checksGreen: fc.boolean(),
  threadsResolved: fc.boolean(),
  needsHumanOpen: fc.boolean(),
  unattended: fc.boolean(),
});

const fmKeyArb = fc.stringMatching(/^[A-Za-z][A-Za-z0-9_-]{0,9}$/);
// scalar values that survive the parser's trim/unquote untouched: alphanumeric edges, no
// surrounding quotes, never the literal "[]"
const fmValueArb = fc.stringMatching(/^[A-Za-z0-9]([A-Za-z0-9 _./-]{0,18}[A-Za-z0-9])?$/);

// ---- 1. label state machine ----

test("property: statusFromTriage total over adversarial triage shapes, codomain fixed", () => {
  const STATUSES = ["", "Blocked", "Ready", "Backlog"];
  fc.assert(fc.property(triageArb, (t) => STATUSES.includes(statusFromTriage(t))), runs);
  expect(statusFromTriage(null)).toBe("");
  expect(statusFromTriage(undefined)).toBe("");
});

test("property: Blocked dominates every other triage signal", () => {
  fc.assert(fc.property(triageArb, fc.boolean(), (t, viaMarker) => {
    const blocked = viaMarker ? { ...t, has_blocked_marker: true } : { ...t, blocker_kind: "real" };
    return statusFromTriage(blocked) === "Blocked";
  }), runs);
});

test("property: Ready exactly for ready-* labels when not blocked", () => {
  fc.assert(fc.property(triageArb, (t) => {
    const blocked = t.has_blocked_marker === true || t.blocker_kind === "real";
    if (blocked) return true;
    const isReadyLabel = t.state_label === "ready-for-agent" || t.state_label === "ready-for-human";
    return (statusFromTriage(t) === "Ready") === isReadyLabel;
  }), runs);
});

test("property: projectFieldsForSync threads Status without erasing or mutating fields", () => {
  fc.assert(fc.property(triageArb, (t) => {
    const beforeEntries = Object.entries((t && t.project_fields) || {});
    const fields = projectFieldsForSync(t);
    const status = statusFromTriage(t);
    // Status derives when nonempty, else passes through the original (possibly absent) value
    if (status) assert.equal(fields.Status, status);
    else assert.equal(fields.Status, ((t && t.project_fields) || {}).Status);
    // every non-Status input field survives untouched; the input map is not mutated
    for (const [key, value] of beforeEntries) {
      if (key !== "Status" || !status) assert.equal(fields[key], value);
    }
    assert.deepEqual(Object.entries((t && t.project_fields) || {}), beforeEntries);
    if (t && t.project_fields) assert.notEqual(fields, t.project_fields);
    return true;
  }), runs);
});

// ---- 2. filter predicates ----

test("property: failure classifiers are total with fixed kind vocabularies", () => {
  const KINDS = {
    externalFailureKind: ["", "github-graphql-quota", "github-project-api-transient"],
    externalIssueFailureKind: ["", "github-graphql-quota", "github-api-transient"],
    externalRestFailureKind: ["", "github-rest-quota", "github-rest-unavailable", "github-rest-not-found", "github-api-transient"],
  };
  fc.assert(fc.property(fc.string(), (message) => {
    for (const [name, kinds] of Object.entries(KINDS)) {
      if (!kinds.includes(common[name](message))) return false;
    }
    return typeof common.isTransientGithubFailure(message) === "boolean";
  }), runs);
});

test("property: quota phrases dominate the GraphQL classifiers under arbitrary hex noise", () => {
  fc.assert(fc.property(hexNoiseArb, hexNoiseArb, (prefix, suffix) => {
    const message = `${prefix} graphql rate limit ${suffix}`;
    return common.externalFailureKind(message) === "github-graphql-quota"
      && common.externalIssueFailureKind(message) === "github-graphql-quota";
  }), runs);
});

test("property: transient markers classify transient, pure hex noise classifies empty", () => {
  fc.assert(fc.property(hexNoiseArb, hexNoiseArb, (prefix, suffix) => {
    const transient = `${prefix} bad gateway ${suffix}`;
    return common.isTransientGithubFailure(transient) === true
      && common.externalFailureKind(transient) === "github-project-api-transient"
      && common.externalIssueFailureKind(transient) === "github-api-transient"
      && common.isTransientGithubFailure(prefix) === false
      && common.externalFailureKind(prefix) === "";
  }), runs);
});

test("property: grillShaMismatch accepts only equal 40-hex shas (case-insensitive), fails closed otherwise", () => {
  fc.assert(fc.property(sha40Arb, fc.boolean(), (sha, upper) => {
    const head = upper ? sha.toUpperCase() : sha;
    return grillShaMismatch({ verified_sha: sha }, head) === false;
  }), runs);
  fc.assert(fc.property(sha40Arb, sha40Arb, (a, b) => {
    fc.pre(a !== b);
    return grillShaMismatch({ verified_sha: a }, b) === true;
  }), runs);
  fc.assert(fc.property(fc.string({ maxLength: 39 }), sha40Arb, (bad, sha) => {
    return grillShaMismatch({ verified_sha: bad }, sha) === true && grillShaMismatch({ verified_sha: sha }, bad) === true;
  }), runs);
});

test("property: mergeCleanVerdict is monotone (worsening any signal never improves the verdict)", () => {
  const RANK = { block: 0, "changes-requested": 1, "merge-ok": 2 };
  const WORSEN = [
    (g) => ({ ...g, lensBlock: true }),
    (g) => ({ ...g, lensChanges: true }),
    (g) => ({ ...g, grillVerdict: "block" }),
    (g) => ({ ...g, grillBlockedHarnessUnavailable: true }),
    (g) => ({ ...g, grillShaBlocked: true }),
    (g) => ({ ...g, checksGreen: false }),
    (g) => ({ ...g, threadsResolved: false }),
    (g) => ({ ...g, needsHumanOpen: true }),
    (g) => ({ ...g, unattended: true }),
  ];
  fc.assert(fc.property(gateArb, fc.nat({ max: WORSEN.length - 1 }), (gate, i) => {
    const before = RANK[mergeCleanVerdict(gate)];
    const after = RANK[mergeCleanVerdict(WORSEN[i](gate))];
    return Number.isInteger(before) && Number.isInteger(after) && after <= before;
  }), runs);
});

test("property: mergeCleanVerdict hard invariants (unproven checks block; unattended thread-dirt blocks)", () => {
  fc.assert(fc.property(gateArb, (gate) => {
    const verdict = mergeCleanVerdict(gate);
    if (gate.checksGreen !== true && verdict !== "block") return false;
    if (gate.unattended && (!gate.threadsResolved || gate.needsHumanOpen) && verdict !== "block") return false;
    if (verdict === "merge-ok" && (!gate.threadsResolved || gate.needsHumanOpen)) return false;
    return true;
  }), runs);
});

test("property: parseArgs agrees with JSON.parse on valid JSON and never throws on garbage", () => {
  fc.assert(fc.property(fc.jsonValue(), (value) => {
    const text = JSON.stringify(value);
    assert.deepEqual(common.parseArgs(text), JSON.parse(text));
    return true;
  }), runs);
  fc.assert(fc.property(fc.string(), (text) => {
    const out = common.parseArgs(text); // must not throw; unparsable coerces to {}
    let parsable = false;
    try { JSON.parse(text); parsable = text.trim().length > 0; } catch { parsable = false; }
    return parsable || (typeof out === "object" && out !== null && Object.keys(out).length === 0);
  }), runs);
  fc.assert(fc.property(fc.object(), (o) => common.parseArgs(o) === o), runs);
});

// ---- 3. frontmatter parsers ----

function renderFrontmatter(entries) {
  const lines = ["---"];
  for (const [key, value] of entries) {
    if (Array.isArray(value)) {
      lines.push(`${key}:`);
      for (const item of value) lines.push(`  - ${item}`);
    } else {
      lines.push(`${key}: ${value}`);
    }
  }
  lines.push("---", "", "body text");
  return lines.join("\n");
}

const fmEntriesArb = fc.uniqueArray(
  fc.tuple(fmKeyArb, fc.oneof(fmValueArb, fc.array(fmValueArb, { minLength: 1, maxLength: 4 }))),
  { minLength: 1, maxLength: 5, selector: (entry) => entry[0] }
);

test("property: parseFrontmatter round-trips rendered scalar + list frontmatter", () => {
  fc.assert(fc.property(fmEntriesArb, (entries) => {
    const parsed = common.parseFrontmatter(renderFrontmatter(entries));
    assert.deepEqual(parsed, Object.fromEntries(entries));
    return true;
  }), runs);
});

test("property: parseFrontmatter round-trips quoted scalars to their unquoted value", () => {
  fc.assert(fc.property(fmKeyArb, fmValueArb, fc.constantFrom('"', "'"), (key, value, quote) => {
    const parsed = common.parseFrontmatter(`---\n${key}: ${quote}${value}${quote}\n---\n`);
    return parsed[key] === value;
  }), runs);
});

test("property: parseFrontmatter is total and inert without a leading fence", () => {
  fc.assert(fc.property(fc.string(), (body) => {
    const out = common.parseFrontmatter(body); // must never throw
    if (typeof out !== "object" || out === null) return false;
    if (!String(body).startsWith("---")) return Object.keys(out).length === 0;
    return true;
  }), runs);
  fc.assert(fc.property(fmKeyArb, fmValueArb, (key, value) => {
    // unclosed fence parses to {} (fail-closed, the RP-23 convention)
    return Object.keys(common.parseFrontmatter(`---\n${key}: ${value}\n`)).length === 0;
  }), runs);
});

// ---- seeded predicate bug: the property suite must catch it (RP-59 acceptance) ----

test("seeded bug: truthy-condition Ready predicate is caught by the Ready-label property", () => {
  function statusFromTriageSeededBug(triage) {
    if (!triage) return "";
    if (triage.has_blocked_marker === true || triage.blocker_kind === "real") return "Blocked";
    // BUG under test: `|| "ready-for-human"` is always truthy, so every non-blocked issue
    // reads Ready (the classic truthy-or predicate slip this suite exists to catch).
    if (triage.state_label === "ready-for-agent" || "ready-for-human") return "Ready";
    if (triage.has_foresight_marker === true) return "Backlog";
    return "";
  }
  const nonReadyTriageArb = fc.record({
    state_label: fc.constantFrom("needs-triage", "needs-info", "wontfix", "", undefined),
    has_blocked_marker: fc.constant(false),
    blocker_kind: fc.constantFrom("", "speculative", undefined),
  });
  const readyLabelProperty = (impl) => fc.property(nonReadyTriageArb, (t) => impl(t) !== "Ready");
  // the REAL predicate satisfies the property...
  fc.assert(readyLabelProperty(statusFromTriage), runs);
  // ...the seeded bug is caught (fc.check reports failure with a counterexample)
  const caught = fc.check(readyLabelProperty(statusFromTriageSeededBug), runs);
  expect(caught.failed).toBe(true);
  expect(caught.counterexample).toBeTruthy();
});
