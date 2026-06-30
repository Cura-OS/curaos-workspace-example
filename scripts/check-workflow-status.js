#!/usr/bin/env node
// RP-56: validate docs/agents/WORKFLOW-STATUS.md against the committed
// executors in scripts/workflows/. Offline + deterministic by default.
//
//   node scripts/check-workflow-status.js
//   node scripts/check-workflow-status.js --defects-json <file>
//
// --defects-json takes a JSON object { "<workflow>": "<open issue url>" }
// (e.g. produced by the workflow-defect closeout from the tracker). When
// given, the set is authoritative: an "ok" row with an open defect fails
// (stale-ok) AND a degraded/broken row without an open defect fails
// (stale-defect).
const fs = require("node:fs");
const path = require("node:path");
const {
  parseWorkflowStatusTable,
  validateWorkflowStatus,
} = require("./lib/workflow-status.js");

const root = path.resolve(__dirname, "..");
const tablePath = path.join(root, "docs/agents/WORKFLOW-STATUS.md");
const executorDir = path.join(root, "scripts/workflows");

function parseArgs(argv) {
  const args = { defectsJson: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--defects-json") {
      args.defectsJson = argv[i + 1];
      i += 1;
    } else {
      console.error(`unknown argument: ${argv[i]}`);
      process.exit(2);
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));

if (!fs.existsSync(tablePath)) {
  console.error("missing docs/agents/WORKFLOW-STATUS.md");
  process.exit(1);
}

const executors = fs
  .readdirSync(executorDir)
  .filter((f) => f.endsWith(".workflow.js"))
  .map((f) => f.replace(/\.workflow\.js$/, ""))
  .sort();

let openDefects = {};
let defectsAuthoritative = false;
if (args.defectsJson) {
  openDefects = JSON.parse(fs.readFileSync(args.defectsJson, "utf8"));
  defectsAuthoritative = true;
}

const rows = parseWorkflowStatusTable(fs.readFileSync(tablePath, "utf8"));
const violations = validateWorkflowStatus(rows, {
  executors,
  openDefects,
  defectsAuthoritative,
});

if (violations.length) {
  for (const violation of violations) {
    console.error(`WORKFLOW-STATUS ${violation.kind}: ${violation.message}`);
  }
  process.exit(1);
}
console.log(
  `workflow status ok (${rows.length} rows, ${executors.length} executors${defectsAuthoritative ? ", defect set authoritative" : ""})`,
);
