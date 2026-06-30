// Runner: bun test scripts/workflows/gh-roadmap-mirror.workflow.test.js
const { test, expect, beforeEach, afterEach } = require("bun:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const ROOT = path.resolve(__dirname, "..", "..");
const WORKFLOW_PATH = path.join(ROOT, "scripts", "workflows", "gh-roadmap-mirror.workflow.js");

let tmpDir;
let binDir;
let ledgerPath;
let previousPath;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "curaos-roadmap-mirror-"));
  binDir = path.join(tmpDir, "bin");
  ledgerPath = path.join(tmpDir, "node-args.bin");
  fs.mkdirSync(binDir, { recursive: true });
  fs.writeFileSync(
    path.join(binDir, "node"),
    [
      "#!/usr/bin/env bash",
      "set -euo pipefail",
      "printf '%s\\0' \"$@\" >> \"$ROADMAP_MIRROR_ARG_LEDGER\"",
      "out=''",
      "prev=''",
      "has_refresh=0",
      "for arg in \"$@\"; do",
      "  if [ \"$prev\" = '--out' ]; then out=\"$arg\"; fi",
      "  if [ \"$arg\" = '--refresh' ]; then has_refresh=1; fi",
      "  prev=\"$arg\"",
      "done",
      "if [ -z \"$out\" ]; then echo 'missing --out' >&2; exit 64; fi",
      "if [ \"${ROADMAP_MIRROR_FAIL_REFRESH:-}\" = '1' ] && [ \"$has_refresh\" = '1' ]; then echo 'unknown owner type' >&2; exit 1; fi",
      "mkdir -p \"$(dirname \"$out\")\"",
      "printf '# Rendered roadmap\\n' > \"$out\"",
      "printf 'render-issue-roadmap: fake render\\n'",
    ].join("\n"),
    { mode: 0o755 },
  );
  previousPath = process.env.PATH;
  process.env.PATH = `${binDir}${path.delimiter}${process.env.PATH}`;
  process.env.ROADMAP_MIRROR_ARG_LEDGER = ledgerPath;
});

afterEach(() => {
  process.env.PATH = previousPath;
  delete process.env.ROADMAP_MIRROR_ARG_LEDGER;
  delete process.env.ROADMAP_MIRROR_FAIL_REFRESH;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function recordedArgs() {
  return fs.readFileSync(ledgerPath).toString("utf8").split("\0").filter(Boolean);
}

test("gh-roadmap-mirror passes offline snapshot options to renderer", async () => {
  const { default: runMirror } = await import(pathToFileURL(WORKFLOW_PATH).href);
  const snapshot = path.join(tmpDir, "roadmap-items.json");
  fs.writeFileSync(snapshot, JSON.stringify({ fetchedAtMs: Date.now(), projectNumber: 2, items: [] }));

  const result = await runMirror({
    args: { dry_run: true, offline: true, snapshot, projectNumber: 2 },
    phase: () => {},
  });

  const args = recordedArgs();
  expect(args).toContain("scripts/render-issue-roadmap.js");
  expect(args).toContain("--offline");
  expect(args).toContain("--snapshot");
  expect(args[args.indexOf("--snapshot") + 1]).toBe(snapshot);
  expect(args).toContain("--project-number");
  expect(args[args.indexOf("--project-number") + 1]).toBe("2");
  expect(result.issue_roadmap_updated).toBe(true);
});

test("gh-roadmap-mirror falls back offline when refresh fails", async () => {
  const { default: runMirror } = await import(pathToFileURL(WORKFLOW_PATH).href);
  const snapshot = path.join(tmpDir, "roadmap-items.json");
  fs.writeFileSync(snapshot, JSON.stringify({ fetchedAtMs: Date.now(), projectNumber: 2, items: [] }));
  process.env.ROADMAP_MIRROR_FAIL_REFRESH = "1";

  const result = await runMirror({
    args: { dry_run: true, refresh: true, snapshot, projectNumber: 2 },
    phase: () => {},
  });

  const args = recordedArgs();
  expect(args).toContain("--refresh");
  expect(args).toContain("--offline");
  expect(result.issue_roadmap_updated).toBe(true);
  expect(result.drift[0]).toContain("offline fallback after refresh failed");
});
