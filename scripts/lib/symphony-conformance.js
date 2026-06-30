const fs = require("node:fs");
const path = require("node:path");

const PLAYBOOK_SKIP = new Set(["README.md", "HIERARCHY-DESIGN.md"]);
const REQUIRED_FIELDS = [
  "tracker_adapter",
  "trigger_mode",
  "workspace_owner",
  "workspace_lifecycle",
  "hooks",
  "agent_runner",
  "prompt_inputs",
  "strict_rendering",
  "state_model",
  "local_issue_db",
  "retry_reconcile",
  "observability",
  "safety_posture",
  "github_sync",
  "validation",
  "tdd_evidence",
];
const ALLOWED_RUNNERS = new Set(["claude-workflow", "agent-workflow-kit", "hermes-native", "codex-adapter", "generic-playbook"]);
const LOCAL_ISSUE_DB = ".scratch/state/symphony-work/local-issues.sqlite";

function extractFrontmatter(markdown) {
  const match = String(markdown || "").match(/^---\r?\n([\s\S]*?)\r?\n---/);
  return match ? match[1] : null;
}

function splitTopLevel(value) {
  const parts = [];
  let cur = "";
  let depth = 0;
  let quote = null;
  for (const ch of value) {
    if (quote) {
      cur += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
      continue;
    }
    if (ch === "[" || ch === "{") depth += 1;
    if (ch === "]" || ch === "}") depth -= 1;
    if (ch === "," && depth === 0) {
      parts.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

function parseScalar(value) {
  const v = String(value || "").trim();
  if (!v) return "";
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) return v.slice(1, -1);
  if (v.startsWith("[") && v.endsWith("]")) {
    const inner = v.slice(1, -1).trim();
    return inner ? splitTopLevel(inner).map(parseScalar) : [];
  }
  if (v.startsWith("{") && v.endsWith("}")) {
    const out = {};
    const inner = v.slice(1, -1).trim();
    for (const part of splitTopLevel(inner)) {
      const i = part.indexOf(":");
      if (i === -1) continue;
      out[part.slice(0, i).trim()] = parseScalar(part.slice(i + 1));
    }
    return out;
  }
  if (v === "true") return true;
  if (v === "false") return false;
  if (/^-?\d+(?:\.\d+)?$/.test(v)) return Number(v);
  return v;
}

function parseYamlSubset(yaml) {
  const root = {};
  const stack = [{ indent: -1, obj: root }];
  for (const raw of String(yaml || "").split(/\r?\n/)) {
    if (!raw.trim() || raw.trimStart().startsWith("#")) continue;
    const indent = raw.length - raw.trimStart().length;
    const line = raw.trim();
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match) continue;
    while (stack.length && indent <= stack[stack.length - 1].indent) stack.pop();
    const parent = stack[stack.length - 1].obj;
    const key = match[1];
    const value = match[2];
    if (value === "") {
      const child = {};
      parent[key] = child;
      stack.push({ indent, obj: child });
    } else {
      parent[key] = parseScalar(value);
    }
  }
  return root;
}

function isMissing(value) {
  return value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === "") return [];
  return [value];
}

function validateMapping(mapping, relPath) {
  const problems = [];
  if (!mapping || typeof mapping !== "object" || Array.isArray(mapping)) {
    return [`${relPath}: missing symphony mapping`];
  }
  if (mapping.not_applicable) return problems;
  for (const field of REQUIRED_FIELDS) {
    if (isMissing(mapping[field])) problems.push(`${relPath}: missing symphony.${field}`);
  }
  for (const runner of asArray(mapping.agent_runner)) {
    if (!ALLOWED_RUNNERS.has(runner)) problems.push(`${relPath}: unknown symphony.agent_runner ${runner}`);
  }
  if (mapping.github_sync !== undefined && mapping.github_sync !== "explicit-checkpoint-only") {
    problems.push(`${relPath}: github_sync must be explicit-checkpoint-only`);
  }
  if (mapping.local_issue_db !== undefined && mapping.local_issue_db !== LOCAL_ISSUE_DB) {
    problems.push(`${relPath}: local_issue_db must be ${LOCAL_ISSUE_DB}`);
  }
  if (mapping.tdd_evidence !== undefined && mapping.tdd_evidence !== "required-for-script-code-changes") {
    problems.push(`${relPath}: tdd_evidence must be required-for-script-code-changes`);
  }
  return problems;
}

function validatePlaybook(filePath, root = process.cwd()) {
  const markdown = fs.readFileSync(filePath, "utf8");
  const relPath = path.relative(root, filePath).replaceAll(path.sep, "/");
  const frontmatter = extractFrontmatter(markdown);
  const name = path.basename(filePath, ".md");
  if (!frontmatter) {
    const problems = [`${relPath}: missing YAML frontmatter`];
    return { name, file: relPath, ok: false, mapping: null, problems };
  }
  const parsed = parseYamlSubset(frontmatter);
  const problems = validateMapping(parsed.symphony, relPath);
  return { name, contractName: parsed.name || name, file: relPath, ok: problems.length === 0, mapping: parsed.symphony || null, problems };
}

function publicPlaybooks(root = process.cwd()) {
  const dir = path.join(root, "docs/agents/workflows");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((file) => file.endsWith(".md") && !PLAYBOOK_SKIP.has(file))
    .sort()
    .map((file) => path.join(dir, file));
}

function checkAll(root = process.cwd()) {
  const results = publicPlaybooks(root).map((file) => validatePlaybook(file, root));
  const problems = results.flatMap((row) => row.problems);
  return { ok: problems.length === 0, results, problems };
}

module.exports = {
  REQUIRED_FIELDS,
  ALLOWED_RUNNERS,
  LOCAL_ISSUE_DB,
  extractFrontmatter,
  parseYamlSubset,
  validateMapping,
  validatePlaybook,
  publicPlaybooks,
  checkAll,
};
