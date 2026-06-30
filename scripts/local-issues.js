#!/usr/bin/env node
const issues = require("./lib/local-issues-db.js");

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (!item.startsWith("--")) {
      args._.push(item);
      continue;
    }
    const key = item.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) args[key] = true;
    else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

function boolValue(value) {
  if (value === true) return true;
  if (value === false || value === undefined || value === null) return false;
  return !/^(false|0|no)$/i.test(String(value));
}

function jsonValue(value, fallback) {
  if (value === undefined || value === "") return fallback;
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error(`invalid JSON: ${error.message}`);
  }
}

function print(value, asJson) {
  if (asJson) process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
  else if (typeof value === "string") process.stdout.write(value);
  else process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function installPipeErrorHandler() {
  process.stdout.on("error", (error) => {
    if (error?.code === "EPIPE") {
      process.exit(0);
    }
    throw error;
  });
}

function usage() {
  return `Usage: node scripts/local-issues.js <command> [options]

Commands:
  ensure
  create --id ID --title TITLE [--parent-id ID] [--status STATUS] [--owner-path PATH] [--workflow-name NAME] [--target-phase PHASE]
  update --id ID [--parent-id ID] [--status STATUS] [--github-sync-status STATUS]
  show --id ID
  list [--status STATUS] [--workflow-name NAME] [--target-phase PHASE] [--parent-id ID] [--limit N]
  event --id ID --type TYPE [--payload-json JSON]
  reflect --id ID --worked TEXT --failed TEXT --decision TEXT --follow-up TEXT [--sync-needed false]
  evidence --id ID --kind KIND [--command CMD] [--path PATH] [--digest DIGEST] [--exit-code N]
  sync-queue --id ID --sync-kind KIND --target TARGET [--payload-json JSON] [--planned-command CMD]
  sync-queue-list [--status STATUS]
  export-markdown

Options:
  --db PATH
  --json
`;
}

function main(argv = process.argv.slice(2)) {
  const command = argv[0];
  const args = parseArgs(argv.slice(1));
  const dbPath = args.db || issues.defaultDbPath();
  const asJson = Boolean(args.json);

  if (!command || command === "help" || command === "--help") {
    print(usage(), false);
    return 0;
  }

  let result;
  switch (command) {
    case "ensure":
      result = issues.ensureDatabase({ dbPath });
      break;
    case "create":
      result = issues.createIssue({
        dbPath,
        id: args.id,
        parentId: args.parentId || "",
        title: args.title,
        body: args.body || "",
        status: args.status || "open",
        priority: args.priority || "normal",
        ownerPath: args.ownerPath || "",
        workflowName: args.workflowName || "",
        targetPhase: args.targetPhase || "",
        githubRepo: args.githubRepo || "",
        githubIssueNumber: args.githubIssueNumber || null,
        githubSyncStatus: args.githubSyncStatus || "not_queued",
      });
      break;
    case "update":
      result = issues.updateIssue({
        dbPath,
        id: args.id,
        title: args.title,
        parentId: args.parentId,
        body: args.body,
        status: args.status,
        priority: args.priority,
        ownerPath: args.ownerPath,
        workflowName: args.workflowName,
        targetPhase: args.targetPhase,
        githubRepo: args.githubRepo,
        githubIssueNumber: args.githubIssueNumber,
        githubSyncStatus: args.githubSyncStatus,
      });
      break;
    case "show":
      result = issues.getIssue({ dbPath, id: args.id });
      if (!result) throw new Error(`local issue not found: ${args.id}`);
      break;
    case "list":
      result = issues.listIssues({
        dbPath,
        status: args.status || null,
        workflowName: args.workflowName || null,
        targetPhase: args.targetPhase || null,
        parentId: args.parentId === undefined ? null : args.parentId,
        limit: args.limit || null,
      });
      break;
    case "event":
      result = issues.appendEvent({
        dbPath,
        issueId: args.id,
        eventType: args.type || args.eventType || "event",
        payload: jsonValue(args.payloadJson, {}),
        actor: args.actor || "local",
      });
      break;
    case "reflect":
      result = issues.appendReflection({
        dbPath,
        issueId: args.id,
        worked: args.worked || "",
        failed: args.failed || "",
        decision: args.decision || "",
        followUp: args.followUp || "",
        evidence: jsonValue(args.evidenceJson, []),
        syncNeeded: boolValue(args.syncNeeded),
      });
      break;
    case "evidence":
      result = issues.addEvidenceRef({
        dbPath,
        issueId: args.id,
        kind: args.kind || "evidence",
        command: args.command || "",
        path: args.path || "",
        digest: args.digest || "",
        exitCode: args.exitCode === undefined ? null : args.exitCode,
      });
      break;
    case "sync-queue":
      result = issues.enqueueSync({
        dbPath,
        issueId: args.id,
        syncKind: args.syncKind || "sync",
        target: args.target || "",
        payload: jsonValue(args.payloadJson, {}),
        plannedCommand: args.plannedCommand || "",
      });
      break;
    case "sync-queue-list":
      result = issues.listSyncOutbox({ dbPath, status: args.status || null });
      break;
    case "export-markdown":
      result = issues.exportMarkdownSummary({ dbPath });
      break;
    default:
      throw new Error(`unknown command: ${command}`);
  }

  print(result, asJson || command !== "export-markdown");
  return 0;
}

if (require.main === module) {
  installPipeErrorHandler();
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { installPipeErrorHandler, main, parseArgs };
