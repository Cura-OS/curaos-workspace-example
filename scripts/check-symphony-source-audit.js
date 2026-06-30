#!/usr/bin/env node
const audit = require("./lib/symphony-source-audit.js");

function parseArgs(argv) {
  const args = { root: process.cwd(), json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--root") args.root = argv[++i];
    else if (arg === "--json") args.json = true;
    else if (arg === "--help" || arg === "-h") args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function printHelp() {
  console.log(`Usage: node scripts/check-symphony-source-audit.js [--root <path>] [--json]\n\nAudits tracked and untracked workspace markdown plus workflow-related scripts\nfor Symphony/CuraOS source hygiene. Discovery uses git ls-files --cached\n--others --exclude-standard across nested repositories, then skips generated\nsandboxes, worktrees, dist, node_modules, and scratch directories.`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const result = audit.auditWorkspaceFiles({ root: args.root });
  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else if (result.ok) {
    console.log(`symphony-source-audit ok: ${result.checked} tracked/untracked workflow markdown and script file(s) checked`);
  } else {
    for (const problem of result.problems) {
      console.error(`${problem.file}:${problem.line}: ${problem.rule}: ${problem.message}`);
    }
    console.error(`\n${result.checked} checked, ${result.problems.length} problem(s)`);
  }
  if (!result.ok) process.exitCode = 1;
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
