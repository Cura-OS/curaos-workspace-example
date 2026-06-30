// parity-manifest - generic reader for a CHECKED-IN cross-submodule parity manifest (issue #706 P3).
//
// Why: cross-submodule parity checks (e.g. the producer-topic parity that PR #688 needed) must NOT
// depend on live, possibly-UNINITIALIZED gitlinks - a wave that runs from a checkout without
// `git submodule update --init` cannot read inside a submodule, so a parity check that walks live
// gitlinks fails closed for the wrong reason (the #688 one-tail-topic-per-cycle class). The fix that
// PR #688 used for producer topics (`curaos/ops/zarf/service-producer-topics.json`) is generalized
// here into a CONVENTION: the authoritative cross-submodule facts are captured into ONE committed
// JSON manifest in the PARENT repo, and the parity check reads that committed manifest instead of
// the submodule working trees. The manifest is regenerated (by the generator that owns the fact)
// and committed in the same PR as the change, so it is always present and version-controlled.
//
// Convention (documented in ai/rules/curaos_verification_stack_rule.md):
//   - Manifest shape: { "version": <int>, "generated_from": "<generator>", "<key>": { ...facts } }
//     where <key> identifies the submodule/service and the facts are the parity inputs.
//   - The manifest lives in the PARENT repo (committed), never inside a submodule that the check
//     would have to initialize.
//   - The parity check reads the manifest via loadParityManifest() (fail-closed) and compares.
//   - A drift-check regenerates the manifest and fails if it differs from the committed copy, so a
//     stale manifest cannot pass a parity gate.
//
// This module is pure I/O + validation; the per-fact comparison stays in each check that owns it.

const fs = require("node:fs");

// loadParityManifest - read + validate a committed parity manifest. Fail-closed: a missing file, a
// non-JSON body, or a non-object root throws with an actionable message (the parity gate must NOT
// silently pass when its authoritative manifest is absent). Returns the parsed object on success.
function loadParityManifest(manifestPath, deps) {
  const d = deps || {};
  const existsFn = d.existsFn || fs.existsSync;
  const readFn = d.readFn || ((p) => fs.readFileSync(p, "utf8"));
  if (!manifestPath || typeof manifestPath !== "string") {
    throw new Error("parity-manifest: manifestPath is required");
  }
  if (!existsFn(manifestPath)) {
    throw new Error(`parity-manifest: committed manifest missing at ${manifestPath}; regenerate + commit it (the parity check reads the committed manifest, never uninitialized gitlinks)`);
  }
  let parsed;
  try {
    parsed = JSON.parse(readFn(manifestPath));
  } catch (error) {
    throw new Error(`parity-manifest: ${manifestPath} is not valid JSON: ${error && error.message ? error.message : String(error)}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`parity-manifest: ${manifestPath} root must be a JSON object`);
  }
  return parsed;
}

// manifestEntries - the per-key fact entries with the reserved metadata keys (version,
// generated_from) stripped, so a parity check iterates only the real subject entries.
function manifestEntries(manifest) {
  if (!manifest || typeof manifest !== "object") return {};
  const reserved = new Set(["version", "generated_from"]);
  const out = {};
  for (const key of Object.keys(manifest)) {
    if (!reserved.has(key)) out[key] = manifest[key];
  }
  return out;
}

// parityDrift - compare a freshly-regenerated entry map against the committed manifest's entries.
// Returns { drifted, missing, extra }: keys whose facts differ, keys present in committed but not
// regenerated, and keys present in regenerated but not committed. A non-empty result means the
// committed manifest is stale and the parity gate must fail until it is regenerated + committed.
function parityDrift(committed, regenerated) {
  const c = manifestEntries(committed);
  const r = regenerated && typeof regenerated === "object" ? regenerated : {};
  const drifted = [];
  const missing = [];
  const extra = [];
  const stable = (v) => JSON.stringify(sortDeep(v));
  for (const key of Object.keys(c)) {
    if (!(key in r)) missing.push(key);
    else if (stable(c[key]) !== stable(r[key])) drifted.push(key);
  }
  for (const key of Object.keys(r)) {
    if (!(key in c)) extra.push(key);
  }
  return { drifted, missing, extra, clean: drifted.length === 0 && missing.length === 0 && extra.length === 0 };
}

function sortDeep(value) {
  if (Array.isArray(value)) return [...value].map(sortDeep).sort((a, b) => (JSON.stringify(a) < JSON.stringify(b) ? -1 : 1));
  if (value && typeof value === "object") {
    const out = {};
    for (const k of Object.keys(value).sort()) out[k] = sortDeep(value[k]);
    return out;
  }
  return value;
}

module.exports = { loadParityManifest, manifestEntries, parityDrift };
