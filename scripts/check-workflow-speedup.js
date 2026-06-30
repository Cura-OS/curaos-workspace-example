#!/usr/bin/env node
const fs = require("node:fs");

function readTimingJsonl(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`malformed timing jsonl at line ${index + 1}: ${error.message}`);
      }
    });
}

function summarizeTimingRecords(records) {
  const summary = { total_duration_ms: 0, by_phase: {} };
  for (const record of records) {
    const duration = Number(record.duration_ms);
    if (!Number.isFinite(duration) || duration < 0) {
      throw new Error(`invalid duration_ms for ${record.workflow || "unknown"}:${record.phase || "unknown"}`);
    }
    const workflow = String(record.workflow || "unknown");
    const phase = String(record.phase || "unknown");
    const key = `${workflow}:${phase}`;
    const bucket = summary.by_phase[key] || {
      workflow,
      phase,
      count: 0,
      failed: 0,
      total_duration_ms: 0,
      avg_duration_ms: 0,
    };
    bucket.count += 1;
    bucket.failed += record.status === "failed" ? 1 : 0;
    bucket.total_duration_ms += duration;
    bucket.avg_duration_ms = bucket.total_duration_ms / bucket.count;
    summary.by_phase[key] = bucket;
    summary.total_duration_ms += duration;
  }
  return summary;
}

function roundSpeedup(value) {
  return Math.round(value * 1000) / 1000;
}

function evaluateSpeedup({ baselineMs, actualMs, requiredSpeedup = 2 }) {
  const baseline = Number(baselineMs);
  const actual = Number(actualMs);
  const required = Number(requiredSpeedup);
  if (!Number.isFinite(baseline) || baseline <= 0) throw new Error("baselineMs must be positive");
  if (!Number.isFinite(actual) || actual <= 0) throw new Error("actualMs must be positive");
  if (!Number.isFinite(required) || required <= 0) throw new Error("requiredSpeedup must be positive");
  const speedup = roundSpeedup(baseline / actual);
  return {
    ok: speedup >= required,
    speedup,
    required_speedup: required,
  };
}

function argValue(args, name, fallback = null) {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  return args[index + 1] || fallback;
}

function main(argv = process.argv.slice(2)) {
  const timings = argValue(argv, "--timings", ".cache/workflow-step-timings.jsonl");
  const baselineMs = Number(argValue(argv, "--baseline-ms", ""));
  const requiredSpeedup = Number(argValue(argv, "--required-speedup", "2"));
  const records = readTimingJsonl(timings);
  const summary = summarizeTimingRecords(records);
  const actualMs = Number(argValue(argv, "--actual-ms", String(summary.total_duration_ms)));
  const speedup = Number.isFinite(baselineMs)
    ? evaluateSpeedup({ baselineMs, actualMs, requiredSpeedup })
    : { ok: true, speedup: null, required_speedup: requiredSpeedup };
  const result = { ...summary, speedup };
  console.log(JSON.stringify(result, null, 2));
  if (!speedup.ok) process.exitCode = 1;
  return result;
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = {
  evaluateSpeedup,
  main,
  readTimingJsonl,
  summarizeTimingRecords,
};
