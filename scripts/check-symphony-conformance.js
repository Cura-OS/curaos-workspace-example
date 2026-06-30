#!/usr/bin/env node
const path = require("node:path");
const conformance = require("./lib/symphony-conformance.js");

function parseArgs(argv) {
  const args = { root: process.cwd(), json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (item === "--json") {
      args.json = true;
      continue;
    }
    if (item === "--root") {
      args.root = argv[i + 1];
      i += 1;
      continue;
    }
    if (item === "--help" || item === "-h") args.help = true;
  }
  args.root = path.resolve(args.root);
  return args;
}

function usage() {
  return "Usage: node scripts/check-symphony-conformance.js [--root PATH] [--json]\n";
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write(usage());
    return 0;
  }
  const result = conformance.checkAll(args.root);
  if (args.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    for (const row of result.results) {
      if (row.ok) console.log(`symphony-conformance ok: ${row.name}`);
    }
    for (const problem of result.problems) console.error(`symphony-conformance problem: ${problem}`);
    console.log(`\n${result.results.length} checked, ${result.problems.length} problem(s)`);
  }
  return result.ok ? 0 : 1;
}

if (require.main === module) process.exitCode = main();

module.exports = { main, parseArgs };
