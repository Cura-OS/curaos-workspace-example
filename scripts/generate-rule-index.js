#!/usr/bin/env node
// generate-rule-index.js (RP-26): the rule index is GENERATED, never hand-edited.
//
// Source of truth: YAML frontmatter (name + title + description) of every
// ai/rules/curaos_*.md file. Derived surfaces, each marker-wrapped or
// banner-stamped so regeneration is idempotent and drift is machine-checkable
// (same playbook/executor shape as scripts/check-workflow-sync.js):
//   1. ai/rules/README.md   `| File | Topic |` table (Topic = description)
//   2. AGENTS.md section 15 `| Rule | File |` table (Rule = title)
//   3. .claude/rules/<name>.mdc path-scoped rule views (RP-62): generated for
//      every rule whose frontmatter declares a `paths:` glob list. The view
//      carries the paths frontmatter + the rule's BINDING CORE (body above
//      the fold marker) so the harness injects only the binding text when a
//      matching file is touched. Canonical text lives in ai/rules/; the view
//      is a generated copy, never hand-edited.
//
// Binding-core fold (RP-63): a rule body may contain the fold marker line
//   <!-- fold: rationale, non-binding -->
// Lines above the fold (frontmatter excluded, outer blank lines trimmed) are
// the binding core; everything below is rationale/reference. Rules whose
// binding core exceeds RULE_SIZE_BUDGET lines get a WARN (exit code is NOT
// affected; warn-first per the RP-63 spec). A rule WITH `paths:` MUST carry
// a fold marker (fail-closed) so its injected view stays lean.
//
// Usage: node scripts/generate-rule-index.js [--write] [--root <dir>]
//   default = check mode: exit 0 when both generated regions and all rule
//   views match the frontmatter-derived content; exit 1 on any drift,
//   missing marker, missing/invalid frontmatter, missing fold on a paths
//   rule, orphan generated view, or em/en dash in title/description/view.
//   --write = regenerate both regions + all rule views in place.
// --root exists for tests (fixture trees); production runs use the repo root.

const fs = require("node:fs");
const path = require("node:path");

const args = process.argv.slice(2);
const write = args.includes("--write");
const rootFlag = args.indexOf("--root");
const root = rootFlag !== -1 && args[rootFlag + 1]
  ? path.resolve(args[rootFlag + 1])
  : path.resolve(__dirname, "..");

const RULES_DIR = path.join(root, "ai/rules");
const README_PATH = path.join(RULES_DIR, "README.md");
const AGENTS_PATH = path.join(root, "AGENTS.md");
const VIEWS_DIR = path.join(root, ".claude/rules");
const BEGIN = "<!-- BEGIN GENERATED: rule-index (node scripts/generate-rule-index.js --write) -->";
const END = "<!-- END GENERATED: rule-index -->";
// RP-63 fold marker: binding core above, rationale (non-binding) below.
const FOLD_MARKER = "<!-- fold: rationale, non-binding -->";
// RP-63 budget: max binding-core lines before a WARN is emitted.
const RULE_SIZE_BUDGET = 60;
// RP-62 view banner: marks a .claude/rules file as generated (orphan-checkable).
// Hand-written .mdc files without this banner are never touched or flagged.
const VIEW_BANNER_PREFIX = "<!-- GENERATED: rule-view (node scripts/generate-rule-index.js --write); source: ";
// Built from escapes so this file never contains the literal glyphs.
const DASH_RE = new RegExp("[\\u2013\\u2014]");

const problems = [];
const warnings = [];

function rel(p) {
  return path.relative(root, p).replaceAll(path.sep, "/");
}

function frontmatterOf(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  return m ? m[1] : null;
}

// Single-line plain scalar with optional surrounding quotes; rule frontmatter
// descriptions are long single lines by convention (see existing rule files).
function scalar(fm, key) {
  const m = fm.match(new RegExp(`^${key}:[ ]*(.*)$`, "m"));
  if (!m) return null;
  let v = m[1].trim();
  if (v.length >= 2 && ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))) {
    v = v.slice(1, -1);
  }
  return v;
}

// Block-sequence list (e.g. `paths:` followed by `  - "glob"` lines); returns
// null when the key is absent, [] when present but empty of items.
function listScalar(fm, key) {
  const m = fm.match(new RegExp(`^${key}:[ \\t]*\\r?\\n((?:[ \\t]+-[ \\t]+.*(?:\\r?\\n|$))*)`, "m"));
  if (!m) return null;
  return m[1]
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.startsWith("- "))
    .map((l) => {
      let v = l.slice(2).trim();
      if (v.length >= 2 && ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))) {
        v = v.slice(1, -1);
      }
      return v;
    });
}

function bodyOf(text) {
  const m = text.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  return m ? text.slice(m[0].length) : text;
}

// RP-63: binding core = body above the fold marker (whole body when no fold),
// outer blank lines trimmed. Internal blank lines count toward the budget.
function bindingCoreOf(body) {
  const at = body.indexOf(FOLD_MARKER);
  const core = at === -1 ? body : body.slice(0, at);
  return core.replace(/^\s*\n/, "").replace(/\s+$/, "");
}

function cell(text) {
  // Markdown table cell safety: pipes would split the row.
  return text.replaceAll("|", "\\|");
}

function loadRules() {
  if (!fs.existsSync(RULES_DIR)) {
    problems.push(`missing rules dir: ${rel(RULES_DIR)}`);
    return [];
  }
  const files = fs
    .readdirSync(RULES_DIR)
    .filter((f) => f.startsWith("curaos_") && f.endsWith(".md"))
    .sort();
  const rules = [];
  for (const file of files) {
    const text = fs.readFileSync(path.join(RULES_DIR, file), "utf8");
    const fm = frontmatterOf(text);
    if (!fm) {
      problems.push(`${rel(path.join(RULES_DIR, file))}: no YAML frontmatter (name + title + description required)`);
      continue;
    }
    const name = scalar(fm, "name");
    const title = scalar(fm, "title");
    const description = scalar(fm, "description");
    const expectedName = file.replace(/\.md$/, "").replaceAll("_", "-");
    if (!name || !title || !description) {
      const missing = [!name && "name", !title && "title", !description && "description"].filter(Boolean);
      problems.push(`${rel(path.join(RULES_DIR, file))}: frontmatter missing ${missing.join(" + ")}`);
      continue;
    }
    if (name !== expectedName) {
      problems.push(`${rel(path.join(RULES_DIR, file))}: frontmatter name "${name}" != filename slug "${expectedName}"`);
      continue;
    }
    for (const [field, value] of [["title", title], ["description", description]]) {
      if (DASH_RE.test(value)) {
        problems.push(`${rel(path.join(RULES_DIR, file))}: ${field} contains an em/en dash (curaos_no_em_dash_rule)`);
      }
    }
    const paths = listScalar(fm, "paths");
    const body = bodyOf(text);
    const core = bindingCoreOf(body);
    const coreLines = core ? core.split("\n").length : 0;
    if (coreLines > RULE_SIZE_BUDGET) {
      warnings.push(
        `${rel(path.join(RULES_DIR, file))}: binding core ${coreLines} lines exceeds budget ${RULE_SIZE_BUDGET}` +
          ` (move rationale below "${FOLD_MARKER}")`,
      );
    }
    if (paths !== null) {
      if (!paths.length) {
        problems.push(`${rel(path.join(RULES_DIR, file))}: paths declared but empty (drop the key or list at least one glob)`);
        continue;
      }
      if (!body.includes(FOLD_MARKER)) {
        problems.push(
          `${rel(path.join(RULES_DIR, file))}: has paths but no fold marker "${FOLD_MARKER}"` +
            " (paths rules must fold rationale so the injected view stays lean)",
        );
        continue;
      }
      if (DASH_RE.test(core)) {
        problems.push(`${rel(path.join(RULES_DIR, file))}: binding core contains an em/en dash (curaos_no_em_dash_rule); it would ship in the generated view`);
        continue;
      }
    }
    rules.push({ file, name, title, description, paths, core });
  }
  return rules;
}

function readmeTable(rules) {
  const lines = ["| File | Topic |", "|---|---|"];
  for (const r of rules) lines.push(`| [${r.file}](${r.file}) | ${cell(r.description)} |`);
  return lines.join("\n");
}

function agentsTable(rules) {
  const lines = ["| Rule | File |", "|---|---|"];
  for (const r of rules) lines.push(`| ${cell(r.title)} | [${r.file}](ai/rules/${r.file}) |`);
  return lines.join("\n");
}

function syncRegion(filePath, generated) {
  if (!fs.existsSync(filePath)) {
    problems.push(`missing file: ${rel(filePath)}`);
    return;
  }
  const text = fs.readFileSync(filePath, "utf8");
  const beginAt = text.indexOf(BEGIN);
  const endAt = text.indexOf(END);
  if (beginAt === -1 || endAt === -1 || endAt < beginAt) {
    problems.push(`${rel(filePath)}: rule-index markers missing or malformed (need "${BEGIN}" ... "${END}")`);
    return;
  }
  const current = text.slice(beginAt + BEGIN.length, endAt).replace(/^\n/, "").replace(/\n$/, "");
  if (current === generated) {
    console.log(`rule-index ok: ${rel(filePath)}`);
    return;
  }
  if (write) {
    const next = text.slice(0, beginAt) + BEGIN + "\n" + generated + "\n" + END + text.slice(endAt + END.length);
    fs.writeFileSync(filePath, next);
    console.log(`rule-index wrote: ${rel(filePath)}`);
    return;
  }
  const currentLines = current.split("\n");
  const generatedLines = generated.split("\n");
  let firstDiff = 0;
  while (
    firstDiff < Math.max(currentLines.length, generatedLines.length) &&
    currentLines[firstDiff] === generatedLines[firstDiff]
  ) {
    firstDiff += 1;
  }
  problems.push(
    `${rel(filePath)}: rule index drifted from rule frontmatter at generated-region line ${firstDiff + 1}\n` +
      `    have: ${currentLines[firstDiff] ?? "(missing line)"}\n` +
      `    want: ${generatedLines[firstDiff] ?? "(missing line)"}\n` +
      "    fix: node scripts/generate-rule-index.js --write (or fix the rule frontmatter)",
  );
}

// RP-62: the .claude/rules/<slug>.mdc view = paths frontmatter (harness
// injection trigger) + generated banner + the rule's binding core + a pointer
// back to the canonical file. Never hand-edited; reuse-DRY holds because the
// canonical text lives in ai/rules/ and this is a regenerable projection.
function viewContent(rule) {
  const description = `"${rule.description.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
  const fmLines = ["---", `description: ${description}`, "paths:"];
  for (const glob of rule.paths) fmLines.push(`  - "${glob}"`);
  fmLines.push("---");
  const banner = `${VIEW_BANNER_PREFIX}ai/rules/${rule.file} -->`;
  const footer =
    `Binding core only. Full rule + rationale: ai/rules/${rule.file}` +
    " (canonical; edit there, then run node scripts/generate-rule-index.js --write).";
  return `${fmLines.join("\n")}\n${banner}\n\n${rule.core}\n\n${footer}\n`;
}

function syncViews(rules) {
  const expected = new Map();
  for (const r of rules) {
    if (r.paths) expected.set(`${r.name}.mdc`, viewContent(r));
  }
  const existing = fs.existsSync(VIEWS_DIR)
    ? fs.readdirSync(VIEWS_DIR).filter((f) => f.endsWith(".mdc")).sort()
    : [];
  for (const file of existing) {
    if (expected.has(file)) continue;
    const p = path.join(VIEWS_DIR, file);
    if (!fs.readFileSync(p, "utf8").includes(VIEW_BANNER_PREFIX)) continue; // hand-written rule: not ours
    if (write) {
      fs.rmSync(p);
      console.log(`rule-view removed orphan: ${rel(p)}`);
    } else {
      problems.push(`${rel(p)}: orphan generated rule view (source rule missing or no longer declares paths); fix: node scripts/generate-rule-index.js --write`);
    }
  }
  for (const [file, content] of expected) {
    const p = path.join(VIEWS_DIR, file);
    const current = fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
    if (current === content) {
      console.log(`rule-view ok: ${rel(p)}`);
      continue;
    }
    if (write) {
      fs.mkdirSync(VIEWS_DIR, { recursive: true });
      fs.writeFileSync(p, content);
      console.log(`rule-view wrote: ${rel(p)}`);
    } else if (current === null) {
      problems.push(`${rel(p)}: missing generated rule view for a paths rule; fix: node scripts/generate-rule-index.js --write`);
    } else {
      problems.push(`${rel(p)}: rule view drifted from its canonical rule's paths/binding core; fix: node scripts/generate-rule-index.js --write (or edit the canonical rule, never the view)`);
    }
  }
  return expected.size;
}

function main() {
  const rules = loadRules();
  if (!problems.length && rules.length === 0) {
    problems.push(`no curaos_*.md rule files found under ${rel(RULES_DIR)}`);
  }
  let views = 0;
  if (!problems.length) {
    syncRegion(README_PATH, readmeTable(rules));
    syncRegion(AGENTS_PATH, agentsTable(rules));
    views = syncViews(rules);
  }
  for (const w of warnings) console.error(`rule-index WARN: ${w}`);
  for (const p of problems) console.error(`rule-index FAIL: ${p}`);
  if (!problems.length) console.log(`rule-index: ${rules.length} rules + ${views} path-scoped views in sync`);
  process.exit(problems.length ? 1 : 0);
}

main();
