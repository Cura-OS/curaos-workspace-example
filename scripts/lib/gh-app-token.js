// scripts/lib/gh-app-token.js
// RP-43: GitHub App installation token helper (REST ceiling raise to ~5,000 + 50/repo
// above 20, org-capped 12,500/hr) with graceful fallback to the current keyring gh auth.
//
// Credential posture (Codex grill GRILL-007): the App private key and every minted
// installation token are credentials and get the full credential treatment:
//   - private key file must be 0600/0400 (no group/other bits) or the helper refuses;
//   - the token cache file is written 0600 inside a 0700 directory;
//   - no token value is ever logged: every diagnostic line and every thrown error
//     message passes through redact() against the live secret set;
//   - a timestamped, token-redacted audit trail of mint/refresh/fallback events is
//     appended to the audit log (also 0600).
//
// Configuration is env-driven. When the three core vars are absent the helper falls
// back to `gh auth token` run WITHOUT GITHUB_TOKEN/GH_TOKEN in the child env, i.e. the
// keyring auth (the same posture as the curaos-gh-project-sync-env-workaround), so
// callers can adopt `GH_TOKEN=$(scripts/gh-app-token)` before the App is registered.
//
//   CURAOS_GH_APP_ID                  GitHub App ID (digits)
//   CURAOS_GH_APP_INSTALLATION_ID    org installation ID (digits)
//   CURAOS_GH_APP_PRIVATE_KEY_PATH   PEM path, mode 0600/0400
//   CURAOS_GH_APP_TOKEN_CACHE        optional cache file (default ~/.cache/curaos-gh-app/token.json)
//   CURAOS_GH_APP_AUDIT_LOG          optional audit log (default ~/.cache/curaos-gh-app/audit.log)
//   CURAOS_GH_APP_API_URL            optional API base (default https://api.github.com)
//
// Installation tokens live 60 minutes; the cache reuses them for at most 55 minutes
// (REFRESH_MARGIN_MS = 5 min before expiry) so every consumer always holds a token
// with usable remaining lifetime. Operator runbook: docs/agents/gh-app-token.md.

const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const DEFAULT_API_URL = "https://api.github.com";
const REFRESH_MARGIN_MS = 5 * 60 * 1000; // refresh before expiry: 60 min lifetime - 5 min margin = 55 min reuse
const JWT_BACKDATE_S = 60; // clock-skew backdate per GitHub App JWT guidance
const JWT_LIFETIME_S = 540; // 9 min, under GitHub's 10 min JWT cap
const REDACTED = "[REDACTED]";

class AppTokenError extends Error {
  constructor(message, code = 1) {
    super(message);
    this.name = "AppTokenError";
    this.exitCode = code;
  }
}

function expandHome(p) {
  if (!p) return p;
  if (p === "~") return os.homedir();
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  return p;
}

function defaultStateDir() {
  return path.join(os.homedir(), ".cache", "curaos-gh-app");
}

function loadConfig(env = process.env) {
  const appId = (env.CURAOS_GH_APP_ID || "").trim();
  const installationId = (env.CURAOS_GH_APP_INSTALLATION_ID || "").trim();
  const privateKeyPath = expandHome((env.CURAOS_GH_APP_PRIVATE_KEY_PATH || "").trim());
  const stateDir = defaultStateDir();
  return {
    appId,
    installationId,
    privateKeyPath,
    cachePath: expandHome((env.CURAOS_GH_APP_TOKEN_CACHE || "").trim()) || path.join(stateDir, "token.json"),
    auditPath: expandHome((env.CURAOS_GH_APP_AUDIT_LOG || "").trim()) || path.join(stateDir, "audit.log"),
    apiUrl: ((env.CURAOS_GH_APP_API_URL || "").trim() || DEFAULT_API_URL).replace(/\/+$/, ""),
    configured: Boolean(appId && installationId && privateKeyPath),
  };
}

function isConfigured(env = process.env) {
  return loadConfig(env).configured;
}

// ---- redaction (no token value ever reaches a log line or error message) ----
function redact(text, secrets = []) {
  let out = String(text == null ? "" : text);
  for (const secret of secrets) {
    if (!secret || secret.length < 4) continue; // never split-replace trivial strings
    out = out.split(secret).join(REDACTED);
  }
  return out;
}

// ---- private key handling (0600/0400 or refuse; content never logged) ----
function checkPrivateKeyPerms(privateKeyPath) {
  let stat;
  try {
    stat = fs.statSync(privateKeyPath);
  } catch {
    throw new AppTokenError(`private key not found at ${privateKeyPath} (set CURAOS_GH_APP_PRIVATE_KEY_PATH; see docs/agents/gh-app-token.md)`, 2);
  }
  if (!stat.isFile()) {
    throw new AppTokenError(`private key path ${privateKeyPath} is not a regular file`, 2);
  }
  const mode = stat.mode & 0o777;
  if ((mode & 0o077) !== 0) {
    throw new AppTokenError(
      `private key ${privateKeyPath} has mode 0${mode.toString(8)}; group/other access is forbidden. Run: chmod 600 ${privateKeyPath}`,
      2,
    );
  }
  return mode;
}

function readPrivateKey(privateKeyPath) {
  checkPrivateKeyPerms(privateKeyPath);
  return fs.readFileSync(privateKeyPath, "utf8");
}

// ---- App JWT (RS256, backdated iat, <10 min lifetime) ----
function b64url(buf) {
  return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function appJwt(appId, privateKeyPem, nowMs) {
  const nowS = Math.floor(nowMs / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({ iat: nowS - JWT_BACKDATE_S, exp: nowS + JWT_LIFETIME_S, iss: appId }));
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(`${header}.${payload}`);
  const signature = b64url(signer.sign(privateKeyPem));
  return `${header}.${payload}.${signature}`;
}

// ---- cache (0600 file inside 0700 dir; over-permissive cache treated as invalid) ----
function ensurePrivateDir(dir) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
}

function readCache(cachePath, nowMs) {
  let stat;
  try {
    stat = fs.statSync(cachePath);
  } catch {
    return null;
  }
  // A cache readable by group/other is a credential leak: ignore it and re-mint.
  if ((stat.mode & 0o077) !== 0) return null;
  let record;
  try {
    record = JSON.parse(fs.readFileSync(cachePath, "utf8"));
  } catch {
    return null;
  }
  if (!record || typeof record.token !== "string" || typeof record.expires_at_ms !== "number") return null;
  if (record.expires_at_ms - nowMs <= REFRESH_MARGIN_MS) return null; // stale: refresh before expiry
  return record;
}

function writeCache(cachePath, record) {
  ensurePrivateDir(path.dirname(cachePath));
  const tmp = `${cachePath}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });
  fs.chmodSync(tmp, 0o600); // mode option is masked by umask; force it
  fs.renameSync(tmp, cachePath);
  fs.chmodSync(cachePath, 0o600);
}

// ---- audit trail (timestamped, token-redacted, 0600) ----
function auditAppend(auditPath, event, fields = {}, secrets = []) {
  ensurePrivateDir(path.dirname(auditPath));
  const line = `${JSON.stringify({ ts: new Date().toISOString(), event, ...fields })}\n`;
  fs.appendFileSync(auditPath, redact(line, secrets), { mode: 0o600 });
  fs.chmodSync(auditPath, 0o600);
}

// ---- mint ----
async function mintInstallationToken(config, { nowMs, fetchImpl }) {
  const pem = readPrivateKey(config.privateKeyPath);
  const jwt = appJwt(config.appId, pem, nowMs);
  const url = `${config.apiUrl}/app/installations/${config.installationId}/access_tokens`;
  let response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "curaos-gh-app-token",
      },
    });
  } catch (error) {
    throw new AppTokenError(`token mint request failed: ${redact(error && error.message, [jwt, pem])}`, 3);
  }
  const bodyText = await response.text();
  if (response.status !== 201) {
    // Redact against the JWT and key; the body is server-controlled and must never echo secrets onward.
    throw new AppTokenError(
      `token mint failed (HTTP ${response.status}): ${redact(bodyText, [jwt, pem]).slice(0, 500)}`,
      3,
    );
  }
  let body;
  try {
    body = JSON.parse(bodyText);
  } catch {
    throw new AppTokenError("token mint returned non-JSON body", 3);
  }
  if (!body || typeof body.token !== "string" || !body.expires_at) {
    throw new AppTokenError("token mint response missing token/expires_at", 3);
  }
  return { token: body.token, expiresAtMs: Date.parse(body.expires_at) };
}

// ---- keyring fallback (gh auth token WITHOUT env token vars) ----
function keyringToken({ env = process.env, execImpl = execFileSync } = {}) {
  const childEnv = { ...env };
  delete childEnv.GITHUB_TOKEN;
  delete childEnv.GH_TOKEN;
  let out;
  try {
    out = execImpl("gh", ["auth", "token"], {
      encoding: "utf8",
      env: childEnv,
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch (error) {
    const detail = redact([error && error.message, error && error.stderr].filter(Boolean).join(": "), []);
    throw new AppTokenError(`no App configured and keyring gh auth unavailable: ${detail}`, 4);
  }
  const token = String(out).trim();
  if (!token) throw new AppTokenError("gh auth token returned an empty token", 4);
  return token;
}

// ---- main entry ----
// Returns { token, source, expiresAtMs|null }. source: app-cache | app-mint | app-refresh | gh-keyring.
async function getToken({
  env = process.env,
  nowMs = Date.now(),
  fetchImpl = fetch,
  execImpl = execFileSync,
  log = (line) => process.stderr.write(`${line}\n`),
  forceRefresh = false,
} = {}) {
  const config = loadConfig(env);

  if (!config.configured) {
    const token = keyringToken({ env, execImpl });
    auditAppend(config.auditPath, "fallback_keyring", { reason: "app not configured" }, [token]);
    log(redact("gh-app-token: App not configured; using keyring gh auth token", [token]));
    return { token, source: "gh-keyring", expiresAtMs: null };
  }

  if (!/^\d+$/.test(config.appId) || !/^\d+$/.test(config.installationId)) {
    throw new AppTokenError("CURAOS_GH_APP_ID and CURAOS_GH_APP_INSTALLATION_ID must be numeric", 2);
  }

  if (!forceRefresh) {
    const cached = readCache(config.cachePath, nowMs);
    if (cached) {
      log(redact(`gh-app-token: cache hit (expires ${new Date(cached.expires_at_ms).toISOString()})`, [cached.token]));
      return { token: cached.token, source: "app-cache", expiresAtMs: cached.expires_at_ms };
    }
  }

  const hadCache = fs.existsSync(config.cachePath);
  const minted = await mintInstallationToken(config, { nowMs, fetchImpl });
  const secrets = [minted.token];
  writeCache(config.cachePath, {
    token: minted.token,
    expires_at_ms: minted.expiresAtMs,
    minted_at_ms: nowMs,
    app_id: config.appId,
    installation_id: config.installationId,
  });
  const event = hadCache ? "refresh" : "mint";
  auditAppend(
    config.auditPath,
    event,
    {
      app_id: config.appId,
      installation_id: config.installationId,
      expires_at: new Date(minted.expiresAtMs).toISOString(),
      cache: config.cachePath,
    },
    secrets,
  );
  log(redact(`gh-app-token: ${event} ok (expires ${new Date(minted.expiresAtMs).toISOString()})`, secrets));
  return { token: minted.token, source: hadCache ? "app-refresh" : "app-mint", expiresAtMs: minted.expiresAtMs };
}

// Status snapshot WITHOUT any token value (safe to print anywhere).
function status({ env = process.env, nowMs = Date.now() } = {}) {
  const config = loadConfig(env);
  const out = {
    configured: config.configured,
    cache_path: config.cachePath,
    audit_path: config.auditPath,
    api_url: config.apiUrl,
  };
  if (config.configured) {
    out.app_id = config.appId;
    out.installation_id = config.installationId;
    out.private_key_path = config.privateKeyPath;
    const cached = readCache(config.cachePath, nowMs);
    out.cache_valid = Boolean(cached);
    out.cache_expires_at = cached ? new Date(cached.expires_at_ms).toISOString() : null;
  }
  return out;
}

// Config + key permission preflight; mints nothing.
function check({ env = process.env } = {}) {
  const config = loadConfig(env);
  if (!config.configured) {
    return { ok: true, mode: "fallback", detail: "App not configured; helper will use keyring gh auth" };
  }
  if (!/^\d+$/.test(config.appId) || !/^\d+$/.test(config.installationId)) {
    throw new AppTokenError("CURAOS_GH_APP_ID and CURAOS_GH_APP_INSTALLATION_ID must be numeric", 2);
  }
  const mode = checkPrivateKeyPerms(config.privateKeyPath);
  return { ok: true, mode: "app", detail: `private key mode 0${mode.toString(8)} ok` };
}

async function main(argv = process.argv.slice(2), deps = {}) {
  const stdout = deps.stdout || ((s) => process.stdout.write(s));
  const stderr = deps.stderr || ((s) => process.stderr.write(s));
  const log = (line) => stderr(`${line}\n`);
  try {
    if (argv.includes("--help") || argv.includes("-h")) {
      stderr(
        [
          "usage: gh-app-token [--status|--check|--force-refresh]",
          "  (no flags)       print a usable token on stdout (App installation token when",
          "                   configured, keyring gh auth token otherwise)",
          "  --status         print a token-free JSON status snapshot",
          "  --check          validate config + private key permissions; mint nothing",
          "  --force-refresh  ignore the cache and mint a fresh token",
          "runbook: docs/agents/gh-app-token.md",
        ].join("\n") + "\n",
      );
      return 0;
    }
    if (argv.includes("--status")) {
      stdout(`${JSON.stringify(status({ env: deps.env || process.env }), null, 2)}\n`);
      return 0;
    }
    if (argv.includes("--check")) {
      const result = check({ env: deps.env || process.env });
      stderr(`gh-app-token: check ok (${result.mode}): ${result.detail}\n`);
      return 0;
    }
    const result = await getToken({
      env: deps.env || process.env,
      log,
      forceRefresh: argv.includes("--force-refresh"),
      fetchImpl: deps.fetchImpl || fetch,
      execImpl: deps.execImpl || execFileSync,
    });
    // stdout is the delivery channel (like `gh auth token`); diagnostics stay on stderr, redacted.
    stdout(`${result.token}\n`);
    return 0;
  } catch (error) {
    const code = error && error.exitCode ? error.exitCode : 1;
    stderr(`gh-app-token: ${redact(error && error.message ? error.message : String(error), [])}\n`);
    return code;
  }
}

module.exports = {
  AppTokenError,
  REFRESH_MARGIN_MS,
  appJwt,
  auditAppend,
  check,
  checkPrivateKeyPerms,
  getToken,
  isConfigured,
  keyringToken,
  loadConfig,
  main,
  mintInstallationToken,
  readCache,
  redact,
  status,
  writeCache,
};
