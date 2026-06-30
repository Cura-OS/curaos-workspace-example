#!/usr/bin/env node
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  analyzeTrackerHygiene,
  isFrontendParityIssue,
} = require("./check-frontend-parity-tracker-hygiene.js");

test("frontend parity selector covers frontend, related backend, docs, and epic rows", () => {
  assert.equal(isFrontendParityIssue({ title: "[v1][fe] admin-app: wire + deepen to Done-criteria parity" }), true);
  assert.equal(isFrontendParityIssue({ title: "[v1][backend] Build personal-site-service" }), true);
  assert.equal(isFrontendParityIssue({ title: "[v1][backend] Author TypeSpec + build tenancy-core-service (neutral)" }), true);
  assert.equal(isFrontendParityIssue({ title: "[v1][docs] Reconcile frontend Requirements service-name drift" }), true);
  assert.equal(isFrontendParityIssue({ title: "[v1][epic] Backend dependencies for full frontend functional parity" }), true);
  assert.equal(isFrontendParityIssue({ title: "[v1.1][backend] Build later service" }), false);
  assert.equal(isFrontendParityIssue({ title: "[v1][ops] Tune live cluster" }), false);
});

test("analysis flags built-in GitHub milestones and missing Target Version", () => {
  const result = analyzeTrackerHygiene({
    issues: [
      {
        number: 750,
        title: "[v1][fe] admin-app: wire + deepen to Done-criteria parity",
        url: "https://github.com/your-org/curaos-ai-workspace/issues/750",
        milestone: { title: "v1 Frontend Functional Parity" },
      },
      {
        number: 774,
        title: "[v1][backend] Build personal-donation-service",
        url: "https://github.com/your-org/curaos-ai-workspace/issues/774",
        milestone: null,
      },
      {
        number: 4,
        title: "[v1][ops] Tune live cluster",
        url: "https://github.com/your-org/curaos-ai-workspace/issues/4",
        milestone: { title: "ignored non-frontend row" },
      },
    ],
    projectItems: [
      {
        content: {
          repository: "https://github.com/your-org/curaos-ai-workspace",
          number: 750,
          title: "[v1][fe] admin-app: wire + deepen to Done-criteria parity",
        },
        "target Version": "v1",
      },
      {
        content: {
          repository: "https://github.com/your-org/curaos-ai-workspace",
          number: 774,
          title: "[v1][backend] Build personal-donation-service",
        },
      },
    ],
  });

  assert.equal(result.checked_count, 2);
  assert.equal(result.ok, false);
  assert.deepEqual(result.built_in_milestone.map((row) => row.ref), [
    "your-org/curaos-ai-workspace#750",
  ]);
  assert.deepEqual(result.target_version_mismatch.map((row) => row.ref), [
    "your-org/curaos-ai-workspace#774",
  ]);
});

test("analysis passes when scoped rows have no built-in milestone and Target Version v1", () => {
  const result = analyzeTrackerHygiene({
    issues: [
      {
        number: 750,
        title: "[v1][fe] admin-app: wire + deepen to Done-criteria parity",
        url: "https://github.com/your-org/curaos-ai-workspace/issues/750",
        milestone: null,
      },
    ],
    projectItems: [
      {
        content: {
          repository: "https://github.com/your-org/curaos-ai-workspace",
          number: 750,
          title: "[v1][fe] admin-app: wire + deepen to Done-criteria parity",
        },
        "target Version": "v1",
      },
    ],
  });

  assert.equal(result.checked_count, 1);
  assert.equal(result.ok, true);
  assert.deepEqual(result.built_in_milestone, []);
  assert.deepEqual(result.target_version_mismatch, []);
});
