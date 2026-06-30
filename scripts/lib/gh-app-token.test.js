// scripts/lib/gh-app-token.test.js
// RP-43: GitHub App installation token helper. Runner: bun test.
// Covers GRILL-007 security acceptance: private key 0600 perms gate, cache file 0600,
// refresh before expiry (55 min reuse window), no token value in any log/audit/error
// output (redaction), audit trail of mint/refresh events, and the graceful fallback
// to keyring gh auth (GITHUB_TOKEN/GH_TOKEN stripped from the child env).
const { test, expect, beforeEach, afterEach } = require("bun:test");
const { spawnSync } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const helper = require("./gh-app-token.js");

const ROOT = path.resolve(__dirname, "..", "..");
const CLI = path.join(ROOT, "scripts", "gh-app-token");
const SENTINEL_TOKEN = "ghs_SENTINELxxSECRETxxVALUExx12345";

let tmpDir;
let keyPath;
let cachePath;
let auditPath;
let env;
let logLines;
let privateKeyPem;

function makeFetchStub({ status = 201, token = SENTINEL_TOKEN, expiresInMs = 60 * 60 * 1000, nowMs = Date.now(), body } = {}) {
  const calls = [];
  const impl = async (url, options) => {
    calls.push({ url, options });
    const payload = body !== undefined ? body : JSON.stringify({ token, expires_at: new Date(nowMs + expiresInMs).toISOString() });
    return { status, text: async () => payload };
  };
  return { impl, calls };
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gh-app-token-test-"));
  keyPath = path.join(tmpDir, "app-key.pem");
  cachePath = path.join(tmpDir, "state", "token.json");
  auditPath = path.join(tmpDir, "state", "audit.log");
  privateKeyPem = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs1", format: "pem" });
  fs.writeFileSync(keyPath, privateKeyPem, { mode: 0o600 });
  fs.chmodSync(keyPath, 0o600);
  env = {
    PATH: process.env.PATH,
    HOME: tmpDir,
    CURAOS_GH_APP_ID: "12345",
    CURAOS_GH_APP_INSTALLATION_ID: "67890",
    CURAOS_GH_APP_PRIVATE_KEY_PATH: keyPath,
    CURAOS_GH_APP_TOKEN_CACHE: cachePath,
    CURAOS_GH_APP_AUDIT_LOG: auditPath,
  };
  logLines = [];
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const log = (line) => logLines.push(line);

// ---- fallback: no App configured -> keyring gh auth, env token vars stripped ----

test("falls back to keyring gh auth when no App is configured, stripping GITHUB_TOKEN/GH_TOKEN", async () => {
  const recorded = [];
  const execStub = (cmd, args, options) => {
    recorded.push({ cmd, args, env: options.env });
    return "keyring-token-abc\n";
  };
  const bare = { PATH: process.env.PATH, HOME: tmpDir, GITHUB_TOKEN: "narrow-env-token", GH_TOKEN: "narrow-env-token-2", CURAOS_GH_APP_AUDIT_LOG: auditPath };
  const result = await helper.getToken({ env: bare, execImpl: execStub, log });
  expect(result.token).toBe("keyring-token-abc");
  expect(result.source).toBe("gh-keyring");
  expect(recorded.length).toBe(1);
  expect(recorded[0].cmd).toBe("gh");
  expect(recorded[0].args).toEqual(["auth", "token"]);
  expect("GITHUB_TOKEN" in recorded[0].env).toBe(false);
  expect("GH_TOKEN" in recorded[0].env).toBe(false);
  // fallback is audited and the keyring token never appears in audit or logs
  const audit = fs.readFileSync(auditPath, "utf8");
  expect(audit).toContain("fallback_keyring");
  expect(audit).not.toContain("keyring-token-abc");
  expect(logLines.join("\n")).not.toContain("keyring-token-abc");
});

test("fallback failure surfaces a classified error, not a crash", async () => {
  const execStub = () => {
    const error = new Error("gh: not logged in");
    error.stderr = "gh: To get started with GitHub CLI, please run: gh auth login";
    throw error;
  };
  const bare = { PATH: process.env.PATH, HOME: tmpDir };
  await expect(helper.getToken({ env: bare, execImpl: execStub, log })).rejects.toThrow(/keyring gh auth unavailable/);
});

// ---- private key permission gate (GRILL-007) ----

test("refuses to mint when the private key is group/other readable", async () => {
  fs.chmodSync(keyPath, 0o644);
  const { impl } = makeFetchStub();
  await expect(helper.getToken({ env, fetchImpl: impl, log })).rejects.toThrow(/group\/other access is forbidden/);
});

test("refuses when the private key file is missing", async () => {
  fs.rmSync(keyPath);
  const { impl } = makeFetchStub();
  await expect(helper.getToken({ env, fetchImpl: impl, log })).rejects.toThrow(/private key not found/);
});

test("accepts 0600 and 0400 private keys", async () => {
  const { impl } = makeFetchStub();
  const first = await helper.getToken({ env, fetchImpl: impl, log });
  expect(first.source).toBe("app-mint");
  fs.rmSync(cachePath);
  fs.chmodSync(keyPath, 0o400);
  const second = await helper.getToken({ env, fetchImpl: impl, log });
  expect(second.source).toBe("app-mint");
});

test("check() validates config + key perms without minting", () => {
  const result = helper.check({ env });
  expect(result.ok).toBe(true);
  expect(result.mode).toBe("app");
  expect(fs.existsSync(cachePath)).toBe(false);
  fs.chmodSync(keyPath, 0o644);
  expect(() => helper.check({ env })).toThrow(/group\/other access is forbidden/);
});

// ---- mint + cache 0600 + 55 min reuse + refresh before expiry ----

test("mint writes a 0600 cache file inside a 0700 dir and returns the token", async () => {
  const nowMs = Date.now();
  const { impl, calls } = makeFetchStub({ nowMs });
  const result = await helper.getToken({ env, nowMs, fetchImpl: impl, log });
  expect(result.token).toBe(SENTINEL_TOKEN);
  expect(result.source).toBe("app-mint");
  expect(calls.length).toBe(1);
  expect(calls[0].url).toBe("https://api.github.com/app/installations/67890/access_tokens");
  expect(calls[0].options.headers.Authorization).toMatch(/^Bearer eyJ/);
  // GRILL-007: cache file mode asserted after mint
  expect(fs.statSync(cachePath).mode & 0o777).toBe(0o600);
  expect(fs.statSync(path.dirname(cachePath)).mode & 0o777).toBe(0o700);
});

test("second call inside the 55 min window is a cache hit (no second mint)", async () => {
  const nowMs = Date.now();
  const { impl, calls } = makeFetchStub({ nowMs });
  await helper.getToken({ env, nowMs, fetchImpl: impl, log });
  const again = await helper.getToken({ env, nowMs: nowMs + 50 * 60 * 1000, fetchImpl: impl, log });
  expect(again.source).toBe("app-cache");
  expect(again.token).toBe(SENTINEL_TOKEN);
  expect(calls.length).toBe(1);
});

test("refreshes BEFORE expiry: a call 56 min after mint re-mints (5 min margin)", async () => {
  const nowMs = Date.now();
  const { impl, calls } = makeFetchStub({ nowMs });
  await helper.getToken({ env, nowMs, fetchImpl: impl, log });
  const later = nowMs + 56 * 60 * 1000; // token still has 4 min left, under the margin
  const second = makeFetchStub({ nowMs: later, token: "ghs_SECONDxxTOKENxxVALUExx67890" });
  const refreshed = await helper.getToken({ env, nowMs: later, fetchImpl: second.impl, log });
  expect(calls.length).toBe(1);
  expect(second.calls.length).toBe(1);
  expect(refreshed.source).toBe("app-refresh");
  expect(refreshed.token).toBe("ghs_SECONDxxTOKENxxVALUExx67890");
  const audit = fs.readFileSync(auditPath, "utf8");
  expect(audit).toContain('"event":"mint"');
  expect(audit).toContain('"event":"refresh"');
});

test("an over-permissive cache file is treated as invalid and re-minted", async () => {
  const nowMs = Date.now();
  const { impl } = makeFetchStub({ nowMs });
  await helper.getToken({ env, nowMs, fetchImpl: impl, log });
  fs.chmodSync(cachePath, 0o644);
  const second = makeFetchStub({ nowMs });
  const result = await helper.getToken({ env, nowMs, fetchImpl: second.impl, log });
  expect(second.calls.length).toBe(1);
  expect(result.source).toBe("app-refresh");
  expect(fs.statSync(cachePath).mode & 0o777).toBe(0o600);
});

// ---- no token logging + redaction (GRILL-007) ----

test("token value never appears in logs, audit trail, or status output", async () => {
  const nowMs = Date.now();
  const { impl } = makeFetchStub({ nowMs });
  await helper.getToken({ env, nowMs, fetchImpl: impl, log });
  const diagnostics = logLines.join("\n");
  expect(diagnostics).not.toContain(SENTINEL_TOKEN);
  const audit = fs.readFileSync(auditPath, "utf8");
  expect(audit).not.toContain(SENTINEL_TOKEN);
  expect(audit).toContain('"event":"mint"');
  expect(audit).toMatch(/"ts":"\d{4}-\d{2}-\d{2}T/); // timestamped
  const snapshot = JSON.stringify(helper.status({ env, nowMs }));
  expect(snapshot).not.toContain(SENTINEL_TOKEN);
  expect(JSON.parse(snapshot).cache_valid).toBe(true);
});

test("a mint failure body that echoes the JWT is redacted in the thrown error", async () => {
  const nowMs = Date.now();
  let capturedJwt = null;
  const impl = async (url, options) => {
    capturedJwt = options.headers.Authorization.replace(/^Bearer /, "");
    return { status: 401, text: async () => `bad credentials for ${capturedJwt}` };
  };
  let thrown = null;
  try {
    await helper.getToken({ env, nowMs, fetchImpl: impl, log });
  } catch (error) {
    thrown = error;
  }
  expect(thrown).not.toBeNull();
  expect(capturedJwt).not.toBeNull();
  expect(thrown.message).toContain("HTTP 401");
  expect(thrown.message).not.toContain(capturedJwt);
  expect(thrown.message).toContain("[REDACTED]");
});

test("redact() scrubs every occurrence and ignores trivially short secrets", () => {
  expect(helper.redact("a TOK1234 b TOK1234", ["TOK1234"])).toBe("a [REDACTED] b [REDACTED]");
  expect(helper.redact("nothing here", ["abc"])).toBe("nothing here"); // <4 chars never split-replaced
  expect(helper.redact(null, ["TOK1234"])).toBe("");
});

// ---- JWT shape ----

test("appJwt emits RS256 with backdated iat and <10 min lifetime", () => {
  const nowMs = 1_700_000_000_000;
  const jwt = helper.appJwt("12345", privateKeyPem, nowMs);
  const [headerB64, payloadB64] = jwt.split(".");
  const header = JSON.parse(Buffer.from(headerB64, "base64"));
  const payload = JSON.parse(Buffer.from(payloadB64, "base64"));
  expect(header.alg).toBe("RS256");
  expect(payload.iss).toBe("12345");
  expect(payload.iat).toBe(Math.floor(nowMs / 1000) - 60);
  // GitHub caps exp at 10 min from NOW; 540s forward keeps margin for clock skew
  expect(payload.exp - Math.floor(nowMs / 1000)).toBeLessThan(600);
});

// ---- CLI subprocess (gh stubbed on PATH; no App env -> keyring path) ----

function makeGhStub(binDir) {
  fs.mkdirSync(binDir, { recursive: true });
  const stub = path.join(binDir, "gh");
  fs.writeFileSync(stub, '#!/usr/bin/env bash\nif [ "$1" = "auth" ] && [ "$2" = "token" ]; then echo "stub-keyring-token"; exit 0; fi\nexit 1\n', { mode: 0o755 });
  fs.chmodSync(stub, 0o755);
  return binDir;
}

test("CLI default prints the fallback token on stdout; stderr and audit stay token-free", () => {
  const binDir = makeGhStub(path.join(tmpDir, "bin"));
  const result = spawnSync("bun", [CLI], {
    encoding: "utf8",
    env: { PATH: `${binDir}:${process.env.PATH}`, HOME: tmpDir, CURAOS_GH_APP_AUDIT_LOG: auditPath },
  });
  expect(result.status).toBe(0);
  expect(result.stdout.trim()).toBe("stub-keyring-token");
  expect(result.stderr).not.toContain("stub-keyring-token");
  expect(fs.readFileSync(auditPath, "utf8")).not.toContain("stub-keyring-token");
});

test("CLI --status prints token-free JSON; --check passes on a 0600 key", () => {
  const binDir = makeGhStub(path.join(tmpDir, "bin"));
  const cliEnv = { ...env, PATH: `${binDir}:${process.env.PATH}` };
  const statusRun = spawnSync("bun", [CLI, "--status"], { encoding: "utf8", env: cliEnv });
  expect(statusRun.status).toBe(0);
  const parsed = JSON.parse(statusRun.stdout);
  expect(parsed.configured).toBe(true);
  expect(JSON.stringify(parsed)).not.toContain(SENTINEL_TOKEN);
  const checkRun = spawnSync("bun", [CLI, "--check"], { encoding: "utf8", env: cliEnv });
  expect(checkRun.status).toBe(0);
  expect(checkRun.stderr).toContain("check ok");
});

test("CLI --check fails closed on a world-readable key", () => {
  fs.chmodSync(keyPath, 0o644);
  const binDir = makeGhStub(path.join(tmpDir, "bin"));
  const run = spawnSync("bun", [CLI, "--check"], { encoding: "utf8", env: { ...env, PATH: `${binDir}:${process.env.PATH}` } });
  expect(run.status).not.toBe(0);
  expect(run.stderr).toContain("group/other access is forbidden");
});
