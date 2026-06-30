// agent-runtime-status - local provider-runtime classifiers for orchestration fail-fast gates.
//
// This reads only local Codex telemetry already written by the CLI. It never reads auth.json,
// never makes a network call, and treats stale no-credit evidence as non-blocking.

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { execFileSync: realExecFileSync } = require("node:child_process");

const DEFAULT_MAX_AGE_MS = 30 * 60 * 1000;
const SESSION_FILE_LIMIT = 600;
const SESSION_RECURSIVE_LIMIT = 12000;

function codexHome(options = {}) {
  return options.codexHome || process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
}

function timestampMs(value) {
  const parsed = typeof value === "number" ? value : Date.parse(String(value || ""));
  if (!Number.isFinite(parsed)) return 0;
  return parsed > 1000000000000 ? parsed : parsed * 1000;
}

function sqlTimestampMs(row) {
  const seconds = Number(row && row.ts);
  const nanos = Number(row && row.ts_nanos);
  if (!Number.isFinite(seconds)) return 0;
  return (seconds > 1000000000000 ? seconds : seconds * 1000) + (Number.isFinite(nanos) ? Math.floor(nanos / 1000000) : 0);
}

function extractJsonObject(text) {
  const source = String(text || "");
  const marker = "websocket event:";
  const markerIndex = source.indexOf(marker);
  const start = source.indexOf("{", markerIndex >= 0 ? markerIndex + marker.length : 0);
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === "\"") {
        inString = false;
      }
      continue;
    }
    if (ch === "\"") {
      inString = true;
    } else if (ch === "{") {
      depth += 1;
    } else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(source.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function zeroCredit(credits) {
  if (!credits || typeof credits !== "object") return false;
  if (credits.unlimited === true) return false;
  if (credits.has_credits === false) return true;
  if (Object.prototype.hasOwnProperty.call(credits, "balance") && Number(credits.balance) <= 0) return true;
  return false;
}

function limitReached(rateLimits) {
  if (!rateLimits || typeof rateLimits !== "object") return false;
  if (rateLimits.allowed === false || rateLimits.limit_reached === true) return true;
  for (const key of ["primary", "secondary"]) {
    const window = rateLimits[key];
    const used = Number(window && window.used_percent);
    if (Number.isFinite(used) && used >= 100) return true;
  }
  return false;
}

function resetAtFrom(rateLimits) {
  if (!rateLimits || typeof rateLimits !== "object") return "";
  const windows = [rateLimits.primary, rateLimits.secondary].filter(Boolean);
  const resets = windows
    .map((window) => Number(window && window.reset_at))
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);
  if (!resets.length) return "";
  return new Date(resets[0] * 1000).toISOString();
}

function classifyCodexLimitPayload(payload) {
  const data = payload && typeof payload === "object" ? payload : {};
  const rateLimits = data.rate_limits && typeof data.rate_limits === "object" ? data.rate_limits : data;
  const credits = data.credits || rateLimits.credits || {};
  if (zeroCredit(credits)) {
    return {
      blocked: true,
      kind: "agent-runtime-quota",
      reason: "codex premium credits unavailable",
      reset_at: resetAtFrom(rateLimits),
    };
  }
  if (limitReached(rateLimits)) {
    return {
      blocked: true,
      kind: "agent-runtime-quota",
      reason: "codex runtime limit reached",
      reset_at: resetAtFrom(rateLimits),
    };
  }
  return { blocked: false, kind: "", reason: "" };
}

function parseJsonLine(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

function candidateDateDirs(sessionsDir, nowMs) {
  const dirs = [];
  for (const offset of [0, -1, 1]) {
    const date = new Date(nowMs + offset * 24 * 60 * 60 * 1000);
    const yyyy = String(date.getUTCFullYear());
    const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(date.getUTCDate()).padStart(2, "0");
    dirs.push(path.join(sessionsDir, yyyy, mm, dd));
  }
  return dirs;
}

function sortedJsonlFiles(dir, limit = SESSION_FILE_LIMIT) {
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".jsonl"))
      .map((entry) => {
        const file = path.join(dir, entry.name);
        let mtimeMs = 0;
        try { mtimeMs = fs.statSync(file).mtimeMs; } catch {}
        return { file, mtimeMs };
      });
  } catch {
    return [];
  }
  return entries
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, limit)
    .map((entry) => entry.file);
}

function findSessionFilesById(sessionsDir, sessionId) {
  if (!sessionId) return [];
  const found = [];
  const stack = [sessionsDir];
  let visited = 0;
  while (stack.length && visited < SESSION_RECURSIVE_LIMIT) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      visited += 1;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile() && entry.name.endsWith(".jsonl") && entry.name.includes(sessionId)) {
        found.push(full);
      }
      if (visited >= SESSION_RECURSIVE_LIMIT) break;
    }
  }
  return found;
}

function tokenCountEvidenceFromFiles(files) {
  let latest = null;
  for (const file of files || []) {
    let text = "";
    try {
      text = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const line of text.split(/\r?\n/)) {
      if (!line.includes("\"token_count\"")) continue;
      const row = parseJsonLine(line);
      const payload = row && row.payload;
      if (!payload || payload.type !== "token_count") continue;
      const status = classifyCodexLimitPayload(payload);
      const at = timestampMs(row.timestamp);
      if (!latest || at > latest.timestamp_ms) {
        latest = {
          ...status,
          source: "codex-session-token-count",
          timestamp_ms: at,
          path: file,
        };
      }
    }
  }
  return latest;
}

function readLatestCodexTokenCount(options = {}) {
  const home = codexHome(options);
  const sessionsDir = path.join(home, "sessions");
  const nowMs = Number.isFinite(options.nowMs) ? options.nowMs : Date.now();
  let files = [];
  if (options.sessionId) {
    files = findSessionFilesById(sessionsDir, options.sessionId);
  }
  if (!files.length) {
    files = candidateDateDirs(sessionsDir, nowMs).flatMap((dir) => sortedJsonlFiles(dir));
  }
  return tokenCountEvidenceFromFiles(files.slice(0, SESSION_FILE_LIMIT));
}

function readLatestCodexStatusLine(options = {}) {
  const home = codexHome(options);
  const db = path.join(home, "logs_2.sqlite");
  if (!fs.existsSync(db)) return null;
  const execFileSync = options.execFileSync || realExecFileSync;
  const sql = "select ts, ts_nanos, feedback_log_body from logs where target='codex_api::endpoint::responses_websocket' and feedback_log_body like '%websocket event: {\"type\":\"codex.rate_limits\"%' order by ts desc, ts_nanos desc limit 5;";
  let rows = [];
  try {
    const text = execFileSync("sqlite3", ["-json", db, sql], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 2 * 1024 * 1024 });
    rows = JSON.parse(text || "[]");
  } catch {
    return null;
  }
  for (const row of rows) {
    const payload = extractJsonObject(row.feedback_log_body);
    if (!payload || payload.type !== "codex.rate_limits") continue;
    const status = classifyCodexLimitPayload(payload);
    return {
      ...status,
      source: "codex-status-line",
      timestamp_ms: sqlTimestampMs(row),
      path: db,
    };
  }
  return null;
}

function newestEvidence(items) {
  return (items || [])
    .filter((item) => item && Number.isFinite(Number(item.timestamp_ms)) && Number(item.timestamp_ms) > 0)
    .sort((a, b) => Number(b.timestamp_ms) - Number(a.timestamp_ms))[0] || null;
}

function evidenceIsFresh(evidence, nowMs, maxAgeMs) {
  if (!evidence || !Number.isFinite(Number(evidence.timestamp_ms))) return false;
  return Number(nowMs) - Number(evidence.timestamp_ms) <= maxAgeMs;
}

function readCodexRuntimeStatus(options = {}) {
  const nowMs = Number.isFinite(options.nowMs) ? options.nowMs : Date.now();
  const maxAgeMs = Number.isFinite(options.maxAgeMs) ? options.maxAgeMs : DEFAULT_MAX_AGE_MS;
  const latest = newestEvidence([
    readLatestCodexStatusLine(options),
    readLatestCodexTokenCount(options),
  ]);
  if (!latest) return { blocked: false, kind: "", reason: "no local Codex quota evidence", source: "none" };
  if (latest.blocked && evidenceIsFresh(latest, nowMs, maxAgeMs)) return latest;
  return {
    ...latest,
    blocked: false,
    kind: "",
    stale: latest.blocked && !evidenceIsFresh(latest, nowMs, maxAgeMs),
  };
}

function codexSessionIdFromText(text) {
  const match = String(text || "").match(/\bsession id:\s*([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/i);
  return match ? match[1] : "";
}

function agentFailureKind(message, options = {}) {
  const text = String(message || "");
  if (/\b(?:session|usage)\s+limit\b|rate\s+limit|quota|too many requests|\b429\b|\bresets?\b/i.test(text)) return "agent-runtime-quota";
  const sessionId = codexSessionIdFromText(text);
  if (sessionId) {
    const evidence = readCodexRuntimeStatus({ ...options, sessionId });
    if (evidence.blocked) return evidence.kind || "agent-runtime-quota";
  }
  return "agent-runtime-unavailable";
}

module.exports = {
  DEFAULT_MAX_AGE_MS,
  codexSessionIdFromText,
  classifyCodexLimitPayload,
  extractJsonObject,
  agentFailureKind,
  readCodexRuntimeStatus,
  readLatestCodexStatusLine,
  readLatestCodexTokenCount,
};
