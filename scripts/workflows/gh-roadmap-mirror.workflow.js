// gh-roadmap-mirror - regenerate ISSUE-ROADMAP from live tracker state (tracker is source of truth).
// Fills the missing-refresh-script gap. Contract: docs/agents/workflows/gh-roadmap-mirror.md
export const meta = {
  name: "gh-roadmap-mirror",
  description: "Regenerate ISSUE-ROADMAP from the live tracker snapshot (tracker wins)",
  phases: [{ title: "Mirror", detail: "render roadmap mirror from board snapshot" }],
};

const CONTRACT = {
  name: "gh-roadmap-mirror",
  kind: "atomic",
  version: "0.1.0",
  inputs: {
    dry_run: { type: "boolean", required: false, description: "report the mirror diff without writing the docs" },
    offline: { type: "boolean", required: false, description: "render from the local board snapshot without a GitHub Project read" },
    refresh: { type: "boolean", required: false, description: "force-refresh the board snapshot before rendering" },
    snapshot: { type: "string", required: false, description: "board snapshot path to render; defaults to the shared workflow cache" },
  },
  outputs: {
    issue_roadmap_updated: { type: "boolean", description: "true if ISSUE-ROADMAP.md changed" },
    handover_updated: { type: "boolean", description: "always false; HANDOVER stop-state remains an explicit closeout edit" },
    drift: { type: "array", description: "tracker-vs-mirror discrepancies found + reconciled" },
  },
  guarantees: { idempotent: false, determinism: "control-flow-only", side_effects: "fs" },
  verification: "T1",
  models: { mirror: "sonnet" },
  composes: [],
};

const ROOT = ".";
function parseArgs(a) {
  if (a && typeof a === "object") return a;
  if (typeof a === "string" && a.trim()) { try { return JSON.parse(a); } catch { return {}; } }
  return {};
}
let _fs;
let _path;
let _execFileSync;
function fs() {
  if (!_fs) _fs = process.getBuiltinModule("node:fs");
  return _fs;
}
function path() {
  if (!_path) _path = process.getBuiltinModule("node:path");
  return _path;
}
function execFileSync(...callArgs) {
  if (!_execFileSync) _execFileSync = process.getBuiltinModule("node:child_process").execFileSync;
  return _execFileSync(...callArgs);
}
function fileText(file) {
  try {
    return fs().readFileSync(file, "utf8");
  } catch {
    return "";
  }
}
function renderArgs(outPath, cfg) {
  const render = ["scripts/render-issue-roadmap.js", "--out", outPath];
  const snapshot = typeof cfg.snapshot === "string" && cfg.snapshot.trim() ? cfg.snapshot.trim() : "";
  if (snapshot) render.push("--snapshot", snapshot);
  if (cfg.offline === true) render.push("--offline");
  if (cfg.refresh === true) render.push("--refresh");
  const projectNumber = Number(cfg.projectNumber ?? cfg.project_number);
  if (Number.isFinite(projectNumber)) render.push("--project-number", String(projectNumber));
  return render;
}
function renderRoadmap(outPath, cfg) {
  return execFileSync("node", renderArgs(outPath, cfg), {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env },
    maxBuffer: 20 * 1024 * 1024,
  }).trim();
}
function renderRoadmapSafe(outPath, cfg) {
  try {
    return { output: renderRoadmap(outPath, cfg), fallback: false };
  } catch (error) {
    if (cfg.offline === true || cfg.refresh !== true) throw error;
    const fallback = renderRoadmap(outPath, { ...cfg, refresh: false, offline: true });
    const reason = error && error.message ? error.message.split("\n")[0] : String(error);
    return { output: `${fallback}; offline fallback after refresh failed: ${reason}`, fallback: true };
  }
}

export default async function workflow({ args, phase }) {
  phase("Mirror");
  const cfg = parseArgs(args);
  const roadmapPath = "ai/curaos/docs/ISSUE-ROADMAP.md";
  const before = fileText(roadmapPath);
  let renderOut = "";
  let after = "";

  if (cfg.dry_run) {
    const scratch = `.scratch/roadmap-mirror-dry-run-${Date.now()}.md`;
    fs().mkdirSync(path().dirname(scratch), { recursive: true });
    renderOut = renderRoadmapSafe(scratch, cfg).output;
    after = fileText(scratch);
    try { fs().unlinkSync(scratch); } catch {}
  } else {
    renderOut = renderRoadmapSafe(roadmapPath, cfg).output;
    after = fileText(roadmapPath);
  }

  const changed = before !== after;
  return {
    issue_roadmap_updated: changed,
    handover_updated: false,
    drift: [
      changed
        ? `${cfg.dry_run ? "Would update" : "Updated"} ISSUE-ROADMAP.md from the board snapshot: ${renderOut}`
        : `ISSUE-ROADMAP.md already matches the board snapshot: ${renderOut}`,
    ],
  };
}
