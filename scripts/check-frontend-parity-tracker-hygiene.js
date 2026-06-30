#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const OWNER = "your-org";
const REPO = "your-org/curaos-ai-workspace";
const PROJECT_TITLE = "CuraOS Roadmap";
const ROOT = path.resolve(__dirname, "..");
const DEFAULT_PROJECT_ITEMS_FILE = path.join(ROOT, ".scratch", "workflow-cache", "roadmap-items.json");

function repoSlugFromUrl(value) {
  if (!value) return "";
  const text = String(value).replace(/\/+$/, "");
  const issueUrl = text.match(/github\.com[:/](?<owner>[^/]+)\/(?<repo>[^/]+)\/(?:issues|pull)\/\d+$/);
  if (issueUrl && issueUrl.groups) return `${issueUrl.groups.owner}/${issueUrl.groups.repo}`;
  const github = text.match(/github\.com[:/](?<owner>[^/]+)\/(?<repo>[^/]+)$/);
  if (github && github.groups) return `${github.groups.owner}/${github.groups.repo}`;
  const slug = text.match(/(?<owner>[^/\s]+)\/(?<repo>[^/\s]+)$/);
  return slug && slug.groups ? `${slug.groups.owner}/${slug.groups.repo}` : text;
}

function issueRef(issue) {
  const repo = issue.repository || repoSlugFromUrl(issue.repositoryUrl || issue.url) || REPO;
  return `${repo}#${issue.number}`;
}

function itemRef(item) {
  const content = item.content || {};
  const repo = repoSlugFromUrl(content.repository || item.repository || content.repositoryUrl);
  const number = content.number || item.number;
  if (!repo || !number) return "";
  return `${repo}#${number}`;
}

function itemTargetVersion(item) {
  return item["target Version"] || item["Target Version"] || item.targetVersion || item.target_version || "";
}

function isFrontendParityIssue(issue) {
  const title = String(issue.title || "").trim();
  const body = String(issue.body || "");
  const lowerTitle = title.toLowerCase();
  const lowerText = `${title}\n${body}`.toLowerCase();
  if (!/^\[v1\]/i.test(title)) return false;
  return (
    /\[fe\]/i.test(title) ||
    /\[docs\].*frontend/i.test(title) ||
    /\[epic\].*frontend/i.test(title) ||
    /\[epic\].*backend dependencies.*frontend functional parity/i.test(title) ||
    /\[backend\]\s+(author typespec \+ build|build)\s+/.test(lowerTitle) ||
    lowerText.includes("frontend functional parity") ||
    lowerText.includes("done-criteria parity")
  );
}

function projectTargetVersionByRef(projectItems) {
  const out = new Map();
  for (const item of projectItems || []) {
    const ref = itemRef(item);
    if (!ref) continue;
    out.set(ref, itemTargetVersion(item));
  }
  return out;
}

function rowForIssue(issue, extra = {}) {
  return {
    ref: issueRef(issue),
    title: issue.title || "",
    url: issue.url || "",
    ...extra,
  };
}

function analyzeTrackerHygiene({ issues, projectItems }) {
  const targetVersions = projectTargetVersionByRef(projectItems);
  const scopedIssues = (issues || []).filter(isFrontendParityIssue);
  const builtInMilestone = [];
  const targetVersionMismatch = [];

  for (const issue of scopedIssues) {
    const milestone = issue.milestone && (issue.milestone.title || issue.milestone);
    if (milestone) {
      builtInMilestone.push(rowForIssue(issue, { milestone: String(milestone) }));
    }

    const targetVersion = targetVersions.get(issueRef(issue)) || "";
    if (targetVersion !== "v1") {
      targetVersionMismatch.push(rowForIssue(issue, { target_version: targetVersion || "MISSING" }));
    }
  }

  return {
    checked_count: scopedIssues.length,
    built_in_milestone: builtInMilestone,
    target_version_mismatch: targetVersionMismatch,
    ok: builtInMilestone.length === 0 && targetVersionMismatch.length === 0,
  };
}

function runGh(args) {
  return execFileSync("env", ["-u", "GITHUB_TOKEN", "gh", ...args], {
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function readJson(path) {
  return JSON.parse(fs.readFileSync(path, "utf8"));
}

function readProjectItemsFile(file) {
  const raw = readJson(file);
  const items = Array.isArray(raw) ? raw : Array.isArray(raw.items) ? raw.items : null;
  if (!items) throw new Error(`project items file carries no items[]: ${file}`);
  return items;
}

function fetchIssues({ limit }) {
  return JSON.parse(runGh([
    "issue",
    "list",
    "--repo",
    REPO,
    "--state",
    "open",
    "--limit",
    String(limit),
    "--json",
    "number,title,body,url,milestone,state",
  ]));
}

function fetchProjectItems({ limit }) {
  const projects = JSON.parse(runGh(["project", "list", "--owner", OWNER, "--format", "json"]));
  const matches = (projects.projects || []).filter((project) => project.title === PROJECT_TITLE);
  if (matches.length !== 1) {
    throw new Error(`expected one open project titled ${PROJECT_TITLE}, found ${matches.length}`);
  }
  const projectNumber = matches[0].number;
  const payload = JSON.parse(runGh([
    "project",
    "item-list",
    String(projectNumber),
    "--owner",
    OWNER,
    "--format",
    "json",
    "--limit",
    String(limit),
  ]));
  const items = payload.items || [];
  if (items.length >= limit) {
    throw new Error(`project item-list reached limit ${limit}; refusing truncated check`);
  }
  return items;
}

function parseArgs(argv) {
  const args = {
    json: false,
    issueLimit: 1000,
    projectLimit: 1000,
    issuesFile: "",
    projectItemsFile: "",
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--json") args.json = true;
    else if (arg === "--issues-file") args.issuesFile = argv[++i];
    else if (arg === "--project-items-file") args.projectItemsFile = argv[++i];
    else if (arg === "--issue-limit") args.issueLimit = Number(argv[++i]);
    else if (arg === "--project-limit") args.projectLimit = Number(argv[++i]);
    else if (arg === "-h" || arg === "--help") {
      console.log("Usage: check-frontend-parity-tracker-hygiene.js [--json] [--issues-file path] [--project-items-file path]");
      process.exit(0);
    } else {
      throw new Error(`unknown arg: ${arg}`);
    }
  }
  return args;
}

function loadProjectItems(args) {
  if (args.projectItemsFile) return readProjectItemsFile(args.projectItemsFile);
  if (fs.existsSync(DEFAULT_PROJECT_ITEMS_FILE)) return readProjectItemsFile(DEFAULT_PROJECT_ITEMS_FILE);
  return fetchProjectItems({ limit: args.projectLimit });
}

function printHuman(result) {
  if (result.ok) {
    console.log(`OK: ${result.checked_count} frontend parity tracker row(s) have no built-in GitHub milestone and Target Version v1.`);
    return;
  }

  console.log(`FAIL: ${result.checked_count} frontend parity tracker row(s) checked.`);
  if (result.built_in_milestone.length) {
    console.log(`Built-in GitHub Milestone is set on ${result.built_in_milestone.length} row(s):`);
    for (const row of result.built_in_milestone) {
      console.log(`  - ${row.ref}  ${row.milestone}  ${row.title}`);
    }
  }
  if (result.target_version_mismatch.length) {
    console.log(`Project Target Version is missing or not v1 on ${result.target_version_mismatch.length} row(s):`);
    for (const row of result.target_version_mismatch) {
      console.log(`  - ${row.ref}  ${row.target_version}  ${row.title}`);
    }
  }
}

function main(argv) {
  try {
    const args = parseArgs(argv);
    const issues = args.issuesFile ? readJson(args.issuesFile) : fetchIssues({ limit: args.issueLimit });
    const projectItems = loadProjectItems(args);
    const result = analyzeTrackerHygiene({ issues, projectItems });
    if (args.json) console.log(JSON.stringify(result, null, 2));
    else printHuman(result);
    return result.ok ? 0 : 3;
  } catch (error) {
    console.error(error.message || String(error));
    return 2;
  }
}

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}

module.exports = {
  analyzeTrackerHygiene,
  isFrontendParityIssue,
  projectTargetVersionByRef,
  repoSlugFromUrl,
};
