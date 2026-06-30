#!/usr/bin/env node
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeIssueRef,
  parseIssueRef,
  parseIssueRefOrUrl,
  parsePrRef,
} = require("./gh-ref.js");

test("parseIssueRef parses owner/repo issue refs and rejects dot paths", () => {
  assert.deepEqual(parseIssueRef("your-org/curaos-ai-workspace#373", { source: "test" }), {
    repo: "your-org/curaos-ai-workspace",
    number: "373",
  });
  assert.throws(
    () => parseIssueRef("../curaos-ai-workspace#373", { source: "test" }),
    /owner\/repo segments cannot be dot paths/,
  );
});

test("parsePrRef parses owner/repo PR refs and rejects malformed refs", () => {
  assert.deepEqual(parsePrRef("your-org/curaos-ai-workspace#673", { source: "test" }), {
    slug: "your-org/curaos-ai-workspace",
    number: "673",
  });
  assert.throws(
    () => parsePrRef("673", { source: "test" }),
    /expected owner\/repo#N/,
  );
});

test("normalizeIssueRef accepts issue URLs and embedded refs while dropping unsafe refs", () => {
  assert.equal(
    normalizeIssueRef("https://github.com/your-org/curaos-ai-workspace/issues/407"),
    "your-org/curaos-ai-workspace#407",
  );
  assert.equal(
    normalizeIssueRef("parent: your-org/curaos-ai-workspace#373"),
    "your-org/curaos-ai-workspace#373",
  );
  assert.equal(normalizeIssueRef("https://github.com/../curaos-ai-workspace/issues/407"), "");
  assert.equal(normalizeIssueRef("parent: ../curaos-ai-workspace#373"), "");
  assert.equal(normalizeIssueRef("none"), "");
});

test("parseIssueRefOrUrl preserves subissue workflow return shape", () => {
  assert.deepEqual(
    parseIssueRefOrUrl("https://github.com/your-org/curaos-ai-workspace/issues/407", {
      source: "test",
      fieldName: "parent",
    }),
    {
      owner: "your-org",
      repoName: "curaos-ai-workspace",
      repo: "your-org/curaos-ai-workspace",
      number: 407,
      ref: "your-org/curaos-ai-workspace#407",
    },
  );
  assert.throws(
    () => parseIssueRefOrUrl("../curaos-ai-workspace#407", { source: "test", fieldName: "parent" }),
    /owner\/repo segments cannot be dot paths/,
  );
});
