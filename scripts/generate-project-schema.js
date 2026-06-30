#!/usr/bin/env node
// scripts/generate-project-schema.js (RP-32)
// Generates docs/agents/github-roadmap-project-schema.md from a LIVE GraphQL dump of the
// org ProjectV2 board. The generated doc is the ONE schema vocabulary source: the roadmap
// rule, the orchestration prompt, and the workflow playbooks LINK to it instead of carrying
// inline field/view lists (3 contradictory copies drifted apart; report section 4.1).
//
// Read-only: resolves the project by TITLE (never a hardcoded number) and issues exactly one
// GraphQL query. All gh calls ride scripts/lib/gh-project.js gh(), which strips GITHUB_TOKEN
// so the keyring/project-scoped auth is used (curaos-gh-project-sync-env-workaround).
//
// Modes:
//   node scripts/generate-project-schema.js            # print generated doc to stdout
//   node scripts/generate-project-schema.js --write    # write the committed doc
//   node scripts/generate-project-schema.js --check    # regenerate + diff vs committed doc
//                                                      # (date line ignored); exit 3 on drift
// --check needs network + project-scope auth; it is a manual/operator drift probe, not a
// local-CI gate (local CI must stay offline per curaos_local_ci_first_rule).

const fs = require("node:fs");
const path = require("node:path");
const { graphql, ORG, PROJECT_TITLE, ROOT } = require("./lib/gh-project");

const DOC_PATH = path.join(ROOT, "docs", "agents", "github-roadmap-project-schema.md");
const PAGE_CAP = 100; // fail closed past one page; the board has ~26 fields / ~10 views

// Built-in ProjectV2 field dataTypes (present on every board; not operator-created).
const BUILTIN_DATA_TYPES = new Set([
  "TITLE", "ASSIGNEES", "LABELS", "LINKED_PULL_REQUESTS", "MILESTONE", "REPOSITORY",
  "REVIEWERS", "PARENT_ISSUE", "SUB_ISSUES_PROGRESS", "CREATED", "UPDATED", "CLOSED",
  "TRACKS", "TRACKED_BY", "ISSUE_TYPE",
]);

// No-dash rule (curaos_no_em_dash_rule): live titles/filters could carry the banned glyphs;
// sanitize on emit so the generated doc always passes the gate. Escapes only, never literals.
function sanitizeDashes(value) {
  return String(value == null ? "" : value).replace(/[\u2014\u2013]/g, "-");
}

function cell(value) {
  return sanitizeDashes(value).replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim();
}

const SCHEMA_QUERY = `query($org:String!,$title:String!){
  organization(login:$org){
    projectsV2(first:${PAGE_CAP},query:$title){
      pageInfo{hasNextPage}
      nodes{
        id number title url closed
        fields(first:${PAGE_CAP}){
          pageInfo{hasNextPage}
          nodes{
            ... on ProjectV2FieldCommon{id name dataType}
            ... on ProjectV2SingleSelectField{options{id name}}
            ... on ProjectV2IterationField{configuration{iterations{id title startDate duration}}}
          }
        }
        views(first:${PAGE_CAP}){
          pageInfo{hasNextPage}
          nodes{id name number layout filter}
        }
      }
    }
  }
}`;

// Resolve the board by exact TITLE among the org's open projects. projectsV2(query:) narrows
// server-side; the exact match + ambiguity guard stay client-side. Fails closed (no create:
// this generator is read-only, unlike gh-project.js ensureProject()).
function fetchProjectSchema({ gql = graphql, org = ORG, title = PROJECT_TITLE } = {}) {
  const res = gql(SCHEMA_QUERY, { org, title });
  const conn = res && res.data && res.data.organization && res.data.organization.projectsV2;
  if (!conn || !Array.isArray(conn.nodes)) {
    throw new Error("generate-project-schema: malformed GraphQL response (no projectsV2 nodes)");
  }
  if (conn.pageInfo && conn.pageInfo.hasNextPage) {
    throw new Error(`generate-project-schema: >${PAGE_CAP} projects matched; refine the title query`);
  }
  const matches = conn.nodes.filter((p) => p && p.title === title && !p.closed);
  if (matches.length === 0) {
    throw new Error(`generate-project-schema: no OPEN project titled ${JSON.stringify(title)} in ${org}`);
  }
  if (matches.length > 1) {
    throw new Error(`generate-project-schema: ${matches.length} open projects titled ${JSON.stringify(title)}; ambiguous`);
  }
  const project = matches[0];
  for (const [conn2, label] of [[project.fields, "fields"], [project.views, "views"]]) {
    if (!conn2 || !Array.isArray(conn2.nodes)) {
      throw new Error(`generate-project-schema: malformed GraphQL response (no ${label})`);
    }
    if (conn2.pageInfo && conn2.pageInfo.hasNextPage) {
      throw new Error(`generate-project-schema: ${label} exceed one ${PAGE_CAP}-node page; raise PAGE_CAP`);
    }
  }
  return project;
}

function optionsSummary(field) {
  if (Array.isArray(field.options) && field.options.length) {
    return field.options.map((o) => `\`${cell(o.name)}\``).join(" / ");
  }
  const iterations = field.configuration && Array.isArray(field.configuration.iterations)
    ? field.configuration.iterations
    : null;
  if (iterations && iterations.length) {
    return iterations.map((i) => `\`${cell(i.title)}\``).join(" / ");
  }
  return "";
}

function renderSchemaDoc(project, { org = ORG, generatedDate = new Date().toISOString().slice(0, 10) } = {}) {
  const fields = project.fields.nodes.filter(Boolean);
  const views = project.views.nodes.filter(Boolean);
  const custom = fields.filter((f) => !BUILTIN_DATA_TYPES.has(f.dataType));
  const builtin = fields.filter((f) => BUILTIN_DATA_TYPES.has(f.dataType));

  const lines = [];
  lines.push("# GitHub Roadmap Project schema (generated)");
  lines.push("");
  lines.push("<!-- GENERATED FILE. Do not hand-edit: regenerate with");
  lines.push("     `node scripts/generate-project-schema.js --write` (live read-only GraphQL dump;");
  lines.push("     needs project-scope keyring auth, i.e. `env -u GITHUB_TOKEN gh`).");
  lines.push("     Drift probe: `node scripts/generate-project-schema.js --check` (exit 3 on drift). -->");
  lines.push("");
  lines.push("Live schema dump of the ONE org-level GitHub Project. This doc is the single");
  lines.push("vocabulary source for Project FIELD and VIEW names: [[curaos-roadmap-workflow-rule]],");
  lines.push("[the orchestration prompt](milestone-orchestration-prompt.md), and the workflow");
  lines.push("playbooks link here instead of carrying their own field lists. If this doc and any");
  lines.push("prose disagree, regenerate this doc; the live board wins.");
  lines.push("");
  lines.push("## Project identity");
  lines.push("");
  lines.push("| Key | Value |");
  lines.push("|---|---|");
  lines.push(`| Org | \`${cell(org)}\` |`);
  lines.push(`| Title | \`${cell(project.title)}\` |`);
  lines.push(`| Number | ${Number(project.number)} (informational; resolve by TITLE, never hardcode the number) |`);
  lines.push(`| URL | <${sanitizeDashes(project.url)}> |`);
  lines.push(`| Node ID | \`${cell(project.id)}\` |`);
  lines.push(`| Generated | ${generatedDate} |`);
  lines.push("");
  lines.push(`## Custom fields (${custom.length})`);
  lines.push("");
  lines.push("| Field | Data type | Options |");
  lines.push("|---|---|---|");
  for (const f of custom) {
    lines.push(`| \`${cell(f.name)}\` | ${cell(f.dataType)} | ${optionsSummary(f)} |`);
  }
  lines.push("");
  lines.push("Option IDs are intentionally omitted: GitHub regenerates ALL option IDs when a");
  lines.push("single-select field is edited (session-30 lesson), so scripts read them at runtime");
  lines.push("via `fieldMap()` in `scripts/lib/gh-project.js` (cached at `.cache/project-fields.json`),");
  lines.push("never from this doc.");
  lines.push("");
  lines.push(`## Built-in fields (${builtin.length})`);
  lines.push("");
  lines.push("| Field | Data type |");
  lines.push("|---|---|");
  for (const f of builtin) {
    lines.push(`| \`${cell(f.name)}\` | ${cell(f.dataType)} |`);
  }
  lines.push("");
  lines.push(`## Views (${views.length})`);
  lines.push("");
  lines.push("| # | View | Layout | Filter |");
  lines.push("|---|---|---|---|");
  for (const v of views) {
    const filter = v.filter ? `\`${cell(v.filter)}\`` : "(none)";
    lines.push(`| ${Number(v.number)} | ${cell(v.name)} | ${cell(v.layout)} | ${filter} |`);
  }
  lines.push("");
  lines.push("## Consumer contract");
  lines.push("");
  lines.push("- Resolve the project by TITLE (exact match on the open project) via");
  lines.push("  `scripts/lib/gh-project.js`; the number above is recorded for humans only.");
  lines.push("- Field NAMES above are the only valid `project_fields` keys; a name not in the");
  lines.push("  custom-fields table does not exist on the board (writes to it are silently lost).");
  lines.push("- `CuraOS Milestone` (custom single-select) is the milestone field; the built-in");
  lines.push("  `Milestone` field is repo-milestone plumbing and is never written by CuraOS tooling.");
  lines.push("- Single-select values must match an option listed above; unknown options are");
  lines.push("  reported as `unmapped` by `reconcileFields()`, not text-written.");
  lines.push("");
  return `${lines.join("\n")}`;
}

// --check ignores the generated-date row so a date-only refresh is not drift.
function normalizeForCheck(text) {
  return String(text)
    .split(/\r?\n/)
    .filter((line) => !/^\|\s*Generated\s*\|/.test(line))
    .join("\n")
    .trim();
}

function main(argv) {
  const args = argv.slice(2);
  const write = args.includes("--write");
  const check = args.includes("--check");
  const project = fetchProjectSchema();
  const doc = renderSchemaDoc(project);
  if (check) {
    let committed = "";
    try {
      committed = fs.readFileSync(DOC_PATH, "utf8");
    } catch {
      console.error(`generate-project-schema: --check found no committed doc at ${DOC_PATH}`);
      process.exit(3);
    }
    if (normalizeForCheck(committed) !== normalizeForCheck(doc)) {
      console.error("generate-project-schema: DRIFT between live board and committed schema doc;");
      console.error("regenerate with: node scripts/generate-project-schema.js --write");
      process.exit(3);
    }
    console.log("generate-project-schema: committed schema doc matches the live board");
    return;
  }
  if (write) {
    fs.mkdirSync(path.dirname(DOC_PATH), { recursive: true });
    fs.writeFileSync(DOC_PATH, doc);
    console.log(`generate-project-schema: wrote ${path.relative(ROOT, DOC_PATH)}`);
    return;
  }
  process.stdout.write(doc);
}

module.exports = {
  DOC_PATH, PAGE_CAP, BUILTIN_DATA_TYPES, SCHEMA_QUERY,
  sanitizeDashes, fetchProjectSchema, renderSchemaDoc, normalizeForCheck,
};

if (require.main === module) main(process.argv);
