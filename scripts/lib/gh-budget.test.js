// scripts/lib/gh-budget.test.js
// RP-40: ETag store round-trip + conditional GET revalidation (304 serves the cached body with
// zero refetch) + /notifications If-Modified-Since + X-Poll-Interval surfacing + store file mode.
// Runner: bun test. Network is never touched: exec is injected with recorded payloads.
const { test, expect, beforeEach, afterEach } = require("bun:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ghBudget = require("./gh-budget.js");

let tmpDir;
let storePath;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "curaos-ghbudget-"));
  storePath = path.join(tmpDir, "etag-store.json");
});
afterEach(() => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {}
});

function payload({ status = 200, headers = {}, body = "" } = {}) {
  const statusText = { 200: "OK", 304: "Not Modified" }[status] || "";
  const head = [`HTTP/2.0 ${status} ${statusText}`, ...Object.entries(headers).map(([k, v]) => `${k}: ${v}`)];
  return `${head.join("\r\n")}\r\n\r\n${body}`;
}

// ============================ parseIncludePayload ============================

test("parseIncludePayload splits status, lowercased headers, and body", () => {
  const parsed = ghBudget.parseIncludePayload(
    payload({ status: 200, headers: { ETag: 'W/"abc"', "X-Poll-Interval": "60" }, body: '[{"id":1}]' }),
  );
  expect(parsed.status).toBe(200);
  expect(parsed.headers.etag).toBe('W/"abc"');
  expect(parsed.headers["x-poll-interval"]).toBe("60");
  expect(parsed.body).toBe('[{"id":1}]');
});

test("parseIncludePayload tolerates a 304 with no body", () => {
  const parsed = ghBudget.parseIncludePayload(payload({ status: 304, headers: { "X-Poll-Interval": "60" } }));
  expect(parsed.status).toBe(304);
  expect(parsed.body).toBe("");
});

// ============================ ETag store round-trip (RP-40 acceptance) ============================

test("ETag store round-trips entries keyed (token, endpoint); distinct tokens never share entries", () => {
  const store = ghBudget.loadEtagStore(storePath);
  expect(store).toEqual({}); // missing file degrades to empty store
  store[ghBudget.storeKey("aaaa111122223333", "/notifications")] = { etag: 'W/"a"', body: "[]", fetchedAtMs: 1 };
  store[ghBudget.storeKey("bbbb111122223333", "/notifications")] = { etag: 'W/"b"', body: "[1]", fetchedAtMs: 2 };
  ghBudget.saveEtagStore(store, storePath);

  const loaded = ghBudget.loadEtagStore(storePath);
  expect(loaded[ghBudget.storeKey("aaaa111122223333", "/notifications")].etag).toBe('W/"a"');
  expect(loaded[ghBudget.storeKey("bbbb111122223333", "/notifications")].etag).toBe('W/"b"');
  expect(ghBudget.storeKey("aaaa111122223333", "/x")).not.toBe(ghBudget.storeKey("bbbb111122223333", "/x"));
});

test("saveEtagStore enforces 0600 on the store file (cached bodies are private)", () => {
  ghBudget.saveEtagStore({ k: { body: "x" } }, storePath);
  const mode = fs.statSync(storePath).mode & 0o777;
  expect(mode).toBe(0o600);
});

// ============================ conditionalRequest: 200 then 304 ============================

test("conditionalRequest stores the ETag on 200 and serves the CACHED body on a 304 revalidation", () => {
  const calls = [];
  const exec = (endpoint, headers) => {
    calls.push({ endpoint, headers });
    if (calls.length === 1) {
      return payload({ status: 200, headers: { ETag: 'W/"v1"', "Last-Modified": "Tue, 09 Jun 2026 00:00:00 GMT", "X-RateLimit-Remaining": "4999" }, body: '[{"id":7}]' });
    }
    return payload({ status: 304, headers: { "X-RateLimit-Remaining": "4999" } });
  };

  const first = ghBudget.conditionalRequest("/notifications", { exec, storePath, token: "t1", nowMs: 1000 });
  expect(first.status).toBe(200);
  expect(first.notModified).toBe(false);
  expect(first.body).toBe('[{"id":7}]');
  expect(calls[0].headers).toEqual({}); // nothing cached yet: no revalidators sent

  const second = ghBudget.conditionalRequest("/notifications", { exec, storePath, token: "t1", nowMs: 2000 });
  expect(calls[1].headers["If-None-Match"]).toBe('W/"v1"'); // revalidators from the store
  expect(calls[1].headers["If-Modified-Since"]).toBe("Tue, 09 Jun 2026 00:00:00 GMT");
  expect(second.status).toBe(304);
  expect(second.notModified).toBe(true);
  expect(second.fromCache).toBe(true);
  expect(second.body).toBe('[{"id":7}]'); // cached body, zero body transfer
  expect(second.rateLimitRemaining).toBe(4999);
});

test("conditionalRequest refreshes the stored entry when content changes (new ETag, new body)", () => {
  const exec = (() => {
    let n = 0;
    return () => {
      n += 1;
      return payload({ status: 200, headers: { ETag: `W/"v${n}"` }, body: `[${n}]` });
    };
  })();
  ghBudget.conditionalRequest("/repos/o/r/labels", { exec, storePath, token: "t1", nowMs: 1 });
  const out = ghBudget.conditionalRequest("/repos/o/r/labels", { exec, storePath, token: "t1", nowMs: 2 });
  expect(out.body).toBe("[2]");
  const entry = ghBudget.loadEtagStore(storePath)[ghBudget.storeKey("t1", "/repos/o/r/labels")];
  expect(entry.etag).toBe('W/"v2"');
  expect(entry.body).toBe("[2]");
});

// ============================ notificationsPoll: X-Poll-Interval hint ============================

test("notificationsPoll surfaces the X-Poll-Interval hint on both 200 and 304", () => {
  const exec = (() => {
    let n = 0;
    return (endpoint) => {
      expect(endpoint).toBe("/notifications");
      n += 1;
      return n === 1
        ? payload({ status: 200, headers: { "Last-Modified": "Tue, 09 Jun 2026 00:00:00 GMT", "X-Poll-Interval": "60" }, body: "[]" })
        : payload({ status: 304, headers: { "X-Poll-Interval": "60" } });
    };
  })();
  const first = ghBudget.notificationsPoll({ exec, storePath, token: "t1", nowMs: 1 });
  expect(first.pollIntervalSec).toBe(60);
  const second = ghBudget.notificationsPoll({ exec, storePath, token: "t1", nowMs: 2 });
  expect(second.notModified).toBe(true);
  expect(second.pollIntervalSec).toBe(60);
  expect(second.body).toBe("[]");
});

// ============================ execGhInclude: gh exits NONZERO on 304 (live-verified) ============================

test("regression: a gh 'HTTP 304' error exit still yields the cached body (gh api errors on 304)", () => {
  // Live-verified 2026-06-10: gh api --include exits 1 on 304 with "gh: HTTP 304" on stderr and
  // the status line + headers on stdout. Stub gh reproduces that exactly.
  const binDir = path.join(tmpDir, "bin");
  fs.mkdirSync(binDir, { recursive: true });
  fs.writeFileSync(
    path.join(binDir, "gh"),
    [
      "#!/bin/sh",
      'if [ "$1" = "auth" ]; then echo dummy-token; exit 0; fi',
      'case "$*" in',
      '  *If-None-Match*) printf "HTTP/2.0 304 Not Modified\\r\\nX-RateLimit-Remaining: 4997\\r\\n\\r\\n"; echo "gh: HTTP 304" >&2; exit 1;;',
      '  *) printf "HTTP/2.0 200 OK\\r\\nEtag: W/\\"live\\"\\r\\nX-RateLimit-Remaining: 4997\\r\\n\\r\\n[7]";;',
      "esac",
    ].join("\n"),
    { mode: 0o755 },
  );
  const savedPath = process.env.PATH;
  process.env.PATH = `${binDir}${path.delimiter}${savedPath}`;
  try {
    const first = ghBudget.conditionalRequest("/notifications", { storePath, token: "t1" });
    expect(first.status).toBe(200);
    const second = ghBudget.conditionalRequest("/notifications", { storePath, token: "t1" });
    expect(second.status).toBe(304);
    expect(second.notModified).toBe(true);
    expect(second.body).toBe("[7]");
    expect(second.rateLimitRemaining).toBe(4997);
  } finally {
    process.env.PATH = savedPath;
  }
});

// ============================ token isolation ============================

test("a 304 for one token never serves another token's cached body", () => {
  const exec200 = () => payload({ status: 200, headers: { ETag: 'W/"a"' }, body: "[1]" });
  ghBudget.conditionalRequest("/notifications", { exec: exec200, storePath, token: "tokA", nowMs: 1 });
  // tokB has no entry: even though the server WOULD 304 for tokA's etag, tokB sends no
  // revalidators and a bare 304 without a cached entry falls through to a stored-as-new entry.
  const calls = [];
  const exec = (endpoint, headers) => {
    calls.push(headers);
    return payload({ status: 200, headers: { ETag: 'W/"b"' }, body: "[2]" });
  };
  const out = ghBudget.conditionalRequest("/notifications", { exec, storePath, token: "tokB", nowMs: 2 });
  expect(calls[0]).toEqual({}); // no cross-token revalidators
  expect(out.body).toBe("[2]");
});

// ============================ RP-42: budget ledger + preflight ============================

function stubBudgets({ core = 5000, graphql = 5000, search = 30, coreLimit = 5000, graphqlLimit = 5000, searchLimit = 30 } = {}) {
  return {
    core: { limit: coreLimit, remaining: core, resetAt: "2026-06-10T12:00:00Z" },
    graphql: { limit: graphqlLimit, remaining: graphql, resetAt: "2026-06-10T12:05:00Z" },
    search: { limit: searchLimit, remaining: search, resetAt: "2026-06-10T11:01:00Z" },
  };
}

test("readBudgets reads REST rate_limit + the GraphQL rateLimit probe and persists the ledger", () => {
  const ledgerPath = path.join(tmpDir, "budget-ledger.json");
  const restCalls = [];
  const execRest = (args) => {
    restCalls.push(args);
    return { resources: { core: { limit: 5000, remaining: 4200, reset: 1765368000 }, graphql: { limit: 5000, remaining: 3000, reset: 1765368300 }, search: { limit: 30, remaining: 28, reset: 1765364500 } } };
  };
  const execGql = (args) => {
    expect(args.join(" ")).toContain(ghBudget.GRAPHQL_RATE_LIMIT_QUERY);
    return { data: { rateLimit: { limit: 5000, remaining: 2950, resetAt: "2026-06-10T12:05:00Z" } } };
  };
  const ledger = ghBudget.readBudgets({ execRest, execGql, nowMs: 777, ledgerPath });
  expect(restCalls[0]).toEqual(["api", "rate_limit"]);
  expect(ledger.fetchedAtMs).toBe(777);
  expect(ledger.graphqlProbe).toBe("graphql");
  // the GraphQL probe is authoritative for the graphql budget (REST mirror can lag)
  expect(ledger.budgets.graphql.remaining).toBe(2950);
  expect(ledger.budgets.core.remaining).toBe(4200);
  expect(ledger.budgets.search.remaining).toBe(28);
  const reloaded = ghBudget.loadBudgetLedger(ledgerPath);
  expect(reloaded).toEqual(ledger); // ledger round-trips through .cache persistence
});

test("readBudgets degrades to the REST graphql mirror when the GraphQL probe fails", () => {
  const ledgerPath = path.join(tmpDir, "budget-ledger.json");
  const execRest = () => ({ resources: { core: { limit: 5000, remaining: 100, reset: 1 }, graphql: { limit: 5000, remaining: 90, reset: 1 }, search: { limit: 30, remaining: 5, reset: 1 } } });
  const execGql = () => { throw new Error("gh: API rate limit exceeded"); };
  const ledger = ghBudget.readBudgets({ execRest, execGql, nowMs: 1, ledgerPath });
  expect(ledger.graphqlProbe).toBe("rest-fallback");
  expect(ledger.budgets.graphql.remaining).toBe(90);
});

// RP-42 acceptance: with stubbed remaining below 2x estimate, the wave defers fan-out and
// reports the deferral reason.
test("preflight defers when remaining GraphQL budget is below 2x the estimate (deferral reason reported)", () => {
  const budgets = stubBudgets({ graphql: 150 });
  const decision = ghBudget.preflight({ budgets, estimate: { graphqlPoints: 100 }, reservePoints: 0 });
  expect(decision.action).toBe("defer");
  expect(decision.ok).toBe(false);
  expect(decision.reason).toContain("graphql budget too low");
  expect(decision.reason).toContain("need 200 (2x 100)");
});

// RP-42 acceptance: closeout sweep reservation enforced (stub).
test("preflight enforces the ~500-point closeout-sweep reserve: same estimate passes with reserve 0, defers with the reserve on", () => {
  const budgets = stubBudgets({ graphql: 600 });
  const withoutReserve = ghBudget.preflight({ budgets, estimate: { graphqlPoints: 60 }, reservePoints: 0 });
  expect(withoutReserve.action).toBe("proceed");
  const withReserve = ghBudget.preflight({ budgets, estimate: { graphqlPoints: 60 } }); // default 500-point reserve
  expect(withReserve.action).toBe("defer");
  expect(withReserve.reason).toContain("closeout reserve");
  expect(withReserve.checks.graphql.available).toBe(100); // 600 remaining minus 500 reserved
});

test("preflight downgrades to REST enumeration when GraphQL is starved but core absorbs the fallback", () => {
  const budgets = stubBudgets({ graphql: 0, core: 4000 });
  const decision = ghBudget.preflight({ budgets, estimate: { graphqlPoints: 100, restCalls: 50, restFallbackCalls: 300 } });
  expect(decision.action).toBe("downgrade-rest");
  expect(decision.ok).toBe(true);
  expect(decision.reason).toContain("downgrading enumeration to REST");
});

test("preflight defers on search starvation (no cheaper representation for search reads)", () => {
  const budgets = stubBudgets({ search: 3 });
  const decision = ghBudget.preflight({ budgets, estimate: { graphqlPoints: 1, searchCalls: 6 } });
  expect(decision.action).toBe("defer");
  expect(decision.reason).toContain("search budget too low");
});

test("routeRead routes to whichever budget has headroom (GraphQL reserve honored)", () => {
  // GraphQL has raw remaining but the closeout reserve eats it: core wins.
  const starved = stubBudgets({ graphql: 510, core: 4000 });
  const pick = ghBudget.routeRead(starved, { graphql: 20, core: 30 });
  expect(pick.budget).toBe("core");
  // With plenty of GraphQL headroom and a starved core, GraphQL wins.
  const rich = stubBudgets({ graphql: 4900, core: 10 });
  const pick2 = ghBudget.routeRead(rich, { graphql: 20, core: 30 });
  expect(pick2.budget).toBe("graphql");
  // Nothing affordable: null with reason.
  const empty = stubBudgets({ graphql: 0, core: 0, search: 0 });
  const pick3 = ghBudget.routeRead(empty, { graphql: 1, core: 1, search: 1 });
  expect(pick3.budget).toBe(null);
});
