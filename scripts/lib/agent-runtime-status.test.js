const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const runtime = require("./agent-runtime-status.js");

function tmpHome(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-runtime-status-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function writeSession(home, sessionId, timestamp, rateLimits) {
  const dir = path.join(home, "sessions", "2026", "06", "19");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `rollout-2026-06-19T14-04-00-${sessionId}.jsonl`);
  fs.writeFileSync(file, `${JSON.stringify({
    timestamp,
    type: "event_msg",
    payload: { type: "token_count", info: null, rate_limits: rateLimits },
  })}\n`);
  return file;
}

function statusLineExec(payload, timestampMs) {
  const row = {
    ts: Math.floor(timestampMs / 1000),
    ts_nanos: (timestampMs % 1000) * 1000000,
    feedback_log_body: `trace context: websocket event: ${JSON.stringify(payload)}`,
  };
  return () => JSON.stringify([row]);
}

test("agent-runtime-status classifies Codex no-credit session failures as quota", (t) => {
  const home = tmpHome(t);
  const sessionId = "019ee032-d32e-7501-926d-c496910667b0";
  writeSession(home, sessionId, "2026-06-19T14:04:50.292Z", {
    limit_id: "premium",
    credits: { has_credits: false, unlimited: false, balance: "0" },
  });

  assert.equal(runtime.codexSessionIdFromText(`codex exited with status 1\nsession id: ${sessionId}`), sessionId);
  assert.equal(
    runtime.agentFailureKind(`codex exited with status 1\nsession id: ${sessionId}`, {
      codexHome: home,
      nowMs: Date.parse("2026-06-19T14:05:00.000Z"),
    }),
    "agent-runtime-quota",
  );
});

test("agent-runtime-status reads current status-line no-credit evidence", (t) => {
  const home = tmpHome(t);
  fs.writeFileSync(path.join(home, "logs_2.sqlite"), "");
  const nowMs = Date.parse("2026-06-19T14:05:00.000Z");
  const status = runtime.readCodexRuntimeStatus({
    codexHome: home,
    nowMs,
    execFileSync: statusLineExec({
      type: "codex.rate_limits",
      rate_limits: {
        allowed: false,
        limit_reached: true,
        primary: { used_percent: 100, reset_at: Math.floor((nowMs + 5000) / 1000) },
      },
      credits: { has_credits: false, unlimited: false, balance: "0" },
    }, nowMs - 5000),
  });

  assert.equal(status.blocked, true);
  assert.equal(status.kind, "agent-runtime-quota");
  assert.equal(status.source, "codex-status-line");
});

test("agent-runtime-status ignores stale no-credit evidence", (t) => {
  const home = tmpHome(t);
  fs.writeFileSync(path.join(home, "logs_2.sqlite"), "");
  const nowMs = Date.parse("2026-06-19T14:05:00.000Z");
  const status = runtime.readCodexRuntimeStatus({
    codexHome: home,
    nowMs,
    maxAgeMs: 30 * 60 * 1000,
    execFileSync: statusLineExec({
      type: "codex.rate_limits",
      rate_limits: { allowed: false, limit_reached: true, primary: { used_percent: 100 } },
      credits: { has_credits: false, unlimited: false, balance: "0" },
    }, nowMs - 60 * 60 * 1000),
  });

  assert.equal(status.blocked, false);
  assert.equal(status.stale, true);
});

test("agent-runtime-status treats direct quota text as quota without local logs", () => {
  assert.equal(runtime.agentFailureKind("provider rate limit 429 quota exceeded"), "agent-runtime-quota");
  assert.equal(runtime.agentFailureKind("codex exited with status 1"), "agent-runtime-unavailable");
});
