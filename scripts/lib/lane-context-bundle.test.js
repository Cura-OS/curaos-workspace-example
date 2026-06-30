// scripts/lib/lane-context-bundle.test.js
// RP-50 dispatch enrichment: per-lane context bundle written at plan time, before worker start.
// fs injected; no network. Runner: bun test.
const { test, expect } = require("bun:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const bundleLib = require("./lane-context-bundle.js");

test("laneSlug and bundlePathFor derive the .scratch/<lane>/context-bundle.md path", () => {
  expect(bundleLib.laneSlug("your-org/curaos#123")).toBe("cura-care-oriented-stack-curaos-123");
  expect(bundleLib.bundlePathFor("your-org/curaos#123")).toBe(
    ".scratch/cura-care-oriented-stack-curaos-123/context-bundle.md",
  );
  expect(bundleLib.bundlePathFor("", ".scratch")).toBe("");
});

test("mirrorDocsForRoot maps curaos roots to the ai/ mirror and others to the workspace set", () => {
  expect(bundleLib.mirrorDocsForRoot("curaos/backend/services/identity-service")).toEqual([
    "ai/curaos/backend/services/identity-service/CONTEXT.md",
    "ai/curaos/backend/services/identity-service/Requirements.md",
    "ai/curaos/backend/services/identity-service/AGENTS.md",
  ]);
  expect(bundleLib.mirrorDocsForRoot("curaos")[0]).toBe("ai/curaos/CONTEXT.md");
  expect(bundleLib.mirrorDocsForRoot("workspace")).toContain("AGENTS.md");
  expect(bundleLib.mirrorDocsForRoot("unknown")).toContain("ai/rules/README.md");
  expect(bundleLib.mirrorDocsForRoot("")).toContain("AGENTS.md");
});

test("buildLaneBundle renders plan row, anchors, resolved mirror docs, and ADR/contract sources", () => {
  const docs = {
    "ai/curaos/backend/services/audit-core-service/CONTEXT.md": "# audit context\nline2",
    "ai/curaos/backend/services/audit-core-service/Requirements.md": "# audit requirements",
  };
  const md = bundleLib.buildLaneBundle({
    lane: { issue: "org/audit#7", owned_root: "curaos/backend/services/audit-core-service", score: 0.81 },
    rankedRow: { issue: "org/audit#7", score: 0.81, unblockReach: 3, criticalPathDepth: 2, priority: "High" },
    candidate: { ref: "org/audit#7", priority: "High", effort: "M", module: "audit-core-service" },
    milestone: "M11",
    wavePlanPath: ".scratch/workflow-cache/wave-plan.json",
    generatedAt: "2026-06-10T00:00:00Z",
    readFile: (p) => (p in docs ? docs[p] : null),
  });
  expect(md).toContain("# Lane context bundle: org/audit#7");
  expect(md).toContain("- owned_root: curaos/backend/services/audit-core-service");
  expect(md).toContain("- criticalPathDepth: 2");
  expect(md).toContain("- module: audit-core-service");
  expect(md).toContain("## Pre-coding anchors (confirm BEFORE writing any file)");
  for (const anchor of bundleLib.PRE_CODING_ANCHORS) expect(md).toContain(anchor);
  expect(md).toContain("### ai/curaos/backend/services/audit-core-service/CONTEXT.md");
  expect(md).toContain("# audit context");
  expect(md).toContain("ai/curaos/docs/adr/RESOLUTION-MAP.md");
  expect(md).toContain("curaos/ci-gates.yaml");
  // No em or en dash ever reaches a generated bundle (curaos_no_em_dash_rule).
  expect(/[\u2014\u2013]/.test(md)).toBe(false);
});

test("buildLaneBundle sanitizes dash glyphs from source snippets and truncates long docs", () => {
  const longDoc = ["# title \u2014 with em dash \u2013 and en dash"]
    .concat(Array.from({ length: 60 }, (_, i) => `line ${i}`))
    .join("\n");
  const md = bundleLib.buildLaneBundle({
    lane: { issue: "org/x#1", owned_root: "curaos" },
    readFile: (p) => (p === "ai/curaos/CONTEXT.md" ? longDoc : null),
  });
  expect(/[\u2014\u2013]/.test(md)).toBe(false);
  expect(md).toContain("# title - with em dash - and en dash");
  expect(md).toContain(`[... truncated at ${bundleLib.SNIPPET_MAX_LINES} lines]`);
});

test("buildLaneBundle reports unresolved mirror docs and falls back to the canonical read list", () => {
  const md = bundleLib.buildLaneBundle({
    lane: { issue: "org/y#2", owned_root: "curaos/backend/services/ghost-service" },
    readFile: () => null,
  });
  expect(md).toContain("no mirror doc resolved for owned_root curaos/backend/services/ghost-service");
});

test("writeLaneBundles writes one bundle per lane at plan time and is fail-soft per lane", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lane-bundle-"));
  try {
    const scratch = path.join(tmp, ".scratch");
    const warned = [];
    const written = bundleLib.writeLaneBundles({
      lanes: [
        { issue: "org/a#1", owned_root: "workspace", score: 0.9 },
        { issue: "", owned_root: "workspace" }, // empty ref skipped, never throws
        { issue: "org/b#2", owned_root: "curaos", score: 0.5 },
      ],
      ranked: [
        { issue: "org/a#1", score: 0.9, unblockReach: 2, criticalPathDepth: 1, priority: "High" },
        { issue: "org/b#2", score: 0.5, unblockReach: 0, criticalPathDepth: 0, priority: "Low" },
      ],
      candidates: [{ ref: "org/a#1", priority: "High", effort: "S", module: "workspace" }],
      milestone: "M-test",
      wavePlanPath: ".scratch/workflow-cache/wave-plan.json",
      scratchDir: scratch,
      now: "2026-06-10T00:00:00Z",
      warn: (msg) => warned.push(msg),
    });
    expect(written.map((w) => w.issue)).toEqual(["org/a#1", "org/b#2"]);
    for (const w of written) {
      expect(fs.existsSync(w.path)).toBe(true);
      const content = fs.readFileSync(w.path, "utf8");
      expect(content).toContain(`# Lane context bundle: ${w.issue}`);
      expect(content).toContain("## Pre-coding anchors");
      expect(/[\u2014\u2013]/.test(content)).toBe(false);
    }
    expect(written[0].path).toBe(path.join(scratch, "org-a-1", "context-bundle.md"));
    expect(warned).toEqual([]);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("writeLaneBundles never aborts the plan on a write failure (fail-soft)", () => {
  const warned = [];
  const failingFs = {
    existsSync: () => false,
    readFileSync: () => null,
    mkdirSync: () => {
      throw new Error("disk full");
    },
    writeFileSync: () => {
      throw new Error("disk full");
    },
  };
  const written = bundleLib.writeLaneBundles({
    lanes: [{ issue: "org/a#1", owned_root: "workspace" }],
    ranked: [],
    candidates: [],
    fsLike: failingFs,
    warn: (msg) => warned.push(msg),
  });
  expect(written).toEqual([]);
  expect(warned.length).toBe(1);
  expect(warned[0]).toContain("lane-context-bundle: skipped org/a#1");
});
