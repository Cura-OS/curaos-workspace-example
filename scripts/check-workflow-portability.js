#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { firstCodeStatement, metaFirstProblem } = require("./lib/meta-first-guard.js");

const root = path.resolve(__dirname, "..");
const workflowDir = path.join(root, "scripts", "workflows");
const readmePath = path.join(root, "docs", "agents", "workflows", "README.md");
const gitignorePath = path.join(root, ".gitignore");
const requiredWorkflows = ["milestone-wave", "task-execute", "pr-verify-merge", "doc-governance"];
const forbidden = [
  /\/Users\/[^"'\s]+\/workspace\/curaos-workspace/g,
  /\/Users\/mkh\/workspace\/curaos-workspace/g,
];
const problems = [];

function rel(file) {
  return path.relative(root, file).replaceAll(path.sep, "/");
}

for (const fileName of fs.readdirSync(workflowDir).filter((name) => name.endsWith(".workflow.js"))) {
  const file = path.join(workflowDir, fileName);
  const text = fs.readFileSync(file, "utf8");
  for (const pattern of forbidden) {
    const matches = text.match(pattern);
    if (matches) problems.push(`${rel(file)}: hardcoded workspace path ${matches[0]}`);
  }
  // cwd-tied lazy require (regression guard): `createRequire(`${process.cwd()}/...`)` makes a lazy
  // `localRequire("../lib/...")` resolve relative to the CALLER's working directory, so it fails with
  // MODULE_NOT_FOUND when the workflow runs from a non-repo-root cwd. Resolve module-relative via
  // createRequire(import.meta.url) instead.
  if (/createRequire\(\s*`\$\{process\.cwd\(\)\}/.test(text)) {
    problems.push(`${rel(file)}: lazy require must resolve module-relative via createRequire(import.meta.url), not createRequire(\`\${process.cwd()}/…\`) (breaks from a non-repo-root cwd)`);
  }
  // meta-first portability (workflow-defect #508): every executor must open with `export const meta`
  // (a PURE object literal) so it loads in BOTH Claude's Workflow() tool AND the agent-workflow-kit
  // runtime. Move any require/process/setup code AFTER meta (lazy loaders inside the function body,
  // per task-execute). metaFirstProblem (scripts/lib/meta-first-guard.js) is the canonical predicate
  // shared with the in-suite regression guard so the two never drift.
  const head = firstCodeStatement(text);
  const metaProblem = metaFirstProblem(text);
  if (metaProblem === "meta-not-first") {
    problems.push(`${rel(file)}: \`export const meta = {…}\` must be the FIRST statement (Claude Workflow() rejects meta-not-first); found "${head.split("\n")[0].slice(0, 60)}…"`);
  } else if (metaProblem === "meta-rhs-not-literal") {
    problems.push(`${rel(file)}: \`export const meta\` RHS must be a pure object literal starting with \`{\` (Claude Workflow() rejects a call/identifier/expression); found "${head.slice(0, 60)}…"`);
  }
}

const readme = fs.readFileSync(readmePath, "utf8");
const gitignore = fs.readFileSync(gitignorePath, "utf8");
if (!gitignore.includes(".agent-workflow-kit/runs/")) {
  problems.push(`${rel(gitignorePath)}: missing .agent-workflow-kit/runs/ ignore rule`);
}

for (const workflow of requiredWorkflows) {
  const executor = path.join(workflowDir, `${workflow}.workflow.js`);
  if (!fs.existsSync(executor)) problems.push(`missing executor for ${workflow}`);
  if (!readme.includes(`agent-workflow-kit workflow-run ${workflow}`)) {
    problems.push(`${rel(readmePath)}: missing non-Claude CLI invocation for ${workflow}`);
  }
}

if (problems.length) {
  for (const problem of problems) console.error(`workflow-portability FAIL: ${problem}`);
  console.error(`\n${problems.length} problem(s)`);
  process.exit(1);
}

const workflowCount = fs.readdirSync(workflowDir).filter((name) => name.endsWith(".workflow.js")).length;
console.log(`workflow-portability ok: ${requiredWorkflows.length} required workflows, ${workflowCount} executors meta-first, no hardcoded workspace paths`);
