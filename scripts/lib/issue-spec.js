// Deterministic issue body -> worker scope extraction for context-load.
// Keep this library free of GitHub calls so tests can cover real issue bodies.

const MODULE_ROOT_OVERRIDES = {
  ops: ["curaos/ops"],
  "healthstack-phi-boundary": [
    "curaos/backend/packages/healthstack-phi-boundary",
    "ai/curaos/backend/packages/healthstack-phi-boundary",
  ],
};

const SPEC_ARRAY_FIELDS = ["owned_paths", "closeout_paths", "forbidden_paths", "acceptance", "verification_cmds", "adr_refs"];

// RP-21: the issue-body frontmatter parser's canonical owner is workflow-common.js; this module
// re-exports parseFrontmatter so existing consumers keep their import surface.
const { parseFrontmatter } = require("./workflow-common.js");

function normalizeHeading(value) {
  return String(value || "")
    .replace(/\[[^\]]+\]\([^)]+\)/g, (m) => m.replace(/^\[|\]\([^)]+\)$/g, ""))
    .replace(/[*_`#]/g, "")
    .trim()
    .replace(/[:：]+$/, "")
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function markdownSections(markdown) {
  const sections = {};
  let current = "";
  for (const raw of String(markdown || "").split(/\r?\n/)) {
    const heading = raw.match(/^#{2,6}\s+(.+?)\s*#*\s*$/);
    if (heading) {
      current = normalizeHeading(heading[1]);
      if (!sections[current]) sections[current] = [];
      continue;
    }
    if (current) sections[current].push(raw);
  }
  return sections;
}

function collectSections(sections, aliases) {
  const out = [];
  for (const [heading, lines] of Object.entries(sections || {})) {
    if (aliases.some((alias) => heading === alias || heading.startsWith(`${alias} `))) {
      out.push(lines.join("\n"));
    }
  }
  return out.join("\n");
}

function cleanListLine(line) {
  return String(line || "")
    .trim()
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+/, "")
    .replace(/^\[[ xX]\]\s+/, "")
    .trim();
}

function listItems(markdown) {
  const items = [];
  for (const raw of String(markdown || "").split(/\r?\n/)) {
    const line = cleanListLine(raw);
    if (!line || line === "```" || line.startsWith("```")) continue;
    if (/^#{1,6}\s/.test(line)) continue;
    items.push(line);
  }
  return unique(items);
}

function looksLikeCommand(value) {
  return /^(?:bun|node|bash|sh|just|make|mise|npm|pnpm|yarn|npx|tsx|turbo|gh|git|gitleaks|semgrep|coderabbit|agent-workflow-kit|cd)\b|^\./.test(String(value || "").trim());
}

function verificationItems(markdown) {
  const out = [];
  for (const item of listItems(markdown)) {
    const backticked = [...String(item).matchAll(/`([^`\n]+)`/g)].map((match) => match[1].trim()).filter(looksLikeCommand);
    if (backticked.length) {
      out.push(...backticked);
      continue;
    }
    const line = item.replace(/^\$\s*/, "").trim();
    if (looksLikeCommand(line)) out.push(line);
  }
  return unique(out);
}

function normalizePathCandidate(value) {
  let p = String(value || "").trim();
  p = p.replace(/^['"`]+|['"`]+$/g, "");
  p = p.replace(/^[({[]+/, "");
  p = p.replace(/[),.;:]+$/, "");
  p = p.replace(/^\.\//, "");
  if (!p || /\s/.test(p)) return "";
  if (/^service-(?:core|personal|business)\//.test(p)) return `curaos/tools/codegen/templates/${p}`;
  return p;
}

function isRepoPath(value) {
  return /^(?:curaos|ai|docs|scripts)\//.test(value)
    || /^(?:AGENTS|CLAUDE|README|CHANGELOG)\.md$/.test(value);
}

function extractPaths(text) {
  const candidates = [];
  const src = String(text || "");
  for (const match of src.matchAll(/`([^`\n]+)`/g)) candidates.push(match[1]);
  for (const match of src.matchAll(/\b(?:curaos|ai|docs|scripts)\/[A-Za-z0-9._~/*{}[\]@+-]+/g)) {
    candidates.push(match[0]);
  }
  for (const match of src.matchAll(/\bservice-(?:core|personal|business)\/[A-Za-z0-9._~/*{}[\]@+-]+/g)) {
    candidates.push(match[0]);
  }
  for (const match of src.matchAll(/\b(?:AGENTS|CLAUDE|README|CHANGELOG)\.md\b/g)) candidates.push(match[0]);
  return unique(candidates.map(normalizePathCandidate).filter((p) => p && isRepoPath(p)));
}

function extractAdrRefs(text) {
  const refs = [];
  const src = String(text || "");
  for (const match of src.matchAll(/\b(?:ADR|RFC)-\d{3,4}(?:\s*§\s*[A-Za-z0-9_.-]+)?/g)) {
    refs.push(match[0].replace(/\s+/g, " ").replace(/[.;:,]+$/, ""));
  }
  for (const match of src.matchAll(/\bai\/curaos\/docs\/(?:adr|rfcs|research)\/[A-Za-z0-9._~/*{}[\]@+-]+/g)) {
    refs.push(normalizePathCandidate(match[0]));
  }
  return unique(refs);
}

function moduleDefaultPaths(frontmatter, title, body) {
  const moduleName = String(frontmatter?.module || "").trim();
  if (!moduleName) return [];
  if (MODULE_ROOT_OVERRIDES[moduleName]) return MODULE_ROOT_OVERRIDES[moduleName];
  if (moduleName.endsWith("-core-service") || moduleName.endsWith("-service")) {
    return [`curaos/backend/services/${moduleName}`];
  }
  if (moduleName.endsWith("-sdk") || moduleName === "contracts" || moduleName.endsWith("-contracts")) {
    return [`curaos/backend/packages/${moduleName}`];
  }
  const haystack = `${title || ""}\n${body || ""}`;
  if (/\bfrontend\b|\bReact\b|\bapp\b/i.test(haystack)) return [`curaos/frontend/packages/${moduleName}`];
  return [];
}

function targetPathDefaults(targetPaths) {
  return extractPaths(String(targetPaths || "").replace(/,/g, "\n"));
}

function baseSpec(frontmatter) {
  const spec = {
    owned_paths: [],
    closeout_paths: [],
    forbidden_paths: [],
    acceptance: [],
    verification_cmds: [],
    adr_refs: [],
  };
  for (const key of ["effort", "module", "milestone", "priority", "type", "parent"]) {
    if (frontmatter && frontmatter[key] !== undefined && frontmatter[key] !== "") spec[key] = frontmatter[key];
  }
  return spec;
}

function issueSpecFromIssueText(input = {}) {
  const title = input.title || "";
  const body = input.body || "";
  const comments = Array.isArray(input.comments) ? input.comments.filter(Boolean) : [];
  const frontmatter = parseFrontmatter(body);
  const bodySections = markdownSections(body);
  const commentSections = markdownSections(comments.join("\n\n"));
  const scopeText = [
    collectSections(bodySections, ["scope", "owned paths", "owned-paths", "worker scope"]),
    collectSections(commentSections, ["worker brief", "scope", "owned paths", "owned-paths"]),
  ].filter(Boolean).join("\n");
  const forbiddenText = collectSections(bodySections, ["do not touch", "forbidden paths", "out of scope"]);
  const acceptanceText = collectSections(bodySections, ["acceptance", "acceptance criteria", "done"]);
  const closeoutText = [
    collectSections(bodySections, ["closeout paths", "closeout-paths", "closeout artifacts", "related paths"]),
    collectSections(commentSections, ["closeout paths", "closeout-paths", "closeout artifacts", "related paths"]),
    acceptanceText,
  ].filter(Boolean).join("\n");
  const verificationText = collectSections(bodySections, ["verification", "test plan", "tests"]);
  const fullText = [title, body, ...comments].filter(Boolean).join("\n\n");

  const spec = baseSpec(frontmatter);
  spec.owned_paths = extractPaths(scopeText);
  if (!spec.owned_paths.length) spec.owned_paths = moduleDefaultPaths(frontmatter, title, body);
  if (!spec.owned_paths.length) spec.owned_paths = targetPathDefaults(input.target_paths);
  spec.forbidden_paths = extractPaths(forbiddenText);
  spec.acceptance = listItems(acceptanceText);
  spec.verification_cmds = verificationItems(verificationText);
  spec.closeout_paths = extractPaths(closeoutText);
  spec.adr_refs = extractAdrRefs(fullText);
  return spec;
}

function unique(values) {
  const out = [];
  const seen = new Set();
  for (const value of values || []) {
    const v = typeof value === "string" ? value.trim() : value;
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

function mergeIssueSpec(deterministic, model) {
  const out = { ...(model && typeof model === "object" && !Array.isArray(model) ? model : {}) };
  const det = deterministic && typeof deterministic === "object" && !Array.isArray(deterministic) ? deterministic : {};
  for (const field of SPEC_ARRAY_FIELDS) {
    out[field] = unique([...(Array.isArray(det[field]) ? det[field] : []), ...(Array.isArray(out[field]) ? out[field] : [])]);
  }
  for (const [key, value] of Object.entries(det)) {
    if (SPEC_ARRAY_FIELDS.includes(key)) continue;
    if (value !== undefined && value !== null && value !== "") out[key] = value;
  }
  return out;
}

function generatedCodeFromSpec(spec, text) {
  const paths = Array.isArray(spec?.owned_paths) ? spec.owned_paths.join(" ") : "";
  const haystack = `${paths}\n${text || ""}`;
  return /curaos\/tools\/codegen|curaos\/backend\/services\/|curaos\/frontend\/(?:apps|packages)\/|curaos\/backend\/packages\/.*(?:contracts|sdk|phi-boundary)|\b(?:NestJS service|frontend app|contract package|BPM workflow|SDK|codegen template)\b/i.test(haystack);
}

function issueSpecSummary(issue, title, spec) {
  const owned = Array.isArray(spec?.owned_paths) && spec.owned_paths.length ? spec.owned_paths.join(", ") : "(none resolved)";
  const closeoutCount = Array.isArray(spec?.closeout_paths) ? spec.closeout_paths.length : 0;
  const acceptanceCount = Array.isArray(spec?.acceptance) ? spec.acceptance.length : 0;
  const verificationCount = Array.isArray(spec?.verification_cmds) ? spec.verification_cmds.length : 0;
  const adrCount = Array.isArray(spec?.adr_refs) ? spec.adr_refs.length : 0;
  return `Issue ${issue}${title ? ` (${title})` : ""}: deterministic REST issue-spec prefetch resolved owned_paths=${owned}; closeout_paths=${closeoutCount}; acceptance=${acceptanceCount}; verification_cmds=${verificationCount}; adr_refs=${adrCount}. Worker must keep implementation inside owned_paths, use closeout_paths only for gate-required artifacts, and satisfy the captured acceptance.`;
}

module.exports = {
  parseFrontmatter,
  markdownSections,
  extractPaths,
  extractAdrRefs,
  issueSpecFromIssueText,
  mergeIssueSpec,
  generatedCodeFromSpec,
  issueSpecSummary,
};
