#!/usr/bin/env node
const test = require("node:test");
const assert = require("node:assert/strict");

const { reentryRequestsFor } = require("./webhook-listener.js");

test("webhook re-entry routes PR events to the smallest workflow step", () => {
  const pullRequest = reentryRequestsFor("pull_request", {
    action: "synchronize",
    repository: { full_name: "owner/repo" },
    pull_request: { number: 7, head: { sha: "a".repeat(40) } },
  });
  assert.deepEqual(pullRequest, [
    {
      workflow: "pr-verify-merge",
      reason: "pull_request:synchronize",
      repo: "owner/repo",
      pr: "owner/repo#7",
      head_sha: "a".repeat(40),
      idempotency_key: `owner/repo#7:${"a".repeat(40)}:pull_request:synchronize`,
    },
  ]);

  const review = reentryRequestsFor("pull_request_review", {
    action: "submitted",
    repository: { full_name: "owner/repo" },
    pull_request: { number: 7, head: { sha: "b".repeat(40) } },
  });
  assert.equal(review[0].workflow, "gh-pr-gate-snapshot");
  assert.equal(review[0].pr, "owner/repo#7");
});

test("webhook re-entry routes tracker events to milestone scan", () => {
  const requests = reentryRequestsFor("issues", {
    action: "labeled",
    repository: { full_name: "owner/repo" },
    issue: { number: 9 },
  });

  assert.deepEqual(requests, [
    {
      workflow: "milestone-active-scan",
      reason: "issues:labeled",
      repo: "owner/repo",
      issue: "owner/repo#9",
      idempotency_key: "owner/repo#9:issues:labeled",
    },
  ]);
});
