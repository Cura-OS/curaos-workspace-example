#!/usr/bin/env node
// check-agents-schema.js (RP-14): AGENTS.md schema gate for ai/**/AGENTS.md.
//
// Validates, per [[curaos-agents-md-schema-rule]]:
//   1. frontmatter presence + the 11 canonical keys
//   2. required ASDLC sections (Mission / Toolchain Registry / Judgment Boundaries)
//   3. 150-line total cap per AGENTS.md
//   4. 50-line section cap (AGENTS.md sections AND each AGENTS-sections/*.md file)
//   5. AGENTS-sections orphan / missing-ref consistency with the sibling AGENTS.md
//   6. frontmatter status enum (stub/scaffold/active/migrating/deprecated/
//      superseded) + STUB banner presence for status: stub modules (RP-31)
//   7. command/dependency existence drift (RP-16): every `bun run <script>` in
//      AGENTS-sections/commands.md and every backticked package in a table row
//      of AGENTS-sections/dependencies.md must exist in the mirrored code
//      module's package.json (ai/<repo>/<path>/ -> <repo>/<path>/package.json).
//      Skipped when the submodule is not checked out. Lines covered by the
//      "planned, do not import" marker (on the line or its governing heading)
//      are exempt per [[curaos-agents-md-schema-rule]] intent-vs-state rules.
//
// Modes (warn-first, then ratchet to fail-closed):
//   --mode=warn (default)  report violations, always exit 0
//   --mode=fail            non-allowlisted violations exit 1
//   env CHECK_AGENTS_SCHEMA_MODE overrides the default; the flag wins over env.
//
// Legacy allowlist: scripts/check-agents-schema-allowlist.txt (repo-relative
// AGENTS.md paths, one per line, # comments). Allowlisted modules pass in BOTH
// modes; the ratchet is: flip mode to fail, then drain the allowlist (RP-15
// migration). Violations in AGENTS-sections/*.md are attributed to the owning
// module's AGENTS.md for allowlist purposes.
//
// Usage:
//   node scripts/check-agents-schema.js [--mode=warn|fail] [--allowlist=FILE]
//                                       [--update-allowlist] [files...]
//   With no file args, scans every ai/**/AGENTS.md under the repo root.

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

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

const REQUIRED_SECTIONS = ["Mission", "Toolchain Registry", "Judgment Boundaries"];

const STATUS_ENUM = ["stub", "scaffold", "active", "migrating", "deprecated", "superseded"];
const PLANNED_MARKER = /planned,\s*do not import/i;
const STUB_BANNER = /STUB:\s*no code yet/;

const FILE_LINE_CAP = 150;
const SECTION_LINE_CAP = 50;

const ignoreParts = new Set([".git", "node_modules", "dist", "build", ".turbo", ".scratch"]);

function rel(file) {
  return path.relative(root, file).replaceAll(path.sep, "/");
}

function parseArgs(argv) {
  const args = { mode: null, allowlist: null, updateAllowlist: false, files: [] };
  for (const arg of argv) {
    if (arg.startsWith("--mode=")) {
      args.mode = arg.slice("--mode=".length);
    } else if (arg.startsWith("--allowlist=")) {
      args.allowlist = arg.slice("--allowlist=".length);
    } else if (arg === "--update-allowlist") {
      args.updateAllowlist = true;
    } else if (arg.startsWith("--")) {
      console.error(`check-agents-schema: unknown flag ${arg}`);
      process.exit(2);
    } else {
      args.files.push(arg);
    }
  }
  args.mode = args.mode || process.env.CHECK_AGENTS_SCHEMA_MODE || "warn";
  if (args.mode !== "warn" && args.mode !== "fail") {
    console.error(`check-agents-schema: invalid mode "${args.mode}" (use warn or fail)`);
    process.exit(2);
  }
  return args;
}

function listAgentsFiles() {
  const found = [];
  const aiRoot = path.join(root, "ai");
  if (!fs.existsSync(aiRoot)) return found;
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      // Walk is rooted at ai/ so the curaos code submodule is never entered.
      if (ignoreParts.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && entry.name === "AGENTS.md") {
        found.push(full);
      }
    }
  };
  walk(aiRoot);
  return found.sort();
}

function readAllowlist(allowlistPath) {
  if (!fs.existsSync(allowlistPath)) return new Set();
  const entries = new Set();
  for (const rawLine of fs.readFileSync(allowlistPath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    entries.add(line);
  }
  return entries;
}

// Returns { keys: string[] | null, bodyStart: number }; keys === null means no
// frontmatter block. bodyStart is the line index where the body begins.
function parseFrontmatter(lines) {
  if (lines[0] !== "---") return { keys: null, bodyStart: 0 };
  const keys = [];
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === "---") return { keys, bodyStart: i + 1 };
    const match = lines[i].match(/^([A-Za-z_][A-Za-z0-9_-]*)\s*:/);
    if (match) keys.push(match[1]);
  }
  // Opening fence without a closing fence: treat as missing frontmatter.
  return { keys: null, bodyStart: 0 };
}

// Fence-aware ## heading scan. Returns [{ title, start }] with start = line index.
function scanSections(lines, bodyStart) {
  const sections = [];
  let inFence = false;
  for (let i = bodyStart; i < lines.length; i++) {
    if (/^(```|~~~)/.test(lines[i])) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const match = lines[i].match(/^##\s+(.+?)\s*$/);
    if (match) sections.push({ title: match[1], start: i });
  }
  return sections;
}

function splitLines(text) {
  const lines = text.split("\n");
  // wc -l semantics: a trailing newline does not add a line.
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

function checkAgentsFile(file, violations) {
  const relPath = rel(file);
  const text = fs.readFileSync(file, "utf8");
  const lines = splitLines(text);

  if (lines.length > FILE_LINE_CAP) {
    violations.push({
      file: relPath,
      owner: relPath,
      code: "file-cap",
      message: `${lines.length} lines exceeds the ${FILE_LINE_CAP}-line total cap (split per AGENTS-sections pattern)`,
    });
  }

  const { keys, bodyStart } = parseFrontmatter(lines);
  if (keys === null) {
    violations.push({
      file: relPath,
      owner: relPath,
      code: "frontmatter-missing",
      message: "no YAML frontmatter block (--- ... ---) at top of file",
    });
  } else {
    const missing = CANONICAL_KEYS.filter((key) => !keys.includes(key));
    if (missing.length > 0) {
      violations.push({
        file: relPath,
        owner: relPath,
        code: "frontmatter-keys",
        message: `missing canonical frontmatter key(s): ${missing.join(", ")}`,
      });
    }
  }

  const sections = scanSections(lines, bodyStart);
  for (const required of REQUIRED_SECTIONS) {
    const pattern = new RegExp(`^${required}\\b`, "i");
    if (!sections.some((section) => pattern.test(section.title))) {
      violations.push({
        file: relPath,
        owner: relPath,
        code: "section-missing",
        message: `missing required ASDLC section "## ${required}"`,
      });
    }
  }

  for (let i = 0; i < sections.length; i++) {
    const end = i + 1 < sections.length ? sections[i + 1].start : lines.length;
    const span = end - sections[i].start;
    if (span > SECTION_LINE_CAP) {
      violations.push({
        file: relPath,
        owner: relPath,
        code: "section-cap",
        message: `section "## ${sections[i].title}" spans ${span} lines, exceeds the ${SECTION_LINE_CAP}-line section cap`,
      });
    }
  }

  if (keys !== null) {
    checkStatus(relPath, lines.slice(1, bodyStart - 1), text, violations);
  }

  checkAgentsSections(file, relPath, text, violations);
  checkModuleDrift(file, relPath, violations);
}

// RP-31: status enum + STUB banner for stub modules.
function checkStatus(relPath, fmLines, text, violations) {
  for (const line of fmLines) {
    const match = line.match(/^status:\s*(.*?)\s*$/);
    if (!match) continue;
    const value = match[1].replace(/^["']|["']$/g, "");
    if (!STATUS_ENUM.includes(value)) {
      violations.push({
        file: relPath,
        owner: relPath,
        code: "status-invalid",
        message: `frontmatter status "${value}" not in enum [${STATUS_ENUM.join(", ")}]`,
      });
    } else if (value === "stub" && !STUB_BANNER.test(text)) {
      violations.push({
        file: relPath,
        owner: relPath,
        code: "stub-banner-missing",
        message: 'status: stub requires a "STUB: no code yet, real home = <path>" banner in the body',
      });
    }
    return; // only the first status key is authoritative
  }
}

// Tags each line with whether the "planned, do not import" marker governs it
// (marker on the line itself or on the nearest preceding heading).
function plannedAwareLines(text) {
  const tagged = [];
  let headingPlanned = false;
  for (const line of text.split("\n")) {
    if (/^#{1,6}\s/.test(line)) headingPlanned = PLANNED_MARKER.test(line);
    tagged.push({ line, planned: headingPlanned || PLANNED_MARKER.test(line) });
  }
  return tagged;
}

// RP-16: documented commands + dependencies must exist in the mirrored code
// module's package.json. ai/<repo>/<path>/AGENTS.md mirrors <repo>/<path>/.
// Fails closed on an unreadable package.json; skips when not checked out.
function checkModuleDrift(file, ownerRel, violations) {
  const moduleDir = path.dirname(file);
  const relDir = rel(moduleDir);
  if (!relDir.startsWith("ai/")) return;
  const commandsFile = path.join(moduleDir, "AGENTS-sections", "commands.md");
  const depsFile = path.join(moduleDir, "AGENTS-sections", "dependencies.md");
  if (!fs.existsSync(commandsFile) && !fs.existsSync(depsFile)) return;
  const pkgPath = path.join(root, relDir.slice("ai/".length), "package.json");
  if (!fs.existsSync(pkgPath)) return; // code module not checked out: skip
  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  } catch {
    violations.push({
      file: rel(pkgPath),
      owner: ownerRel,
      code: "package-json-unreadable",
      message: `cannot parse ${rel(pkgPath)}; command/dependency drift check has no ground truth`,
    });
    return;
  }
  const scripts = new Set(Object.keys(pkg.scripts || {}));
  const deps = new Set([
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
    ...Object.keys(pkg.peerDependencies || {}),
  ]);

  if (fs.existsSync(commandsFile)) {
    const relCommands = rel(commandsFile);
    const reported = new Set();
    for (const { line, planned } of plannedAwareLines(fs.readFileSync(commandsFile, "utf8"))) {
      if (planned) continue;
      for (const match of line.matchAll(/\bbun run (?!-)([A-Za-z0-9:._-]+)/g)) {
        const script = match[1];
        if (scripts.has(script) || reported.has(script)) continue;
        reported.add(script);
        violations.push({
          file: relCommands,
          owner: ownerRel,
          code: "command-missing",
          message: `documents \`bun run ${script}\` but package.json has no script "${script}" (mark it "planned, do not import" or remove it)`,
        });
      }
    }
  }

  if (fs.existsSync(depsFile)) {
    const relDeps = rel(depsFile);
    const reported = new Set();
    for (const { line, planned } of plannedAwareLines(fs.readFileSync(depsFile, "utf8"))) {
      if (planned) continue;
      const row = line.match(/^\|([^|]*)\|/);
      if (!row) continue;
      for (const token of row[1].matchAll(/`([@A-Za-z0-9/._-]+)`/g)) {
        const name = token[1];
        if (deps.has(name) || reported.has(name)) continue;
        reported.add(name);
        violations.push({
          file: relDeps,
          owner: ownerRel,
          code: "dependency-missing",
          message: `lists \`${name}\` but package.json does not declare it (mark it "planned, do not import" or remove it)`,
        });
      }
    }
  }
}

function checkAgentsSections(file, ownerRel, agentsText, violations) {
  const dir = path.join(path.dirname(file), "AGENTS-sections");
  const referenced = new Set();
  for (const match of agentsText.matchAll(/AGENTS-sections\/([A-Za-z0-9._-]+\.md)/g)) {
    referenced.add(match[1]);
  }

  const existing = new Set();
  if (fs.existsSync(dir)) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
      existing.add(entry.name);
      const sectionFile = path.join(dir, entry.name);
      const sectionLines = splitLines(fs.readFileSync(sectionFile, "utf8"));
      if (sectionLines.length > SECTION_LINE_CAP) {
        violations.push({
          file: rel(sectionFile),
          owner: ownerRel,
          code: "section-file-cap",
          message: `${sectionLines.length} lines exceeds the ${SECTION_LINE_CAP}-line per-section cap`,
        });
      }
      if (!referenced.has(entry.name)) {
        violations.push({
          file: rel(sectionFile),
          owner: ownerRel,
          code: "sections-orphan",
          message: `not referenced from ${ownerRel} (orphaned section file)`,
        });
      }
    }
  }

  for (const name of referenced) {
    if (!existing.has(name)) {
      violations.push({
        file: ownerRel,
        owner: ownerRel,
        code: "sections-missing-ref",
        message: `references AGENTS-sections/${name} which does not exist`,
      });
    }
  }
}

function updateAllowlist(allowlistPath, violations) {
  const owners = [...new Set(violations.map((v) => v.owner))].sort();
  const header = [
    "# check-agents-schema legacy allowlist (RP-14 warn-first ratchet).",
    "# One repo-relative AGENTS.md path per line. Allowlisted modules pass in",
    "# both modes. Drain entries as modules migrate to the canonical schema",
    "# (RP-15); regenerate with: node scripts/check-agents-schema.js --update-allowlist",
  ];
  fs.writeFileSync(allowlistPath, `${[...header, ...owners].join("\n")}\n`);
  console.log(`check-agents-schema: wrote ${owners.length} allowlist entries to ${rel(allowlistPath)}`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const allowlistPath = args.allowlist
    ? path.resolve(root, args.allowlist)
    : path.join(root, "scripts/check-agents-schema-allowlist.txt");

  const files = args.files.length > 0 ? args.files.map((f) => path.resolve(root, f)) : listAgentsFiles();

  const violations = [];
  for (const file of files) {
    if (!fs.existsSync(file)) {
      console.error(`check-agents-schema: no such file ${rel(file)}`);
      process.exit(2);
    }
    checkAgentsFile(file, violations);
  }

  if (args.updateAllowlist) {
    updateAllowlist(allowlistPath, violations);
    return;
  }

  const allowlist = readAllowlist(allowlistPath);
  const active = violations.filter((v) => !allowlist.has(v.owner) && !allowlist.has(v.file));
  const allowlisted = violations.length - active.length;
  const label = args.mode === "fail" ? "FAIL" : "WARN";

  for (const violation of active) {
    console.log(`${label} ${violation.file}: ${violation.code}: ${violation.message}`);
  }

  const allowlistedOwners = new Set(
    violations.filter((v) => allowlist.has(v.owner) || allowlist.has(v.file)).map((v) => v.owner),
  );
  console.log(
    `check-agents-schema: ${active.length} violation(s) in ${new Set(active.map((v) => v.file)).size} file(s); ` +
      `${allowlisted} allowlisted violation(s) across ${allowlistedOwners.size} legacy module(s) [mode=${args.mode}]`,
  );

  if (active.length > 0 && args.mode === "fail") {
    console.error("check-agents-schema: fail-closed mode; fix violations or add a justified allowlist entry");
    process.exit(1);
  }
}

main();
