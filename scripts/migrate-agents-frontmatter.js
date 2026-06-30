#!/usr/bin/env node
// migrate-agents-frontmatter.js (RP-15): one-shot frontmatter dialect migration
// for every ai/**/AGENTS.md, normalizing 40+ historical dialects onto the
// canonical 11-key schema of [[curaos-agents-md-schema-rule]]:
//   name, description, tags, language, framework, infrastructure, tooling,
//   apis, events, deployment_profiles, docs
//
// Behavior:
//   - Existing canonical keys keep their value blocks byte-for-byte.
//   - Alias keys fold in: module -> name, frameworks -> framework,
//     events_produced/events_consumed -> events.produces/consumes.
//   - Missing keys are backfilled deterministically:
//       tags                 derived from the module's mirror path
//       language/framework   class defaults (TypeScript / NestJS 11 for
//                            backend services; none elsewhere)
//       infrastructure       token scan over the module's own Requirements.md
//                            + CONTEXT.md (no fabrication; "none" when absent)
//       apis                 /api/v1/... path prefixes from own Requirements.md
//       events               same-line "produces/consumes `topic`" scrape over
//                            own Requirements.md + CONTEXT.md; ambiguous lines
//                            and lines attributed to other services are skipped
//       deployment_profiles  [dev] for tools/scripts, else all four profiles
//       docs                 adr index + sibling CONTEXT.md / Requirements.md
//                            when those files exist
//   - All non-canonical extra keys are preserved verbatim AFTER the canonical
//     block (spec-valid superset; unknown keys ignored by AAIF readers).
//   - status value "m7-s3-complete" normalizes to "active" (plan-phase naming
//     is banned; the milestone marker said the module is built).
//   - Idempotent: a second run is a no-op.
//
// Usage: node scripts/migrate-agents-frontmatter.js [--dry-run] [files...]

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const ignoreParts = new Set([".git", "node_modules", "dist", "build", ".turbo", ".scratch"]);

const CANONICAL_KEYS = [
  "name",
  "description",
  "tags",
  "language",
  "framework",
  "infrastructure",
  "tooling",
  "apis",
  "events",
  "deployment_profiles",
  "docs",
];

const ALIAS_TO_CANONICAL = { module: "name", frameworks: "framework" };
const STATUS_NORMALIZE = { "m7-s3-complete": "active" };

const INFRA_TOKENS = [
  [/postgres|cnpg|citus/i, "PostgreSQL (CNPG)"],
  [/valkey|redis/i, "Valkey"],
  [/redpanda|kafka/i, "Redpanda (Kafka API)"],
  [/temporal/i, "Temporal"],
  [/seaweedfs/i, "SeaweedFS S3"],
  [/kubernetes|\bk8s\b|\bk3s\b/i, "K8s"],
];

function rel(file) {
  return path.relative(root, file).replaceAll(path.sep, "/");
}

function listAgentsFiles() {
  const found = [];
  const aiRoot = path.join(root, "ai");
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (ignoreParts.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name === "AGENTS.md") found.push(full);
    }
  };
  walk(aiRoot);
  return found.sort();
}

// Splits frontmatter into ordered { key, lines } blocks; continuation lines
// (indented or list items) attach to the preceding key.
function parseBlocks(fmLines) {
  const blocks = [];
  let current = null;
  for (const line of fmLines) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_-]*)\s*:(.*)$/);
    if (match) {
      current = { key: match[1], inline: match[2].trim(), lines: [line] };
      blocks.push(current);
    } else if (current) {
      current.lines.push(line);
    } else {
      blocks.push({ key: null, inline: "", lines: [line] });
    }
  }
  return blocks;
}

// Reads a block's value as a flat list (inline [a, b] or "- item" lines).
function blockToList(block) {
  if (!block) return [];
  const items = [];
  const inline = block.inline.match(/^\[(.*)\]$/);
  if (inline) {
    for (const piece of inline[1].split(",")) {
      const item = piece.trim().replace(/^["']|["']$/g, "");
      if (item) items.push(item);
    }
    return items;
  }
  for (const line of block.lines.slice(1)) {
    const m = line.match(/^\s*-\s*(.+?)\s*$/);
    if (m) items.push(m[1].replace(/^["']|["']$/g, ""));
  }
  return items;
}

function classify(relPath) {
  // relPath like ai/curaos/backend/services/foo-service/AGENTS.md
  const parts = relPath.split("/");
  const dirParts = parts.slice(0, -1);
  const moduleDir = dirParts[dirParts.length - 1];
  const sub = dirParts.slice(2); // strip ai/curaos (or ai/<repo>)
  const area = sub.length > 1 ? `${sub[0]}/${sub[1]}` : sub[0] || "root";
  let kind = "index";
  if (sub.length >= 3 && sub[0] === "backend" && sub[1] === "services") kind = "backend-service";
  else if (sub.length >= 3 && sub[0] === "backend" && sub[1] === "packages") kind = "backend-package";
  else if (sub.length >= 3 && sub[0] === "frontend" && sub[1] === "apps") kind = "frontend-app";
  else if (sub.length >= 3 && sub[0] === "frontend" && sub[1] === "packages") kind = "frontend-package";
  else if (sub.length >= 2 && sub[0] === "tools") kind = "tool";
  else if (sub.length >= 1 && sub[0] === "scripts") kind = "scripts";
  else if (sub.length >= 2 && sub[0] === "ops") kind = "ops";
  else if (sub.length === 1 && /^curaos-/.test(sub[0])) kind = "sibling-repo";
  return { kind, moduleDir, area, dir: path.join(root, dirParts.join("/")) };
}

function layerTag(name) {
  if (name.startsWith("personal-")) return "personal";
  if (name.startsWith("business-")) return "business";
  if (name.startsWith("healthstack-")) return "healthstack";
  if (name.startsWith("education-")) return "education";
  if (name.endsWith("-core-service")) return "core";
  return "neutral";
}

function deriveTags(cls) {
  const { kind, moduleDir } = cls;
  if (kind === "backend-service") return ["service", layerTag(moduleDir)];
  if (kind === "backend-package") {
    const tags = ["package"];
    if (moduleDir.endsWith("-sdk")) tags.push("sdk");
    if (moduleDir.startsWith("healthstack-")) tags.push("healthstack");
    return tags;
  }
  if (kind === "frontend-app") return ["frontend", "app", layerTag(moduleDir)];
  if (kind === "frontend-package") return ["frontend", "package"];
  if (kind === "tool") return ["tooling", moduleDir];
  if (kind === "scripts") return ["tooling", "scripts"];
  if (kind === "ops") return ["ops", moduleDir];
  if (kind === "sibling-repo") return ["repo", moduleDir];
  return ["index", moduleDir];
}

function readDocIfExists(file) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

function moduleDocsText(cls) {
  return (
    readDocIfExists(path.join(cls.dir, "Requirements.md")) +
    "\n" +
    readDocIfExists(path.join(cls.dir, "CONTEXT.md"))
  );
}

function scrapeApis(cls) {
  const text = readDocIfExists(path.join(cls.dir, "Requirements.md"));
  const seen = new Set();
  for (const match of text.matchAll(/\/api\/v\d+\/[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)?/g)) {
    seen.add(match[0].replace(/\/$/, ""));
    if (seen.size >= 6) break;
  }
  return [...seen].sort().map((p) => `REST ${p}`);
}

// Same-line directional scrape: "... produces `curaos.x.y.v1` ..." on a line
// not attributed to a different service (bold lead like "- **other-service:**").
function scrapeEvents(cls) {
  const text = moduleDocsText(cls);
  const produces = new Set();
  const consumes = new Set();
  for (const line of text.split("\n")) {
    const lead = line.match(/^\s*[-*]?\s*\*\*([a-z0-9@/._-]+)[^*]*\*\*/i);
    if (lead && lead[1].includes("service") && !lead[1].includes(cls.moduleDir)) continue;
    const topics = [...line.matchAll(/`(curaos\.[a-z0-9_.-]+)`/g)].map((m) => m[1]);
    if (topics.length === 0) continue;
    const hasProduce = /produc|publish|emit/i.test(line);
    const hasConsume = /consum|subscrib/i.test(line);
    if (hasProduce === hasConsume) continue; // ambiguous or undirected line
    const target = hasProduce ? produces : consumes;
    for (const topic of topics) if (target.size < 12) target.add(topic);
  }
  return { produces: [...produces].sort(), consumes: [...consumes].sort() };
}

function scrapeInfrastructure(cls) {
  const text = moduleDocsText(cls);
  const hits = [];
  for (const [pattern, label] of INFRA_TOKENS) {
    if (pattern.test(text)) hits.push(label);
  }
  return hits.length > 0 ? hits.join(", ") : "none";
}

function firstBlockquote(bodyLines) {
  for (const line of bodyLines) {
    const m = line.match(/^>\s*(.+)$/);
    if (m) {
      return m[1]
        .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
        .replace(/[*`]/g, "")
        .replace(/[:;,\s]+$/, "")
        .trim();
    }
  }
  return "";
}

function yamlList(items) {
  if (items.length === 0) return "[]";
  return `[${items.join(", ")}]`;
}

function generateBlock(key, ctx) {
  const { cls, bodyLines, byKey } = ctx;
  switch (key) {
    case "name":
      return [`name: ${cls.moduleDir === "curaos" ? "curaos" : cls.moduleDir}`];
    case "description": {
      const quote = firstBlockquote(bodyLines);
      const text = quote || `${cls.moduleDir} module; see Requirements.md`;
      return [`description: "${text.replaceAll('"', "'")}"`];
    }
    case "tags":
      return [`tags: ${yamlList(deriveTags(cls))}`];
    case "language":
      return ["language: TypeScript"];
    case "framework":
      return [`framework: ${cls.kind === "backend-service" ? "NestJS 11" : "none"}`];
    case "infrastructure":
      return [`infrastructure: ${scrapeInfrastructure(cls)}`];
    case "tooling":
      return ["tooling: Bun"];
    case "apis": {
      const apis = cls.kind === "backend-service" ? scrapeApis(cls) : [];
      if (apis.length === 0) return ["apis: []"];
      return ["apis:", ...apis.map((a) => `  - ${a}`)];
    }
    case "events": {
      const produced = blockToList(byKey.get("events_produced"));
      const consumed = blockToList(byKey.get("events_consumed"));
      let produces = produced;
      let consumes = consumed;
      if (produced.length === 0 && consumed.length === 0 && cls.kind === "backend-service") {
        const scraped = scrapeEvents(cls);
        produces = scraped.produces;
        consumes = scraped.consumes;
      }
      return [
        "events:",
        `  produces: ${yamlList(produces)}`,
        `  consumes: ${yamlList(consumes)}`,
      ];
    }
    case "deployment_profiles": {
      const dev = cls.kind === "tool" || cls.kind === "scripts";
      return [`deployment_profiles: ${dev ? "[dev]" : "[cloud, on-prem, hybrid, air-gap]"}`];
    }
    case "docs": {
      const lines = ["docs:", "  adr: ai/curaos/docs/adr/"];
      const base = rel(cls.dir);
      if (fs.existsSync(path.join(cls.dir, "CONTEXT.md"))) lines.push(`  context: ${base}/CONTEXT.md`);
      if (fs.existsSync(path.join(cls.dir, "Requirements.md")))
        lines.push(`  requirements: ${base}/Requirements.md`);
      return lines;
    }
    default:
      throw new Error(`no generator for key ${key}`);
  }
}

function migrateFile(file, dryRun) {
  const relPath = rel(file);
  const text = fs.readFileSync(file, "utf8");
  const lines = text.split("\n");
  if (lines[0] !== "---") {
    console.error(`SKIP ${relPath}: no frontmatter block`);
    return false;
  }
  const closeIdx = lines.indexOf("---", 1);
  if (closeIdx === -1) {
    console.error(`SKIP ${relPath}: unterminated frontmatter`);
    return false;
  }
  const fmLines = lines.slice(1, closeIdx);
  const bodyLines = lines.slice(closeIdx + 1);
  const blocks = parseBlocks(fmLines);
  const byKey = new Map();
  for (const block of blocks) {
    if (block.key && !byKey.has(block.key)) byKey.set(block.key, block);
  }

  // Resolve a canonical block: own key, then alias fold-in.
  const consumed = new Set(["events_produced", "events_consumed"]);
  const resolveExisting = (key) => {
    if (byKey.has(key)) return byKey.get(key);
    for (const [alias, target] of Object.entries(ALIAS_TO_CANONICAL)) {
      if (target === key && byKey.has(alias)) {
        consumed.add(alias);
        const block = byKey.get(alias);
        const value = block.inline.replace(/^["']|["']$/g, "");
        return { key, inline: value, lines: [`${key}: ${value}`, ...block.lines.slice(1)] };
      }
    }
    return null;
  };

  const cls = classify(relPath);
  const ctx = { cls, bodyLines, byKey };
  const out = [];
  for (const key of CANONICAL_KEYS) {
    const existing = resolveExisting(key);
    if (existing) {
      out.push(...existing.lines);
      consumed.add(byKey.has(key) ? key : null);
    } else {
      out.push(...generateBlock(key, ctx));
    }
  }
  // events_produced/events_consumed fold into events even when events exists.
  if ((byKey.has("events_produced") || byKey.has("events_consumed")) && byKey.has("events")) {
    consumed.add("events_produced");
    consumed.add("events_consumed");
  }

  // Preserve every other key verbatim, in original order.
  const canonicalSet = new Set(CANONICAL_KEYS);
  for (const block of blocks) {
    if (!block.key) continue; // drop stray comment-only lines inside frontmatter
    if (canonicalSet.has(block.key) || consumed.has(block.key)) continue;
    if (Object.keys(ALIAS_TO_CANONICAL).includes(block.key) && consumed.has(block.key)) continue;
    let blockLines = block.lines;
    if (block.key === "status") {
      const value = block.inline.replace(/^["']|["']$/g, "");
      if (STATUS_NORMALIZE[value]) blockLines = [`status: ${STATUS_NORMALIZE[value]}`];
    }
    out.push(...blockLines);
  }

  const next = ["---", ...out, "---", ...bodyLines].join("\n");
  if (next === text) return false;
  if (!dryRun) fs.writeFileSync(file, next);
  console.log(`${dryRun ? "WOULD MIGRATE" : "MIGRATED"} ${relPath}`);
  return true;
}

function main() {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes("--dry-run");
  const fileArgs = argv.filter((a) => a !== "--dry-run");
  const files = fileArgs.length > 0 ? fileArgs.map((f) => path.resolve(root, f)) : listAgentsFiles();
  let changed = 0;
  for (const file of files) {
    if (migrateFile(file, dryRun)) changed++;
  }
  console.log(`migrate-agents-frontmatter: ${changed} file(s) ${dryRun ? "would change" : "changed"} of ${files.length}`);
}

main();
