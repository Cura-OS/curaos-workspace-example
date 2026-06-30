// gh-project-sync - idempotently add an issue to CuraOS Roadmap + reconcile fields. Calls scripts/lib/gh-project.js.
// Contract: docs/agents/workflows/gh-project-sync.md
//
// Dual-runtime shape (workflow-defect #508): `export const meta` MUST be the FIRST statement so Claude's
// native Workflow() tool loads it. node:child_process is reached only through the lazy execFileSync wrapper
// below (call-time, never module top level); the kit runs this file via process-bearing import() because it
// exports a default function.
export const meta = {
  name: "gh-project-sync",
  description: "Idempotent project item add + 3-way field reconcile for one issue",
  phases: [{ title: "Sync", detail: "addItem (returns existing id) + reconcileFields deltas" }],
};

// Lazy node:child_process accessor: resolves `process` only at call time so module load stays meta-first
// and the Claude Workflow() tool (no process/require) can parse the file.
let _execFileSync;
function execFileSync(...callArgs) {
  if (!_execFileSync) _execFileSync = process.getBuiltinModule("node:child_process").execFileSync;
  return _execFileSync(...callArgs);
}

const CONTRACT = {
  name: "gh-project-sync",
  kind: "atomic",
  version: "0.1.0",
  inputs: {
    issue: { type: "string", required: true, description: "owner/repo#N to add + sync onto the CuraOS Roadmap project" },
    fields: { type: "string", required: false, description: "JSON object of desired field values keyed by field name (Target Version/Priority/CuraOS Milestone/etc.)" },
    project_items_cache: { type: "string", required: false, description: "optional path to a cached gh project item-list JSON payload created once by a composite gate/wave to avoid per-candidate full Project scans" },
    dry_run: { type: "boolean", required: false, description: "report planned add/field-writes without executing" },
  },
  outputs: {
    item_id: { type: "string", description: "the project item id (existing or newly added)" },
    field_writes: { type: "array", description: "the field deltas written (empty if already in sync)" },
    added: { type: "boolean", description: "true if the item was newly added (false if it already existed)" },
    milestone: { type: "string", description: "confirmed CuraOS Milestone after reconcile: existing in-sync board value or successful set write; NONE if unset/unmapped/skipped. Metadata only, not a dispatch gate." },
    blocked_by_external: { type: "boolean", description: "true only when GitHub ProjectV2 quota/transient failure blocks sync; callers must stop dispatch and retry later" },
    error_kind: { type: "string", description: "external failure classifier when blocked_by_external=true" },
  },
  guarantees: { idempotent: true, determinism: "control-flow-only", side_effects: "github" },
  verification: "T1",
  models: { sync: "haiku" },
  composes: [],
};

function parseArgs(a) {
  if (a && typeof a === "object") return a;
  if (typeof a === "string" && a.trim()) { try { return JSON.parse(a); } catch { return {}; } }
  return {};
}

function errorText(error) {
  const parts = [];
  if (error && error.message) parts.push(error.message);
  if (error && error.stderr) parts.push(String(error.stderr));
  if (error && Array.isArray(error.output)) parts.push(error.output.filter(Boolean).join("\n"));
  return parts.join("\n").trim() || String(error);
}

function externalFailureKind(message) {
  if (/unknown owner type/i.test(message)) {
    return "github-graphql-quota";
  }
  if (/(?:graphql|api).*(?:rate limit|quota)|(?:rate limit|quota).*(?:graphql|api)/i.test(message)) {
    return "github-graphql-quota";
  }
  if (/github-project-api-transient|\bhttp\s*5\d\d\b|\bstatus\s*5\d\d\b|\bnon-200\s+status\s+5\d\d\b|gateway timeout|bad gateway|service unavailable|github\s+service|github.*unicorn|unicorn.*github/i.test(message)) {
    return "github-project-api-transient";
  }
  return "";
}

export default async function workflow({ args, phase }) {
  phase("Sync");
  const cfg = parseArgs(args);
  if (!cfg.issue) throw new Error("gh-project-sync: args.issue (owner/repo#N) is required");
  try {
    const out = execFileSync("node", ["scripts/roadmap-project-item-sync.js", JSON.stringify(cfg)], {
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
    });
    return JSON.parse(out);
  } catch (error) {
    const message = errorText(error);
    const kind = externalFailureKind(message);
    if (kind) {
      return {
        item_id: "",
        field_writes: [],
        added: false,
        milestone: "NONE",
        blocked_by_external: true,
        error_kind: kind,
        error: message,
      };
    }
    throw error;
  }
}
