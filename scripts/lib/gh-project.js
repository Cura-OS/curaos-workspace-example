// scripts/lib/gh-project.js
// Canonical GitHub Projects v2 + Issues helpers for CuraOS PM automation.
// Plain Node (real fs/shell) - the durable substrate the gh-* workflow atomics call via Bash,
// and that scripts/seed-github-roadmap.js imports. ONE owner for these patterns (DRY).
//
// Research-grounded (ai/research/26-github-pm-orchestration.md):
//  - add-returns-existing-id idempotency        - read-before-write 3-way field reconcile
//  - aliased batched GraphQL mutations          - cached field/option ID map (+ next_global_id)
//  - native sub-issues + blocked_by deps (diff-first)
//  - content-creation token bucket (<=80/min, <=500/hr) + checkpoint
//
// All gh calls use `env -u GITHUB_TOKEN gh` (per curaos-gh-project-sync-env-workaround) - the narrow
// env token lacks project scope; the keyring auth has it.

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const roadmapJournal = require("./roadmap-journal.js"); // RP-57: field-change audit journal

const ORG = "your-org";
const PROJECT_TITLE = "CuraOS Roadmap";
const ROOT = path.resolve(__dirname, "..", "..");
const CACHE_DIR = path.join(ROOT, ".cache");
const FIELD_CACHE = path.join(CACHE_DIR, "project-fields.json");
const BUCKET_STATE = path.join(CACHE_DIR, "gh-content-bucket.json");

// ---- gh exec (strips GITHUB_TOKEN so the keyring/project-scoped auth is used) ----
// RP-12: standard 3-attempt/backoff retry (same shape as context-load/gh-issue-triage/
// milestone-active-scan ghJson). The mutation path was the only GH helper with ZERO retry, so one
// transient 502 discarded an entire wave pass. Only TRANSIENT failures (5xx/gateway/unicorn) retry;
// 404s and other client errors throw on the first attempt unchanged. Project field mutations are
// idempotent (set-value/clear-value/add-returns-existing), so a retried mutation is safe.
const GH_ATTEMPTS = 3;
function sleep(ms) {
  execFileSync("sleep", [String(ms / 1000)], { stdio: "ignore" });
}
function isTransientGithubFailure(text) {
  return /(?:\bhttp\s*5\d\d\b|\bstatus\s*5\d\d\b|\bnon-200\s+status\s+5\d\d\b|gateway timeout|bad gateway|service unavailable|github\s+service|github.*unicorn|unicorn.*github)/i.test(String(text || ""));
}
function gh(args, { json = false, attempts = GH_ATTEMPTS } = {}) {
  const env = { ...process.env };
  delete env.GITHUB_TOKEN;
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      // Fully piped stdio: execFileSync's default echoes the child's stderr to the parent, so
      // expected-failure probes (e.g. the sub-issues parent probe's "gh: No parent issue found
      // (HTTP 404)") leaked into wave logs and were misread as real failures. Captured streams
      // ride the thrown error (error.stderr/error.stdout) so isNotFound()/errorText() classify.
      const out = execFileSync("gh", args, {
        encoding: "utf8",
        env,
        maxBuffer: 64 * 1024 * 1024,
        stdio: ["pipe", "pipe", "pipe"],
      });
      return json ? JSON.parse(out) : out;
    } catch (error) {
      if (error && error.stderr != null) error.stderr = String(error.stderr);
      if (error && error.stdout != null) error.stdout = String(error.stdout);
      lastError = error;
      if (attempt < attempts && isTransientGithubFailure(errorText(error))) {
        sleep(500 * attempt);
        continue;
      }
      break;
    }
  }
  throw lastError;
}
function graphql(query, variables = {}) {
  const args = ["api", "graphql", "-f", `query=${query}`];
  for (const [k, v] of Object.entries(variables)) args.push("-F", `${k}=${v}`);
  return gh(args, { json: true });
}

// ---- gh error classification (structured payload first) ----
function errorText(error) {
  const parts = [];
  if (error && error.message) parts.push(error.message);
  if (error && error.stderr) parts.push(String(error.stderr));
  if (error && error.stdout) parts.push(String(error.stdout));
  if (error && Array.isArray(error.output)) parts.push(error.output.filter(Boolean).join("\n"));
  return parts.join("\n").trim() || String(error);
}

// `gh api` leaves the JSON error body on stdout ({"message":"No parent issue found","status":"404"})
// and the human line on stderr ("gh: No parent issue found (HTTP 404)"). Classify on the structured
// body first; when the body carries a status, that status alone decides (a 422 whose message merely
// contains "not found" is NOT a 404). The bare "HTTP 404" literal stays as the fallback for
// non-JSON gh failures.
const NOT_FOUND_MESSAGE = /(no parent issue found|not found)/i;
function isNotFound(error) {
  for (const stream of [error && error.stdout, error && error.stderr]) {
    if (!stream) continue;
    const text = String(stream);
    const start = text.indexOf("{");
    if (start === -1) continue;
    let body;
    try {
      body = JSON.parse(text.slice(start));
    } catch {
      continue;
    }
    if (!body || typeof body !== "object") continue;
    if (body.status !== undefined) {
      if (String(body.status) === "404") return true;
      continue;
    }
    if (typeof body.message === "string" && NOT_FOUND_MESSAGE.test(body.message)) return true;
  }
  return /\bHTTP 404\b/.test(errorText(error));
}

// ---- content-creation token bucket (<=80/min, <=500/hr); checkpointed to disk ----
// Only GUARDS content-creating ops (issue/sub-issue/dependency/project-item creation), per the
// GitHub secondary rate limit. Reads are unthrottled.
function loadBucket() {
  try { return JSON.parse(fs.readFileSync(BUCKET_STATE, "utf8")); } catch { return { events: [] }; }
}
function saveBucket(b) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(BUCKET_STATE, JSON.stringify(b));
}
// nowMs is injected (caller passes Date.now()) so this stays pure/testable.
function throttleContentOp(nowMs) {
  const b = loadBucket();
  b.events = b.events.filter((t) => nowMs - t < 3600_000); // keep last hour
  const lastMin = b.events.filter((t) => nowMs - t < 60_000).length;
  const lastHour = b.events.length;
  if (lastMin >= 80) return { allowed: false, reason: "minute-cap", waitMs: 60_000 - (nowMs - b.events.filter((t) => nowMs - t < 60_000)[0]) };
  if (lastHour >= 500) return { allowed: false, reason: "hour-cap", waitMs: 3600_000 - (nowMs - b.events[0]) };
  b.events.push(nowMs);
  saveBucket(b);
  return { allowed: true, lastMin: lastMin + 1, lastHour: lastHour + 1 };
}

// ---- project + cached field/option IDs (with next_global_id awareness) ----
// RP-36: process-scoped memo. The project number/title binding cannot change mid-run, but every
// consumer used to re-list projects per call (and per candidate in the sync path), so a wave paid
// the same `gh project list` dozens of times. {refresh:true} escapes the memo.
let _projectNumber;
function ensureProject({ refresh = false } = {}) {
  if (_projectNumber !== undefined && !refresh) return _projectNumber;
  const list = gh(["project", "list", "--owner", ORG, "--format", "json", "--limit", "100"], { json: true });
  const found = (list.projects || []).find((p) => p.title === PROJECT_TITLE);
  if (found) {
    _projectNumber = found.number;
    return _projectNumber;
  }
  const created = gh(["project", "create", "--owner", ORG, "--title", PROJECT_TITLE, "--format", "json"], { json: true });
  _projectNumber = created.number;
  return _projectNumber;
}

// RP-36: memoized `gh project view` (number + node id + title). Consumers that need projectId
// (addItem/reconcileFields) call this ONCE per process instead of one view per candidate.
let _projectInfo;
function projectInfo({ refresh = false } = {}) {
  if (_projectInfo && !refresh) return _projectInfo;
  const number = ensureProject({ refresh });
  const view = gh(["project", "view", String(number), "--owner", ORG, "--format", "json"], { json: true });
  if (!view || !view.id) throw new Error("projectInfo: project id unavailable from gh project view");
  _projectInfo = { number, id: view.id, title: view.title || PROJECT_TITLE };
  return _projectInfo;
}

function loadFieldCache() {
  try { return JSON.parse(fs.readFileSync(FIELD_CACHE, "utf8")); } catch { return null; }
}
// Discovery query builds field-id -> {id, options{name->id}} map; cached to disk, refreshed on miss.
function fieldMap(projectNumber, { refresh = false } = {}) {
  if (!refresh) {
    const cached = loadFieldCache();
    if (cached && cached.projectNumber === projectNumber) return cached.fields;
  }
  const raw = gh(["project", "field-list", String(projectNumber), "--owner", ORG, "--format", "json", "--limit", "100"], { json: true });
  const fields = {};
  for (const f of raw.fields || []) {
    fields[f.name] = { id: f.id, dataType: f.type, options: {} };
    for (const o of f.options || []) fields[f.name].options[o.name] = o.id;
  }
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(FIELD_CACHE, JSON.stringify({ projectNumber, fields }, null, 2));
  return fields;
}

// ---- RP-38: shared board snapshot with TTL ----
// ONE on-disk snapshot of the CuraOS Roadmap item list at .scratch/workflow-cache/
// roadmap-items.json, shared by every consumer (wave, triage gate, item sync, bash convergers)
// instead of each fetching its own item-list page set (and the wave writing a UNIQUE timestamped
// file per pass: the 46-orphaned-snapshots growth pattern). Within the TTL a read costs ZERO
// network calls. Any mutating sweep MUST call invalidateBoardSnapshot() (or rm the file) so the
// next read refetches. Bash writers may store a bare {items:[...]} without fetchedAtMs: freshness
// then falls back to file mtime.
const BOARD_SNAPSHOT = path.join(ROOT, ".scratch", "workflow-cache", "roadmap-items.json");
const BOARD_SNAPSHOT_TTL_MS = 15 * 60_000; // Longer local pickup window; explicit refresh still forces GitHub truth.
const BOARD_ITEM_LIMIT = 1000;

// Full --limit page = rows silently dropped past the cap; fail closed (RP-07 truncation class).
function fetchBoardItems(projectNumber, { ghFn = gh, limit = BOARD_ITEM_LIMIT } = {}) {
  const data = ghFn(["project", "item-list", String(projectNumber), "--owner", ORG, "--format", "json", "--limit", String(limit)], { json: true });
  const items = Array.isArray(data.items) ? data.items : [];
  if (items.length >= limit) {
    throw new Error(`boardSnapshot: project item-list filled the --limit ${limit} cap (${items.length} rows); refusing truncated snapshot`);
  }
  return items;
}

function loadBoardSnapshotFile(snapshotPath = BOARD_SNAPSHOT) {
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(snapshotPath, "utf8"));
  } catch {
    return null;
  }
  const items = Array.isArray(raw) ? raw : Array.isArray(raw.items) ? raw.items : null;
  if (!items) return null;
  let fetchedAtMs = Number(raw && raw.fetchedAtMs);
  if (!Number.isFinite(fetchedAtMs)) {
    try {
      fetchedAtMs = fs.statSync(snapshotPath).mtimeMs;
    } catch {
      return null;
    }
  }
  return { items, fetchedAtMs };
}

// boardSnapshot(): TTL-cached read. {refresh:true} forces a refetch (the spec's refresh()).
// projectNumber/ghFn/nowMs/snapshotPath injectable for tests; projectNumber defaults through
// ensureProject() ONLY on an actual fetch, so a TTL hit costs zero calls of any kind.
function boardSnapshot({ refresh = false, ttlMs = BOARD_SNAPSHOT_TTL_MS, nowMs = Date.now(), snapshotPath = BOARD_SNAPSHOT, projectNumber = null, ghFn = gh } = {}) {
  if (!refresh) {
    const cached = loadBoardSnapshotFile(snapshotPath);
    if (cached && nowMs - cached.fetchedAtMs < ttlMs) {
      return { items: cached.items, path: snapshotPath, fetchedAtMs: cached.fetchedAtMs, fromCache: true };
    }
  }
  const num = projectNumber === null || projectNumber === undefined ? ensureProject() : projectNumber;
  const items = fetchBoardItems(num, { ghFn });
  fs.mkdirSync(path.dirname(snapshotPath), { recursive: true });
  fs.writeFileSync(snapshotPath, JSON.stringify({ fetchedAtMs: nowMs, projectNumber: num, items }, null, 2));
  return { items, path: snapshotPath, fetchedAtMs: nowMs, fromCache: false };
}

// Mutating sweeps (item-edit/--apply paths) call this so the next read refetches.
function invalidateBoardSnapshot({ snapshotPath = BOARD_SNAPSHOT } = {}) {
  fs.rmSync(snapshotPath, { force: true });
}

// ---- idempotent project item add (add-returns-existing-id) ----
// addProjectV2ItemById returns the existing item id when the content is already on the project -
// so call unconditionally and read the returned id; no pre-list, no error-string catch.
function addItem(projectId, contentId) {
  const q = `mutation($p:ID!,$c:ID!){addProjectV2ItemById(input:{projectId:$p,contentId:$c}){item{id}}}`;
  const r = graphql(q, { p: projectId, c: contentId });
  return r.data.addProjectV2ItemById.item.id;
}

// ---- read-before-write 3-way field reconcile (write only deltas; clear empties) ----
// desired = {fieldName: value}. Reads current item field values, writes only changed, clears removed.
// RP-12: TRUE alias batching - every delta write for the item folds into ONE mutation document with
// `m0..mN` aliases (the :8 header claim made real). A 6-field stamp on 60 candidates is ~60 requests,
// not ~360. The delta-only read-diff-skip is unchanged: no-op fields never enter the document, and a
// reconcile with zero deltas issues zero requests. gql is injectable for tests (throttleContentOp
// nowMs pattern).

// RP-25: classify the GraphQL failure GitHub returns when a singleSelectOptionId is STALE.
// Option IDs regenerate on ANY field mutation (updateProjectV2Field regenerates ALL of them;
// observed live in 3+ sessions), so a cached .cache/project-fields.json can resolve a CURRENT
// option NAME to a DEAD option id. The failure surfaces as a GraphQL error mentioning the
// option (gh api graphql exits 1 with the message on stderr), never as an HTTP 404.
const OPTION_NOT_FOUND_PATTERN = /option[^\n]{0,80}?(does not exist|doesn't exist|does not belong|was not found|not found|is not valid|invalid)|invalid[^\n]{0,40}?single[ -]?select option/i;
function isOptionNotFound(error) {
  return OPTION_NOT_FOUND_PATTERN.test(errorText(error));
}

// Pure build step: resolves desired deltas against a field map into {writes, mutations}.
// Kept separate from the network wrapper so the RP-25 retry can re-resolve option ids against a
// REFRESHED map without duplicating the delta/skip/unmapped policy.
function buildFieldMutations(projectId, itemId, fields, desired, currentValues) {
  const writes = [];
  const mutations = [];
  for (const [name, value] of Object.entries(desired)) {
    const f = fields[name];
    if (!f) continue;
    const cur = currentValues[name];
    if (cur === value) continue; // no-op: skip (stay under points budget)
    const input = `projectId:${JSON.stringify(projectId)},itemId:${JSON.stringify(itemId)},fieldId:${JSON.stringify(f.id)}`;
    if (value === null || value === "") {
      mutations.push(`clearProjectV2ItemFieldValue(input:{${input}}){projectV2Item{id}}`);
      writes.push({ field: name, cleared: true });
    } else {
      const optId = f.options && f.options[value];
      // Single-select fields MUST resolve to a known option id. A `text:` write to a single-select is
      // rejected by GraphQL and SILENTLY drops the value - exactly the class of bug that let milestoned
      // issues land in the "No CuraOS Milestone" bucket. So for a single-select with an unknown option we
      // SKIP the write and record it as `unmapped` (loud in the returned writes[]) instead of attempting a
      // doomed text-write. The skip is per-FIELD so one bad value (e.g. effort: XL when the field only
      // offers S/M/L) never aborts the reconcile of the OTHER fields (e.g. the grouping CuraOS Milestone).
      const isSingleSelect = f.dataType === "ProjectV2SingleSelectField" || (f.options && Object.keys(f.options).length > 0);
      if (isSingleSelect && !optId) {
        writes.push({ field: name, unmapped: value, knownOptions: Object.keys(f.options || {}) });
        continue;
      }
      const valArg = optId ? `singleSelectOptionId:${JSON.stringify(optId)}` : `text:${JSON.stringify(value)}`;
      mutations.push(`updateProjectV2ItemFieldValue(input:{${input},value:{${valArg}}}){projectV2Item{id}}`);
      writes.push({ field: name, set: value });
    }
  }
  return { writes, mutations };
}

function mutationDocument(mutations) {
  return `mutation{${mutations.map((m, i) => `m${i}: ${m}`).join(" ")}}`;
}

// RP-57: journal each APPLIED field write as one roadmap-changes.ndjson line
// {item, field, old, new, actor, ts}. Only set/clear writes journal (an `unmapped` skip
// mutated nothing). Best-effort by design: the mutation already landed, so a journal append
// failure must never fail the reconcile; the append is local-fs-only and effectively
// infallible, while a throw here would turn a SUCCESSFUL write into a spurious wave error.
// journalOpts === false disables (tests / callers that journal at a higher level);
// otherwise it forwards {journalPath, actor, nowMs} to roadmap-journal.appendJournal.
function journalFieldWrites(itemId, writes, desired, currentValues, journalOpts) {
  if (journalOpts === false) return;
  try {
    const entries = [];
    for (const write of writes || []) {
      if (write.unmapped !== undefined) continue;
      entries.push({
        item: itemId,
        field: write.field,
        old: currentValues && currentValues[write.field] !== undefined ? currentValues[write.field] : null,
        new: write.cleared ? null : desired[write.field],
      });
    }
    if (entries.length) roadmapJournal.appendJournal(entries, journalOpts || {});
  } catch {
    // audit trail only; never fail a landed mutation
  }
}

// RP-25: single-select write resilience. On an option-not-found GraphQL failure the cached option
// ids are presumed stale: refresh the field map ONCE (fieldMap(projectNumber, {refresh:true})),
// re-resolve every delta against the refreshed map, and retry the aliased document ONCE. Field
// mutations are idempotent (set-value/clear-value), so re-sending deltas that may have applied
// before the failing alias is safe. Options that are STILL unknown after the refresh come back as
// loud `unmapped` writes (never a doomed text-write). Callers that cannot name the projectNumber
// keep the old throw-through behavior. gql + fieldMapFn injectable for tests.
function reconcileFields(projectId, itemId, fields, desired, currentValues, { gql = graphql, projectNumber = null, fieldMapFn = fieldMap, journal = {} } = {}) {
  const first = buildFieldMutations(projectId, itemId, fields, desired, currentValues);
  if (!first.mutations.length) return first.writes;
  try {
    gql(mutationDocument(first.mutations));
    journalFieldWrites(itemId, first.writes, desired, currentValues, journal); // RP-57
    return first.writes;
  } catch (error) {
    if (projectNumber === null || projectNumber === undefined || !isOptionNotFound(error)) throw error;
    const refreshed = fieldMapFn(projectNumber, { refresh: true });
    const retry = buildFieldMutations(projectId, itemId, refreshed, desired, currentValues);
    if (retry.mutations.length) {
      gql(mutationDocument(retry.mutations));
      journalFieldWrites(itemId, retry.writes, desired, currentValues, journal); // RP-57
    }
    return retry.writes.map((write) => ({ ...write, retriedAfterOptionRefresh: true }));
  }
}

// ---- batched issue hierarchy read (ONE aliased GraphQL query per <=50 issues) ----
// Replaces the per-child REST pair (parent probe + db-id read, 2 calls/child) in gh-subissue-wire:
// fetches parent {number repository{nameWithOwner}} + databaseId for all children in one document.
// Issue.parent/subIssues are schema-gated (older API surfaces lack them), so callers MUST gate on
// probeIssueHierarchyFields() and fall back to the classified REST path when unavailable.
const HIERARCHY_ALIAS_CHUNK = 50; // keep aliased documents comfortably under GraphQL node/size limits
const ISSUE_SCHEMA_PROBE_QUERY = `query{__type(name:"Issue"){fields{name}}}`;

function issueHierarchyFieldsAvailable(schema) {
  const fields = schema && schema.data && schema.data.__type && schema.data.__type.fields;
  if (!Array.isArray(fields)) return false;
  const names = new Set(fields.map((f) => f && f.name));
  return names.has("parent") && names.has("subIssues");
}

let _hierarchyFieldsAvailable;
// Per-process cache (schema availability cannot change mid-run); probe failure degrades to the
// REST fallback path instead of throwing.
function probeIssueHierarchyFields({ refresh = false, gql = graphql } = {}) {
  if (_hierarchyFieldsAvailable === undefined || refresh) {
    try {
      _hierarchyFieldsAvailable = issueHierarchyFieldsAvailable(gql(ISSUE_SCHEMA_PROBE_QUERY));
    } catch {
      _hierarchyFieldsAvailable = false;
    }
  }
  return _hierarchyFieldsAvailable;
}

// issues: [{repo: "owner/name", number}]. Returns Map "owner/name#number" -> {databaseId, parent}
// where parent is {repo, number} or null (root issue). gql is injectable for tests (same pattern
// as the injected nowMs in throttleContentOp).
function issueHierarchy(issues, { chunkSize = HIERARCHY_ALIAS_CHUNK, gql = graphql } = {}) {
  const out = new Map();
  for (let i = 0; i < issues.length; i += chunkSize) {
    const chunk = issues.slice(i, i + chunkSize);
    const doc = chunk
      .map((issue, idx) => {
        const [owner, name] = String(issue.repo).split("/");
        return `i${idx}: repository(owner:${JSON.stringify(owner)},name:${JSON.stringify(name)}){issue(number:${Number(issue.number)}){databaseId parent{number repository{nameWithOwner}}}}`;
      })
      .join(" ");
    const res = gql(`query{${doc}}`);
    chunk.forEach((issue, idx) => {
      const node = res && res.data && res.data[`i${idx}`] ? res.data[`i${idx}`].issue : null;
      if (!node || !Number.isFinite(Number(node.databaseId))) {
        throw new Error(`issueHierarchy: could not resolve ${issue.repo}#${issue.number}`);
      }
      const parent = node.parent && node.parent.repository
        ? { repo: node.parent.repository.nameWithOwner, number: Number(node.parent.number) }
        : null;
      out.set(`${issue.repo}#${issue.number}`, { databaseId: Number(node.databaseId), parent });
    });
  }
  return out;
}

// ---- RP-36: aliased batched issue READ layer (ONE GraphQL document per <=100 issues) ----
// The triage/sync/wire pipelines used to issue 1-3 reads PER issue (issue view + parent probe +
// mandated agent re-read), ~300 calls for a 100-issue wave read. One aliased document carrying
// 100 `repository(...){issue(number:N){...}}` nodes returns id/body/state/labels (+ parent/
// subIssues when the schema offers them) for the whole set: a 100-issue read costs 2 GraphQL
// calls total (schema probe + 1 aliased document). Verified against the committed baseline by
// scripts/gh-call-ledger (GRILL-011).
const ISSUE_BATCH_CHUNK = 100; // spec window is 50-100 aliases/document; 100 keeps a wave read at 1 document
const ISSUE_BATCH_CORE_FIELDS = "id databaseId number state title body labels(first:100){nodes{name}}";
const ISSUE_BATCH_HIERARCHY_FIELDS = " parent{number repository{nameWithOwner}} subIssues(first:100){nodes{number repository{nameWithOwner}}}";

// issues: [{repo:"owner/name", number}]. Returns Map "owner/name#number" ->
// {id, databaseId, number, state, title, body, labels[], parent, subIssues}. parent/subIssues are
// present only when the schema carries Issue.parent/Issue.subIssues (probe-gated, same contract
// as issueHierarchy); pass includeHierarchy:false to skip the probe entirely. Unresolved issues
// throw (never silently dropped). gql injectable for tests.
function batchIssueRead(issues, { chunkSize = ISSUE_BATCH_CHUNK, gql = graphql, includeHierarchy } = {}) {
  const withHierarchy = includeHierarchy === undefined ? probeIssueHierarchyFields({ gql }) : !!includeHierarchy;
  const out = new Map();
  for (let i = 0; i < issues.length; i += chunkSize) {
    const chunk = issues.slice(i, i + chunkSize);
    const doc = chunk
      .map((issue, idx) => {
        const [owner, name] = String(issue.repo).split("/");
        return `i${idx}: repository(owner:${JSON.stringify(owner)},name:${JSON.stringify(name)}){issue(number:${Number(issue.number)}){${ISSUE_BATCH_CORE_FIELDS}${withHierarchy ? ISSUE_BATCH_HIERARCHY_FIELDS : ""}}}`;
      })
      .join(" ");
    const res = gql(`query{${doc}}`);
    chunk.forEach((issue, idx) => {
      const node = res && res.data && res.data[`i${idx}`] ? res.data[`i${idx}`].issue : null;
      if (!node || !Number.isFinite(Number(node.databaseId))) {
        throw new Error(`batchIssueRead: could not resolve ${issue.repo}#${issue.number}`);
      }
      const labels = node.labels && Array.isArray(node.labels.nodes)
        ? node.labels.nodes.map((n) => n && n.name).filter(Boolean)
        : [];
      const record = {
        id: node.id,
        databaseId: Number(node.databaseId),
        number: Number(node.number),
        state: node.state,
        title: node.title,
        body: node.body == null ? "" : String(node.body),
        labels,
      };
      if (withHierarchy) {
        record.parent = node.parent && node.parent.repository
          ? { repo: node.parent.repository.nameWithOwner, number: Number(node.parent.number) }
          : null;
        record.subIssues = node.subIssues && Array.isArray(node.subIssues.nodes)
          ? node.subIssues.nodes
              .filter((n) => n && n.repository)
              .map((n) => ({ repo: n.repository.nameWithOwner, number: Number(n.number) }))
          : [];
      }
      out.set(`${issue.repo}#${issue.number}`, record);
    });
  }
  return out;
}

// ---- native sub-issues + dependencies (diff-first: add missing, leave existing) ----
function listSubIssues(repo, issueNumber) {
  try {
    return gh(["api", "--paginate", `repos/${repo}/issues/${issueNumber}/sub_issues`], { json: true });
  } catch { return []; }
}
function addSubIssue(repo, parentNumber, childDbId, nowMs) {
  const t = throttleContentOp(nowMs);
  if (!t.allowed) throw new Error(`content rate cap (${t.reason}); retry in ${Math.ceil(t.waitMs / 1000)}s`);
  return gh(["api", "-X", "POST", `repos/${repo}/issues/${parentNumber}/sub_issues`, "-F", `sub_issue_id=${childDbId}`], { json: true });
}
function removeSubIssue(repo, parentNumber, childDbId, nowMs) {
  const t = throttleContentOp(nowMs);
  if (!t.allowed) throw new Error(`content rate cap (${t.reason}); retry in ${Math.ceil(t.waitMs / 1000)}s`);
  return gh(["api", "-X", "DELETE", `repos/${repo}/issues/${parentNumber}/sub_issue`, "-F", `sub_issue_id=${childDbId}`], { json: true });
}
function addBlockedBy(repo, issueNumber, blockingIssueDbId, nowMs) {
  const t = throttleContentOp(nowMs);
  if (!t.allowed) throw new Error(`content rate cap (${t.reason}); retry in ${Math.ceil(t.waitMs / 1000)}s`);
  return gh(["api", "-X", "POST", `repos/${repo}/issues/${issueNumber}/dependencies/blocked_by`, "-F", `issue_id=${blockingIssueDbId}`], { json: true });
}

module.exports = {
  ORG, PROJECT_TITLE, ROOT,
  gh, graphql,
  GH_ATTEMPTS, isTransientGithubFailure,
  errorText, isNotFound, isOptionNotFound,
  throttleContentOp,
  ensureProject, projectInfo, fieldMap, loadFieldCache,
  BOARD_SNAPSHOT, BOARD_SNAPSHOT_TTL_MS, BOARD_ITEM_LIMIT,
  boardSnapshot, invalidateBoardSnapshot, loadBoardSnapshotFile, fetchBoardItems,
  addItem, reconcileFields, buildFieldMutations,
  HIERARCHY_ALIAS_CHUNK, ISSUE_SCHEMA_PROBE_QUERY, ISSUE_BATCH_CHUNK,
  issueHierarchyFieldsAvailable, probeIssueHierarchyFields, issueHierarchy, batchIssueRead,
  listSubIssues, addSubIssue, removeSubIssue, addBlockedBy,
};
