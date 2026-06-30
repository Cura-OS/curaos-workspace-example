#!/usr/bin/env node
const ghProject = require("./lib/gh-project.js");
const fs = require("node:fs");

function parseIssueRef(ref) {
  return require("./lib/gh-ref.js").parseIssueRef(ref, { source: "roadmap-project-item-sync" });
}

function parseFields(value) {
  if (!value) return {};
  if (typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  }
  return {};
}

function unquote(value) {
  const v = String(value || "").trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) return v.slice(1, -1);
  if (v === "[]") return [];
  return v;
}

function parseFrontmatter(body) {
  const match = String(body || "").match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  const out = {};
  let listKey = null;
  for (const raw of match[1].split(/\r?\n/)) {
    const line = raw.trimEnd();
    const keyMatch = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (keyMatch) {
      listKey = null;
      const key = keyMatch[1];
      const value = unquote(keyMatch[2]);
      out[key] = value;
      if (keyMatch[2].trim() === "") {
        out[key] = [];
        listKey = key;
      }
      continue;
    }
    const itemMatch = line.trim().match(/^-\s*(.*)$/);
    if (listKey && itemMatch) out[listKey].push(unquote(itemMatch[1]));
  }
  return out;
}

function priorityLabel(value) {
  const normalized = String(value || "").toLowerCase();
  const map = {
    P0: "Critical",
    P1: "High",
    P2: "Medium",
    P3: "Low",
    critical: "Critical",
    high: "High",
    medium: "Medium",
    low: "Low",
  };
  return map[value] || map[normalized] || value;
}

function issueKindLabel(value) {
  const normalized = String(value || "").trim().toLowerCase();
  const map = {
    initiative: "Roadmap",
    epic: "Roadmap",
    story: "Implementation",
    task: "Implementation",
    bug: "Implementation",
    spike: "Planning",
    gate: "Gate",
    verification: "Verification",
  };
  return map[normalized] || value;
}

function normalizeDesired(fields) {
  const out = {};
  for (const [key, value] of Object.entries(fields || {})) {
    if (value === undefined || value === null || value === "") continue;
    out[key === "Milestone" ? "CuraOS Milestone" : key] = key === "Priority" ? priorityLabel(String(value)) : value;
  }
  return out;
}

function mergeFrontmatterBackstop(desired, body) {
  const frontmatter = parseFrontmatter(body);
  const out = { ...desired };
  if (!out["Target Version"] && frontmatter["target-version"]) out["Target Version"] = String(frontmatter["target-version"]);
  if (!out["Target Version"] && frontmatter.target_version) out["Target Version"] = String(frontmatter.target_version);
  if (!out["Target Version"] && frontmatter.targetVersion) out["Target Version"] = String(frontmatter.targetVersion);
  if (!out["CuraOS Milestone"] && frontmatter.milestone) out["CuraOS Milestone"] = String(frontmatter.milestone);
  if (!out.Priority && frontmatter.priority) out.Priority = priorityLabel(String(frontmatter.priority));
  if (!out.Cycle && frontmatter.cycle) out.Cycle = String(frontmatter.cycle);
  if (!out.Initiative && frontmatter.initiative) out.Initiative = String(frontmatter.initiative);
  if (!out.Effort && frontmatter.effort) out.Effort = String(frontmatter.effort);
  if (!out.Module && frontmatter.module) out.Module = String(frontmatter.module);
  if (!out["Issue Kind"] && frontmatter.type) out["Issue Kind"] = issueKindLabel(frontmatter.type);
  return out;
}

function flattenedKey(name) {
  if (name === "CuraOS Milestone") return "curaOS Milestone";
  return name ? name[0].toLowerCase() + name.slice(1) : name;
}

function itemRef(item) {
  const content = item && item.content;
  if (!content || content.type !== "Issue" || !content.number) return "";
  const repo = content.repository || item.repository || "";
  const repoName = String(repo).replace(/^https:\/\/github\.com\//, "");
  return repoName ? `${repoName}#${content.number}` : "";
}

function projectItems(projectNumber, cachePath = "") {
  if (cachePath && fs.existsSync(cachePath)) {
    const cached = JSON.parse(fs.readFileSync(cachePath, "utf8"));
    const cachedItems = Array.isArray(cached.items) ? cached.items : cached;
    return Array.isArray(cachedItems) ? cachedItems : [];
  }
  const data = ghProject.gh(["project", "item-list", String(projectNumber), "--owner", ghProject.ORG, "--format", "json", "--limit", "1000"], { json: true });
  const items = Array.isArray(data.items) ? data.items : [];
  if (items.length >= 1000) throw new Error("roadmap-project-item-sync: project item-list reached limit 1000; refusing truncated sync");
  if (cachePath) fs.writeFileSync(cachePath, JSON.stringify({ items }, null, 2));
  return items;
}

function currentValuesFor(item, fields) {
  const values = {};
  for (const name of Object.keys(fields || {})) {
    const key = flattenedKey(name);
    if (item && item[key] !== undefined && item[key] !== null && item[key] !== "") values[name] = item[key];
  }
  return values;
}

function plannedFieldWrites(desired, currentValues, fields) {
  const writes = [];
  for (const [name, value] of Object.entries(desired || {})) {
    const field = fields[name];
    if (!field || currentValues[name] === value) continue;
    const isSingleSelect = field.dataType === "ProjectV2SingleSelectField" || (field.options && Object.keys(field.options).length > 0);
    if (isSingleSelect && !(field.options && field.options[value])) {
      writes.push({ field: name, unmapped: value, knownOptions: Object.keys(field.options || {}) });
      continue;
    }
    writes.push({ field: name, set: value });
  }
  return writes;
}

function desiredForFieldCacheRefresh(desired, fields, fieldWrites) {
  const refreshDesired = {};
  for (const [name, value] of Object.entries(desired || {})) {
    if (!fields[name]) refreshDesired[name] = value;
  }
  for (const write of fieldWrites || []) {
    if (write && write.field && write.unmapped !== undefined && desired[write.field] !== undefined) {
      refreshDesired[write.field] = desired[write.field];
    }
  }
  return refreshDesired;
}

function milestoneAfterReconcile(desired, currentValues, fieldWrites) {
  const wanted = desired["CuraOS Milestone"];
  const current = currentValues["CuraOS Milestone"];
  const milestoneWrite = (fieldWrites || []).find((write) => write && write.field === "CuraOS Milestone");
  if (milestoneWrite) {
    if (milestoneWrite.set) return String(milestoneWrite.set);
    return "NONE";
  }
  if (wanted) return current === wanted ? String(current) : "NONE";
  return current ? String(current) : "NONE";
}

function syncProjectItem(cfg) {
  if (!cfg.issue) throw new Error("roadmap-project-item-sync: issue is required");
  const issueRef = parseIssueRef(cfg.issue);
  const projectNumber = ghProject.ensureProject();
  const project = ghProject.gh(["project", "view", String(projectNumber), "--owner", ghProject.ORG, "--format", "json"], { json: true });
  const projectId = project.id;
  if (!projectId) throw new Error("roadmap-project-item-sync: project id unavailable from gh project view");

  let fields = ghProject.fieldMap(projectNumber);
  const issueData = ghProject.gh(["api", `repos/${issueRef.repo}/issues/${issueRef.number}`], { json: true });
  const contentId = issueData.node_id;
  if (!contentId) throw new Error(`roadmap-project-item-sync: issue node_id unavailable for ${cfg.issue}`);

  const desired = mergeFrontmatterBackstop(normalizeDesired(parseFields(cfg.fields)), issueData.body || "");
  const cachePath = cfg.project_items_cache || process.env.CURAOS_ROADMAP_ITEMS_CACHE || "";
  const items = projectItems(projectNumber, cachePath);
  let currentItem = items.find((item) => itemRef(item) === cfg.issue);
  let itemId = "";
  let added = false;

  if (cfg.dry_run) {
    itemId = currentItem ? currentItem.id : "(dry-run)";
  } else {
    itemId = ghProject.addItem(projectId, contentId);
    added = !currentItem;
    // Cache misses are treated as newly-added/currently-unknown rows: write desired
    // values and rely on GraphQL mutation failure for invalid options. Existing
    // active candidates normally appear in the wave cache because they came from
    // the same Project scan.
    if (!currentItem) currentItem = { id: itemId };
  }

  let currentValues = currentValuesFor(currentItem || {}, fields);
  let field_writes = cfg.dry_run
    ? plannedFieldWrites(desired, currentValues, fields)
    : ghProject.reconcileFields(projectId, itemId, fields, desired, currentValues, { projectNumber });
  const refreshDesired = desiredForFieldCacheRefresh(desired, fields, field_writes);
  if (!cfg.dry_run && Object.keys(refreshDesired).length > 0) {
    fields = ghProject.fieldMap(projectNumber, { refresh: true });
    currentValues = currentValuesFor(currentItem || {}, fields);
    const retryWrites = ghProject.reconcileFields(projectId, itemId, fields, refreshDesired, currentValues, { projectNumber });
    const retriedFields = new Set(Object.keys(refreshDesired));
    field_writes = field_writes
      .filter((write) => !(write && write.field && retriedFields.has(write.field) && write.unmapped !== undefined))
      .concat(retryWrites.map((write) => ({ ...write, retried_after_field_cache_refresh: true })));
  }
  const milestone = milestoneAfterReconcile(desired, currentValues, field_writes);

  return { item_id: itemId, field_writes, added, milestone: String(milestone || "NONE") };
}

if (require.main === module) {
  const cfg = JSON.parse(process.argv[2] || "{}");
  process.stdout.write(`${JSON.stringify(syncProjectItem(cfg))}\n`);
}

module.exports = {
  parseFrontmatter,
  desiredForFieldCacheRefresh,
  mergeFrontmatterBackstop,
  milestoneAfterReconcile,
  issueKindLabel,
  plannedFieldWrites,
  syncProjectItem,
};
