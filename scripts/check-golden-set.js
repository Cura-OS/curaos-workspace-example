#!/usr/bin/env node
// RP-58: T1 LLM-judge golden-set runner. Offline + deterministic.
//
//   bun scripts/check-golden-set.js
//       Integrity self-check of the committed golden set (counts, labels, judge pin,
//       grill_report provenance files present in the archive). Exit 1 on any problem.
//
//   bun scripts/check-golden-set.js --verdicts <file.json> [--threshold 0.1]
//       Drift compare: <file.json> is a judge run { "<entry-id>": "pass" | "fail" }.
//       Missing/unknown verdicts count as divergent (fail-closed). Exit 1 when the
//       divergence rate exceeds the threshold (golden-set divergence_threshold default).
//
// Rubric + protocol: ai/curaos/docs/grills/golden-set/t1-judge-rubric.md
const fs = require("node:fs");
const path = require("node:path");
const { validateGoldenSet, evaluateDrift } = require("./lib/golden-set.js");

const root = path.resolve(__dirname, "..");
const DEFAULT_GOLDEN_SET = "ai/curaos/docs/grills/golden-set/golden-set.json";
const ARCHIVE_DIR = "ai/curaos/docs/grills";

function parseArgs(argv) {
  const args = { goldenSet: null, verdicts: null, threshold: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--golden-set") {
      args.goldenSet = argv[i + 1];
      i += 1;
    } else if (argv[i] === "--verdicts") {
      args.verdicts = argv[i + 1];
      i += 1;
    } else if (argv[i] === "--threshold") {
      args.threshold = Number(argv[i + 1]);
      i += 1;
    } else {
      console.error(`unknown argument: ${argv[i]}`);
      process.exit(2);
    }
  }
  if (args.threshold !== null && !(args.threshold > 0 && args.threshold < 1)) {
    console.error("--threshold must be a number in (0, 1)");
    process.exit(2);
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const goldenSetPath = path.resolve(root, args.goldenSet || DEFAULT_GOLDEN_SET);

if (!fs.existsSync(goldenSetPath)) {
  console.error(`missing golden set: ${goldenSetPath}`);
  process.exit(1);
}

let set;
try {
  set = JSON.parse(fs.readFileSync(goldenSetPath, "utf8"));
} catch (error) {
  console.error(`golden set unparseable: ${error.message}`);
  process.exit(1);
}

const problems = validateGoldenSet(set, {
  archiveDir: path.resolve(root, ARCHIVE_DIR),
  rootDir: root,
});
if (problems.length) {
  for (const problem of problems) console.error(`GOLDEN-SET ${problem}`);
  process.exit(1);
}

if (!args.verdicts) {
  const perClass = set.entries.reduce((acc, entry) => {
    acc[entry.label] = (acc[entry.label] || 0) + 1;
    return acc;
  }, {});
  console.log(
    `golden set ok (${set.entries.length} entries: ${perClass.fail || 0} fail / ${perClass.pass || 0} pass; ` +
      `judge ${set.judge.model} pinned ${set.judge.pinned_at}; rubric v${set.rubric_version})`,
  );
  process.exit(0);
}

const verdictsPath = path.resolve(args.verdicts);
if (!fs.existsSync(verdictsPath)) {
  console.error(`missing verdicts file: ${verdictsPath}`);
  process.exit(1);
}
let verdicts;
try {
  verdicts = JSON.parse(fs.readFileSync(verdictsPath, "utf8"));
} catch (error) {
  console.error(`verdicts file unparseable: ${error.message}`);
  process.exit(1);
}

const result = evaluateDrift(set, verdicts, args.threshold === null ? undefined : args.threshold);
for (const d of result.divergent) {
  console.error(`DIVERGENT ${d.id}: label=${d.label} judge=${d.verdict}`);
}
for (const id of result.missing) console.error(`MISSING ${id}: no judge verdict (counts divergent)`);
for (const u of result.unknown) {
  console.error(`UNKNOWN ${u.id}: unrecognized verdict ${JSON.stringify(u.raw)} (counts divergent)`);
}
const summary =
  `drift: ${result.divergenceCount}/${result.total} divergent ` +
  `(rate ${result.rate.toFixed(4)}, threshold ${result.threshold})`;
if (!result.ok) {
  console.error(`GOLDEN-SET DRIFT ${summary}`);
  console.error("do NOT adopt the candidate judge pin; file divergent entries with the refresh issue");
  process.exit(1);
}
console.log(`golden set drift ok: ${summary}, agreed ${result.agreed}`);
