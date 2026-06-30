// scripts/lib/model-tier.test.js
// RP-21: the logical model-tier catalog has ONE owner (MODEL_TIERS here). The cross-file sync
// pin (tdd-implement's impl_model whitelist == MODEL_TIERS) is queued for
// scripts/workflow-truth-contract.test.js (migration-lane-owned). Runner: bun test.
const { test, expect } = require("bun:test");

const { MODEL_TIERS, isModelTier, pickImplementModel, recommendImplementModel } = require("./model-tier.js");

test("MODEL_TIERS is the available opus/sonnet/haiku logical catalog", () => {
  expect(MODEL_TIERS).toEqual(["opus", "sonnet", "haiku"]);
});

test("isModelTier accepts exactly the catalog", () => {
  for (const tier of MODEL_TIERS) expect(isModelTier(tier)).toBe(true);
  for (const bad of ["claude-fable-5", "opus-4.8", "", null, undefined, "OPUS", 3]) {
    expect(isModelTier(bad)).toBe(false);
  }
});

test("pickImplementModel only ever returns catalog tiers (incl. null spec guard)", () => {
  const specs = [
    null,
    {},
    { effort: "S", owned_paths: ["a"], acceptance: ["do x"], adr_refs: [] },
    { effort: "S", owned_paths: ["a"], acceptance: ["rename the file"], adr_refs: [] },
    { effort: "XL", adr_refs: ["ADR-0001"] },
    { effort: "M", owned_paths: ["a", "b"] },
  ];
  for (const spec of specs) {
    const tier = pickImplementModel(spec, "");
    expect(isModelTier(tier)).toBe(true);
    expect(recommendImplementModel(spec, "")).toBe(tier);
  }
  expect(pickImplementModel(null, "")).toBe("opus"); // the RP-20 null-guard acceptance
  expect(pickImplementModel({ effort: "XL", adr_refs: ["ADR-0215"] }, "")).toBe("opus");
});
