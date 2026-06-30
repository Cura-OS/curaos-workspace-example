const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const SKIP_SEGMENTS = new Set([
  ".ai-analysis",
  ".git",
  ".hg",
  ".next",
  ".scratch",
  ".stryker-tmp",
  ".turbo",
  ".worktrees",
  "coverage",
  "dist",
  "external-sources",
  "node_modules",
]);

const SCRIPT_EXTENSIONS = new Set([".cjs", ".js", ".mjs", ".sh", ".ts", ".tsx"]);
const MARKDOWN_EXTENSIONS = new Set([".md", ".mdc"]);
const AUDIT_EXTENSIONS = new Set([...SCRIPT_EXTENSIONS, ...MARKDOWN_EXTENSIONS]);

const WORKFLOW_TERMS = [
  "workflow",
  "Workflow",
  "agent-workflow-kit",
  "workflow-run",
  "workflow-status",
  "workflow-events",
  "Claude Workflow",
  "Codex app-server",
  "symphony",
  "Symphony",
  "GitHub sync",
  "local-issues",
  "local issue",
  "tracker adapter",
  "runner adapter",
  "Hermes",
  "Codex",
];

const AGENT_ORCHESTRATION_TERMS = [
  "agent workflow",
  "agent-workflow-kit",
  "workflow-run",
  "Claude Workflow",
  "Codex app-server",
  "symphony",
  "Symphony",
  "tracker adapter",
  "runner adapter",
];

const BLOCKED_TRACKER_NAME = ["Lin", "ear"].join("");
const BLOCKED_TRACKER_TERMS = [
  BLOCKED_TRACKER_NAME,
  [["lin", "ear"].join(""), "app"].join("."),
  [["lin", "ear"].join(""), "tracker"].join(" "),
  [BLOCKED_TRACKER_NAME, "tracker"].join(" "),
];

function toSlash(filePath) {
  return filePath.split(path.sep).join("/");
}

function skipSegment(segment) {
  return SKIP_SEGMENTS.has(segment) || /^\.wt-/.test(segment);
}

function shouldSkipPath(filePath) {
  const slash = toSlash(filePath);
  return slash.includes(".claude/worktrees/") || filePath.split(path.sep).some(skipSegment);
}

function walkFiles(dir, out = []) {
  if (!fs.existsSync(dir) || shouldSkipPath(dir)) return out;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (shouldSkipPath(full)) continue;
    if (entry.isDirectory()) {
      walkFiles(full, out);
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
  return out;
}

function walkGitRepositories(dir, root, out = []) {
  if (!fs.existsSync(dir) || shouldSkipPath(dir)) return out;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  if (entries.some((entry) => entry.name === ".git")) {
    out.push(dir);
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (skipSegment(entry.name)) continue;
    walkGitRepositories(path.join(dir, entry.name), root, out);
  }
  return out;
}

function discoverGitRepositories(root = process.cwd()) {
  const absoluteRoot = path.resolve(root);
  const repos = walkGitRepositories(absoluteRoot, absoluteRoot, []);
  if (repos.length === 0 && fs.existsSync(path.join(absoluteRoot, ".git"))) repos.push(absoluteRoot);
  return [...new Set(repos.map((repo) => path.resolve(repo)))]
    .sort((a, b) => path.relative(absoluteRoot, a).localeCompare(path.relative(absoluteRoot, b)));
}

function gitWorkspaceFilesForRepo(root, repo) {
  let output;
  try {
    output = execFileSync("git", ["-C", repo, "ls-files", "--cached", "--others", "--exclude-standard", "-z"]);
  } catch {
    return [];
  }
  return output
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .map((rel) => path.resolve(repo, rel))
    .filter((file) => file.startsWith(root + path.sep) || file === root)
    .filter((file) => fs.existsSync(file) && fs.statSync(file).isFile())
    .filter((file) => !shouldSkipPath(path.relative(root, file)));
}

function discoverWorkspaceFiles(root = process.cwd()) {
  const absoluteRoot = path.resolve(root);
  const repos = discoverGitRepositories(absoluteRoot);
  const files = repos.length > 0
    ? repos.flatMap((repo) => gitWorkspaceFilesForRepo(absoluteRoot, repo))
    : walkFiles(absoluteRoot);
  return [...new Set(files)]
    .filter((file) => !shouldSkipPath(path.relative(absoluteRoot, file)))
    .sort((a, b) => path.relative(absoluteRoot, a).localeCompare(path.relative(absoluteRoot, b)));
}

function hasWorkflowTerm(content) {
  return WORKFLOW_TERMS.some((term) => content.includes(term));
}

function pathHasWorkflowTerm(rel) {
  const lowered = toSlash(rel).toLowerCase();
  return [
    "agent",
    "codex",
    "hermes",
    "local-issues",
    "orchestration",
    "symphony",
    "workflow",
  ].some((term) => lowered.includes(term));
}

function pathHasAgentToolTerm(rel) {
  const lowered = toSlash(rel).toLowerCase();
  return [
    "agent-workflow",
    "codex",
    "hermes",
    "local-issues",
    "orchestration",
    "symphony",
  ].some((term) => lowered.includes(term));
}

function isWorkflowMjs(filePath, content) {
  return filePath.endsWith(".mjs") && hasWorkflowTerm(content);
}

function isWorkflowTypeScript(filePath) {
  return filePath.endsWith(".workflow.ts");
}

function isMarkdownAuditFile(rel) {
  const slash = toSlash(rel);
  const ext = path.extname(rel);
  if (!MARKDOWN_EXTENSIONS.has(ext)) return false;
  if (slash === "AGENTS.md" || slash === "CLAUDE.md") return true;
  if (slash.startsWith("docs/agents/")) return true;
  if (slash.startsWith("ai/rules/")) return true;
  if (slash.startsWith(".claude/rules/")) return true;
  return false;
}

function isScriptAuditFile(rel, content) {
  const slash = toSlash(rel);
  const ext = path.extname(rel);
  if (!SCRIPT_EXTENSIONS.has(ext)) return false;
  if (/\.workflow\.(js|mjs|ts|tsx)$/.test(slash)) return true;
  if (slash.startsWith("scripts/")) return true;
  if (slash.startsWith("curaos/scripts/")) return true;
  if (slash.includes("/scripts/workflows/")) return true;
  if (pathHasAgentToolTerm(slash)) return true;
  return ext === ".mjs" && hasWorkflowTerm(content);
}

function discoverPersistentWorkflowSourceFiles(root = process.cwd()) {
  const absoluteRoot = path.resolve(root);
  return walkFiles(absoluteRoot)
    .filter((file) => file.endsWith(".mjs") || file.endsWith(".ts"))
    .filter((file) => {
      const content = file.endsWith(".mjs") ? fs.readFileSync(file, "utf8") : "";
      return isWorkflowTypeScript(file) || isWorkflowMjs(file, content);
    })
    .sort((a, b) => path.relative(absoluteRoot, a).localeCompare(path.relative(absoluteRoot, b)));
}

function discoverWorkspaceAuditFiles(root = process.cwd()) {
  const absoluteRoot = path.resolve(root);
  return discoverWorkspaceFiles(absoluteRoot)
    .filter((file) => AUDIT_EXTENSIONS.has(path.extname(file)))
    .filter((file) => {
      const rel = path.relative(absoluteRoot, file);
      if (isMarkdownAuditFile(rel)) return true;
      const content = fs.readFileSync(file, "utf8");
      return isScriptAuditFile(rel, content);
    })
    .sort((a, b) => path.relative(absoluteRoot, a).localeCompare(path.relative(absoluteRoot, b)));
}

function lineNumberForOffset(content, offset) {
  return content.slice(0, offset).split("\n").length;
}

function agentOrchestrationMentionsBlockedTracker(content) {
  if (!BLOCKED_TRACKER_TERMS.some((term) => content.includes(term))) return false;
  return AGENT_ORCHESTRATION_TERMS.some((term) => content.includes(term));
}

function isExecutableScript(file) {
  return SCRIPT_EXTENSIONS.has(path.extname(file));
}

function auditFile(root, file) {
  const content = fs.readFileSync(file, "utf8");
  const rel = path.relative(root, file);
  const problems = [];
  const dashIndex = Math.min(
    ...[content.indexOf("\u2013"), content.indexOf("\u2014")].filter((index) => index >= 0),
  );
  if (Number.isFinite(dashIndex)) {
    problems.push({
      file: rel,
      line: lineNumberForOffset(content, dashIndex),
      rule: "no-unicode-dash",
      message: "Workspace workflow markdown and scripts must use ASCII hyphen, comma, semicolon, colon, or parentheses instead of en/em dash.",
    });
  }
  if (isExecutableScript(file) && agentOrchestrationMentionsBlockedTracker(content)) {
    const index = Math.min(
      ...BLOCKED_TRACKER_TERMS.map((term) => content.indexOf(term)).filter((offset) => offset >= 0),
    );
    problems.push({
      file: rel,
      line: lineNumberForOffset(content, index),
      rule: "no-linear-agent-tracker",
      message: `Symphony-aligned agent orchestration must keep GitHub as the tracker adapter; ${BLOCKED_TRACKER_NAME} may appear only in historical research docs, not executable source.`,
    });
  }
  return problems;
}

function auditFiles(root, files) {
  const absoluteRoot = path.resolve(root);
  const absoluteFiles = files.map((file) => path.resolve(absoluteRoot, file));
  const problems = absoluteFiles.flatMap((file) => auditFile(absoluteRoot, file));
  return {
    ok: problems.length === 0,
    checked: absoluteFiles.length,
    files: absoluteFiles.map((file) => path.relative(absoluteRoot, file)),
    problems,
  };
}

function auditPersistentWorkflowSources(options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const files = options.files?.map((file) => path.resolve(root, file)) ?? discoverPersistentWorkflowSourceFiles(root);
  return auditFiles(root, files);
}

function auditWorkspaceFiles(options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const files = options.files?.map((file) => path.resolve(root, file)) ?? discoverWorkspaceAuditFiles(root);
  return auditFiles(root, files);
}

module.exports = {
  auditFile,
  auditPersistentWorkflowSources,
  auditWorkspaceFiles,
  discoverGitRepositories,
  discoverPersistentWorkflowSourceFiles,
  discoverWorkspaceAuditFiles,
  discoverWorkspaceFiles,
};
