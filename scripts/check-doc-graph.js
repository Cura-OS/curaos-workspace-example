#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const root = process.env.DOC_GRAPH_ROOT ? path.resolve(process.env.DOC_GRAPH_ROOT) : path.resolve(__dirname, "..");
const graphPath = path.join(root, "ai/curaos/docs/DOC-GRAPH.md");
const write = process.argv.includes("--write");

const ignoreParts = new Set([".git", "node_modules", "dist", "build", ".turbo"]);

function rel(file) {
  return path.relative(root, file).replaceAll(path.sep, "/");
}

function exists(file) {
  return fs.existsSync(path.join(root, file));
}

function readSubmodulePaths() {
  const gitmodulesPath = path.join(root, ".gitmodules");
  if (!fs.existsSync(gitmodulesPath)) return [];

  const paths = [];
  for (const rawLine of fs.readFileSync(gitmodulesPath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.startsWith("[submodule ")) continue;
    const match = line.match(/^path\s*=\s*(.+)$/);
    if (match) paths.push(match[1].trim());
  }
  return paths;
}

function readSubmoduleStatus(submodulePath) {
  try {
    const output = execFileSync("git", ["submodule", "status", "--", submodulePath], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return output ? output[0] : null;
  } catch {
    return null;
  }
}

function getUnpopulatedSubmoduleIssues() {
  return readSubmodulePaths()
    .map((submodulePath) => {
      const absPath = path.join(root, submodulePath);
      const gitMarkerPath = path.join(absPath, ".git");
      const dirExists = fs.existsSync(absPath);
      const dirEntries = dirExists ? fs.readdirSync(absPath) : [];
      const statusPrefix = readSubmoduleStatus(submodulePath);
      const isUnpopulated =
        !dirExists ||
        dirEntries.length === 0 ||
        !fs.existsSync(gitMarkerPath) ||
        statusPrefix === "-";

      if (!isUnpopulated) return null;

      return {
        submodulePath,
        reasons: [
          !dirExists ? "path missing" : null,
          dirExists && dirEntries.length === 0 ? "directory empty" : null,
          dirExists && !fs.existsSync(gitMarkerPath) ? "missing .git marker" : null,
          statusPrefix === "-" ? "git submodule status reports uninitialized" : null,
        ].filter(Boolean),
      };
    })
    .filter(Boolean);
}

function stripLineSuffixIfFileExists(target) {
  const withoutLine = target.replace(/:\d+(?::\d+)?$/, "");
  if (withoutLine !== target && fs.existsSync(path.join(root, withoutLine))) return withoutLine;
  return target;
}

function normalizeWorkspaceHref(href) {
  const normalized = href.replaceAll("\\", "/");
  const marker = "/curaos-workspace/";
  const markerIndex = normalized.indexOf(marker);
  if (!path.isAbsolute(normalized) || markerIndex === -1) return { href: normalized, relativeToRoot: false };

  return {
    href: normalized.slice(markerIndex + marker.length),
    relativeToRoot: true,
  };
}

function listMarkdown() {
  let files;
  try {
    files = execFileSync("rg", ["--files", "-g", "*.md"], { cwd: root, encoding: "utf8" })
      .trim()
      .split("\n")
      .filter(Boolean);
  } catch (error) {
    files = [];
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        const relative = rel(full);
        if (relative.split("/").some((part) => ignoreParts.has(part))) continue;
        if (entry.isDirectory()) {
          walk(full);
          continue;
        }
        if (entry.isFile() && entry.name.endsWith(".md")) files.push(relative);
      }
    };
    walk(root);
  }

  return files
    .filter((file) => !file.split("/").some((part) => ignoreParts.has(part)))
    .filter((file) => file !== "ai/curaos/docs/DOC-GRAPH.md")
    .sort();
}

function stripCodeBlocks(text) {
  const out = [];
  let code = false;
  for (const line of text.split(/\r?\n/)) {
    if (line.trim().startsWith("```")) {
      code = !code;
      continue;
    }
    if (!code) out.push(line);
  }
  return out.join("\n");
}

function titleFor(file, text) {
  const heading = text.match(/^#\s+(.+)$/m);
  return (heading ? heading[1] : path.basename(file))
    .replace(/\s+/g, " ")
    // Legacy doc titles may carry em/en dashes; the generated DOC-GRAPH must
    // satisfy the no-dash gate (curaos_no_em_dash_rule), so sanitize on emit.
    .replace(/[\u2014\u2013]/g, "-")
    .trim();
}

function typeFor(file) {
  if (file === "AGENTS.md" || file.endsWith("/AGENTS.md")) return "agent-contract";
  if (file.endsWith("/CONTEXT.md")) return "context-map";
  if (file.endsWith("/Requirements.md") || file.endsWith("/Requirements-raw.md")) return "requirements";
  if (file.includes("/docs/adr/")) return "adr";
  if (file.includes("/rules/")) return "rule";
  if (file.includes("/research/") || file.includes("/docs/research/") || file.includes("archived")) return "research";
  if (file.includes("/docs/workflows/")) return "workflow";
  if (file.includes("/docs/specs/")) return "spec";
  if (file.includes("/docs/ops/")) return "ops";
  return "doc";
}

function isHistorical(file) {
  return /(^|\/)(research|archive|archived)(\/|$)|archived-|docs\/research\//.test(file);
}

function lintStaleStack(file, text, warnings) {
  if (isHistorical(file)) return;
  const stale = /^runtime: node$|package_manager: pnpm|pnpm-workspace\.yaml|Package manager\s*\|\s*pnpm|Prisma ORM|Prisma schema|Prisma middleware|data\.prisma|TenantPrismaFactory|prismaPool|src\/prisma|schema\.prisma|prisma migrate|no-raw-prisma-client|PrismaClient|Nx vs Turborepo/i;
  const resolvedMention = /RESOLVED|internal-only|Bun primary|fallback only when Bun cannot/i;
  const lines = stripCodeBlocks(text).split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!stale.test(line)) continue;
    if (resolvedMention.test(line)) continue;
    warnings.push(`stale stack term: ${file}:${index + 1}: ${line.trim()}`);
  }
}

function lintRuleDuplication(file, text, warnings) {
  if (file.startsWith("ai/rules/")) return;
  const lines = stripCodeBlocks(text).split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (/^Canonical rule:|^## The Rule$|^## Required Behavior$/.test(line)) {
      warnings.push(`copied rule text outside ai/rules: ${file}:${index + 1}: ${line}`);
    }
  }
}

function addEdge(edges, from, type, to, note = "") {
  if (!from || !to || from === to) return;
  edges.add(JSON.stringify({ from, type, to, note }));
}

function graphRootFor(files) {
  if (process.env.DOC_GRAPH_ROOT_NODE) return process.env.DOC_GRAPH_ROOT_NODE;
  if (files.has("AGENTS.md")) return "AGENTS.md";
  if (files.has("README.md")) return "README.md";
  return "";
}

function graphRootEdgeTypes(rootNode) {
  return rootNode.endsWith("AGENTS.md")
    ? { outbound: "governs", inbound: "governed_by" }
    : { outbound: "introduces", inbound: "introduced_by" };
}

function parseLinks(file, text, files, edges, warnings) {
  const body = stripCodeBlocks(text);
  for (const match of body.matchAll(/\[[^\]]+\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    const raw = match[1];
    const href = raw.split("#")[0].replace(/^<|>$/g, "");
    if (!href || href.startsWith("#") || /^(https?:|mailto:)/.test(href) || href.includes("<repo>")) continue;
    const normalizedHref = normalizeWorkspaceHref(href);
    const absoluteTarget = normalizedHref.relativeToRoot
      ? path.join(root, normalizedHref.href)
      : path.resolve(root, path.dirname(file), normalizedHref.href);
    const target = stripLineSuffixIfFileExists(rel(absoluteTarget));
    if (files.has(target)) addEdge(edges, file, "references", target);
    else if (fs.existsSync(path.join(root, target))) addEdge(edges, file, "references_directory", target);
    else warnings.push(`broken link: ${file} -> ${normalizedHref.href}`);
  }
  for (const match of body.matchAll(/\[\[([^\]]+)\]\]/g)) {
    const key = match[1].trim();
    const normalized = key.replace(/^curaos-/, "curaos_").replaceAll("-", "_");
    const candidates = [
      `ai/rules/${normalized}.md`,
      `ai/rules/${normalized}_rule.md`,
      `ai/curaos/docs/adr/${key}.md`,
    ];
    const target = candidates.find((candidate) => files.has(candidate));
    if (target) addEdge(edges, file, "wikilink", target, key);
  }
}

function inferEdges(file, files, edges) {
  const dir = path.dirname(file);
  const type = typeFor(file);
  const siblingAgents = `${dir}/AGENTS.md`;
  const siblingContext = `${dir}/CONTEXT.md`;
  const siblingReqs = `${dir}/Requirements.md`;
  const dirReadme = `${dir}/README.md`;
  const rootNode = graphRootFor(files);

  if (rootNode && file !== rootNode && files.has(rootNode)) {
    const edgeTypes = graphRootEdgeTypes(rootNode);
    addEdge(edges, rootNode, edgeTypes.outbound, file);
    addEdge(edges, file, edgeTypes.inbound, rootNode);
  }
  if (file.startsWith("ai/curaos/") && files.has("ai/curaos/AGENTS.md") && file !== "ai/curaos/AGENTS.md") {
    addEdge(edges, file, "repo_contract", "ai/curaos/AGENTS.md");
  }
  if (file.startsWith("ai/rules/") && file !== "ai/rules/README.md" && files.has("ai/rules/README.md")) {
    addEdge(edges, "ai/rules/README.md", "indexes_rule", file);
    addEdge(edges, file, "indexed_by", "ai/rules/README.md");
  }
  if (file.includes("/docs/adr/") && file !== "ai/curaos/docs/adr/RESOLUTION-MAP.md" && files.has("ai/curaos/docs/adr/RESOLUTION-MAP.md")) {
    addEdge(edges, "ai/curaos/docs/adr/RESOLUTION-MAP.md", "indexes_adr", file);
    addEdge(edges, file, "status_in", "ai/curaos/docs/adr/RESOLUTION-MAP.md");
  }
  if (files.has(siblingAgents) && file !== siblingAgents) addEdge(edges, file, "module_contract", siblingAgents);
  if (files.has(siblingContext) && file !== siblingContext) addEdge(edges, file, "contextualized_by", siblingContext);
  if (files.has(siblingReqs) && file !== siblingReqs) addEdge(edges, file, "specified_by", siblingReqs);
  if (files.has(dirReadme) && file !== dirReadme) addEdge(edges, file, "introduced_by", dirReadme);

  if (type === "agent-contract" && files.has(siblingContext)) addEdge(edges, file, "loads_context", siblingContext);
  if (type === "agent-contract" && files.has(siblingReqs)) addEdge(edges, file, "loads_requirements", siblingReqs);
  if (type === "context-map" && files.has(siblingReqs)) addEdge(edges, file, "explains_requirements", siblingReqs);
  if (type === "requirements" && files.has(siblingContext)) addEdge(edges, file, "implemented_context", siblingContext);
}

function validateGraph(files, edgeObjects, warnings) {
  const outbound = new Map();
  for (const edge of edgeObjects) {
    if (!outbound.has(edge.from)) outbound.set(edge.from, []);
    outbound.get(edge.from).push(edge.to);
  }

  const rootNode = graphRootFor(new Set(files));
  if (!rootNode) {
    warnings.push("missing graph root: AGENTS.md or README.md");
    return;
  }
  if (!files.includes(rootNode)) {
    warnings.push(`missing graph root: ${rootNode}`);
    return;
  }

  const reachable = new Set([rootNode]);
  const queue = [rootNode];
  while (queue.length) {
    const node = queue.shift();
    for (const next of outbound.get(node) || []) {
      if (reachable.has(next)) continue;
      reachable.add(next);
      queue.push(next);
    }
  }

  for (const file of files) {
    if (!reachable.has(file)) warnings.push(`unreachable from ${rootNode}: ${file}`);
  }
}

function render(files, metadata, edgeObjects, warnings) {
  const graphDir = path.dirname(graphPath);
  const linkTo = (file) => path.relative(graphDir, path.join(root, file)).replaceAll(path.sep, "/");
  const byType = {};
  for (const file of files) {
    const type = metadata[file].type;
    byType[type] ||= [];
    byType[type].push(file);
  }

  const inbound = new Map();
  const outbound = new Map();
  for (const edge of edgeObjects) {
    inbound.set(edge.to, (inbound.get(edge.to) || 0) + 1);
    outbound.set(edge.from, (outbound.get(edge.from) || 0) + 1);
  }
  const isolated = files.filter((file) => !inbound.get(file) && !outbound.get(file));

  const lines = [];
  lines.push("# CuraOS Document Graph");
  lines.push("");
  lines.push("Generated by `scripts/check-doc-graph.js --write`. Do not edit relationship tables by hand.");
  lines.push("");
  lines.push("## Method");
  lines.push("");
  lines.push("- Every Markdown file is a graph node.");
  lines.push("- Explicit Markdown links and wikilinks become `references` / `wikilink` edges.");
  lines.push("- Path conventions infer typed edges: `AGENTS.md` governs or `README.md` introduces a repo slice, `CONTEXT.md` contextualizes, `Requirements.md` specifies, `RESOLUTION-MAP.md` indexes ADR status, and `ai/rules/README.md` indexes rules.");
  lines.push("- Historical research stays in the graph but does not override rules or ADR status.");
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- Nodes: ${files.length}`);
  lines.push(`- Edges: ${edgeObjects.length}`);
  lines.push(`- Isolated nodes: ${isolated.length}`);
  lines.push(`- Broken links: ${warnings.length}`);
  lines.push("");
  lines.push("## Node Counts");
  lines.push("");
  lines.push("| Type | Count |");
  lines.push("|---|---:|");
  for (const type of Object.keys(byType).sort()) lines.push(`| ${type} | ${byType[type].length} |`);
  lines.push("");
  lines.push("## Mind Map");
  lines.push("");
  lines.push("```mermaid");
  lines.push("mindmap");
  lines.push("  root((CuraOS Docs))");
  for (const [type, group] of Object.entries(byType).sort(([a], [b]) => a.localeCompare(b))) {
    lines.push(`    ${type}`);
    for (const file of group.slice(0, 40)) lines.push(`      ${file}`);
    if (group.length > 40) lines.push(`      ... ${group.length - 40} more`);
  }
  lines.push("```");
  lines.push("");
  lines.push("## Nodes");
  lines.push("");
  lines.push("| File | Type | In | Out | Title |");
  lines.push("|---|---|---:|---:|---|");
  for (const file of files) {
    const meta = metadata[file];
    lines.push(`| [${file}](${linkTo(file)}) | ${meta.type} | ${inbound.get(file) || 0} | ${outbound.get(file) || 0} | ${meta.title.replaceAll("|", "\\|")} |`);
  }
  lines.push("");
  lines.push("## Edges");
  lines.push("");
  lines.push("| From | Relationship | To | Note |");
  lines.push("|---|---|---|---|");
  for (const edge of edgeObjects) {
    lines.push(`| [${edge.from}](${linkTo(edge.from)}) | ${edge.type} | [${edge.to}](${linkTo(edge.to)}) | ${(edge.note || "").replaceAll("|", "\\|")} |`);
  }
  if (warnings.length) {
    lines.push("");
    lines.push("## Broken Links");
    lines.push("");
    for (const warning of warnings) lines.push(`- ${warning}`);
  }
  return `${lines.join("\n")}\n`;
}

const markdownFiles = listMarkdown();
const unpopulatedSubmodules =
  process.env.DOC_GRAPH_SKIP_SUBMODULE_PREFLIGHT === "1" ? [] : getUnpopulatedSubmoduleIssues();

function formatUnpopulatedSubmoduleDetails(submodules) {
  return submodules
    .map(({ submodulePath, reasons }) => `${submodulePath} (${reasons.join(", ")})`)
    .join("; ");
}

if (unpopulatedSubmodules.length) {
  const action = write ? "write" : "check";
  const details = formatUnpopulatedSubmoduleDetails(unpopulatedSubmodules);
  console.error(
    `DOC-GRAPH ${action} blocked: unpopulated submodule(s) detected: ${details}. ` +
      "Populate submodules first with `git submodule update --init` " +
      `or run the ${action} from a populated shared checkout.`,
  );
  process.exit(1);
}

const fileSet = new Set(markdownFiles);
const metadata = {};
const edges = new Set();
const warnings = [];

for (const file of markdownFiles) {
  const text = fs.readFileSync(path.join(root, file), "utf8");
  metadata[file] = { title: titleFor(file, text), type: typeFor(file) };
  parseLinks(file, text, fileSet, edges, warnings);
  lintStaleStack(file, text, warnings);
  lintRuleDuplication(file, text, warnings);
  inferEdges(file, fileSet, edges);
}

const edgeObjects = [...edges].map((edge) => JSON.parse(edge)).sort((a, b) =>
  `${a.from}\0${a.type}\0${a.to}`.localeCompare(`${b.from}\0${b.type}\0${b.to}`),
);
validateGraph(markdownFiles, edgeObjects, warnings);
const output = render(markdownFiles, metadata, edgeObjects, warnings);

if (write) {
  fs.mkdirSync(path.dirname(graphPath), { recursive: true });
  fs.writeFileSync(graphPath, output);
  console.log(`wrote ${rel(graphPath)} (${markdownFiles.length} nodes, ${edgeObjects.length} edges)`);
  process.exit(warnings.length ? 1 : 0);
}

const existing = exists(rel(graphPath)) ? fs.readFileSync(graphPath, "utf8") : "";
if (existing !== output) {
  console.error("DOC-GRAPH.md is stale. Run: bun scripts/check-doc-graph.js --write");
  process.exit(1);
}
if (warnings.length) {
  console.error(warnings.join("\n"));
  process.exit(1);
}
console.log(`doc graph ok (${markdownFiles.length} nodes, ${edgeObjects.length} edges)`);
