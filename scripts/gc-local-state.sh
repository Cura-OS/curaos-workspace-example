#!/usr/bin/env bash
# gc-local-state.sh: retention GC for workspace-local, git-ignored state (RP-75).
# Policy: docs/agents/local-state-retention.md
#
# DEFAULT IS DRY-RUN: lists candidates and exits without touching anything.
# --apply is DESTRUCTIVE and requires same-turn user confirmation per AGENTS.md
# section 11; the candidate listing printed before any action is the required
# dry-run evidence.
#
# Fail-closed gates, in order, all BEFORE any deletion:
#   1. gitleaks leg over .agent-workflow-kit/runs + .scratch (exit 3 on findings,
#      scanner error, or missing scanner in apply mode).
#   2. RP-27 evidence guard (scripts/lib/gc-evidence-guard.js, consumed via
#      gcBlockers): VERDICT: files in .scratch, unreadable .scratch candidates,
#      and non-worktree dirs under .worktrees/ exit 2 without deleting.
#   3. Open-issue reference check for legacy .scratch files: unavailable check
#      in apply mode exits 4 without deleting.
set -uo pipefail

TAB="$(printf '\t')"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB_DIR="$SCRIPT_DIR/lib"

APPLY=0
ROOT_ARG=""
KEEP_RUNS=50
RUN_TTL_DAYS=7
CACHE_TTL_DAYS=7
STATE_TTL_DAYS=30
LEGACY_TTL_DAYS=7
KEEP_SNAPSHOTS=3

die() { local code="$1"; shift; printf 'gc-local-state: ERROR: %s\n' "$*" >&2; exit "$code"; }
log() { printf 'gc-local-state: %s\n' "$*"; }

usage() {
  cat <<'EOF'
Usage: gc-local-state.sh [--apply] [--root DIR] [--keep-runs N] [--run-ttl-days N]
                         [--cache-ttl-days N] [--state-ttl-days N] [--legacy-ttl-days N]
                         [--keep-snapshots N]
Default is DRY-RUN (no deletion). --apply is destructive and requires same-turn
user confirmation per AGENTS.md section 11. Policy: docs/agents/local-state-retention.md
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --apply) APPLY=1; shift ;;
    --root) [ $# -ge 2 ] || die 5 "--root needs a value"; ROOT_ARG="$2"; shift 2 ;;
    --keep-runs) [ $# -ge 2 ] || die 5 "--keep-runs needs a value"; KEEP_RUNS="$2"; shift 2 ;;
    --run-ttl-days) [ $# -ge 2 ] || die 5 "--run-ttl-days needs a value"; RUN_TTL_DAYS="$2"; shift 2 ;;
    --cache-ttl-days) [ $# -ge 2 ] || die 5 "--cache-ttl-days needs a value"; CACHE_TTL_DAYS="$2"; shift 2 ;;
    --state-ttl-days) [ $# -ge 2 ] || die 5 "--state-ttl-days needs a value"; STATE_TTL_DAYS="$2"; shift 2 ;;
    --legacy-ttl-days) [ $# -ge 2 ] || die 5 "--legacy-ttl-days needs a value"; LEGACY_TTL_DAYS="$2"; shift 2 ;;
    --keep-snapshots) [ $# -ge 2 ] || die 5 "--keep-snapshots needs a value"; KEEP_SNAPSHOTS="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) usage >&2; die 5 "unknown argument: $1" ;;
  esac
done

command -v bun >/dev/null 2>&1 || die 5 "bun is required (curaos_bun_primary_rule)"
[ -f "$LIB_DIR/gc-evidence-guard.js" ] || die 5 "missing $LIB_DIR/gc-evidence-guard.js (RP-27 guard)"
[ -f "$LIB_DIR/workspace-root.js" ] || die 5 "missing $LIB_DIR/workspace-root.js (RP-27 resolver)"
[ -f "$LIB_DIR/snapshot-rotation.js" ] || die 5 "missing $LIB_DIR/snapshot-rotation.js (RP-71 rotation)"

# --- Root resolution (RP-27: absolute workspace root, never the caller cwd) ---
resolve_root_js='const { resolveWorkspaceRoot } = require(process.env.GC_LIB_DIR + "/workspace-root.js");
console.log(resolveWorkspaceRoot(process.env, process.cwd()));'
if [ -n "$ROOT_ARG" ]; then
  RESOLVED="$(WORKSPACE_ROOT="$ROOT_ARG" GC_LIB_DIR="$LIB_DIR" bun -e "$resolve_root_js")" || die 5 "root resolution failed"
  REQ_REAL="$(cd "$ROOT_ARG" 2>/dev/null && pwd -P)" || die 5 "--root not a directory: $ROOT_ARG"
  RES_REAL="$(cd "$RESOLVED" 2>/dev/null && pwd -P)" || die 5 "resolved root not a directory: $RESOLVED"
  [ "$REQ_REAL" = "$RES_REAL" ] || die 5 "--root failed workspace-marker validation (AGENTS.md + ai/ required): $ROOT_ARG"
  ROOT="$RES_REAL"
else
  RESOLVED="$(GC_LIB_DIR="$LIB_DIR" bun -e "$resolve_root_js")" || die 5 "root resolution failed"
  ROOT="$(cd "$RESOLVED" 2>/dev/null && pwd -P)" || die 5 "resolved root not a directory: $RESOLVED"
fi

MODE="DRY-RUN"
[ "$APPLY" -eq 1 ] && MODE="APPLY"
log "mode=$MODE root=$ROOT keep-runs=$KEEP_RUNS run-ttl=${RUN_TTL_DAYS}d cache-ttl=${CACHE_TTL_DAYS}d state-ttl=${STATE_TTL_DAYS}d legacy-ttl=${LEGACY_TTL_DAYS}d keep-snapshots=$KEEP_SNAPSHOTS"

# --- Gate 1: gitleaks leg (the one place a token dump would silently persist) ---
GITLEAKS_BIN="${GC_GITLEAKS_BIN:-gitleaks}"
GITLEAKS_AVAILABLE=1
command -v "$GITLEAKS_BIN" >/dev/null 2>&1 || GITLEAKS_AVAILABLE=0
if [ "$GITLEAKS_AVAILABLE" -eq 0 ]; then
  if [ "$APPLY" -eq 1 ]; then
    die 3 "gitleaks not found ($GITLEAKS_BIN); apply mode fails closed without the secret scan"
  fi
  log "WARN: gitleaks not found ($GITLEAKS_BIN); dry-run continues, apply would fail closed (exit 3)"
else
  for d in "$ROOT/.agent-workflow-kit/runs" "$ROOT/.scratch"; do
    [ -d "$d" ] || continue
    log "gitleaks: scanning $d"
    if ! "$GITLEAKS_BIN" detect --no-git --redact --source "$d"; then
      die 3 "gitleaks reported findings (or failed) in $d; resolve the leak before any GC"
    fi
  done
fi

# --- Plan computation (RP-27 guard + retention candidates), via embedded bun helper ---
PLAN_JS="$(mktemp -t gc-local-state-plan.XXXXXX.js)" || die 5 "mktemp failed"
trap 'rm -f "$PLAN_JS"' EXIT
cat > "$PLAN_JS" <<'EOF'
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const root = fs.realpathSync(process.argv[2]);
const libDir = process.argv[3];
const { gcBlockers } = require(path.join(libDir, "gc-evidence-guard.js"));
const now = Date.now();
const DAY = 86400000;
const num = (name, dflt) => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v >= 0 ? v : dflt;
};
const keepRuns = num("GC_KEEP_RUNS", 50);
const runTtl = num("GC_RUN_TTL_DAYS", 7);
const cacheTtl = num("GC_CACHE_TTL_DAYS", 7);
const stateTtl = num("GC_STATE_TTL_DAYS", 30);
const legacyTtl = num("GC_LEGACY_TTL_DAYS", 7);
const out = [];
const emit = (...cols) => out.push(cols.join("\t"));
const ageDays = (st) => (now - st.mtimeMs) / DAY;
const statOrNull = (p) => { try { return fs.statSync(p); } catch { return null; } };

function walkFiles(dir) {
  const files = [];
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    let entries = [];
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (e.isFile()) files.push(p); // symlinks skipped: never follow, never delete
    }
  }
  return files;
}

// RP-27 evidence guard inputs: ALL .scratch files (presence-based, not candidacy-based;
// verdict evidence anywhere in .scratch must be promoted before any GC can run).
const scratchDir = path.join(root, ".scratch");
const scratchFiles = fs.existsSync(scratchDir) ? walkFiles(scratchDir) : [];
const guardCandidates = scratchFiles.map((p) => {
  let content = null;
  try { content = fs.readFileSync(p, "utf8"); } catch {}
  return { path: p, content };
});

const wtRoot = path.join(root, ".worktrees");
let wtEntries = [];
if (fs.existsSync(wtRoot)) {
  try {
    wtEntries = fs.readdirSync(wtRoot, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch { wtEntries = []; }
}
// Registered worktrees from every level we manage worktrees at (workspace root + curaos
// submodule). Any listing failure, or no repo found at all, yields null so the guard
// blocks every entry (registry-unavailable) instead of treating them as strays.
let registered = null;
try {
  const lines = [];
  let sawRepo = false;
  for (const repo of [root, path.join(root, "curaos")]) {
    if (!fs.existsSync(path.join(repo, ".git"))) continue;
    sawRepo = true;
    const o = execFileSync("git", ["worktree", "list", "--porcelain"], {
      cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
    });
    for (const line of o.split("\n")) {
      if (!line.startsWith("worktree ")) continue;
      const p = line.slice("worktree ".length).trim();
      try { lines.push(fs.realpathSync(p)); } catch { lines.push(p); }
    }
  }
  if (sawRepo) registered = lines;
} catch { registered = null; }

const blockers = gcBlockers({
  scratchCandidates: guardCandidates,
  worktreesRoot: wtRoot,
  worktreeEntries: wtEntries,
  registeredWorktrees: registered,
});
for (const b of blockers) emit("BLOCKER", b.path, b.reason);

// --- .agent-workflow-kit/runs retention: keep newest N OR younger than TTL ---
const runsDir = path.join(root, ".agent-workflow-kit", "runs");
const archiveRoot = path.join(root, ".agent-workflow-kit", "runs-archive");
let runDirs = [];
if (fs.existsSync(runsDir)) {
  runDirs = fs.readdirSync(runsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => {
      const p = path.join(runsDir, e.name);
      return { name: e.name, path: p, st: statOrNull(p) };
    })
    .filter((r) => r.st);
  runDirs.sort((a, b) => b.st.mtimeMs - a.st.mtimeMs);
}
let runsKept = 0;
let runsDeleted = 0;
runDirs.forEach((r, i) => {
  if (i < keepRuns || ageDays(r.st) <= runTtl) { runsKept += 1; return; }
  // Fail closed on status: unreadable or unparsable run.json counts as failed (archive it).
  let failed = true;
  try {
    const rj = JSON.parse(fs.readFileSync(path.join(r.path, "run.json"), "utf8"));
    failed = rj.status !== "completed";
  } catch {}
  if (failed) {
    for (const f of ["run.json", "events.jsonl"]) {
      const src = path.join(r.path, f);
      if (fs.existsSync(src)) emit("RUN-ARCHIVE", src, path.join(archiveRoot, r.name));
    }
  }
  emit("RUN-DELETE", r.path, failed ? "failed=yes" : "failed=no");
  runsDeleted += 1;
});
emit("SUMMARY-RUNS", `total=${runDirs.length}`, `keep=${runsKept}`, `delete=${runsDeleted}`);

// --- .scratch retention by class ---
let issueText = null;
let issueCheck = "unavailable";
if (process.env.GC_OPEN_ISSUES_FILE !== undefined) {
  try {
    issueText = fs.readFileSync(process.env.GC_OPEN_ISSUES_FILE, "utf8");
    issueCheck = "ok";
  } catch { issueText = null; }
} else {
  const repo = process.env.GC_ISSUE_REPO || "your-org/curaos-ai-workspace";
  try {
    issueText = execFileSync("gh", [
      "issue", "list", "-R", repo, "--state", "open",
      "--json", "number,title,body", "--limit", "1000",
    ], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    issueCheck = "ok";
  } catch { issueText = null; }
}
emit("ISSUE-CHECK", issueCheck);

// --- RP-71: snapshot family rotation (count-based: keep newest N, never the fixed names) ---
// Families are the stores RP-71 names (registry in scripts/lib/snapshot-rotation.js). These
// are typed regenerable snapshot caches, so rotation is governed by count, not the legacy TTL
// + issue-check class; an open-issue reference still keeps a member when the check succeeded.
const rot = require(path.join(libDir, "snapshot-rotation.js"));
const keepSnapshots = num("GC_KEEP_SNAPSHOTS", 3);
const snapshotGoverned = new Set();
for (const fam of rot.GC_SNAPSHOT_FAMILIES) {
  const famDir = path.join(root, fam.dir);
  const members = rot.familyFiles(famDir, fam.base);
  if (members.length === 0 && !rot.fixedNames(fam.base).some((n) => fs.existsSync(path.join(famDir, n)))) continue;
  let referencedNames = null;
  if (issueCheck === "ok") {
    referencedNames = new Set(members.filter((m) => issueText.includes(m.name)).map((m) => m.name));
  }
  const plan = rot.planFamilyRotation({ dir: famDir, base: fam.base, keep: keepSnapshots, referencedNames });
  for (const n of rot.fixedNames(fam.base)) {
    const fp = path.join(famDir, n);
    if (fs.existsSync(fp)) {
      snapshotGoverned.add(fp);
      emit("SNAPSHOT-PROTECTED", fp, "fixed-name");
    }
  }
  for (const k of plan.keep) {
    snapshotGoverned.add(k.path);
    if (k.reason) emit("SNAPSHOT-KEEP", k.path, k.reason);
  }
  for (const r of plan.remove) {
    snapshotGoverned.add(r.path);
    emit("SNAPSHOT-DELETE", r.path, `family=${fam.base}`, String(r.size));
  }
  emit(
    "SUMMARY-SNAPSHOTS",
    `family=${fam.base}`,
    `dir=${famDir}`,
    `before_files=${plan.before.files}`, `before_bytes=${plan.before.bytes}`,
    `delete=${plan.remove.length}`,
    `after_files=${plan.after.files}`, `after_bytes=${plan.after.bytes}`
  );
}

for (const p of scratchFiles) {
  // RP-71 family members (incl. fixed names) are rotation-governed, not TTL-governed.
  if (snapshotGoverned.has(p)) continue;
  const relParts = path.relative(scratchDir, p).split(path.sep);
  const top = relParts.length > 1 ? relParts[0] : "";
  const st = statOrNull(p);
  if (!st) continue;
  const age = ageDays(st);
  if (top === "evidence") {
    // Promotion-only: never deleted; old files surface as promotion-pending.
    if (age > legacyTtl) emit("EVIDENCE-PENDING", p, age.toFixed(1));
    continue;
  }
  if (top === "integration-queue") {
    // Cross-lane handoff state; lifecycle owned by the wave, never by TTL.
    emit("PROTECTED", p, "integration-queue");
    continue;
  }
  let cls = "legacy";
  let ttl = legacyTtl;
  if (top === "cache") { cls = "cache"; ttl = cacheTtl; }
  else if (top === "state") { cls = "state"; ttl = stateTtl; }
  if (age <= ttl) continue;
  if (issueCheck === "ok" && issueText.includes(path.basename(p))) {
    emit("SCRATCH-KEEP", p, "referenced-by-open-issue");
    continue;
  }
  if (cls === "legacy" && issueCheck !== "ok") {
    // Untyped files carry the strictest gate: no reference check, no deletion.
    emit("SCRATCH-BLOCKED", p, "legacy-no-issue-check");
    continue;
  }
  emit("SCRATCH-DELETE", p, cls, age.toFixed(1));
}

// --- .codegraph WAL sizes (checkpoint decision happens in the shell wrapper) ---
const cgDir = path.join(root, ".codegraph");
if (fs.existsSync(cgDir)) {
  let entries = [];
  try { entries = fs.readdirSync(cgDir); } catch { entries = []; }
  for (const e of entries) {
    if (!e.endsWith(".db")) continue;
    const dbp = path.join(cgDir, e);
    const dbSt = statOrNull(dbp);
    const walSt = statOrNull(`${dbp}-wal`);
    emit("CODEGRAPH", dbp, String(dbSt ? dbSt.size : 0), String(walSt ? walSt.size : 0));
  }
}
console.log(out.join("\n"));
EOF

PLAN="$(GC_KEEP_RUNS="$KEEP_RUNS" GC_RUN_TTL_DAYS="$RUN_TTL_DAYS" GC_CACHE_TTL_DAYS="$CACHE_TTL_DAYS" \
  GC_STATE_TTL_DAYS="$STATE_TTL_DAYS" GC_LEGACY_TTL_DAYS="$LEGACY_TTL_DAYS" GC_KEEP_SNAPSHOTS="$KEEP_SNAPSHOTS" \
  bun "$PLAN_JS" "$ROOT" "$LIB_DIR")" || die 5 "plan computation failed"

count_tag() { printf '%s\n' "$PLAN" | grep -c "^${1}${TAB}" || true; }

# The full plan IS the dry-run evidence listing; print it before anything acts.
log "---- candidate listing (evidence) ----"
printf '%s\n' "$PLAN"
log "---- end candidate listing ----"

# --- Gate 2: RP-27 evidence guard (fail closed, both modes) ---
BLOCKER_COUNT="$(count_tag BLOCKER)"
if [ "${BLOCKER_COUNT:-0}" -gt 0 ]; then
  die 2 "$BLOCKER_COUNT evidence blocker(s) present (see BLOCKER lines above); promote or disposition them first, nothing was deleted"
fi

# --- Gate 3: open-issue reference check (apply fails closed on legacy candidates) ---
SCRATCH_BLOCKED_COUNT="$(count_tag SCRATCH-BLOCKED)"
if [ "${SCRATCH_BLOCKED_COUNT:-0}" -gt 0 ]; then
  if [ "$APPLY" -eq 1 ]; then
    die 4 "$SCRATCH_BLOCKED_COUNT legacy .scratch candidate(s) blocked: open-issue reference check unavailable; nothing was deleted"
  fi
  log "WARN: $SCRATCH_BLOCKED_COUNT legacy .scratch candidate(s) would be blocked in apply mode (issue check unavailable)"
fi

assert_under_root() {
  case "$1" in
    "$ROOT"/*) ;;
    *) die 5 "refusing to act outside root: $1" ;;
  esac
}

RUN_DELETE_COUNT="$(count_tag RUN-DELETE)"
SCRATCH_DELETE_COUNT="$(count_tag SCRATCH-DELETE)"
SNAPSHOT_DELETE_COUNT="$(count_tag SNAPSHOT-DELETE)"

if [ "$APPLY" -eq 1 ]; then
  log "APPLY: destructive actions begin (same-turn user confirmation required per AGENTS.md section 11; listing above is the evidence)"
  # Archive lines precede their run's delete line in plan order; sequential apply preserves it.
  while IFS="$TAB" read -r tag f1 f2 f3; do
    case "$tag" in
      RUN-ARCHIVE)
        [ -f "$f1" ] || continue
        mkdir -p "$f2" || die 5 "archive mkdir failed: $f2"
        cp "$f1" "$f2/" || die 5 "archive copy failed: $f1 -> $f2"
        log "archived $f1 -> $f2/"
        ;;
      RUN-DELETE)
        assert_under_root "$f1"
        rm -rf -- "$f1"
        log "deleted run $f1 ($f2)"
        ;;
      SCRATCH-DELETE)
        assert_under_root "$f1"
        rm -f -- "$f1"
        log "deleted scratch $f1 (class=$f2 age=${f3}d)"
        ;;
      SNAPSHOT-DELETE)
        assert_under_root "$f1"
        rm -f -- "$f1"
        log "deleted snapshot $f1 ($f2 bytes=$f3)"
        ;;
    esac
  done <<EOF
$PLAN
EOF
  # RP-71: immediate measured ledger after the cleanup (the SUMMARY-SNAPSHOTS lines above are
  # the before/projected-after side; these lines are the measured-after evidence).
  GC_ROOT="$ROOT" GC_LIB_DIR="$LIB_DIR" bun -e '
const path = require("node:path");
const rot = require(path.join(process.env.GC_LIB_DIR, "snapshot-rotation.js"));
for (const fam of rot.GC_SNAPSHOT_FAMILIES) {
  const dir = path.join(process.env.GC_ROOT, fam.dir);
  const led = rot.familyLedger(dir, fam.base);
  console.log(`gc-local-state: snapshot-after family=${fam.base} dir=${dir} files=${led.files} bytes=${led.bytes} rotations=${led.rotations}`);
}' || log "WARN: post-apply snapshot ledger failed"
else
  log "DRY-RUN: would delete $RUN_DELETE_COUNT run dir(s) + $SCRATCH_DELETE_COUNT scratch file(s) + $SNAPSHOT_DELETE_COUNT snapshot rotation(s); nothing was deleted"
fi

# --- .codegraph WAL checkpoint (apply) / size report (dry-run) ---
while IFS="$TAB" read -r tag dbp dbB walB; do
  [ "$tag" = "CODEGRAPH" ] || continue
  if [ "${walB:-0}" -gt 0 ] 2>/dev/null; then
    if ! command -v sqlite3 >/dev/null 2>&1; then
      log "codegraph: sqlite3 unavailable; skipping checkpoint for $dbp (db=${dbB} wal=${walB} bytes)"
    elif [ "$APPLY" -eq 1 ]; then
      if sqlite3 "$dbp" "PRAGMA wal_checkpoint(TRUNCATE);" >/dev/null 2>&1; then
        AFTER="$(wc -c < "${dbp}-wal" 2>/dev/null | tr -d '[:space:]')"
        log "codegraph: checkpointed $dbp WAL before=${walB} after=${AFTER:-0} bytes (db=${dbB})"
      else
        log "WARN: codegraph checkpoint failed (db busy?) for $dbp; left as-is"
      fi
    else
      log "codegraph: would checkpoint $dbp (db=${dbB} wal=${walB} bytes)"
    fi
  else
    log "codegraph: $dbp WAL empty (db=${dbB} bytes); no checkpoint needed"
  fi
done <<EOF
$PLAN
EOF

log "done mode=$MODE runs-delete=$RUN_DELETE_COUNT scratch-delete=$SCRATCH_DELETE_COUNT snapshot-delete=$SNAPSHOT_DELETE_COUNT blockers=0"
exit 0
