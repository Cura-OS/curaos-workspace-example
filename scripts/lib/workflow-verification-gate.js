// Canonical test mirror for tdd-implement's runner-inline verification helpers.
// Keep in sync with scripts/workflows/tdd-implement.workflow.js; the workflow
// runtime does not expose process/require during metadata loading.
function normalizeCiExit(value) {
  return Number.isInteger(value) ? value : 1;
}

function workflowDefectKindForVerification({ emptyDiff, verifierContradiction } = {}) {
  if (emptyDiff) return "tdd-implement-no-op-done";
  if (verifierContradiction) return "tdd-implement-verifier-contradiction";
  return "";
}

function normalizeRepoPath(value) {
  return String(value || "").replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "");
}

function uniqueStrings(values) {
  const out = [];
  const seen = new Set();
  for (const value of values || []) {
    const v = String(value || "").trim();
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

function globToRegExp(pattern) {
  const normalized = normalizeRepoPath(pattern);
  let out = "^";
  for (let i = 0; i < normalized.length; i += 1) {
    const ch = normalized[i];
    if (ch === "*") {
      if (normalized[i + 1] === "*") {
        out += ".*";
        i += 1;
      } else {
        out += "[^/]*";
      }
    } else {
      out += ch.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
    }
  }
  return new RegExp(`${out}$`);
}

function ownedPathMatches(changedPath, ownedPath) {
  const changed = normalizeRepoPath(changedPath);
  const owned = normalizeRepoPath(ownedPath);
  if (!changed || !owned) return false;
  if (owned.includes("*")) return globToRegExp(owned).test(changed);
  if (changed === owned) return true;
  const last = owned.split("/").pop() || "";
  const looksLikeFile = /^[^.].*\.[A-Za-z0-9_-]+$/.test(last);
  return !looksLikeFile && changed.startsWith(`${owned}/`);
}

function scopePathMatches(changedPath, scopePath) {
  const scope = String(scopePath || "").trim();
  if (scope.startsWith("exact:")) {
    return normalizeRepoPath(changedPath) === normalizeRepoPath(scope.slice("exact:".length));
  }
  return ownedPathMatches(changedPath, scope);
}

function derivedCloseoutPathsForOwnedPaths(ownedPaths) {
  const out = [];
  for (const raw of ownedPaths || []) {
    const owned = normalizeRepoPath(raw);
    if (!owned) continue;
    if (owned === "curaos" || owned.startsWith("curaos/")) {
      out.push("exact:curaos");
      out.push("ai/curaos/docs/DOC-GRAPH.md");
    }
    if (owned.startsWith("curaos/")) out.push(`ai/${owned}`);
    if (/^curaos\/(?:backend|frontend)\//.test(owned)) out.push("curaos/bun.lock");
  }
  return uniqueStrings(out);
}

function closeoutPathsForSpec(spec) {
  const explicit = Array.isArray(spec && spec.closeout_paths) ? spec.closeout_paths.filter(Boolean) : [];
  const owned = Array.isArray(spec && spec.owned_paths) ? spec.owned_paths.filter(Boolean) : [];
  return uniqueStrings([...explicit, ...derivedCloseoutPathsForOwnedPaths(owned)]);
}

function scopePathsForSpec(spec) {
  const owned = Array.isArray(spec && spec.owned_paths) ? spec.owned_paths.filter(Boolean) : [];
  return uniqueStrings([...owned, ...closeoutPathsForSpec(spec)]);
}

function outOfScopePaths(changedPaths, ownedPaths) {
  const owned = Array.isArray(ownedPaths) ? ownedPaths.filter(Boolean) : [];
  if (!owned.length) return Array.isArray(changedPaths) ? changedPaths.filter(Boolean) : [];
  return (Array.isArray(changedPaths) ? changedPaths.filter(Boolean) : []).filter(
    (changed) => !owned.some((scope) => scopePathMatches(changed, scope)),
  );
}

module.exports = {
  normalizeCiExit,
  workflowDefectKindForVerification,
  normalizeRepoPath,
  uniqueStrings,
  globToRegExp,
  ownedPathMatches,
  scopePathMatches,
  derivedCloseoutPathsForOwnedPaths,
  closeoutPathsForSpec,
  scopePathsForSpec,
  outOfScopePaths,
};
