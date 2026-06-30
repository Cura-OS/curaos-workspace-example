// scripts/lib/webhook-listener.js
// RP-54: org webhook -> homelab listener (session-30c pattern: Hetzner Caddy terminates TLS
// and proxies to a loopback-bound Bun listener). This module is the agent-authorable half:
// verification pipeline + converger dispatch. Webhook REGISTRATION and SECRET PROVISIONING
// are OPERATOR-ONLY steps (see docs/agents/webhook-listener.md); this code never registers
// anything and never talks to the GitHub API to set up hooks.
//
// Security checklist implemented here (per Codex grill GRILL-008; HMAC alone is not the bar):
//   1. HMAC verify: X-Hub-Signature-256 (sha256 HMAC over the RAW body) compared with
//      crypto.timingSafeEqual over fixed-length sha256 digests of both signature strings
//      (the double-hash pattern: constant-time AND constant-length, so a length mismatch
//      cannot leak timing either).
//   2. Replay/timestamp window: deliveries whose HTTP Date header falls outside a bounded
//      window are rejected. HONEST LIMIT: GitHub's HMAC covers only the body, NOT headers,
//      so the Date check bounds naive/accidental replays and redelivery floods only; the
//      AUTHORITATIVE replay defense is the delivery-id idempotency ledger below. A missing
//      Date header is rejected (fail-closed; GitHub always sends one).
//   3. Delivery-id idempotency: X-GitHub-Delivery is recorded in a 0600 JSON ledger BEFORE
//      dispatch, so a replayed or redelivered event runs a converger at most once. Ledger
//      retention must exceed the replay window (enforced at load). A corrupt or unreadable
//      ledger fails CLOSED: deliveries are rejected 503 until the ledger is repaired
//      (only first-use ENOENT counts as an empty ledger; anything else fails closed).
//   4. Event-type allowlist: only the five subscribed event types are processed; everything
//      else (including the registration "ping") is dropped with a log line and a 2xx so
//      GitHub does not mark the hook failing.
//   5. Payload size bounds: bodies above the cap are rejected BEFORE any JSON parse; the
//      HTTP server additionally aborts the read mid-stream at the same cap.
//   6. Secret storage fail-closed: secret comes from CURAOS_WEBHOOK_SECRET_FILE (preferred;
//      vault-mounted path) or CURAOS_WEBHOOK_SECRET env. Missing/empty/whitespace secret
//      throws; the server entrypoint refuses to start. The secret value never touches disk
//      via this module and never appears in any log line or error message.
//   7. Log redaction: structured log lines carry only {ts, deliveryId, event, action,
//      decision, reason}. Never the payload, never headers, never signatures, never the
//      secret. redactForLog() additionally scrubs accidental occurrences.
//   8. TLS/proxy assumptions: Caddy terminates TLS; the listener binds 127.0.0.1 ONLY and
//      trusts nothing but the local proxy hop. No X-Forwarded-* header participates in any
//      auth decision (auth is HMAC only). Documented in docs/agents/webhook-listener.md.
//
// Substrate: plain Node builtins (runs under Bun and Node), same rules as
// scripts/lib/gh-budget.js. Everything impure (exec, clock, store path, log sink) is
// injectable for tests; bun test never touches the network.

const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "..");
const DELIVERY_LEDGER = path.join(ROOT, ".cache", "webhook-deliveries.json");
const LEDGER_FILE_MODE = 0o600;

// The five org-webhook event types RP-54 subscribes; everything else is dropped.
const ALLOWED_EVENTS = Object.freeze([
  "issues",
  "pull_request",
  "pull_request_review",
  "label",
  "project_v2_item",
]);

const DEFAULT_MAX_BODY_BYTES = 1024 * 1024; // 1 MiB; largest observed tracker payloads are ~100 KiB
const DEFAULT_REPLAY_WINDOW_SEC = 300; // reject deliveries older than 5 minutes
const DEFAULT_FUTURE_SKEW_SEC = 120; // tolerate small clock skew, reject far-future Dates
const DEFAULT_LEDGER_RETENTION_SEC = 24 * 60 * 60; // must exceed the replay window

// ---- secret loading (fail-closed) ----
// File source wins over env so a vault-mounted file cannot be shadowed by a stale export.
// Throws on any empty result; callers must NOT catch-and-continue (fail-closed per
// session-30c: an empty secret must never silently accept unsigned traffic).
function loadSecret({ env = process.env, readFile = fs.readFileSync } = {}) {
  let raw = "";
  const file = env.CURAOS_WEBHOOK_SECRET_FILE;
  if (file) {
    try {
      raw = String(readFile(file, "utf8"));
    } catch {
      throw new Error(`webhook secret file unreadable (CURAOS_WEBHOOK_SECRET_FILE=${file})`);
    }
  } else if (env.CURAOS_WEBHOOK_SECRET) {
    raw = String(env.CURAOS_WEBHOOK_SECRET);
  }
  const secret = raw.trim();
  if (!secret) {
    throw new Error(
      "webhook secret missing or empty: set CURAOS_WEBHOOK_SECRET_FILE (preferred) or CURAOS_WEBHOOK_SECRET; refusing to start (fail-closed)",
    );
  }
  return secret;
}

// ---- HMAC verification (timingSafeEqual; checklist line 1) ----
function expectedSignature(rawBody, secret) {
  return `sha256=${crypto.createHmac("sha256", secret).update(rawBody).digest("hex")}`;
}

// Compare sha256 digests of the two signature STRINGS: timingSafeEqual requires equal
// lengths, and hashing first gives constant length without an early-exit length branch.
function timingSafeStringEqual(a, b) {
  const da = crypto.createHash("sha256").update(String(a)).digest();
  const db = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(da, db);
}

function verifySignature(rawBody, signatureHeader, secret) {
  if (!secret || !String(secret).trim()) {
    // Fail-closed: never fall through to "no secret means accept".
    throw new Error("webhook secret empty at verification time (fail-closed)");
  }
  if (!signatureHeader || typeof signatureHeader !== "string") return false;
  if (!signatureHeader.startsWith("sha256=")) return false;
  return timingSafeStringEqual(signatureHeader, expectedSignature(rawBody, secret));
}

// ---- replay/timestamp window (checklist line 2; see HONEST LIMIT in header) ----
function checkTimestamp(dateHeader, { nowMs = Date.now(), windowSec = DEFAULT_REPLAY_WINDOW_SEC, futureSkewSec = DEFAULT_FUTURE_SKEW_SEC } = {}) {
  if (!dateHeader) return { ok: false, reason: "missing-date-header" };
  const sentMs = Date.parse(dateHeader);
  if (Number.isNaN(sentMs)) return { ok: false, reason: "unparseable-date-header" };
  if (nowMs - sentMs > windowSec * 1000) return { ok: false, reason: "stale-delivery" };
  if (sentMs - nowMs > futureSkewSec * 1000) return { ok: false, reason: "future-dated-delivery" };
  return { ok: true, reason: "within-window" };
}

// ---- delivery-id idempotency ledger (checklist line 3) ----
// Fail-closed contract (codex G-03 + N-01): ONLY ENOENT (ledger file not written yet)
// means "empty ledger". ENOTDIR is a misconfiguration (a path component is a plain
// file), not first use, and every other read/parse/type failure means replay state is
// UNKNOWN; returning {} there would fail OPEN and let a replayed delivery re-dispatch.
// Such errors are tagged LEDGER_UNREADABLE so handleDelivery rejects deliveries (503)
// until an operator repairs the ledger path.
function ledgerUnreadableError(storePath, cause) {
  const err = new Error(`webhook delivery ledger unreadable or corrupt at ${storePath}; rejecting deliveries until repaired (fail-closed)`);
  err.code = "LEDGER_UNREADABLE";
  err.causeCode = cause && cause.code ? String(cause.code) : "parse";
  return err;
}

function loadLedger(storePath = DELIVERY_LEDGER) {
  let raw;
  try {
    raw = fs.readFileSync(storePath, "utf8");
  } catch (error) {
    if (error && error.code === "ENOENT") return {};
    throw ledgerUnreadableError(storePath, error);
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw ledgerUnreadableError(storePath, error);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw ledgerUnreadableError(storePath, null);
  }
  return parsed;
}

function saveLedger(ledger, storePath = DELIVERY_LEDGER) {
  fs.mkdirSync(path.dirname(storePath), { recursive: true });
  fs.writeFileSync(storePath, JSON.stringify(ledger), { mode: LEDGER_FILE_MODE });
  // mode applies only on create; tighten pre-existing files on every save (same rationale
  // as gh-budget.js: defense in depth on a state file).
  fs.chmodSync(storePath, LEDGER_FILE_MODE);
}

// Record-then-dispatch: returns true when the id was already seen (duplicate; caller must
// NOT dispatch), false when newly recorded. Recording happens BEFORE dispatch so a crash
// after record errs on at-most-once, which is the RP-54 contract for replayed deliveries.
function seenDelivery(deliveryId, { storePath = DELIVERY_LEDGER, nowMs = Date.now(), retentionSec = DEFAULT_LEDGER_RETENTION_SEC, windowSec = DEFAULT_REPLAY_WINDOW_SEC } = {}) {
  if (retentionSec < windowSec) {
    // A ledger that forgets faster than the replay window reopens the replay hole.
    throw new Error(`ledger retention (${retentionSec}s) must be >= replay window (${windowSec}s)`);
  }
  const ledger = loadLedger(storePath);
  // Prune expired entries so the file stays bounded.
  for (const [id, firstSeenMs] of Object.entries(ledger)) {
    if (nowMs - firstSeenMs > retentionSec * 1000) delete ledger[id];
  }
  if (Object.prototype.hasOwnProperty.call(ledger, deliveryId)) {
    saveLedger(ledger, storePath); // persist the prune even on the duplicate path
    return true;
  }
  ledger[deliveryId] = nowMs;
  saveLedger(ledger, storePath);
  return false;
}

// ---- event allowlist (checklist line 4) ----
function eventAllowed(eventHeader) {
  return ALLOWED_EVENTS.includes(String(eventHeader || ""));
}

// ---- log redaction (checklist line 7) ----
// Belt and braces: log lines are BUILT from a safe-field whitelist, and redactForLog()
// additionally scrubs the secret and any sha256=... signature should one ever leak into a
// reason string.
function redactForLog(text, secret) {
  let out = String(text);
  if (secret) out = out.split(secret).join("[redacted]");
  out = out.replace(/sha256=[0-9a-f]+/gi, "sha256=[redacted]");
  return out;
}

function makeLogger({ sink = (line) => process.stderr.write(`${line}\n`), secret = "" } = {}) {
  return function log(fields) {
    const safe = {
      ts: fields.ts || new Date().toISOString(),
      deliveryId: fields.deliveryId || "",
      event: fields.event || "",
      action: fields.action || "",
      decision: fields.decision || "",
      reason: fields.reason || "",
    };
    sink(redactForLog(JSON.stringify(safe), secret));
  };
}

// ---- converger dispatch (the point of the listener: convergers run on-event) ----
// Event type -> existing converger sweeps. The timer (launchd template) stays as a 6-hour
// safety net; cutover is an operator step in the runbook.
const CONVERGER_MAP = Object.freeze({
  issues: ["scripts/sweep-closed-issue-labels", "scripts/sweep-foresight-staging"],
  pull_request: ["scripts/sweep-pr-notifications"],
  pull_request_review: ["scripts/sweep-pr-notifications"],
  label: ["scripts/sweep-label-seed"],
  project_v2_item: ["scripts/sweep-project-status", "scripts/sweep-roadmap-milestone-fields"],
});

function convergerCommandsFor(event) {
  return CONVERGER_MAP[event] || [];
}

function repoFullName(payload) {
  return String((payload && payload.repository && payload.repository.full_name) || "").trim();
}

function prRefFromPayload(payload) {
  const repo = repoFullName(payload);
  const number = payload && payload.pull_request && payload.pull_request.number;
  return repo && number ? `${repo}#${number}` : "";
}

function issueRefFromPayload(payload) {
  const repo = repoFullName(payload);
  const number = payload && payload.issue && payload.issue.number;
  return repo && number ? `${repo}#${number}` : "";
}

function headShaFromPayload(payload) {
  const sha = String((payload && payload.pull_request && payload.pull_request.head && payload.pull_request.head.sha) || "").trim();
  return /^[0-9a-f]{40}$/i.test(sha) ? sha.toLowerCase() : "";
}

function reentryRequestsFor(event, payload = {}) {
  const action = String(payload.action || "");
  const reason = action ? `${event}:${action}` : event;
  if (event === "pull_request") {
    const pr = prRefFromPayload(payload);
    const headSha = headShaFromPayload(payload);
    if (!pr || !headSha) return [];
    return [{ workflow: "pr-verify-merge", reason, repo: repoFullName(payload), pr, head_sha: headSha, idempotency_key: `${pr}:${headSha}:${reason}` }];
  }
  if (event === "pull_request_review" || event === "pull_request_review_thread") {
    const pr = prRefFromPayload(payload);
    const headSha = headShaFromPayload(payload);
    if (!pr) return [];
    return [{ workflow: "gh-pr-gate-snapshot", reason, repo: repoFullName(payload), pr, head_sha: headSha, idempotency_key: `${pr}:${headSha || "unknown-head"}:${reason}` }];
  }
  if (event === "issues" || event === "label" || event === "project_v2_item" || event === "projects_v2_item") {
    const issue = issueRefFromPayload(payload);
    return [{ workflow: "milestone-active-scan", reason, repo: repoFullName(payload), issue, idempotency_key: issue ? `${issue}:${reason}` : `${repoFullName(payload) || "unknown-repo"}:${reason}` }];
  }
  return [];
}

// RP-38 hook: any on-event run starts from a fresh board snapshot. Prefer the gh-project
// export; fall back to removing the snapshot file directly so this module keeps working
// even if gh-project.js is older than RP-38 on the deployed box.
function invalidateSnapshot({ root = ROOT } = {}) {
  try {
    const ghProject = require("./gh-project.js");
    if (typeof ghProject.invalidateBoardSnapshot === "function") {
      ghProject.invalidateBoardSnapshot();
      return "gh-project";
    }
  } catch {}
  try {
    fs.rmSync(path.join(root, ".scratch", "workflow-cache", "roadmap-items.json"), { force: true });
    return "rm-fallback";
  } catch {
    return "noop";
  }
}

// ---- the verification pipeline ----
// Pure-ish decision function: takes raw inputs, returns {status, decision, reason} and
// calls dispatch(event) exactly when every gate passes. Order matters and is deliberate:
//   size -> signature -> timestamp -> allowlist -> idempotency -> parse -> dispatch
// Size first (never buffer-parse unbounded input); signature before everything semantic
// (unauthenticated traffic learns nothing about allowlists or ledger state); allowlist
// before the ledger so dropped event types do not grow the ledger.
function handleDelivery({
  headers = {},
  rawBody = "",
  secret,
  nowMs = Date.now(),
  maxBodyBytes = DEFAULT_MAX_BODY_BYTES,
  windowSec = DEFAULT_REPLAY_WINDOW_SEC,
  futureSkewSec = DEFAULT_FUTURE_SKEW_SEC,
  storePath = DELIVERY_LEDGER,
  retentionSec = DEFAULT_LEDGER_RETENTION_SEC,
  dispatch = defaultDispatch,
  log = makeLogger({ secret }),
} = {}) {
  // Normalize header names once; node lowercases them, tests may not.
  const h = {};
  for (const [k, v] of Object.entries(headers)) h[k.toLowerCase()] = v;
  const deliveryId = String(h["x-github-delivery"] || "");
  const event = String(h["x-github-event"] || "");
  const base = { deliveryId, event };

  if (!secret || !String(secret).trim()) {
    // Fail-closed (checklist line 6): a listener that lost its secret must reject
    // everything loudly, never verify-as-empty.
    log({ ...base, action: "reject", decision: "503", reason: "empty-secret-fail-closed" });
    return { status: 503, decision: "rejected", reason: "empty-secret-fail-closed" };
  }

  const bodyBytes = Buffer.byteLength(rawBody);
  if (bodyBytes > maxBodyBytes) {
    // Checklist line 5: bounded BEFORE any parse.
    log({ ...base, action: "reject", decision: "413", reason: `payload-too-large:${bodyBytes}` });
    return { status: 413, decision: "rejected", reason: "payload-too-large" };
  }

  if (!verifySignature(rawBody, h["x-hub-signature-256"], secret)) {
    log({ ...base, action: "reject", decision: "401", reason: "signature-invalid-or-missing" });
    return { status: 401, decision: "rejected", reason: "signature-invalid-or-missing" };
  }

  const ts = checkTimestamp(h.date, { nowMs, windowSec, futureSkewSec });
  if (!ts.ok) {
    log({ ...base, action: "reject", decision: "403", reason: ts.reason });
    return { status: 403, decision: "rejected", reason: ts.reason };
  }

  if (!eventAllowed(event)) {
    // 2xx so GitHub does not mark the hook failing; "ping" lands here by design.
    log({ ...base, action: "drop", decision: "204", reason: "event-not-allowlisted" });
    return { status: 204, decision: "dropped", reason: "event-not-allowlisted" };
  }

  if (!deliveryId) {
    log({ ...base, action: "reject", decision: "400", reason: "missing-delivery-id" });
    return { status: 400, decision: "rejected", reason: "missing-delivery-id" };
  }
  let duplicate;
  try {
    duplicate = seenDelivery(deliveryId, { storePath, nowMs, retentionSec, windowSec });
  } catch (error) {
    if (error && error.code === "LEDGER_UNREADABLE") {
      // Fail-closed (codex G-03): with the replay ledger corrupt or unreadable, duplicate
      // state is unknowable; REJECT every delivery (503 = GitHub will redeliver) until an
      // operator repairs the ledger. Structured log only; never the payload or the error
      // message (the reason carries the errno/parse class, nothing user-controlled).
      log({ ...base, action: "reject", decision: "503", reason: `ledger-unreadable-fail-closed:${error.causeCode || "unknown"}` });
      return { status: 503, decision: "rejected", reason: "ledger-unreadable-fail-closed" };
    }
    throw error; // config errors (retention < replay window) stay loud
  }
  if (duplicate) {
    log({ ...base, action: "skip", decision: "200", reason: "duplicate-delivery" });
    return { status: 200, decision: "duplicate", reason: "duplicate-delivery" };
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    log({ ...base, action: "reject", decision: "400", reason: "body-not-json" });
    return { status: 400, decision: "rejected", reason: "body-not-json" };
  }

  // Log the action (issues.labeled etc.) but never the payload itself (checklist line 7).
  const action = typeof payload.action === "string" ? payload.action : "";
  dispatch(event, { payload, log: (fields) => log({ ...base, ...fields }) });
  log({ ...base, action: action || "dispatch", decision: "202", reason: "convergers-dispatched" });
  return { status: 202, decision: "dispatched", reason: "convergers-dispatched" };
}

// Default dispatch: invalidate the RP-38 board snapshot, then run each mapped converger.
// Sequential and best-effort: one failing converger must not block the rest, and the
// listener never crashes on a converger failure (exit codes go to the log).
function defaultDispatch(event, { exec, log = () => {}, root = ROOT, payload = {} } = {}) {
  const run =
    exec ||
    ((cmd) => {
      const { execFileSync } = require("node:child_process");
      execFileSync(cmd, [], { cwd: root, stdio: ["ignore", "ignore", "ignore"] });
    });
  const via = invalidateSnapshot({ root });
  log({ action: "snapshot-invalidate", decision: via, reason: "rp-38-hook" });
  for (const request of reentryRequestsFor(event, payload)) {
    log({ action: "workflow-reentry", decision: request.workflow, reason: request.idempotency_key });
  }
  for (const relCmd of convergerCommandsFor(event)) {
    const cmd = path.join(root, relCmd);
    try {
      run(cmd);
      log({ action: "converger", decision: "ok", reason: relCmd });
    } catch {
      // Reason carries the script path only; converger stdout/stderr stays out of OUR log
      // (it may quote issue titles from private repos).
      log({ action: "converger", decision: "failed", reason: relCmd });
    }
  }
}

// ---- HTTP request pipeline (transport layer; checklist line 5 at the stream level) ----
// Extracted from createServer (codex G-04) so the pipeline is testable with injected
// req/res streams (node:stream PassThrough + a writeHead/end recorder) WITHOUT binding a
// socket; sandboxes that forbid listen() can still execute every transport behavior test.
function createRequestHandler({
  secret,
  hookPath = "/hooks/curaos-tracker",
  maxBodyBytes = DEFAULT_MAX_BODY_BYTES,
  handle = handleDelivery,
  log,
  ...handleOptions
} = {}) {
  const logger = log || makeLogger({ secret });
  return (req, res) => {
    if (req.method !== "POST" || req.url !== hookPath) {
      res.writeHead(404).end();
      return;
    }
    // Stream with a running byte count: abort mid-read at the cap so an oversized body is
    // never fully buffered, let alone parsed (checklist line 5 at the transport layer).
    const declared = Number(req.headers["content-length"] || 0);
    if (declared > maxBodyBytes) {
      logger({ deliveryId: String(req.headers["x-github-delivery"] || ""), action: "reject", decision: "413", reason: "content-length-over-cap" });
      res.writeHead(413).end();
      req.destroy();
      return;
    }
    const chunks = [];
    let received = 0;
    let aborted = false;
    req.on("data", (chunk) => {
      received += chunk.length;
      if (received > maxBodyBytes) {
        aborted = true;
        logger({ deliveryId: String(req.headers["x-github-delivery"] || ""), action: "reject", decision: "413", reason: "body-stream-over-cap" });
        res.writeHead(413).end();
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (aborted) return;
      const result = handle({
        headers: req.headers,
        rawBody: Buffer.concat(chunks).toString("utf8"),
        secret,
        maxBodyBytes,
        log: logger,
        ...handleOptions,
      });
      res.writeHead(result.status).end();
    });
    req.on("error", () => {
      if (!res.headersSent) res.writeHead(400).end();
    });
  };
}

// ---- HTTP server (loopback-only; Caddy owns TLS; checklist lines 5 + 8) ----
function createServer({ bind = "127.0.0.1", ...options } = {}) {
  const server = http.createServer(createRequestHandler(options));
  // Refuse non-loopback binds unless the operator explicitly opts in: the TLS/proxy contract
  // (checklist line 8) is "Caddy terminates TLS, listener trusts only the local hop".
  server.curaosBind = bind;
  if (bind !== "127.0.0.1" && bind !== "::1" && process.env.CURAOS_WEBHOOK_ALLOW_NONLOOPBACK !== "1") {
    throw new Error(`refusing non-loopback bind ${bind}: Caddy terminates TLS and this listener trusts only the local proxy hop (set CURAOS_WEBHOOK_ALLOW_NONLOOPBACK=1 to override deliberately)`);
  }
  return server;
}

module.exports = {
  ROOT,
  DELIVERY_LEDGER,
  LEDGER_FILE_MODE,
  ALLOWED_EVENTS,
  CONVERGER_MAP,
  DEFAULT_MAX_BODY_BYTES,
  DEFAULT_REPLAY_WINDOW_SEC,
  DEFAULT_FUTURE_SKEW_SEC,
  DEFAULT_LEDGER_RETENTION_SEC,
  loadSecret,
  expectedSignature,
  verifySignature,
  checkTimestamp,
  loadLedger,
  saveLedger,
  seenDelivery,
  eventAllowed,
  redactForLog,
  makeLogger,
  convergerCommandsFor,
  reentryRequestsFor,
  invalidateSnapshot,
  handleDelivery,
  defaultDispatch,
  createRequestHandler,
  createServer,
};
