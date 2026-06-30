// gh-pr-gate-snapshot - deterministic REST snapshot for PR merge gates.
// Contract: docs/agents/workflows/gh-pr-gate-snapshot.md
export const meta = {
  name: "gh-pr-gate-snapshot",
  description: "Read PR head facts using GitHub REST",
  phases: [{ title: "Snapshot", detail: "head sha + update-age facts" }],
};

const CONTRACT = {
  name: "gh-pr-gate-snapshot",
  kind: "atomic",
  version: "0.1.0",
  inputs: {
    pr: { type: "string", required: true, description: "owner/repo#N PR to inspect" },
  },
  outputs: {
    head_sha: { type: "string", description: "current PR head sha, or empty on failure" },
    minutes_since_last_push: { type: "number", description: "minutes since the PR was last updated (pulls/{number}.updated_at), exposed through this compatibility field name, or -1 on failure" },
    blocked_by_external: { type: "boolean", description: "true when GitHub REST failed" },
    error: { type: "string", description: "failure text when blocked_by_external=true" },
  },
  guarantees: { idempotent: true, determinism: "control-flow-only", side_effects: "github-read" },
  verification: "T1",
  models: {},
  composes: [],
};

let _execFileSync;
function execFileSync(...callArgs) {
  if (!_execFileSync) _execFileSync = process.getBuiltinModule("node:child_process").execFileSync;
  return _execFileSync(...callArgs);
}

function parseArgs(a) {
  if (a && typeof a === "object") return a;
  if (typeof a === "string" && a.trim()) { try { return JSON.parse(a); } catch { return {}; } }
  return {};
}

let _ghRef;
function workflowRequire(name) {
  const { createRequire } = process.getBuiltinModule("node:module");
  const { pathToFileURL } = process.getBuiltinModule("node:url");
  let base = "";
  try { base = eval("import.meta.url"); } catch {}
  if (!base && typeof __filename === "string" && /scripts\/workflows\/gh-pr-gate-snapshot\.workflow\.js$/.test(__filename)) base = __filename;
  if (!base) base = pathToFileURL(`${process.cwd()}/scripts/workflows/gh-pr-gate-snapshot.workflow.js`).href;
  return createRequire(base)(name);
}
function ghRef() {
  if (!_ghRef) _ghRef = workflowRequire("../lib/gh-ref.js");
  return _ghRef;
}
function parsePrRef(pr) {
  return ghRef().parsePrRef(pr, { source: "gh-pr-gate-snapshot" });
}

const GH_ATTEMPTS = 3;

function errorText(error) {
  const parts = [];
  if (error && error.message) parts.push(error.message);
  if (error && error.stderr) parts.push(String(error.stderr));
  if (error && error.stdout) parts.push(String(error.stdout));
  if (error && Array.isArray(error.output)) parts.push(error.output.filter(Boolean).join("\n"));
  return parts.join("\n").trim() || String(error);
}

function isTransientGithubFailure(text) {
  return /(?:\bhttp\s*5\d\d\b|\bstatus\s*5\d\d\b|\bnon-200\s+status\s+5\d\d\b|gateway timeout|bad gateway|service unavailable|github\s+service|github.*unicorn|unicorn.*github)/i.test(String(text || ""));
}

function ghApi(path, jq, extraArgs = []) {
  const env = { ...process.env };
  delete env.GITHUB_TOKEN;
  const args = ["api", ...extraArgs, path];
  if (jq) args.push("--jq", jq);
  let lastError = null;
  for (let attempt = 1; attempt <= GH_ATTEMPTS; attempt += 1) {
    try {
      return execFileSync("gh", args, { encoding: "utf8", env, maxBuffer: 20 * 1024 * 1024 }).trim();
    } catch (error) {
      lastError = error;
      if (attempt < GH_ATTEMPTS && isTransientGithubFailure(errorText(error))) continue;
      throw error;
    }
  }
  throw lastError;
}

function prHeadSha(ref) {
  const { slug, number } = parsePrRef(ref);
  return ghApi(`repos/${slug}/pulls/${number}`, ".head.sha");
}

function prUpdatedAt(ref) {
  const { slug, number } = parsePrRef(ref);
  return ghApi(`repos/${slug}/pulls/${number}`, ".updated_at");
}

function minutesSincePrUpdate(ref) {
  const date = prUpdatedAt(ref);
  const then = Date.parse(date);
  if (!Number.isFinite(then)) return -1;
  return Math.max(0, (Date.now() - then) / 60000);
}

function snapshotPrGate(cfg) {
  const headSha = prHeadSha(cfg.pr);
  const minutes = minutesSincePrUpdate(cfg.pr);
  return {
    head_sha: headSha,
    minutes_since_last_push: minutes,
    blocked_by_external: false,
    error: "",
  };
}

async function agentSnapshotFallback(cfg, agent, cause) {
  if (!agent) return null;
  const result = await agent(
    `Deterministic gh-pr-gate-snapshot failed before it could read GitHub: ${cause}
Return a fail-closed PR gate snapshot for ${cfg.pr}. If you can inspect GitHub, read the current PR head SHA and minutes since the PR was last updated. If any field cannot be proven, return blocked_by_external:true with head_sha:"" and minutes_since_last_push:-1.`,
    {
      label: "gh-pr-gate-snapshot-fallback",
      phase: "Snapshot",
      model: "haiku",
      schema: {
        type: "object",
        required: ["head_sha", "minutes_since_last_push", "blocked_by_external", "error"],
        properties: {
          head_sha: { type: "string" },
          minutes_since_last_push: { type: "number" },
          blocked_by_external: { type: "boolean" },
          error: { type: "string" },
        },
      },
    },
  );
  const head = String(result && result.head_sha || "");
  const minutes = Number(result && result.minutes_since_last_push);
  if (result && result.blocked_by_external === false && /^[0-9a-f]{40}$/i.test(head) && Number.isFinite(minutes)) {
    return {
      head_sha: head,
      minutes_since_last_push: minutes,
      blocked_by_external: false,
      error: "",
    };
  }
  return {
    head_sha: "",
    minutes_since_last_push: -1,
    blocked_by_external: true,
    error: String(result && result.error || cause || "gh-pr-gate-snapshot fallback could not prove PR state"),
  };
}

export default async function workflow({ args, phase, log, agent }) {
  phase("Snapshot");
  const cfg = parseArgs(args);
  if (!cfg.pr) throw new Error("gh-pr-gate-snapshot: args.pr (owner/repo#N) is required");
  try {
    return snapshotPrGate(cfg);
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    const fallback = await agentSnapshotFallback(cfg, agent, message).catch(() => null);
    if (fallback) return fallback;
    return {
      head_sha: "",
      minutes_since_last_push: -1,
      blocked_by_external: true,
      error: message,
    };
  }
}
