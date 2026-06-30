// merge-hygiene - SINGLE owner of the deterministic merge+hygiene-leg helpers shared by the
// pr-verify-merge and milestone-wave executors (RP-20: the KEEP-IN-SYNC inline copies are the
// drift class; extraction is the guard).
//
// Consumption modes (dual-runtime constraint, workflow-defect #508):
//   - milestone-wave.workflow.js (default-export executor) lazy-requires this module via
//     createRequire(import.meta.url) inside the function body - a DIRECT import, no inline copy.
//   - pr-verify-merge.workflow.js is a Claude-style top-level body: its source also runs through
//     `new Function` harnesses where neither require() nor import.meta exists, so it keeps an
//     INLINE copy of these functions. That copy MUST stay byte-identical to the functions below;
//     scripts/workflow-truth-contract.test.js pins the equality (extractFunction) and executes
//     the behavior from THIS module.
//
// Pure functions, no side effects - safe to require from any workflow executor or script.

function ghPrCommand(verb, pr) {
  const ref = String(pr || "").trim();
  const match = ref.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)#(\d+)$/);
  if (match) return `gh pr ${verb} ${match[3]} --repo ${match[1]}/${match[2]}`;
  if (/^\d+$/.test(ref)) return `gh pr ${verb} ${ref}`;
  throw new Error(`invalid PR ref ${JSON.stringify(ref)}; expected owner/repo#N or N`);
}

function isBlockedHarnessUnavailable(grill) {
  return !!grill && (grill.grill === "blocked-harness-unavailable" || grill.verdict === "skipped-harness-unavailable");
}

// RP-03 / #202 incident class: a grill verdict is bound to the exact commit it reviewed. The merge
// gate FAILS CLOSED when the grill's verified_sha is missing, malformed, or differs from the PR's
// current REST head sha (a later push invalidates the verdict; a missing sha is an unproven review).
function grillShaMismatch(grill, headSha) {
  const verified = String((grill && grill.verified_sha) || "").trim().toLowerCase();
  const head = String(headSha || "").trim().toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(verified) || !/^[0-9a-f]{40}$/.test(head)) return true;
  return verified !== head;
}

// RP-21: SINGLE owner of the safe-to-merge-clean verdict combination. The prose owner of the
// predicate is ai/rules/curaos_verification_stack_rule.md ("Review-thread resolution gate");
// this is its code form, shared by the pr-verify-merge merge gate and the milestone-wave verify
// leg. The two paths intentionally diverge on ONE axis only: unattended (the wave) hard-blocks
// on any unresolved/needs-human thread because no human is watching the pass; the attended
// per-PR path downgrades unresolved threads to changes-requested for inline adjudication.
//
// gate fields: lensBlock, lensChanges (bool); grillVerdict ("merge-ok"|"issues-found"|"block"|...);
// grillBlockedHarnessUnavailable, grillShaBlocked (bool; absent = false);
// checksGreen (bool); threadsResolved (true iff EVERY review thread resolved); needsHumanOpen
// (true iff any needs-human thread open); unattended (bool).
// Returns "block" | "changes-requested" | "merge-ok"; merge-clean is ONLY "merge-ok".
function mergeCleanVerdict(gate) {
  const g = gate || {};
  const threadsClean = g.threadsResolved === true && g.needsHumanOpen !== true;
  if (
    g.lensBlock === true ||
    g.grillVerdict === "block" ||
    g.grillBlockedHarnessUnavailable === true ||
    g.grillShaBlocked === true ||
    g.checksGreen !== true ||
    (g.unattended === true && !threadsClean)
  ) return "block";
  if (g.lensChanges === true || g.grillVerdict === "issues-found" || !threadsClean) return "changes-requested";
  return "merge-ok";
}

module.exports = { ghPrCommand, isBlockedHarnessUnavailable, grillShaMismatch, mergeCleanVerdict };
