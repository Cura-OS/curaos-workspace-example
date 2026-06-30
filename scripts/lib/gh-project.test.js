// scripts/lib/gh-project.test.js
// RP-79: gh() captured stderr + structured 404 classification + batched GraphQL hierarchy reads.
// Runner: bun test. The gh binary is stubbed with a recording fake on PATH; the stderr-passthrough
// regression runs the gh-subissue-wire workflow in a SUBPROCESS so the calling process's stderr is
// observable (in-process the parent stderr is the test runner's own and cannot be asserted).
const { test, expect, beforeEach, afterEach } = require("bun:test");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const ghProject = require("./gh-project.js");

const ROOT = path.resolve(__dirname, "..", "..");
const WORKFLOW_PATH = path.join(ROOT, "scripts", "workflows", "gh-subissue-wire.workflow.js");
const BUCKET_STATE = path.join(ROOT, ".cache", "gh-content-bucket.json");

let tmpDir;
let binDir;
let ledgerPath;
let driverPath;

// Recording gh stub. Modes (GH_STUB_MODE):
//  - "graphql": schema probe advertises Issue.parent/subIssues -> batched hierarchy read path.
//  - "rest-fallback": probe omits them -> classified per-child REST pair; the parent probe fails
//    with GitHub's EXACT payload: JSON body on stdout, "gh: ... (HTTP 404)" on stderr, exit 1.
const GH_STUB = `#!/usr/bin/env bun
const fs = require("node:fs");
const args = process.argv.slice(2);
if (process.env.GH_STUB_LEDGER) fs.appendFileSync(process.env.GH_STUB_LEDGER, JSON.stringify(args) + "\\n");
const mode = process.env.GH_STUB_MODE || "graphql";
const write = (v) => process.stdout.write(typeof v === "string" ? v : JSON.stringify(v));
// RP-12 transient-failure injection: fail the first GH_STUB_FAIL_TIMES calls with GitHub's 502
// shape (JSON body on stdout, human line on stderr), then behave normally. The cross-process
// attempt counter lives in GH_STUB_FAIL_COUNTER.
const failTimes = Number(process.env.GH_STUB_FAIL_TIMES || 0);
if (failTimes > 0 && process.env.GH_STUB_FAIL_COUNTER) {
  let n = 0;
  try { n = Number(fs.readFileSync(process.env.GH_STUB_FAIL_COUNTER, "utf8")) || 0; } catch {}
  if (n < failTimes) {
    fs.writeFileSync(process.env.GH_STUB_FAIL_COUNTER, String(n + 1));
    write('{"message":"Bad Gateway","status":"502"}');
    process.stderr.write("gh: Bad Gateway (HTTP 502)\\n");
    process.exit(1);
  }
}
if (args[0] === "api" && args[1] === "graphql") {
  const query = (args.find((a) => a.startsWith("query=")) || "").slice("query=".length);
  if (query.includes("__type")) {
    const fields = mode === "graphql"
      ? [{ name: "id" }, { name: "number" }, { name: "parent" }, { name: "subIssues" }]
      : [{ name: "id" }, { name: "number" }];
    write({ data: { __type: { fields } } });
    process.exit(0);
  }
  const data = {};
  for (const m of query.matchAll(/(i\\d+): repository\\(owner:"[^"]+",name:"[^"]+"\\)\\{issue\\(number:(\\d+)\\)/g)) {
    data[m[1]] = { issue: { databaseId: 1000 + Number(m[2]), parent: null } };
  }
  write({ data });
  process.exit(0);
}
if (args[0] === "api" && args[1] === "--paginate" && /\\/sub_issues$/.test(args[2])) {
  write([]);
  process.exit(0);
}
if (args[0] === "api" && /\\/parent$/.test(args[1])) {
  write('{"message":"No parent issue found","status":"404"}');
  process.stderr.write("gh: No parent issue found (HTTP 404)\\n");
  process.exit(1);
}
if (args[0] === "api" && args[1] === "-X" && args[2] === "POST" && /\\/sub_issues$/.test(args[3])) {
  if (process.env.GH_STUB_SUBISSUE_DEPTH_LIMIT === "1") {
    write('{"message":"You cannot add more than 7 layers of sub-issues.","status":"422"}');
    process.stderr.write("gh: You cannot add more than 7 layers of sub-issues. To add a sub-issue, remove a parent issue at any level. (HTTP 422)\\n");
    process.exit(1);
  }
  write({ id: 1 });
  process.exit(0);
}
const plain = args[0] === "api" && /repos\\/[^/]+\\/[^/]+\\/issues\\/(\\d+)$/.exec(args[1]);
if (plain) {
  write({ id: 1000 + Number(plain[1]) });
  process.exit(0);
}
process.stderr.write("gh-stub: unhandled args " + JSON.stringify(args) + "\\n");
process.exit(64);
`;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "curaos-ghproj-"));
  binDir = path.join(tmpDir, "bin");
  fs.mkdirSync(binDir, { recursive: true });
  ledgerPath = path.join(tmpDir, "gh-ledger.jsonl");
  fs.writeFileSync(path.join(binDir, "gh"), GH_STUB, { mode: 0o755 });
  driverPath = path.join(tmpDir, "wire-driver.mjs");
  fs.writeFileSync(
    driverPath,
    [
      `const { default: runWire } = await import(${JSON.stringify(pathToFileURL(WORKFLOW_PATH).href)});`,
      `const result = await runWire({ args: { parent: "o/r#1", children: JSON.stringify(["o/r#2", "o/r#3"]) }, phase: () => {} });`,
      `console.log(JSON.stringify(result));`,
    ].join("\n"),
  );
});
afterEach(() => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {}
});

function ghError({ message = "Command failed: gh", stdout = "", stderr = "" } = {}) {
  const error = new Error(message);
  error.stdout = stdout;
  error.stderr = stderr;
  return error;
}

function stubEnv() {
  return {
    ...process.env,
    PATH: `${binDir}${path.delimiter}${process.env.PATH}`,
    GH_STUB_LEDGER: ledgerPath,
  };
}

// addSubIssue writes throttle events into the REAL .cache bucket; snapshot + restore around runs.
function withBucketStateRestored(fn) {
  const existed = fs.existsSync(BUCKET_STATE);
  const before = existed ? fs.readFileSync(BUCKET_STATE) : null;
  try {
    return fn();
  } finally {
    if (existed) fs.writeFileSync(BUCKET_STATE, before);
    else fs.rmSync(BUCKET_STATE, { force: true });
  }
}

function runDriver(mode, extraEnv = {}) {
  return withBucketStateRestored(() =>
    spawnSync(process.execPath, [driverPath], {
      encoding: "utf8",
      env: { ...stubEnv(), GH_STUB_MODE: mode, ...extraEnv },
    }),
  );
}

function readLedger() {
  return fs
    .readFileSync(ledgerPath, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

// ============================ isNotFound: structured 404 classification ============================

test("isNotFound classifies the exact parent-probe payload (body on stdout, human line on stderr)", () => {
  const error = ghError({
    stdout: '{"message":"No parent issue found","status":"404"}',
    stderr: "gh: No parent issue found (HTTP 404)\n",
  });
  expect(ghProject.isNotFound(error)).toBe(true);
});

test("isNotFound classifies on the structured body alone, without any HTTP 404 literal", () => {
  expect(ghProject.isNotFound(ghError({ stdout: '{"message":"No parent issue found","status":"404"}' }))).toBe(true);
  // message-match branch (status absent): "Not Found" case-insensitive
  expect(ghProject.isNotFound(ghError({ stdout: '{"message":"Not Found"}' }))).toBe(true);
  expect(ghProject.isNotFound(ghError({ stdout: '{"message":"no parent issue found"}' }))).toBe(true);
});

test("isNotFound rejects non-404 statuses even when the message mentions not found", () => {
  expect(ghProject.isNotFound(ghError({ stdout: '{"message":"Validation failed: issue not found","status":"422"}' }))).toBe(false);
  expect(ghProject.isNotFound(ghError({ stdout: '{"message":"Server Error","status":"500"}', stderr: "gh: Server Error (HTTP 500)\n" }))).toBe(false);
});

test("isNotFound keeps the bare HTTP 404 literal as fallback for non-JSON gh failures", () => {
  expect(ghProject.isNotFound(ghError({ stderr: "gh: Not Found (HTTP 404)\n" }))).toBe(true);
  expect(ghProject.isNotFound(ghError({ stderr: "gh: bad gateway (HTTP 502)\n" }))).toBe(false);
});

test("errorText folds message + captured stderr + stdout", () => {
  const text = ghProject.errorText(
    ghError({ message: "Command failed: gh api", stdout: '{"status":"404"}', stderr: "gh: No parent issue found (HTTP 404)" }),
  );
  expect(text).toContain("Command failed: gh api");
  expect(text).toContain("gh: No parent issue found (HTTP 404)");
  expect(text).toContain('{"status":"404"}');
});

// ============================ gh(): piped stdio + captured streams on the error ============================

test("gh() attaches captured stderr/stdout strings to the thrown error so isNotFound classifies it", () => {
  const saved = { PATH: process.env.PATH, GH_STUB_LEDGER: process.env.GH_STUB_LEDGER, GH_STUB_MODE: process.env.GH_STUB_MODE };
  process.env.PATH = `${binDir}${path.delimiter}${saved.PATH}`;
  process.env.GH_STUB_LEDGER = ledgerPath;
  process.env.GH_STUB_MODE = "rest-fallback";
  try {
    let caught;
    try {
      ghProject.gh(["api", "repos/o/r/issues/2/parent"], { json: true });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeDefined();
    expect(typeof caught.stderr).toBe("string");
    expect(caught.stderr).toContain("gh: No parent issue found (HTTP 404)");
    expect(String(caught.stdout)).toContain('"No parent issue found"');
    expect(ghProject.isNotFound(caught)).toBe(true);
  } finally {
    process.env.PATH = saved.PATH;
    if (saved.GH_STUB_LEDGER === undefined) delete process.env.GH_STUB_LEDGER;
    else process.env.GH_STUB_LEDGER = saved.GH_STUB_LEDGER;
    if (saved.GH_STUB_MODE === undefined) delete process.env.GH_STUB_MODE;
    else process.env.GH_STUB_MODE = saved.GH_STUB_MODE;
  }
});

// ============================ RP-12: gh() transient retry + backoff ============================

function withStubbedGhEnv(extraEnv, fn) {
  const keys = ["PATH", "GH_STUB_LEDGER", "GH_STUB_MODE", "GH_STUB_FAIL_TIMES", "GH_STUB_FAIL_COUNTER"];
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  process.env.PATH = `${binDir}${path.delimiter}${saved.PATH}`;
  process.env.GH_STUB_LEDGER = ledgerPath;
  for (const [k, v] of Object.entries(extraEnv)) process.env[k] = v;
  try {
    return fn();
  } finally {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

test("transient fixture: gh() recovers from ONE 502 on the retry with backoff observed", () => {
  const counterPath = path.join(tmpDir, "fail-counter");
  withStubbedGhEnv({ GH_STUB_MODE: "graphql", GH_STUB_FAIL_TIMES: "1", GH_STUB_FAIL_COUNTER: counterPath }, () => {
    const started = Date.now();
    const out = ghProject.gh(["api", "graphql", "-f", "query=query{viewer{login}}"], { json: true });
    const elapsed = Date.now() - started;
    expect(out).toEqual({ data: {} }); // recovered fully: parsed success payload, no throw
    expect(readLedger().length).toBe(2); // attempt 1 (502) + attempt 2 (success)
    expect(elapsed).toBeGreaterThanOrEqual(450); // 500ms * attempt backoff between attempts
  });
});

test("persistent fixture: gh() exhausts exactly GH_ATTEMPTS on a 502 that never clears", () => {
  const counterPath = path.join(tmpDir, "fail-counter");
  withStubbedGhEnv({ GH_STUB_MODE: "graphql", GH_STUB_FAIL_TIMES: "99", GH_STUB_FAIL_COUNTER: counterPath }, () => {
    let caught;
    try {
      ghProject.gh(["api", "graphql", "-f", "query=query{viewer{login}}"], { json: true });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeDefined();
    expect(String(caught.stderr)).toContain("HTTP 502");
    expect(ghProject.isTransientGithubFailure(ghProject.errorText(caught))).toBe(true);
    expect(readLedger().length).toBe(ghProject.GH_ATTEMPTS); // bounded: no infinite retry
  });
});

test("gh() does NOT retry a non-transient 404 (single attempt)", () => {
  withStubbedGhEnv({ GH_STUB_MODE: "rest-fallback" }, () => {
    let caught;
    try {
      ghProject.gh(["api", "repos/o/r/issues/2/parent"], { json: true });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeDefined();
    expect(ghProject.isNotFound(caught)).toBe(true);
    expect(readLedger().length).toBe(1); // 404 throws immediately; retry is transient-only
  });
});

// ============================ RP-12: reconcileFields TRUE alias batching ============================

test("reconcileFields folds every delta write into ONE aliased m0..mN mutation document", () => {
  const calls = [];
  const gql = (doc) => {
    calls.push(doc);
    return { data: {} };
  };
  const fields = {
    Status: { id: "F-status", dataType: "ProjectV2SingleSelectField", options: { Ready: "OPT-READY" } },
    Priority: { id: "F-priority", dataType: "ProjectV2SingleSelectField", options: { high: "OPT-HIGH" } },
    Notes: { id: "F-notes", dataType: "ProjectV2Field", options: {} },
    Stale: { id: "F-stale", dataType: "ProjectV2Field", options: {} },
    Effort: { id: "F-effort", dataType: "ProjectV2SingleSelectField", options: { S: "OPT-S" } },
    Unchanged: { id: "F-unchanged", dataType: "ProjectV2SingleSelectField", options: { Done: "OPT-DONE" } },
  };
  const desired = {
    Status: "Ready", // set: single-select
    Priority: "high", // set: single-select
    Notes: 'say "hi"', // set: text (escaping exercised)
    Stale: "", // clear
    Effort: "XL", // unmapped single-select option: skipped LOUDLY, not written
    Ghost: "x", // unknown field: ignored
    Unchanged: "Done", // read-diff-skip: equals current value
  };
  const writes = ghProject.reconcileFields("P-1", "I-1", fields, desired, { Unchanged: "Done" }, { gql, journal: false });

  expect(calls.length).toBe(1); // ONE aliased mutation request, not one per field
  const doc = calls[0];
  expect(doc.startsWith("mutation{m0: ")).toBe(true);
  expect((doc.match(/m\d+: /g) || []).length).toBe(4); // 3 sets + 1 clear; unmapped/no-op/unknown excluded
  expect(doc).toContain('singleSelectOptionId:"OPT-READY"');
  expect(doc).toContain('singleSelectOptionId:"OPT-HIGH"');
  expect(doc).toContain('text:"say \\"hi\\""');
  expect(doc).toContain('clearProjectV2ItemFieldValue(input:{projectId:"P-1",itemId:"I-1",fieldId:"F-stale"})');
  expect(doc).not.toContain("F-effort");
  expect(doc).not.toContain("F-unchanged");
  expect(writes).toEqual([
    { field: "Status", set: "Ready" },
    { field: "Priority", set: "high" },
    { field: "Notes", set: 'say "hi"' },
    { field: "Stale", cleared: true },
    { field: "Effort", unmapped: "XL", knownOptions: ["S"] },
  ]);
});

test("reconcileFields with zero deltas issues zero GraphQL requests", () => {
  const calls = [];
  const gql = (doc) => {
    calls.push(doc);
    return { data: {} };
  };
  const fields = { Status: { id: "F-status", dataType: "ProjectV2SingleSelectField", options: { Ready: "OPT-READY" } } };
  const writes = ghProject.reconcileFields("P-1", "I-1", fields, { Status: "Ready" }, { Status: "Ready" }, { gql });
  expect(writes).toEqual([]);
  expect(calls.length).toBe(0);
});

// ============================ RP-38: shared board snapshot with TTL ============================

function recordingItemList(items) {
  const calls = [];
  const ghFn = (args, opts) => {
    calls.push({ args, opts });
    return { items };
  };
  return { calls, ghFn };
}

test("boardSnapshot: two consecutive reads within TTL issue ZERO network calls on the second", () => {
  const snapshotPath = path.join(tmpDir, "roadmap-items.json");
  const { calls, ghFn } = recordingItemList([{ id: "I-1", status: "Ready" }]);

  const first = ghProject.boardSnapshot({ snapshotPath, projectNumber: 2, ghFn, nowMs: 10_000 });
  expect(first.fromCache).toBe(false);
  expect(first.items).toEqual([{ id: "I-1", status: "Ready" }]);
  expect(calls.length).toBe(1);

  const second = ghProject.boardSnapshot({ snapshotPath, projectNumber: 2, ghFn, nowMs: 10_000 + 60_000 });
  expect(second.fromCache).toBe(true);
  expect(second.items).toEqual([{ id: "I-1", status: "Ready" }]);
  expect(calls.length).toBe(1); // zero additional network calls within TTL
});

test("boardSnapshot: TTL expiry and {refresh:true} both refetch", () => {
  const snapshotPath = path.join(tmpDir, "roadmap-items.json");
  const { calls, ghFn } = recordingItemList([]);
  ghProject.boardSnapshot({ snapshotPath, projectNumber: 2, ghFn, nowMs: 0 });
  ghProject.boardSnapshot({ snapshotPath, projectNumber: 2, ghFn, nowMs: ghProject.BOARD_SNAPSHOT_TTL_MS + 1 });
  expect(calls.length).toBe(2); // past TTL: refetched
  const forced = ghProject.boardSnapshot({ snapshotPath, projectNumber: 2, ghFn, nowMs: ghProject.BOARD_SNAPSHOT_TTL_MS + 2, refresh: true });
  expect(forced.fromCache).toBe(false);
  expect(calls.length).toBe(3); // refresh() forces even inside TTL
});

test("boardSnapshot: a mutating sweep invalidates, so the next read refetches", () => {
  const snapshotPath = path.join(tmpDir, "roadmap-items.json");
  const { calls, ghFn } = recordingItemList([{ id: "I-1" }]);
  ghProject.boardSnapshot({ snapshotPath, projectNumber: 2, ghFn, nowMs: 0 });
  ghProject.invalidateBoardSnapshot({ snapshotPath });
  const after = ghProject.boardSnapshot({ snapshotPath, projectNumber: 2, ghFn, nowMs: 1 });
  expect(after.fromCache).toBe(false);
  expect(calls.length).toBe(2); // invalidation dropped the TTL hit
});

test("boardSnapshot fails closed when item-list fills the --limit cap (truncation fixture)", () => {
  const snapshotPath = path.join(tmpDir, "roadmap-items.json");
  const full = Array.from({ length: ghProject.BOARD_ITEM_LIMIT }, (_, i) => ({ id: `I-${i}` }));
  const { ghFn } = recordingItemList(full);
  expect(() => ghProject.boardSnapshot({ snapshotPath, projectNumber: 2, ghFn, nowMs: 0 })).toThrow(/truncated/);
  expect(fs.existsSync(snapshotPath)).toBe(false); // a truncated page never becomes the shared snapshot
});

test("boardSnapshot accepts a bash-written bare {items:[...]} snapshot via file-mtime freshness", () => {
  const snapshotPath = path.join(tmpDir, "roadmap-items.json");
  fs.writeFileSync(snapshotPath, JSON.stringify({ items: [{ id: "I-bash" }] })); // no fetchedAtMs
  const { calls, ghFn } = recordingItemList([]);
  const out = ghProject.boardSnapshot({ snapshotPath, projectNumber: 2, ghFn, nowMs: Date.now() });
  expect(out.fromCache).toBe(true);
  expect(out.items).toEqual([{ id: "I-bash" }]);
  expect(calls.length).toBe(0);
});

// ============================ RP-25: single-select write resilience (catch-refresh-retry) ============================

function optionNotFoundError() {
  // gh api graphql exits 1 and leaves the GraphQL error message on stderr.
  return ghError({
    message: "Command failed: gh api graphql",
    stderr: "GraphQL: The single select option does not exist. (updateProjectV2ItemFieldValue)\n",
  });
}

test("isOptionNotFound classifies stale-option GraphQL failures and rejects unrelated errors", () => {
  expect(ghProject.isOptionNotFound(optionNotFoundError())).toBe(true);
  expect(ghProject.isOptionNotFound(ghError({ stderr: "GraphQL: option 'X' was not found on field 'Status'\n" }))).toBe(true);
  expect(ghProject.isOptionNotFound(ghError({ stderr: "GraphQL: Invalid single-select option id\n" }))).toBe(true);
  expect(ghProject.isOptionNotFound(ghError({ stderr: "gh: bad gateway (HTTP 502)\n" }))).toBe(false);
  expect(ghProject.isOptionNotFound(ghError({ stdout: '{"message":"Not Found","status":"404"}' }))).toBe(false);
});

test("reconcileFields: stubbed option-not-found triggers EXACTLY ONE fieldMap refresh + retry, then succeeds", () => {
  const gqlCalls = [];
  const refreshCalls = [];
  const staleFields = { Status: { id: "F-status", dataType: "ProjectV2SingleSelectField", options: { Ready: "OPT-STALE" } } };
  const freshFields = { Status: { id: "F-status", dataType: "ProjectV2SingleSelectField", options: { Ready: "OPT-FRESH" } } };
  const gql = (doc) => {
    gqlCalls.push(doc);
    if (gqlCalls.length === 1) throw optionNotFoundError();
    return { data: {} };
  };
  const fieldMapFn = (projectNumber, opts) => {
    refreshCalls.push({ projectNumber, opts });
    return freshFields;
  };
  const writes = ghProject.reconcileFields("P-1", "I-1", staleFields, { Status: "Ready" }, {}, { gql, projectNumber: 2, fieldMapFn, journal: false });

  expect(refreshCalls).toEqual([{ projectNumber: 2, opts: { refresh: true } }]); // exactly one refresh
  expect(gqlCalls.length).toBe(2); // first attempt + exactly one retry
  expect(gqlCalls[0]).toContain('singleSelectOptionId:"OPT-STALE"');
  expect(gqlCalls[1]).toContain('singleSelectOptionId:"OPT-FRESH"'); // retry re-resolves against refreshed map
  expect(writes).toEqual([{ field: "Status", set: "Ready", retriedAfterOptionRefresh: true }]);
});

test("reconcileFields retry marks options STILL unknown after refresh as loud unmapped writes", () => {
  const gqlCalls = [];
  const staleFields = { Status: { id: "F-status", dataType: "ProjectV2SingleSelectField", options: { Ready: "OPT-STALE" } } };
  const freshFields = { Status: { id: "F-status", dataType: "ProjectV2SingleSelectField", options: { Done: "OPT-DONE" } } };
  const gql = (doc) => {
    gqlCalls.push(doc);
    if (gqlCalls.length === 1) throw optionNotFoundError();
    return { data: {} };
  };
  const writes = ghProject.reconcileFields("P-1", "I-1", staleFields, { Status: "Ready" }, {}, { gql, projectNumber: 2, fieldMapFn: () => freshFields });
  expect(gqlCalls.length).toBe(1); // retry document is empty (sole write became unmapped): no second request
  expect(writes).toEqual([{ field: "Status", unmapped: "Ready", knownOptions: ["Done"], retriedAfterOptionRefresh: true }]);
});

test("reconcileFields does NOT refresh on non-option failures or when projectNumber is unknown", () => {
  const fields = { Status: { id: "F-status", dataType: "ProjectV2SingleSelectField", options: { Ready: "OPT-READY" } } };
  let refreshes = 0;
  const fieldMapFn = () => {
    refreshes += 1;
    return fields;
  };
  // non-option failure: rethrown unchanged, zero refreshes
  const transient = () => {
    throw ghError({ stderr: "gh: Bad Gateway (HTTP 502)\n" });
  };
  expect(() => ghProject.reconcileFields("P-1", "I-1", fields, { Status: "Ready" }, {}, { gql: transient, projectNumber: 2, fieldMapFn })).toThrow();
  // option failure WITHOUT projectNumber: rethrown unchanged, zero refreshes (legacy callers)
  const stale = () => {
    throw optionNotFoundError();
  };
  expect(() => ghProject.reconcileFields("P-1", "I-1", fields, { Status: "Ready" }, {}, { gql: stale, fieldMapFn })).toThrow();
  expect(refreshes).toBe(0);
});

// ============================ RP-57: roadmap-changes.ndjson journal touchpoint ============================

test("RP-57: a field mutation through reconcileFields appends one journal line per applied write ({item,field,old,new,actor,ts})", () => {
  const journalPath = path.join(tmpDir, "roadmap-changes.ndjson");
  const gql = () => ({ data: {} });
  const fields = {
    Status: { id: "F-status", dataType: "ProjectV2SingleSelectField", options: { Done: "OPT-DONE" } },
    Notes: { id: "F-notes", dataType: "ProjectV2Field", options: {} },
    Effort: { id: "F-effort", dataType: "ProjectV2SingleSelectField", options: { S: "OPT-S" } },
  };
  ghProject.reconcileFields(
    "P-1",
    "PVTI_journal1",
    fields,
    { Status: "Done", Notes: "", Effort: "XL" }, // set + clear + unmapped-skip
    { Status: "Ready", Notes: "old note" },
    { gql, journal: { journalPath, nowMs: 42, actor: "wave-test" } },
  );
  const lines = fs.readFileSync(journalPath, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  expect(lines.length).toBe(2); // set + clear journaled; the unmapped skip mutated nothing
  expect(lines[0]).toEqual({ item: "PVTI_journal1", field: "Status", old: "Ready", new: "Done", actor: "wave-test", ts: new Date(42).toISOString() });
  expect(lines[1]).toEqual({ item: "PVTI_journal1", field: "Notes", old: "old note", new: null, actor: "wave-test", ts: new Date(42).toISOString() });
});

test("RP-57: a FAILED mutation journals nothing; the RP-25 retry path journals the retried writes", () => {
  const journalPath = path.join(tmpDir, "roadmap-changes.ndjson");
  // hard failure: nothing lands, nothing journals
  const boom = () => {
    throw ghError({ stderr: "gh: Bad Gateway (HTTP 502)\n" });
  };
  const fields = { Status: { id: "F-status", dataType: "ProjectV2SingleSelectField", options: { Ready: "OPT-READY" } } };
  expect(() =>
    ghProject.reconcileFields("P-1", "I-1", fields, { Status: "Ready" }, {}, { gql: boom, projectNumber: 2, fieldMapFn: () => fields, journal: { journalPath, nowMs: 1, actor: "x" } }),
  ).toThrow();
  expect(fs.existsSync(journalPath)).toBe(false);

  // option-not-found retry: the SECOND (successful) document journals
  let calls = 0;
  const gql = () => {
    calls += 1;
    if (calls === 1) throw optionNotFoundError();
    return { data: {} };
  };
  const fresh = { Status: { id: "F-status", dataType: "ProjectV2SingleSelectField", options: { Ready: "OPT-FRESH" } } };
  ghProject.reconcileFields("P-1", "PVTI_retry", fields, { Status: "Ready" }, {}, { gql, projectNumber: 2, fieldMapFn: () => fresh, journal: { journalPath, nowMs: 2, actor: "x" } });
  const lines = fs.readFileSync(journalPath, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  expect(lines.length).toBe(1);
  expect(lines[0].item).toBe("PVTI_retry");
  expect(lines[0].new).toBe("Ready");
});

test("RP-57: journal:false disables the touchpoint and a journal failure never fails a landed mutation", () => {
  const gql = () => ({ data: {} });
  const fields = { Status: { id: "F-status", dataType: "ProjectV2SingleSelectField", options: { Done: "OPT-DONE" } } };
  const offPath = path.join(tmpDir, "off.ndjson");
  ghProject.reconcileFields("P-1", "I-1", fields, { Status: "Done" }, {}, { gql, journal: false });
  expect(fs.existsSync(offPath)).toBe(false);
  // journalPath pointing INTO A FILE (unwritable dir path) forces the append to throw inside
  // the touchpoint; the reconcile must still return its writes (best-effort audit trail).
  const blocker = path.join(tmpDir, "blocker");
  fs.writeFileSync(blocker, "x");
  const writes = ghProject.reconcileFields("P-1", "I-1", fields, { Status: "Done" }, {}, { gql, journal: { journalPath: path.join(blocker, "nested.ndjson"), nowMs: 1, actor: "x" } });
  expect(writes).toEqual([{ field: "Status", set: "Done" }]);
});

// ============================ schema fixture: Issue.parent/subIssues availability ============================

test("issueHierarchyFieldsAvailable schema fixture gates on Issue.parent + Issue.subIssues", () => {
  const withFields = { data: { __type: { fields: [{ name: "id" }, { name: "parent" }, { name: "subIssues" }] } } };
  const missingParent = { data: { __type: { fields: [{ name: "id" }, { name: "subIssues" }] } } };
  const missingSubIssues = { data: { __type: { fields: [{ name: "id" }, { name: "parent" }] } } };
  expect(ghProject.issueHierarchyFieldsAvailable(withFields)).toBe(true);
  expect(ghProject.issueHierarchyFieldsAvailable(missingParent)).toBe(false);
  expect(ghProject.issueHierarchyFieldsAvailable(missingSubIssues)).toBe(false);
  expect(ghProject.issueHierarchyFieldsAvailable({})).toBe(false);
  expect(ghProject.issueHierarchyFieldsAvailable(null)).toBe(false);
});

test("probeIssueHierarchyFields degrades to false (REST fallback) on probe failure, true when fields exist", () => {
  expect(
    ghProject.probeIssueHierarchyFields({
      refresh: true,
      gql: () => {
        throw new Error("boom");
      },
    }),
  ).toBe(false);
  expect(
    ghProject.probeIssueHierarchyFields({
      refresh: true,
      gql: () => ({ data: { __type: { fields: [{ name: "parent" }, { name: "subIssues" }] } } }),
    }),
  ).toBe(true);
});

// ============================ issueHierarchy: aliased batching + chunking at 50 ============================

function recordingGql(calls) {
  return (query) => {
    calls.push(query);
    const data = {};
    for (const m of query.matchAll(/(i\d+): repository\(owner:"[^"]+",name:"[^"]+"\)\{issue\(number:(\d+)\)/g)) {
      data[m[1]] = { issue: { databaseId: 1000 + Number(m[2]), parent: null } };
    }
    return { data };
  };
}

test("issueHierarchy chunks at 50 aliases per GraphQL document", () => {
  const calls = [];
  const issues = Array.from({ length: 120 }, (_, i) => ({ repo: "o/r", number: i + 1 }));
  const out = ghProject.issueHierarchy(issues, { gql: recordingGql(calls) });
  expect(calls.length).toBe(3); // 50 + 50 + 20
  expect((calls[0].match(/i\d+:/g) || []).length).toBe(50);
  expect((calls[1].match(/i\d+:/g) || []).length).toBe(50);
  expect((calls[2].match(/i\d+:/g) || []).length).toBe(20);
  expect(out.size).toBe(120);
  expect(out.get("o/r#7")).toEqual({ databaseId: 1007, parent: null });
  expect(out.get("o/r#120")).toEqual({ databaseId: 1120, parent: null });
});

test("issueHierarchy maps parent {number repository{nameWithOwner}} and null parents", () => {
  const gql = (query) => {
    expect(query).toContain("databaseId parent{number repository{nameWithOwner}}");
    return {
      data: {
        i0: { issue: { databaseId: 11, parent: { number: 9, repository: { nameWithOwner: "o/other" } } } },
        i1: { issue: { databaseId: 12, parent: null } },
      },
    };
  };
  const out = ghProject.issueHierarchy(
    [
      { repo: "o/r", number: 2 },
      { repo: "o/r", number: 3 },
    ],
    { gql },
  );
  expect(out.get("o/r#2")).toEqual({ databaseId: 11, parent: { repo: "o/other", number: 9 } });
  expect(out.get("o/r#3")).toEqual({ databaseId: 12, parent: null });
});

test("issueHierarchy throws on an unresolved child instead of silently dropping it", () => {
  const gql = () => ({ data: { i0: null } });
  expect(() => ghProject.issueHierarchy([{ repo: "o/r", number: 2 }], { gql })).toThrow(/could not resolve o\/r#2/);
});

// ============================ RP-36: batchIssueRead aliased batch-read layer ============================

function batchRecordingGql(calls, { bodies = {} } = {}) {
  return (query) => {
    calls.push(query);
    if (query.includes("__type")) {
      return { data: { __type: { fields: [{ name: "parent" }, { name: "subIssues" }] } } };
    }
    const data = {};
    for (const m of query.matchAll(/(i\d+): repository\(owner:"([^"]+)",name:"([^"]+)"\)\{issue\(number:(\d+)\)/g)) {
      const n = Number(m[4]);
      data[m[1]] = {
        issue: {
          id: `NID-${n}`,
          databaseId: 1000 + n,
          number: n,
          state: "OPEN",
          title: `T${n}`,
          body: bodies[n] !== undefined ? bodies[n] : `body-${n}`,
          labels: { nodes: [{ name: "ready-for-agent" }, { name: "bug" }] },
          parent: n === 2 ? { number: 1, repository: { nameWithOwner: `${m[2]}/${m[3]}` } } : null,
          subIssues: { nodes: n === 1 ? [{ number: 2, repository: { nameWithOwner: `${m[2]}/${m[3]}` } }] : [] },
        },
      };
    }
    return { data };
  };
}

test("batchIssueRead: a 100-issue read costs <=2 GraphQL calls (probe + ONE aliased document)", () => {
  const calls = [];
  const gql = batchRecordingGql(calls);
  // reset the per-process schema-probe memo so the probe call is COUNTED here (worst case)
  expect(ghProject.probeIssueHierarchyFields({ refresh: true, gql })).toBe(true);
  const issues = Array.from({ length: 100 }, (_, i) => ({ repo: `o/r${i % 10}`, number: i + 1 }));
  const out = ghProject.batchIssueRead(issues, { gql });
  expect(calls.length).toBeLessThanOrEqual(2); // RP-36 acceptance bound: probe + 1 document
  expect((calls[calls.length - 1].match(/i\d+:/g) || []).length).toBe(100);
  expect(out.size).toBe(100);
  const rec = out.get("o/r6#7");
  expect(rec.databaseId).toBe(1007);
  expect(rec.body).toBe("body-7");
  expect(rec.state).toBe("OPEN");
  expect(rec.labels).toEqual(["ready-for-agent", "bug"]);
});

test("batchIssueRead maps parent/subIssues when the schema offers them, and skips them when not", () => {
  const calls = [];
  const out = ghProject.batchIssueRead(
    [
      { repo: "o/r", number: 1 },
      { repo: "o/r", number: 2 },
    ],
    { gql: batchRecordingGql(calls) },
  );
  expect(out.get("o/r#2").parent).toEqual({ repo: "o/r", number: 1 });
  expect(out.get("o/r#1").parent).toBeNull();
  expect(out.get("o/r#1").subIssues).toEqual([{ repo: "o/r", number: 2 }]);

  // includeHierarchy:false: no schema probe, no hierarchy fields in the document
  const noH = [];
  const flat = ghProject.batchIssueRead([{ repo: "o/r", number: 3 }], { gql: batchRecordingGql(noH), includeHierarchy: false });
  expect(noH.length).toBe(1); // no probe call
  expect(noH[0]).not.toContain("parent{");
  expect(flat.get("o/r#3").parent).toBeUndefined();
});

test("batchIssueRead throws on an unresolved issue instead of silently dropping it", () => {
  const gql = (query) =>
    query.includes("__type") ? { data: { __type: { fields: [{ name: "parent" }, { name: "subIssues" }] } } } : { data: { i0: null } };
  expect(() => ghProject.batchIssueRead([{ repo: "o/r", number: 9 }], { gql })).toThrow(/could not resolve o\/r#9/);
});

test("batchIssueRead chunks above ISSUE_BATCH_CHUNK aliases per document", () => {
  const calls = [];
  const issues = Array.from({ length: ghProject.ISSUE_BATCH_CHUNK + 20 }, (_, i) => ({ repo: "o/r", number: i + 1 }));
  ghProject.batchIssueRead(issues, { gql: batchRecordingGql(calls), includeHierarchy: false });
  expect(calls.length).toBe(2); // 100 + 20
  expect((calls[0].match(/i\d+:/g) || []).length).toBe(ghProject.ISSUE_BATCH_CHUNK);
  expect((calls[1].match(/i\d+:/g) || []).length).toBe(20);
});

// ============================ RP-36: ensureProject/projectInfo process memo ============================

test("ensureProject memoizes per process; {refresh:true} re-lists", () => {
  const saved = { PATH: process.env.PATH, GH_STUB_LEDGER: process.env.GH_STUB_LEDGER };
  const projListStub = `#!/usr/bin/env bun
const fs = require("node:fs");
if (process.env.GH_STUB_LEDGER) fs.appendFileSync(process.env.GH_STUB_LEDGER, JSON.stringify(process.argv.slice(2)) + "\\n");
process.stdout.write(JSON.stringify({ projects: [{ title: "CuraOS Roadmap", number: 2 }] }));
`;
  fs.writeFileSync(path.join(binDir, "gh"), projListStub, { mode: 0o755 });
  process.env.PATH = `${binDir}${path.delimiter}${saved.PATH}`;
  process.env.GH_STUB_LEDGER = ledgerPath;
  try {
    const first = ghProject.ensureProject({ refresh: true }); // refresh first: another test may have primed the memo
    const second = ghProject.ensureProject();
    const third = ghProject.ensureProject();
    expect(first).toBe(2);
    expect(second).toBe(2);
    expect(third).toBe(2);
    const listCalls = readLedger().filter((args) => args[0] === "project" && args[1] === "list");
    expect(listCalls.length).toBe(1); // memo: ONE gh project list for three calls
    ghProject.ensureProject({ refresh: true });
    expect(readLedger().filter((args) => args[0] === "project" && args[1] === "list").length).toBe(2);
  } finally {
    process.env.PATH = saved.PATH;
    if (saved.GH_STUB_LEDGER === undefined) delete process.env.GH_STUB_LEDGER;
    else process.env.GH_STUB_LEDGER = saved.GH_STUB_LEDGER;
  }
});

// ============================ regression: wire workflow call ledger + zero stderr passthrough ============================

test("wiring N children issues ONE aliased GraphQL hierarchy read, not 2N REST reads", () => {
  const run = runDriver("graphql");
  expect(run.status).toBe(0);
  const result = JSON.parse(run.stdout.trim().split("\n").pop());
  expect(result.subissues_added.sort()).toEqual(["o/r#2", "o/r#3"]);
  expect(result.reparented).toEqual([]);

  const ledger = readLedger();
  const graphqlCalls = ledger.filter((args) => args[0] === "api" && args[1] === "graphql");
  const schemaProbes = graphqlCalls.filter((args) => args.some((a) => a.includes("__type")));
  const hierarchyReads = graphqlCalls.filter((args) => args.some((a) => a.includes("databaseId parent{")));
  expect(schemaProbes.length).toBe(1);
  expect(hierarchyReads.length).toBe(1); // ONE aliased read for both children
  expect(hierarchyReads[0].some((a) => a.includes("i0:") && a.includes("i1:"))).toBe(true);
  // zero per-child REST pair calls on the GraphQL path
  const restParentProbes = ledger.filter((args) => args.some((a) => /issues\/\d+\/parent$/.test(a)));
  const restDbIdReads = ledger.filter((args) => args[0] === "api" && /repos\/o\/r\/issues\/[23]$/.test(args[1]));
  expect(restParentProbes.length).toBe(0);
  expect(restDbIdReads.length).toBe(0);
});

test("subissue max-depth validation is recorded instead of failing the wire workflow", () => {
  const run = runDriver("graphql", { GH_STUB_SUBISSUE_DEPTH_LIMIT: "1" });
  expect(run.status).toBe(0);
  const result = JSON.parse(run.stdout.trim().split("\n").pop());
  expect(result.subissues_added).toEqual([]);
  expect(result.subissues_depth_limited.sort()).toEqual(["o/r#2", "o/r#3"]);
  expect(result.blocked_by_external).toBe(false);
  expect(result.error_kind).toBe("github-subissue-depth-limit");
  expect(result.error).toContain("more than 7 layers of sub-issues");
  expect(run.stderr).not.toContain("more than 7 layers of sub-issues");
});

test("regression: exact parent-probe 404 classifies null parent with ZERO stderr passthrough", () => {
  // rest-fallback mode: schema probe lacks Issue.parent/subIssues, so the workflow takes the
  // classified REST pair and the stub parent probe fails with GitHub's EXACT message
  // {"message":"No parent issue found","status":"404"} + "gh: No parent issue found (HTTP 404)".
  const run = runDriver("rest-fallback");
  expect(run.status).toBe(0);
  // null-parent classification: both children wire cleanly, nothing reparented, no throw
  const result = JSON.parse(run.stdout.trim().split("\n").pop());
  expect(result.subissues_added.sort()).toEqual(["o/r#2", "o/r#3"]);
  expect(result.reparented).toEqual([]);
  // zero passthrough of the expected-404 probe noise to the calling process's stderr
  expect(run.stderr).not.toContain("No parent issue found");
  expect(run.stderr).not.toContain("HTTP 404");
  // the REST fallback really ran (probe per child), proving the schema guard is exercised
  const ledger = readLedger();
  const restParentProbes = ledger.filter((args) => args.some((a) => /issues\/\d+\/parent$/.test(a)));
  expect(restParentProbes.length).toBe(2);
});
