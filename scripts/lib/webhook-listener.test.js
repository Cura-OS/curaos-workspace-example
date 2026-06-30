// scripts/lib/webhook-listener.test.js
// RP-54 security checklist tests. Runner: bun test. No network and NO sockets in the
// blocking suite: dispatch/exec/clock/store are injected, and the HTTP transport pipeline
// is exercised through createRequestHandler with injected req/res streams (codex G-04).
// A real socket-binding smoke test exists behind WEBHOOK_SOCKET_TEST=1 only.
// Each checklist line from the RP-54 spec has at least one dedicated test:
//   replay/timestamp window, delivery-id idempotency (incl. fail-closed corrupt ledger),
//   event allowlist, payload size bounds (before parse), fail-closed empty secret,
//   log redaction, HMAC timingSafeEqual verify, loopback-only bind (TLS/proxy contract).
const { test, expect, beforeEach, afterEach } = require("bun:test");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const wh = require("./webhook-listener.js");

const SECRET = "test-secret-3f9c";
const NOW = Date.parse("2026-06-10T12:00:00Z");

let tmpDir;
let storePath;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "curaos-webhook-"));
  storePath = path.join(tmpDir, "deliveries.json");
});
afterEach(() => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {}
});

function sign(body, secret = SECRET) {
  return `sha256=${crypto.createHmac("sha256", secret).update(body).digest("hex")}`;
}

// Builds a fully valid delivery; tests then break exactly one property each.
function delivery({ event = "issues", id = "delivery-1", body = JSON.stringify({ action: "labeled" }), secret = SECRET, dateMs = NOW } = {}) {
  return {
    headers: {
      "x-github-event": event,
      "x-github-delivery": id,
      "x-hub-signature-256": sign(body, secret),
      date: new Date(dateMs).toUTCString(),
    },
    rawBody: body,
  };
}

function handle(input, overrides = {}) {
  const calls = [];
  const logs = [];
  const result = wh.handleDelivery({
    ...input,
    secret: SECRET,
    nowMs: NOW,
    storePath,
    dispatch: (event) => calls.push(event),
    log: (fields) => logs.push(JSON.stringify(fields)),
    ...overrides,
  });
  return { result, calls, logs };
}

// ---- happy path ----
test("valid signed allowlisted delivery dispatches convergers exactly once", () => {
  const { result, calls } = handle(delivery());
  expect(result.status).toBe(202);
  expect(result.decision).toBe("dispatched");
  expect(calls).toEqual(["issues"]);
});

// ---- HMAC verify (timingSafeEqual) ----
test("unsigned payload is rejected 401", () => {
  const input = delivery();
  delete input.headers["x-hub-signature-256"];
  const { result, calls } = handle(input);
  expect(result.status).toBe(401);
  expect(calls.length).toBe(0);
});

test("tampered body fails signature verification", () => {
  const input = delivery();
  input.rawBody = JSON.stringify({ action: "labeled", injected: true });
  const { result, calls } = handle(input);
  expect(result.status).toBe(401);
  expect(calls.length).toBe(0);
});

test("signature signed with the wrong secret is rejected", () => {
  const body = JSON.stringify({ action: "labeled" });
  const input = delivery({ body, secret: "wrong-secret" });
  const { result } = handle(input);
  expect(result.status).toBe(401);
});

test("verifySignature accepts only the sha256= scheme and uses timingSafeEqual digests", () => {
  const body = "{}";
  expect(wh.verifySignature(body, sign(body), SECRET)).toBe(true);
  expect(wh.verifySignature(body, sign(body).replace("sha256=", "sha1="), SECRET)).toBe(false);
  expect(wh.verifySignature(body, "", SECRET)).toBe(false);
  // Different-length forgeries must return false, not throw (timingSafeEqual length trap).
  expect(wh.verifySignature(body, "sha256=abc", SECRET)).toBe(false);
});

// ---- fail-closed empty secret ----
test("loadSecret throws on missing or whitespace secret (fail-closed)", () => {
  expect(() => wh.loadSecret({ env: {} })).toThrow(/fail-closed/);
  expect(() => wh.loadSecret({ env: { CURAOS_WEBHOOK_SECRET: "   " } })).toThrow(/fail-closed/);
});

test("loadSecret prefers the secret file and trims it", () => {
  const secretFile = path.join(tmpDir, "secret");
  fs.writeFileSync(secretFile, "  from-file \n");
  expect(wh.loadSecret({ env: { CURAOS_WEBHOOK_SECRET_FILE: secretFile, CURAOS_WEBHOOK_SECRET: "from-env" } })).toBe("from-file");
});

test("loadSecret throws when the secret file is unreadable", () => {
  expect(() => wh.loadSecret({ env: { CURAOS_WEBHOOK_SECRET_FILE: path.join(tmpDir, "missing") } })).toThrow(/unreadable/);
});

test("handleDelivery with an empty secret rejects 503 and never dispatches (fail-closed)", () => {
  const input = delivery();
  const { result, calls } = handle(input, { secret: "" });
  expect(result.status).toBe(503);
  expect(result.reason).toBe("empty-secret-fail-closed");
  expect(calls.length).toBe(0);
});

test("verifySignature throws rather than verifying with an empty secret", () => {
  expect(() => wh.verifySignature("{}", "sha256=00", "")).toThrow(/fail-closed/);
});

// ---- replay/timestamp window ----
test("stale-dated delivery (older than window) is rejected 403", () => {
  const input = delivery({ dateMs: NOW - 301 * 1000 });
  const { result, calls } = handle(input);
  expect(result.status).toBe(403);
  expect(result.reason).toBe("stale-delivery");
  expect(calls.length).toBe(0);
});

test("missing Date header is rejected (fail-closed)", () => {
  const input = delivery();
  delete input.headers.date;
  const { result } = handle(input);
  expect(result.status).toBe(403);
  expect(result.reason).toBe("missing-date-header");
});

test("far-future Date is rejected; small skew within tolerance is accepted", () => {
  const future = handle(delivery({ dateMs: NOW + 121 * 1000 }));
  expect(future.result.status).toBe(403);
  expect(future.result.reason).toBe("future-dated-delivery");
  const skew = handle(delivery({ dateMs: NOW + 60 * 1000 }));
  expect(skew.result.status).toBe(202);
});

// ---- delivery-id idempotency ----
test("duplicate delivery-id runs the converger at most once across handler calls", () => {
  const first = handle(delivery({ id: "dup-1" }));
  expect(first.result.status).toBe(202);
  expect(first.calls).toEqual(["issues"]);
  // Second call: fresh handler, same persisted ledger file = replay/redelivery.
  const second = handle(delivery({ id: "dup-1" }));
  expect(second.result.status).toBe(200);
  expect(second.result.decision).toBe("duplicate");
  expect(second.calls.length).toBe(0);
});

test("missing delivery-id is rejected 400", () => {
  const input = delivery();
  delete input.headers["x-github-delivery"];
  const { result, calls } = handle(input);
  expect(result.status).toBe(400);
  expect(calls.length).toBe(0);
});

test("ledger prunes entries older than retention and keeps the file mode 0600", () => {
  wh.saveLedger({ ancient: NOW - 25 * 60 * 60 * 1000, recent: NOW - 60 * 1000 }, storePath);
  expect(wh.seenDelivery("recent", { storePath, nowMs: NOW })).toBe(true);
  const ledger = wh.loadLedger(storePath);
  expect(ledger.ancient).toBeUndefined();
  expect(ledger.recent).toBeDefined();
  const mode = fs.statSync(storePath).mode & 0o777;
  expect(mode).toBe(0o600);
});

test("retention shorter than the replay window is refused (reopens the replay hole)", () => {
  expect(() => wh.seenDelivery("x", { storePath, nowMs: NOW, retentionSec: 10, windowSec: 300 })).toThrow(/retention/);
});

// ---- corrupt/unreadable ledger fails CLOSED (codex G-03) ----
test("loadLedger treats only first-use ENOENT as an empty ledger", () => {
  expect(wh.loadLedger(path.join(tmpDir, "never-written.json"))).toEqual({});
});

test("ENOTDIR ledger path fails closed (codex N-01): misconfiguration, not first use", () => {
  // A path component exists but is a plain file: replay state is unknowable.
  const notADir = path.join(tmpDir, "plain-file");
  fs.writeFileSync(notADir, "x");
  let thrown;
  try {
    wh.loadLedger(path.join(notADir, "ledger.json"));
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeDefined();
  expect(thrown.code).toBe("LEDGER_UNREADABLE");
  expect(thrown.causeCode).toBe("ENOTDIR");
});

test("ENOTDIR ledger path rejects a valid signed delivery via handleDelivery (503, no dispatch)", () => {
  // Same misconfiguration exercised end to end (codex round-3 coverage gap):
  // the full pipeline must reject, not dispatch, when the ledger path is unusable.
  const notADir = path.join(tmpDir, "plain-file-e2e");
  fs.writeFileSync(notADir, "x");
  const { result, calls } = handle(delivery({ id: "enotdir-1" }), {
    storePath: path.join(notADir, "ledger.json"),
  });
  expect(result.status).toBe(503);
  expect(result.decision).toBe("rejected");
  expect(result.reason).toBe("ledger-unreadable-fail-closed");
  expect(calls.length).toBe(0);
});

test("loadLedger throws LEDGER_UNREADABLE on corrupt JSON or a non-object ledger", () => {
  fs.writeFileSync(storePath, "{ this is not json");
  expect(() => wh.loadLedger(storePath)).toThrow(/fail-closed/);
  fs.writeFileSync(storePath, "[1,2,3]");
  expect(() => wh.loadLedger(storePath)).toThrow(/fail-closed/);
  fs.writeFileSync(storePath, "42");
  expect(() => wh.loadLedger(storePath)).toThrow(/fail-closed/);
});

test("corrupt ledger rejects a valid signed duplicate delivery instead of dispatching (fail closed)", () => {
  // Record the delivery in a healthy ledger first, then corrupt the ledger: the replayed
  // delivery is VALID and SIGNED, but with replay state unknowable it must be rejected,
  // never dispatched (a {} fallback here would fail open and re-run convergers).
  const first = handle(delivery({ id: "dup-ledger-1" }));
  expect(first.result.status).toBe(202);
  fs.writeFileSync(storePath, "{ corrupt-ledger-not-json");
  const replay = handle(delivery({ id: "dup-ledger-1" }));
  expect(replay.result.status).toBe(503);
  expect(replay.result.decision).toBe("rejected");
  expect(replay.result.reason).toBe("ledger-unreadable-fail-closed");
  expect(replay.calls.length).toBe(0);
  // Structured log carries the fail-closed reason; never the payload body.
  expect(replay.logs.some((line) => line.includes("ledger-unreadable-fail-closed"))).toBe(true);
  for (const line of replay.logs) expect(line.includes("labeled")).toBe(false);
});

// ---- event allowlist ----
test("non-allowlisted event types (push, ping) are dropped 204 with a log line and no dispatch", () => {
  for (const event of ["push", "ping", "workflow_run", ""]) {
    const { result, calls, logs } = handle(delivery({ event, id: `evt-${event || "blank"}` }));
    expect(result.status).toBe(204);
    expect(result.decision).toBe("dropped");
    expect(calls.length).toBe(0);
    expect(logs.some((line) => line.includes("event-not-allowlisted"))).toBe(true);
  }
});

test("exactly the five subscribed event types are allowlisted and mapped to convergers", () => {
  expect([...wh.ALLOWED_EVENTS].sort()).toEqual(["issues", "label", "project_v2_item", "pull_request", "pull_request_review"].sort());
  for (const event of wh.ALLOWED_EVENTS) {
    expect(wh.convergerCommandsFor(event).length).toBeGreaterThan(0);
  }
  expect(wh.convergerCommandsFor("push")).toEqual([]);
});

// ---- payload size bounds (before parse) ----
test("oversized payload is rejected 413 BEFORE parse (invalid JSON never reaches the parser)", () => {
  // Deliberately NOT JSON: if parsing ran first this would be body-not-json, not 413.
  const big = `x${"y".repeat(2048)}`;
  const input = delivery({ body: big });
  const { result, calls } = handle(input, { maxBodyBytes: 1024 });
  expect(result.status).toBe(413);
  expect(result.reason).toBe("payload-too-large");
  expect(calls.length).toBe(0);
});

test("body at exactly the cap passes the size gate", () => {
  const body = JSON.stringify({ action: "labeled", pad: "p".repeat(64) });
  const input = delivery({ body });
  const { result } = handle(input, { maxBodyBytes: Buffer.byteLength(body) });
  expect(result.status).toBe(202);
});

// ---- log redaction ----
test("no log line ever contains the secret, a signature value, or the payload body", () => {
  const marker = "PHI-SENSITIVE-TITLE-marker";
  const body = JSON.stringify({ action: "labeled", title: marker });
  const flows = [
    handle(delivery({ body, id: "redact-1" })), // accepted flow
    handle({ headers: delivery().headers, rawBody: "tampered" }), // rejected flow
  ];
  for (const { logs } of flows) {
    expect(logs.length).toBeGreaterThan(0);
    for (const line of logs) {
      expect(line.includes(SECRET)).toBe(false);
      expect(/sha256=[0-9a-f]{10,}/.test(line)).toBe(false);
      expect(line.includes(marker)).toBe(false);
    }
  }
});

test("redactForLog scrubs the secret and signature hex even if a reason string leaks one", () => {
  const leaked = `oops ${SECRET} and sha256=${"ab".repeat(32)}`;
  const scrubbed = wh.redactForLog(leaked, SECRET);
  expect(scrubbed.includes(SECRET)).toBe(false);
  expect(scrubbed.includes("ab".repeat(32))).toBe(false);
  expect(scrubbed.includes("[redacted]")).toBe(true);
});

test("makeLogger emits only the safe-field whitelist", () => {
  const lines = [];
  const log = wh.makeLogger({ sink: (line) => lines.push(line), secret: SECRET });
  log({ deliveryId: "d1", event: "issues", action: "labeled", decision: "202", reason: "ok", rawBody: "NEVER", headers: { secret: "NEVER" } });
  const parsed = JSON.parse(lines[0]);
  expect(Object.keys(parsed).sort()).toEqual(["action", "decision", "deliveryId", "event", "reason", "ts"].sort());
  expect(lines[0].includes("NEVER")).toBe(false);
});

// ---- dispatch wiring ----
test("defaultDispatch invalidates the board snapshot then runs each mapped converger, tolerating failures", () => {
  const ran = [];
  const logs = [];
  // Fake snapshot file proves the rm fallback fires even without RP-38 gh-project export.
  const fakeRoot = tmpDir;
  fs.mkdirSync(path.join(fakeRoot, ".scratch", "workflow-cache"), { recursive: true });
  const snapshot = path.join(fakeRoot, ".scratch", "workflow-cache", "roadmap-items.json");
  fs.writeFileSync(snapshot, "{}");
  wh.defaultDispatch("project_v2_item", {
    root: fakeRoot,
    exec: (cmd) => {
      ran.push(path.basename(cmd));
      if (ran.length === 1) throw new Error("first converger fails");
    },
    log: (fields) => logs.push(fields),
  });
  expect(ran).toEqual(["sweep-project-status", "sweep-roadmap-milestone-fields"]);
  expect(logs.some((f) => f.action === "converger" && f.decision === "failed")).toBe(true);
  expect(logs.some((f) => f.action === "converger" && f.decision === "ok")).toBe(true);
});

// ---- TLS/proxy contract: loopback-only bind ----
test("createServer refuses a non-loopback bind without the explicit override", () => {
  const prev = process.env.CURAOS_WEBHOOK_ALLOW_NONLOOPBACK;
  delete process.env.CURAOS_WEBHOOK_ALLOW_NONLOOPBACK;
  try {
    expect(() => wh.createServer({ secret: SECRET, bind: "0.0.0.0" })).toThrow(/loopback/);
  } finally {
    if (prev !== undefined) process.env.CURAOS_WEBHOOK_ALLOW_NONLOOPBACK = prev;
  }
});

// ---- HTTP transport (injected req/res streams; NO socket; codex G-04) ----
// The request pipeline is exercised through createRequestHandler with a node:stream
// PassThrough request and a writeHead/end recorder response, so these BLOCKING behavior
// tests are deterministic in sandboxes where binding any port fails ("Is port 0 in use?").
// A real socket smoke test exists below, env-guarded behind WEBHOOK_SOCKET_TEST=1.
const { PassThrough } = require("node:stream");

function streamRequest(handler, { method = "POST", url = "/hooks/curaos-tracker", headers = {}, chunks = [] } = {}) {
  const req = new PassThrough();
  req.method = method;
  req.url = url;
  req.headers = headers;
  req.on("error", () => {}); // a destroyed req must not surface as an unhandled stream error
  return new Promise((resolve) => {
    const res = {
      statusCode: null,
      headersSent: false,
      writeHead(code) {
        this.statusCode = code;
        this.headersSent = true;
        return this;
      },
      end() {
        resolve(res);
        return this;
      },
    };
    handler(req, res);
    // Early-reject paths (404, declared over-cap) destroy req synchronously; only feed a live stream.
    if (!req.destroyed) {
      for (const chunk of chunks) req.write(chunk);
      req.end();
    }
  });
}

function streamHandler(logs) {
  return wh.createRequestHandler({
    secret: SECRET,
    maxBodyBytes: 4096,
    storePath,
    nowMs: NOW,
    dispatch: () => {},
    log: (fields) => logs.push(JSON.stringify(fields)),
  });
}

test("HTTP server accepts a valid signed delivery and 413s an over-cap stream", async () => {
  const logs = [];
  const handler = streamHandler(logs);

  const input = delivery({ id: "http-1" });
  const ok = await streamRequest(handler, { headers: input.headers, chunks: [input.rawBody] });
  expect(ok.statusCode).toBe(202);

  // Over-cap stream with no Content-Length: the mid-read byte counter must abort at 413.
  const big = await streamRequest(handler, {
    headers: { ...delivery().headers, "x-github-delivery": "http-big" },
    chunks: ["z".repeat(3000), "z".repeat(3000), "z".repeat(3000)],
  });
  expect(big.statusCode).toBe(413);
  expect(logs.some((line) => line.includes("body-stream-over-cap"))).toBe(true);

  // Declared Content-Length over the cap is rejected before reading any body byte.
  const declared = await streamRequest(handler, {
    headers: { ...delivery().headers, "x-github-delivery": "http-declared", "content-length": "8192" },
  });
  expect(declared.statusCode).toBe(413);
  expect(logs.some((line) => line.includes("content-length-over-cap"))).toBe(true);

  const wrongPath = await streamRequest(handler, { url: "/other", chunks: ["{}"] });
  expect(wrongPath.statusCode).toBe(404);

  const wrongMethod = await streamRequest(handler, { method: "GET" });
  expect(wrongMethod.statusCode).toBe(404);

  for (const line of logs) expect(line.includes(SECRET)).toBe(false);
});

// Socket-binding smoke test: SKIPPED by default (visible as "skip" in the bun test output)
// because grill/CI sandboxes may refuse to bind even an ephemeral loopback port; it failed
// there with "Failed to start server. Is port 0 in use?". Run it on a real box with:
//   WEBHOOK_SOCKET_TEST=1 bun test scripts/lib/webhook-listener.test.js
// The blocking transport behavior lives in the stream-based test above; this only smokes
// that createServer wires createRequestHandler to a real listening socket.
const socketTestEnabled = process.env.WEBHOOK_SOCKET_TEST === "1";
test.skipIf(!socketTestEnabled)("socket smoke: real loopback server round-trips a signed delivery (set WEBHOOK_SOCKET_TEST=1 to run)", async () => {
  const logs = [];
  const server = wh.createServer({
    secret: SECRET,
    maxBodyBytes: 4096,
    storePath,
    nowMs: NOW,
    dispatch: () => {},
    log: (fields) => logs.push(JSON.stringify(fields)),
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  try {
    const input = delivery({ id: "socket-1" });
    const ok = await fetch(`http://127.0.0.1:${port}/hooks/curaos-tracker`, { method: "POST", headers: input.headers, body: input.rawBody });
    expect(ok.status).toBe(202);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
  for (const line of logs) expect(line.includes(SECRET)).toBe(false);
});
