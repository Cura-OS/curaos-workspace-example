// scripts/lib/workflow-common.test.js
// RP-21: behavior battery for the consolidated micro-helpers. Cross-file byte-equality pins
// (inline copies in Claude-style executors == this lib) live in
// scripts/workflow-truth-contract.test.js (queued via .scratch/integration-queue/rp-21.md;
// that file is owned by the dedicated migration lane). Runner: bun test (just test-js).
const { test, expect } = require("bun:test");

const common = require("./workflow-common.js");
const issueSpec = require("./issue-spec.js");

// ---- parseArgs (19-copy family) ----

test("parseArgs passes objects through, parses JSON strings, coerces garbage to {}", () => {
  const obj = { pr: "o/r#1" };
  expect(common.parseArgs(obj)).toBe(obj);
  expect(common.parseArgs('{"a":1}')).toEqual({ a: 1 });
  expect(common.parseArgs("not json")).toEqual({});
  expect(common.parseArgs("")).toEqual({});
  expect(common.parseArgs("   ")).toEqual({});
  expect(common.parseArgs(null)).toEqual({});
  expect(common.parseArgs(undefined)).toEqual({});
  expect(common.parseArgs(42)).toEqual({});
  // JSON scalars parse to their value (matches every inline copy's behavior)
  expect(common.parseArgs("3")).toBe(3);
});

// ---- parseFrontmatter (4-copy family; issue-spec semantics are canonical) ----

test("parseFrontmatter handles scalars, quoted scalars, [] scalars, and block lists", () => {
  const body = [
    "---",
    "module: identity-service",
    'effort: "S"',
    "adr_refs: []",
    "owned_paths:",
    '  - "scripts/lib/a.js"',
    "  - scripts/lib/b.js",
    "---",
    "body text",
  ].join("\n");
  const fm = common.parseFrontmatter(body);
  expect(fm.module).toBe("identity-service");
  expect(fm.effort).toBe("S");
  expect(fm.adr_refs).toEqual([]);
  expect(fm.owned_paths).toEqual(["scripts/lib/a.js", "scripts/lib/b.js"]);
});

test("parseFrontmatter is total: no fence, unclosed fence, null, CRLF all return objects", () => {
  expect(common.parseFrontmatter("no fence here")).toEqual({});
  expect(common.parseFrontmatter("---\nkey: value\n(no closing fence)")).toEqual({});
  expect(common.parseFrontmatter(null)).toEqual({});
  expect(common.parseFrontmatter(undefined)).toEqual({});
  expect(common.parseFrontmatter("---\r\nkey: value\r\n---\r\n")).toEqual({ key: "value" });
});

test("parseFrontmatter list items stay strings (issue-spec semantics; a '- []' item is the string)", () => {
  const fm = common.parseFrontmatter("---\nitems:\n  - []\n  - 'quoted'\n---");
  expect(fm.items).toEqual(["[]", "quoted"]);
});

test("issue-spec re-exports the canonical parser (single lib owner)", () => {
  expect(issueSpec.parseFrontmatter).toBe(common.parseFrontmatter);
});

// ---- isTransientGithubFailure (5-copy family) ----

test("isTransientGithubFailure matches 5xx/gateway/unicorn shapes and rejects client errors", () => {
  for (const transient of [
    "HTTP 502 from api.github.com",
    "status 503",
    "non-200 status 500",
    "Gateway Timeout",
    "bad gateway",
    "Service Unavailable",
    "GitHub service is down",
    "github sent a unicorn page",
  ]) expect(common.isTransientGithubFailure(transient)).toBe(true);
  for (const hard of ["HTTP 404 not found", "HTTP 403 forbidden", "parse error", "", null, undefined]) {
    expect(common.isTransientGithubFailure(hard)).toBe(false);
  }
});

// ---- externalFailureKind flavors (5 copies, 3 behavior families) ----

test("externalFailureKind (GraphQL/Projects flavor): quota dominates, transient routes to project-api-transient", () => {
  expect(common.externalFailureKind("Unknown owner type for project")).toBe("github-graphql-quota");
  expect(common.externalFailureKind("GraphQL: API rate limit exceeded")).toBe("github-graphql-quota");
  expect(common.externalFailureKind("rate limit hit calling api")).toBe("github-graphql-quota");
  expect(common.externalFailureKind("HTTP 502 bad gateway")).toBe("github-project-api-transient");
  expect(common.externalFailureKind("github-project-api-transient (carried marker)")).toBe("github-project-api-transient");
  expect(common.externalFailureKind("validation failed on field X")).toBe("");
});

test("externalIssueFailureKind (issue-ops flavor): transient routes to the generic kind", () => {
  expect(common.externalIssueFailureKind("unknown owner type")).toBe("github-graphql-quota");
  expect(common.externalIssueFailureKind("graphql quota exhausted")).toBe("github-graphql-quota");
  expect(common.externalIssueFailureKind("HTTP 503 service unavailable")).toBe("github-api-transient");
  expect(common.externalIssueFailureKind("label not found")).toBe("");
});

test("externalRestFailureKind (REST flavor): quota, 401/403/404 to unavailable, digit-free not-found, transient", () => {
  expect(common.externalRestFailureKind("REST rate limit exceeded")).toBe("github-rest-quota");
  expect(common.externalRestFailureKind("HTTP 401 unauthorized")).toBe("github-rest-unavailable");
  expect(common.externalRestFailureKind("HTTP 403 resource not accessible")).toBe("github-rest-unavailable");
  // Preserved quirk: "404" matches the 40[134] rule first (documented in the lib, not a fix site)
  expect(common.externalRestFailureKind("HTTP 404")).toBe("github-rest-unavailable");
  expect(common.externalRestFailureKind("issue was not found")).toBe("github-rest-not-found");
  expect(common.externalRestFailureKind("gateway timeout")).toBe("github-api-transient");
  expect(common.externalRestFailureKind("schema mismatch")).toBe("");
});
