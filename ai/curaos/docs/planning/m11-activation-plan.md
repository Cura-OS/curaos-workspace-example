# M11 Activation Wave - resume plan (2026-06-03)

User authorized (2026-06-03): "Do all work unblocking blocked + all pre-m11 + all m11, in this wave." + "do all of those and ask me questions... I will not do anything manually." Decisions logged to AUTO-DECISION-LOG.md.

**Decisions:** #307 = anonymous Verdaccio for DEV + curaos-ci htpasswd+token for LIVE/STAGING (both agent-automated in ops, no manual user step). #192 = temporal role-history table. M11 order = research-doc 4-wave.

**M11 hold lifted:** #25 `blocked` removed, Project status In Progress. DONE.

## Phases (generator-evolution barrier ⇒ strict order)

### Phase A - close codegen/mold debt BEFORE any M11 service dispatch
Wave-1 (parallel, independent file roots): **#320** (audit-outbox templates, LANE HEAD + merge-gate), **#316** (sdk-emit.ts name-collision), **#319** (.gitignore+Dockerfile drizzle-meta).
Wave-2 (serialize AFTER #320 merges - collide on audit-outbox.service.ts.hbs): **#315** (claim_id+lease-fence), **#331** (replayer recordSkipped+monotonic guard).
State target: wave-1 trio = ready-for-agent + Ready; #315/#331 = blocked (blocked-by #320) until #320 merges.
PARTIAL DONE: #316 needs-triage dropped. TODO (rate-limited): #315/#331 → drop ready-for-agent/foresight/needs-triage + add blocked.
(Deferred, NOT barrier-blockers: #317 drop-v1 [needs backfill first], #318 length-prefix v2 encoding [hardening].)

### Phase B - pre-M11 research (unblocks Story seeding)
**#323** per-domain backend stack research (16 domains) - HARD prereq of #324. **#327** ADR-0101 search revisit (OpenSearch eval). **#328** webhook delivery-guarantee contract (ADR-0120 Q2). Run as research/deep-research, persist to ai/curaos/docs/research/.

### Phase C - seed M11 Stories
**#324** break Epic #25 into 16 atomic ready-for-agent Stories from #323 research + m11-domain-breakdown.md. Wire sub-issues under #25, Project items, frontmatter, blocked-by edges per W1→W4 chain.

### Phase D - dispatch M11 service waves (research-doc 4-wave order)
W1 Commerce + producers → W2 {Sales,Procurement,Inventory,Accounting} → W3 {CRM,HR,Documents,Geospatial,Fleet} → W4 {E-Sign,Integrations,Conversion,Donation,Event,Site}.
Each via generator (NOTE the `--layer` flag debt: rule says `--layer=core|trio`, codegen ships `--core-only` - reconcile in Phase A or a docs fix before W1).

### Also-unblock (user said do ALL)
- **#307** Verdaccio: implement tiered (dev anonymous + live/staging curaos-ci htpasswd+token) in ops. Agent-doable.
- **#192** temporal role-history: implement when an identity lane is touched (M11 neutral services don't need it; surfaces later). Decision locked.
- **#194** agent-overclaimed label seed, **#208** dep-graph weights (data-gated: needs 3+ wave runs - genuinely deferred), **#321/#322/#330** roadmap/M8/M9 debt, **#326/#329** M14/M12 prereqs, **id#73** Diamond forward-guard test.

## PROGRESS (2026-06-03 session)
- M11 hold lifted (#25 In Progress). Decisions logged.
- **Partition-collision root-cause FIXED** (commit 2eeaae7): parallel-dispatched #316/#319/#320 collided in shared curaos checkout; fixed wave-prioritize step 2 + swarm rule (collision unit = git working tree, codegen lanes serialize). Workspace main has the fix (NOT yet pushed).
- Phase-A recovered into clean PRs: **#316→curaos#194, #319→curaos#195, #320→curaos#196** (all OPEN, MERGEABLE, CodeRabbit-clean, codegen gate 741 pass/0 fail). #319 nested backfill pushed to party-core+audit-core `fix/drizzle-meta-option-a-319` branches.
- **#328→workspace PR#332** (webhook contract, OPEN).
- #320 grill: Codex agent a1bf445ec7894781b RUNNING (high-blast).
- #327 research worker wxyv9dwnp STILL RUNNING.
- #323 BLOCKED (worker honored stale body hold-text "stay needs-triage until M11 active" - M11 now active; need to edit #323 body to remove the stale hold, re-dispatch).

## PHASE A DONE (2026-06-03)
- #194/#195/#196 MERGED to curaos main 41f09bb; #332 MERGED to workspace. curaos pointer bumped (workspace 09db7a5, pushed). #316/#319/#320/#328 CLOSED. Partition fix CONFIRMED in origin/main (was never lost). #320 grill report written; 2 interim P2s → foresight #333/#334 (need staging).
- #315 worker committed 3c17cbc (real, +970/-572, 779 codegen tests pass - worker's "empty diff" verdict was a collision-timing false-negative). PR curaos#197 OPEN. Grill RUNNING (Codex aebd752, high-blast claim-lease-fence). #331 still queued AFTER #315 merges (same audit-outbox.service.ts.hbs).
- #327 research STILL running (very long search-scaling eval).
- #315 grill (aebd752): MERGE-BLOCKING 2 P1 (no P0): P1-A no additive 0001 migration (claim_id added in-place to 0000 baseline = rolling-update violation, breaks existing deploys + false-passing test); P1-B terminal marks don't check locked_until>NOW() (stale-lease terminal-outcome race). #294 regressions NOT reintroduced. Grill report written. Fix worker a005ea84 RUNNING (§8 cycle 1, serial on curaos). Re-grill after.

## PHASE A - #315 MERGED (curaos main 4f222d6), re-grill APPROVE. Only #331 left.
- #331 (replayer P2s) dispatched SOLO (w0wdglkpv) off merged main. Last Phase-A lane. (cwd MUST be workspace root when dispatching workflows - relative composes break from curaos/.)
- #327 research STILL running (suspiciously long - assess if stuck on next idle).
- merged so far: #194 #195 #196 #197 (curaos) + #332 (workspace). curaos pointer bumped to 41f09bb (needs re-bump to 4f222d6 after #331).

## PHASE A 100% COMPLETE (2026-06-03)
ALL 6 lanes merged: curaos #194/#195/#196/#197/#198 + workspace #332. curaos pointer → dd5a331 on workspace main (4a10d48, pushed). #316/#319/#320/#315/#331/#328 CLOSED. Notification inbox CLEAN (0/0, #196 nit→#335). Post-merge foresight: #333/#334 (interim guards) + #335 (test nit), all parent #320. Generator-evolution barrier CLEAR.

## PHASE B IN FLIGHT
- #327 search-revisit research: original worker DIED (stale 2hr), RE-DISPATCHED w1764rel5 (running).
- #323 per-domain stack research (Phase-C gating prereq): stale M11-hold in body CLEARED (frontmatter blocked-by:[] + agent-notes), RE-DISPATCHED wn10vk3zw (running). Worker had stopped on the stale "until #25 activated" body text.
- #328 webhook contract = MERGED (#332).
- Stage #333/#334/#335 via sweep-foresight-staging --apply (raw-created, need Project+milestone+parent-wire).

## PHASE B - research done, in review
- #323+#327 research → combined PR #337 (closes both; bundled because both regen DOC-GRAPH.md). Awaiting CodeRabbit (watcher b0rqnjiu1). #327 follow-on #336 (Tier-2 OpenSearch, blocked) filed + being staged.
- **SECOND COLLISION LESSON:** #323 + #327 dispatched concurrently both as WORKSPACE-repo research lanes → shared one workspace working tree → tangled (same class as codegen collision). Partition rule is right ("same working tree → serialize") but applies to ALL same-repo task-execute lanes, not just codegen. DISPATCH DISCIPLINE: serialize ANY two lanes that mutate the same repo working tree (curaos submodule OR workspace repo OR any one submodule). Only truly-different submodules parallelize. TODO: tighten wave-prioritize/dispatch to enforce (currently manual). Orphan branch 74755ad (session-22-mirror, regressive, NOT ancestor of main) = DISCARD, never build on it.

## PHASE B DONE: #337 MERGED (main 0a8611c), #323/#327 CLOSED. Research landed.

## PHASE C IN FLIGHT: #324 Story-seeding agent acaf617 RUNNING - seeds 16 M11 <domain>-core-service Stories under Epic #25, sub-issue-wired + Project(M11/Backlog) + blocked-by W1→W4 edges (machine-readable). Generator flag = --core-only (NOT --layer=core). On done: verify 16 Stories exist + wired + wave-edged, close #324.

## PHASE D (after C): dispatch service waves W1→W2→W3→W4 in dep order. CRITICAL: each <domain>-core-service is its OWN submodule → DIFFERENT working trees → CAN parallelize WITHIN a wave (unlike codegen). BUT the generator RUN itself mutates the curaos parent checkout (tools/codegen + new submodule registration) - so the SCAFFOLD step per service may serialize on the curaos checkout; once a service submodule exists, its impl is isolated. Verify generator-run isolation before parallel-dispatching a wave.

## PHASE C DONE: 16 Stories #338-#353 seeded under #25, wave-edged (native blocked-by), Project'd M11/Backlog, ready-for-agent. #324 closed. Verified (#345 blocked-by=[338,342,343,344], #25=22 sub-issues).
Wave map: W1=#338 commerce,#339 crm,#340 hr,#341 documents | W2=#342 sales,#343 procurement,#344 inventory,#345 accounting | W3=#346 geospatial,#347 fleet,#348 esign,#349 integrations | W4=#350 conversion,#351 donation,#352 event,#353 site.
blocked-by edges: 342/343/344→338; 345→338,342,343,344; 347→346; 348→341; 351→338; 352→338; 353→346,341,338. W1 roots (338/339/340/341/346/349/350) = no deps.

## STALE-DOC-HOLD LESSON (3rd of the "stale hold blocks worker" class): #338 worker STOPPED reading HANDOVER/ISSUE-ROADMAP session-22 "M11 HELD / 0 ready-for-agent" stop-state. FIXED: prepended session-23 HANDOVER entry + flipped ISSUE-ROADMAP M11→ACTIVATED (commit 8487f50 pushed). Workers context-load these as authoritative - ALWAYS update HANDOVER+ISSUE-ROADMAP when milestone state changes, BEFORE dispatching. Re-dispatched #338 = wicfut0ow.

## PHASE D - #338 commerce-core SCAFFOLDED + PR curaos#199 (grill a7c6ffd running).
- commerce-core-service NEW submodule created+pushed (794519f→its main), 34 tests pass, interim driver-free CommerceEngine seam. Worker blocker flags = collision-timing false-negatives (re-verified clean + pointer pushed).
- **GENERATOR GAP → #354** (`--orm=mikro-orm` mode): mold hardcodes Drizzle but Medusa/MikroORM services need it. #354 promoted ready-for-agent = NEW generator-evolution PREREQUISITE for the commerce cluster. Sequencing: dispatch #354 (codegen lane, serial) BEFORE the MikroORM W2 services (sales/procurement/inventory/accounting per commerce-cluster research). commerce(#338) shipped with interim seam - acceptable (modulith pattern); #354 binds the real MikroORM later.
- **ORM-tier wave refinement (from research):** Drizzle-default (NO #354 dep, dispatchable now, serial on curaos checkout): #339 crm, #340 hr, #346 geospatial, #349 integrations. MikroORM/Medusa (WAIT for #354): commerce(done-interim), sales/procurement/inventory/accounting. documents(#341)/conversion(#350) - verify ORM at dispatch (likely Drizzle).
- SERIAL on curaos checkout: only ONE curaos-lane worker/grill at a time.
- #338 GRILL VERDICT: MERGE-BLOCKED 1 P0 (generic asyncapi - no W2-consumable order/product/pricing/stock/accounting channels - the root producer's whole job) + 2 P1 (P1-A non-durable domain events: direct producer.send not transactional → add domain outbox; P1-B COMMERCE_ENGINE local-provider → can't bind from composition root, dead-ends #354 → dynamic module register()). audit-outbox + tenant-isolation CLEAN. Grill report written.
- #338 FIX worker ab44420 RUNNING (§8 cycle 1, serial). Fixes event catalog (from research Medusa event map) + durable domain-outbox + dynamic-engine-module seam. Pushes service-repo commit BEFORE curaos pointer bump.
- **PROBABLE 2nd generator fold:** durable-domain-outbox (P1-A) is likely GENERAL - every M11 producer needs it (not just commerce). Worker told to flag for mold fold. Watch for this → may become a Phase-A-style mold prereq like #354.
- W2 BLOCKED until #338's corrected event catalog merges (consumers derive contracts from it).

## (superseded) PHASE D re-dispatch note: #338 re-dispatched (wicfut0ow) after doc-state fix - DONE, scaffolded.
SERIALIZATION: gen:service scaffolds into the SHARED curaos checkout (new backend/services/<domain> dir) → concurrent scaffolds COLLIDE → dispatch ONE service at a time on the curaos checkout. Once a service submodule is registered + its impl isolated, MAYBE parallel - but safest = serial scaffold. After #338: verify+grill(high-blast)+merge → register submodule → bump pointer → next W1 (#339/#340/#341/#346/#349/#350 are dep-free, can follow #338 serially), then W2 once producers' contracts ship.

## TODO (resume)
0. (done) #337 merged, Phase C done.
1. Collect #320 grill verdict → fix P0/P1 or merge.
2. Merge order (serialize, same curaos repo): #194 → #195 → #196 (rebase each on main). Run `just ci` / codegen gate per merge. Bump curaos pointer in workspace after.
3. #328/#332 merge (workspace repo).
4. Unblock #315 + #331 AFTER #320 (#196) merges (they edit audit-outbox.service.ts.hbs - serialize). Dispatch ONE AT A TIME (codegen = serialize).
5. Re-dispatch #323 (fix stale body hold first), collect #327, then Phase C #324 Story seeding, then Phase D 16-service waves W1-W4 (serialize codegen-generation lanes!).
6. Reconcile workspace `curaos` submodule pointer to a clean pushed commit before committing pointer.
7. #307 Verdaccio (tiered dev-anon/live-authed), #192 temporal role-history - implement in their lanes.
8. Run all 4 sweeps + push workspace main.

## SESSION 24 (2026-06-03 resume) - user asked "did you start with pre-M11?"
- LEDGER: M1-M10 epics #23/#24 CLOSED wave-done. NO open non-foresight M1-M10 impl issues. Every still-open pre-M11 item is `foresight`-quarantined (#317/#318/#322/#330/#333/#334/#335/id#73/#194/#208) = backlog, not active queue. The two pre-M11 items the directive ACTIVATED = #192 (temporal role-history) + #307 (Verdaccio tiered). #99 (#192's blocked-by) verified CLOSED 2026-05-31 → #192 cleared.
- User answered AskUserQuestion: **dispatch #192 + #307 NOW in parallel**.
- **#192 dispatched (ad39c81b, RUNNING)** - identity-service checkout = truly separate working tree. Decision: temporal role-history table, forward-migration-only, multi-role-tenant backfill cleanup-free, MikroORM.
- **#307 PARTITION ERROR → killed before it touched checkout.** I mis-classified #307 as "ops dir = independent repo." WRONG: #307 lands in `curaos/ops/` = INSIDE the curaos submodule checkout = SAME `.git/modules/curaos` working tree the serialized #338 M11 lane holds (currently on branch `agent/m11-338-commerce-core-scaffold`). Launching it = #316/#319/#320 collision class. LESSON (4th collision lesson): `curaos/ops/`, `curaos/tools/`, `curaos/backend|frontend` parent files, AND any `curaos/...`-path issue ALL share the ONE curaos checkout - "ops" is not a separate repo. #307 QUEUES behind the curaos M11 lane; re-dispatch after #338 merges + checkout returns to clean main. TODO: fold into wave-prioritize step-2 owned-root derivation (add explicit `curaos/ops/**` + `curaos/tools/**` → root=curaos-checkout examples; right now the rule covers codegen+submodule+parent-pointer but a reader could still eyeball "ops" as independent).
- #338 fix worker ab44420 STILL RUNNING (domain-outbox + event-catalog + dynamic-module, mid-build - new-diagnostics are expected WIP, e.g. test/impl topic-name mismatch + outbox seq optional-vs-required, not final).

## SESSION 24 cont. - #192 DONE (PR open, CodeRabbit pending), #338 cycle-2 running
- **#192 temporal role-history VERIFIED + done.** identity-service PR#74 OPEN+MERGEABLE, commit 4484334 pushed. Migration 0009 additive forward-only (guarded DROP on indisunique=true → fresh/re-run no-op). 484 pass/0 fail + live-PG 7/0 + multi-role-tenant backfill integration test green. Self-grill Codex APPROVE-WITH-NOTES. curaos pointer bumped on branch agent/bump-identity-service-multi-role-history-claude-5b71f787 (f997f9d, UNPUSHED). **STACK CORRECTION: identity-service is DRIZZLE not MikroORM** - my task brief premise was wrong; worker honored existing Drizzle pattern (correct). ORM-3-tier "MikroORM for relational-rich" is a guideline, not what identity shipped.
  - MERGE BLOCKED ON: CodeRabbit review IN PROGRESS on #74 (pending check). 0 reviews/0 unresolved threads currently. Re-check next tick; merge only when CodeRabbit done + threads resolved + no needs-human. Then push the pointer-bump branch / fold into curaos pointer.
  - Foresight surfaced (worker): `actor_primary_org` materialized view (ADR-0210) is docs-only; future current-roles view must emit one row per current role, NO primary-role precedence. (capture if not already a foresight issue.)
- **#338 commerce cycle-2** fix worker a26fa308 RUNNING (serial on curaos checkout). Re-grill MERGE-BLOCKED 2 P0 (missing return/refund/fulfillment-cancel channels; unit_amount:0 per line) + 3 P1 (non-atomic engine+outbox tx; non-overridable outbox store; no-DLQ relay = false at-least-once). Grill report cycle-1 section appended. §8 cycle 2 of 3.
- **#355** filed (foresight): fold domain-outbox + dynamic-module seam into codegen mold (predicted 2nd generator fold, confirmed).
- #307 still queued behind curaos lane (lives in curaos/ops/, same checkout).

## SESSION 24 cont.2 - #338 cycle-2 verified, cycle-3 dispatched
- **#338 cycle-2 (8315d70) VERIFIED real:** 61/0 unit + 26/0 integration (standalone), 18 channels, reverse-flow + accounting-reversal payloads, real line pricing (1299/4500/total 7098), atomicity (tx.db threaded into engine), relay indefinite-pending+capped-backoff. 5 prior findings all FIXED.
- **Cycle-2 RE-GRILL (Codex, FINAL §8 cycle) MERGE-BLOCKED 1-reclassified+2 P1:**
  - RG2-1: grill saw `bun test`=43/18 EADDRINUSE. RECONCILED: plain `bun test` globs ONLY 7 unit files=61/0 (the real `bun run ci` gate=green); `bun test test/integration/`=26/0 standalone. 18 fails = test-ISOLATION artifact (two app.listen(0) in one proc, no afterAll close) NOT code regression. Reclassed P0→P1. Real gaps: (a) integration excluded from `bun run ci` test step; (b) EADDRINUSE on combined run (missing teardown).
  - RG2-2 (W2-blocker): `src/index.ts` doesn't export new payload types/Commerce_ALL_TOPICS/DomainOutboxModule/tokens → W2 can't import catalog from package root. Genuine W1-root blocker.
  - RG2-3: fail-closed guard = `instanceof InMemoryDomainOutboxStore` only → other volatile stores bypass. Replace w/ isDurable capability/brand.
- **Cycle-3 fix worker a9a6089 RUNNING** (serial, curaos checkout): exports + capability-brand guard + integration teardown/gating. §8 cap reached but fixes are tight/mechanical + RG2-2 is a real W2-blocker (won't ship around).
- **#357 filed** (foresight, Backlog): W2-maturity extra channels (order-edit/backorder/payment-failed/partial-shipment) - grill ACCEPTABLE-SCOPE, not blocking.
- **#356 filed** (foresight, M12): actor_primary_org current-roles view (from #192).
- **#192 MERGED + CLOSED** (identity PR#74 squash 636f5ab). Notifications swept.
- **DEFERRED pointer bumps (both wait for #338 lane to release curaos checkout):** identity-service pointer (re-derive against squash 636f5ab - worker's f997f9d branch is stale) + commerce-core pointer + register commerce-core submodule. Do all 3 in ONE combined curaos-parent commit after #338 merges.

## SESSION 24 cont.3 - #338 cycle-3 VERIFIED clean, PRs open, MERGE PENDING CodeRabbit
- **#338 cycle-3 (4c8ce16) VERIFIED:** tsc exit=0 (isDurable new-diagnostics were stale LSP, NOT real), combined `bun test` 105/0/8-files 0 EADDRINUSE (RG2-1 proven), export barrel src/index.ts COMPLETE (18 topics + all payloads incl reverse-flow/refund/accounting-reversal + domain-outbox subsystem+tokens), isDurable capability guard (RG2-3), public-export-surface 40/0. 5 prior + 3 RG2 findings ALL fixed, no regressions. CLEAN APPROVE state - do NOT re-grill (§8 cap, all findings verified addressed).
- **PRs open, MERGE SEQUENCE (gated on CodeRabbit):**
  1. **commerce-core-service PR #1** (feat/commerce-core-scaffold-338 → main, 4 commits 4fd2df9/8315d70/4c8ce16+scaffold). CodeRabbit IN PROGRESS. Merge first → gets code on service main.
  2. **curaos #199** (pointer + .gitmodules register). CodeRabbit=skipped(pointer diff), 0 threads. BUT pointer currently = OLD scaffold SHA 794519f → must RE-POINT to service-main merge SHA after PR#1 merges.
  3. Combined curaos-parent commit: re-point commerce-core to service-main SHA + fold identity-service pointer (re-derive vs #74 squash 636f5ab - worker's f997f9d stale) → merge #199 → push.
- curaos checkout STILL HELD on agent/m11-338-commerce-core-scaffold (serialized) until #199 merges. NO other curaos-lane worker until then.
- **GENERATOR FOLD (worker surfaced, §8.75 multi-file→follow-up):** 6 codegen integration-test templates still emit `app.listen(0)` (the RG2-1 EADDRINUSE defect) → every future scaffold inherits it. + no src/index.ts barrel template (RG2-2 export pattern is net-new per-service). BOTH belong in #355 (mold fold) or a new codegen issue. Capture.

## SESSION 24 cont.4 - PR#1 CodeRabbit thread resolved
- PR#1 CodeRabbit flagged 1 🟡 Minor (package.json:28): `ci` ran integration twice (`bun test` already scans test/integration in Bun 1.3.x + explicit `&& bun run test:integration`). FIXED f5c2124 (dropped redundant run, kept test:integration script). ci exit=0 105/0. Thread replied+resolved. Pushed.
- CodeRabbit RE-REVIEWING f5c2124 (incremental, 1-line). MERGEABLE, 0 unresolved. Merge when incremental done.

## SESSION 24 cont.5 - PR#1 MERGED, #199 re-pointed + pushed, MERGE PENDING CodeRabbit
- **PR#1 MERGED** (squash) → commerce-core-service main = **b29fa16**. Branch deleted.
- **#199 re-pointed:** commit 6f4a365 on agent/m11-338-commerce-core-scaffold - commerce-core→b29fa16 + identity-service→636f5ab (BOTH merged-main SHAs, were feature-branch). Pushed (ff ef27e99..6f4a365). #199 diff = 2 submodule pointers + bun.lock (new commerce-core workspace entry, legit). MERGEABLE, 0 unresolved. PR comment notes the identity fold.
- CodeRabbit RE-REVIEWING #199 push (in progress). Merge when done + threads clean.
- After #199 merge: curaos main pointer advances, checkout RELEASED (back to clean main) → #307 + W1 followers unblock.

## SESSION 24 cont.6 - #338 W1 ROOT FULLY LANDED + closed. Lane RELEASED.
- **#199 MERGED** (squash) → curaos main **232a554** (commerce-core registered + commerce b29fa16 + identity 636f5ab pointers). curaos checkout synced to main, agent/m11-338 branch deleted, lane RELEASED.
- **Workspace main pushed d754aa7:** curaos pointer→232a554 + ai-mirror (commerce+identity CONTEXT, identity Requirements, ADR-0210 note, DOC-GRAPH 1086n) + grills (#338 3-cycle, #192) + identity multi-role research. gitleaks clean.
- **#338 CLOSED** (PR-linkage auto). #192 already closed. Notifications swept (commerce#1 + curaos#199 cleared, inbox 0/0).
- **NET: M11 W1 commerce root DONE + #192 pre-M11 DONE. Both pointers live on workspace main.**

## NEXT (resume) - lane free, big unblock available
1. (DONE) #338/#192 landed.
2. **Next serial curaos-checkout lane** (only ONE at a time - all scaffold+ops lanes share curaos checkout):
   - #307 Verdaccio (curaos/ops, tiered dev-anon/live-authed) - independent, no #354 dep.
   - W1 Drizzle followers (dep-free, no #354): #339 crm, #340 hr, #341 documents, #346 geospatial, #349 integrations, #350 conversion.
   - #354 MikroORM codegen mode = PREREQ for W2 MikroORM services (sales/proc/inv/accounting). BARRIER: while #354 (codegen lane) in-flight, W2 MikroORM dispatch BLOCKED.
   - W2 (#342/#343/#344/#345) now have importable catalog from commerce b29fa16 - but need #354 first (MikroORM) + serialize.
3. Re-check GraphQL budget before next wave (each ~5k/hr). Pick highest-leverage single serial lane.
4. Fold generator gaps into #355: domain-outbox + dynamic-module + src/index.ts barrel template + app.listen(0)→app.close() in 6 integration-test templates.
2. Re-point curaos #199 to PR#1's main SHA + add identity-service pointer bump (vs 636f5ab) in same curaos-parent commit. Verify #199 still mergeable + threads clean.
3. Merge #199 → push curaos main pointer. Register commerce-core submodule confirmed in .gitmodules.
4. Sweep notifications. Then UNBLOCK: #307 Verdaccio (curaos/ops, now checkout free) + W1 followers #339/#340/#341/#346/#349/#350 (Drizzle, dep-free) serial on curaos checkout. #354 MikroORM-mode codegen before W2 MikroORM services. W2 (#342/#343/#344/#345) now have importable catalog from PR#1.
5. Fold the 2 generator gaps (app.listen(0) templates + barrel template) into #355 or new codegen issue.

## Budget reality
Each live wave burns ~5000 GraphQL/hr (the cap). Pace: prep state when fresh → dispatch → wait reset. Currently 0/5000.

## SESSION 24 cont.7 - W1 done, dispatched #354+#355 combined codegen lane
- #355 PROMOTED foresight→ready-for-agent (M11 active, commerce-core = reference impl), folded into #354.
- **DISPATCHED ab4f400** (serial, curaos checkout): COMBINED #354 (--orm=mikro-orm flag + MikroORM templates + Medusa-embedding MedusaCommerceEngine partial + snapshot tests) + #355 (port commerce-core's durable domain-outbox + dynamic-engine-module register() + src/index.ts barrel + fix app.listen(0)→app.close() in 6 trio integration-test templates INTO the mold). One pass = one trio-symmetry verify + one PR.
- Highest-leverage: clears W2 MikroORM barrier (sales/proc/inv/accounting blocked until #354) + every future service inherits commerce-core hardening.
- BINDING reminders to worker: byte-identical trio symmetry, ≥90% cov, Drizzle-default snapshot-stable (modulo universal barrel/outbox folds), STOP+report if too big rather than leave mold half-migrated (shared generator - broken mold blocks all downstream).
- GraphQL budget healthy (4945/5000 at dispatch).
- WHILE ab4f400 runs: curaos checkout LOCKED. No W1-follower/W2/#307 dispatch until it merges (all share curaos checkout). Generator barrier ALSO blocks W2 until #354 lands.
- On done: verify (codegen gate green, trio symmetry, MikroORM gen output) → grill (codegen = high-blast, every service inherits) → merge → THEN W1 Drizzle followers (#339/#340/#341/#346/#349/#350) serial + W2 MikroORM services unblocked + #307.

## SESSION 24 cont.8 - #354+#355-item4 done, GRILL 2 P1, fix dispatched
- **#354+#355item4 worker (ab4f400) DONE + VERIFIED:** PR curaos#200 (branch feat/codegen-mikroorm-mode-domain-outbox-folds, c1a57e6 pushed). codegen gate 803/0 (independently confirmed). --orm flag, MikroORM templates, trio md5-identical (46ec0f0d), app.listen(0) removed (comment-only), drizzle-default byte-stable.
- **#355 SPLIT:** item 4 (app.listen fold) DONE in #200. Items 1-3 (domain-outbox + dynamic-module + barrel templates ~1140 LOC) DEFERRED - worker correctly declined half-port of shared mold. #355 STAYS OPEN ready-for-agent for a follow-up lane after #200 merges.
- **GRILL (Codex, high-blast) MERGE-BLOCKED 2 P1 + 1 P2:**
  - G-P1-1: --orm flag absent from @turbo/gen INTERACTIVE path (config.ts) - CLI threads it, turbo-gen ctx.orm always undefined → interactive always emits Drizzle silently. Fix: orm prompt+isOrmTier validate+fail-closed.
  - G-P1-2: medusa-engine.ts.hbs emits LYING stub (synthetic medusa-pending, no real write in tx) → phantom event = outbox-atomicity violation. Fix: honest in-memory-persisting engine (match commerce-core InMemoryCommerceEngine) OR throw NotImplementedError. Trio.
  - G-P2-1 → foresight #358 (codegen tests presence-only; add pre-#354 snapshot fixture + tsc/bootstrap smoke).
  - GRILLED CLEAN: CLI plumbing, drizzle byte-stable, RLS set_config(...,true) transaction-local (no cross-tenant leak - highest-stakes, SAFE), listen(0) fold, trio symmetry. 218 sandbox fails = mkdtemp isolation not logic.
- **FIX worker a4d837a RUNNING** (§8 cycle 1, serial curaos checkout): G-P1-1 turbo-gen flag + G-P1-2 honest engine. Grill report ai/curaos/docs/grills/m11-354-codegen-mikroorm-mode-pr200.md.
- curaos checkout LOCKED until #200 merges. W1-followers/W2/#307 all wait.

## SESSION 24 cont.9 - #200 fix VERIFIED + CodeRabbit thread resolved, MERGE PENDING
- **#200 fix worker (a4d837a) DONE+VERIFIED:** commit b7e1a8e. G-P1-1 turbo-gen --orm prompt+isOrmTier-reuse+fail-closed. G-P1-2 MedusaEmbeddedEngine throws MedusaEngineNotWiredError (no phantom medusa-pending; InMemory persisting default unchanged). gate 811/0 (+8 tests), cov 95.95%func/94.6%line, trio md5 cb44e045. Both P1 correct → NO re-grill (tight fixes match grill spec exactly).
- **CodeRabbit 🟡 Minor on #200:** mikro-orm.config migrations comment claimed no-master-tx but allOrNothing defaults true (comment lied). FIXED e5a2b81: allOrNothing:false across trio (md5 d6697ea), gate 811/0. Thread replied+resolved. Aligns rolling-update forward-only.
- CodeRabbit RE-REVIEWING e5a2b81 (incremental, 3-file config). MERGEABLE. Merge when done + clean.
- On #200 merge: bump workspace curaos pointer (+ codegen CONTEXT.md ai-mirror edit). Then checkout RELEASED → BIG unblock: W1 Drizzle followers (#339/#340/#341/#346/#349/#350) + W2 MikroORM services (#342/#343/#344/#345 - barrier cleared, mold now has mikro-orm tier) + #307 Verdaccio. All serial on curaos checkout.

## SESSION 24 cont.10 - #354 MERGED (W2 barrier cleared). Batch-scaffold strategy.
- **#200 MERGED** → curaos main b6ae4ed; workspace pointer bdf771e pushed. #354 CLOSED. #200 swept. MikroORM codegen tier LIVE → W2 barrier CLEARED.
- index.lock transient (doc-graph regen race) - cleared self, no real git proc; committed fine.
- **USER DECISION: batch-scaffold-then-parallel-impl.** Scaffold mutates shared curaos checkout (serial), but a registered submodule's IMPL is an isolated checkout (parallel). So: batch-scaffold a wave in ONE serial curaos lane → then parallel-impl across separate submodule checkouts.
- Repo state: geospatial + conversion repos EXIST; crm/hr/documents/integrations/sales/procurement/inventory/accounting do NOT (worker creates them).
- **Split by ORM tier (2 sequential scaffold lanes):** Lane A = 6 Drizzle W1 (#339 crm/#340 hr/#341 documents/#346 geospatial/#349 integrations/#350 conversion). Lane B = 4 MikroORM W2 (#342 sales/#343 procurement/#344 inventory/#345 accounting, on the new --orm=mikro-orm tier).
- **DISPATCHED a381bfcc** (Lane A, serial curaos): create 4 missing repos + gen:service --core-only (Drizzle) ×6 + push each scaffold to its remote + register 6 submodules in .gitmodules + ONE curaos PR. STOP-if-mold-defect (shared mold). ai-docs per service uncommitted→orchestrator.
- Budget 4969/5000 at dispatch.
- ON LANE A DONE: verify each scaffold builds, merge the curaos registration PR, bump workspace pointer → then PARALLEL-impl the 6 (separate submodule checkouts, can fan out). THEN Lane B (4 MikroORM W2) same pattern. THEN #307 + #355-items1-3 + W3/W4.

## SESSION 24 cont.11 - Lane A (6 Drizzle W1) SCAFFOLDED + VERIFIED, MERGE PENDING
- **Lane A worker (a381bfcc) DONE+VERIFIED:** 6 service repos scaffolded+pushed, all 6 main SHAs MATCH PR pointers (crm 87ef3de, hr c73b4d2, documents 29ff2f2, integrations 06bd468, geospatial 81e8e5d, conversion 197a78b). Each 27/0 + typecheck 0. Mold consumed unmodified (no defect, scaffolds green OOTB). 4 repos created this lane (crm/hr/documents/integrations); geospatial/conversion pre-existed.
- **curaos PR #201** (branch agent/scaffold-m11-w1-batch6-claude-fe2035a2, tip d3e80e4): diff = .gitmodules (4 new) + 6 pointers + bun.lock. MERGEABLE. CodeRabbit in progress (pointer PR, fast). 0 unresolved.
- Topology note (worker): used `git submodule add --force` not raw `git init` (raw init breaks lefthook commit-msg hook ENOTDIR). Correct gitlink pattern.
- Foresight #359: scaffolded-service tsconfig/deps not self-contained for isolated-checkout typecheck (latent; all CI runs from workspace root today).
- Uncommitted workspace ai-docs (worker left): ai/curaos/backend/services/{crm,hr,documents,integrations}-core-service/ (AGENTS+CONTEXT+Requirements) + DOC-GRAPH (1105n). Commit WITH the pointer bump after #201 merges.
- ON #201 MERGE: bump workspace curaos pointer + commit the 4 ai-doc dirs + DOC-GRAPH in one workspace commit; close #339/#340/#341/#346/#349/#350 (cross-repo, manual close); sweep. THEN PARALLEL-IMPL the 6 (separate submodule checkouts - can fan out up to swarm cap). THEN Lane B (4 MikroORM W2).

## SESSION 24 cont.12 - #201 MERGED; PREMATURE-CLOSE CAUGHT+CORRECTED
- #201 MERGED → curaos main 8f1f561; workspace pointer 5bb441f pushed (+ 4 ai-doc dirs + DOC-GRAPH 1105n). .batch-stage2/ scratch removed. #201 swept. ai-mirror 1:1 clean.
- **ERROR CAUGHT+FIXED:** closed #339/#340/#341/#346/#349/#350 as "scaffold done" - but their DoD is NOT scaffold-only (e.g. #341 = domain model+events+TypeSpec REST+integration tests vs real PG/Kafka+SeaweedFS WORM+OTel+dev-cluster deploy; scaffold = just checkbox 1). REOPENED all 6 + re-labeled ready-for-agent + correction comment. LESSON: a "<svc> scaffold + <features>" issue's DoD includes the FEATURES; scaffold-lane completion ≠ issue close.
- **NEXT = PARALLEL-IMPL phase:** each of the 6 W1 services is now an ISOLATED submodule checkout → fan out concurrent impl workers (swarm cap 8). Each impl: domain model+events+TypeSpec REST+integration tests(real PG/Kafka)+service deps+OTel+tenant-scope, per each issue's named-libs + backing research. Then grill each (cross-harness), merge each service PR, bump pointers. Generator-evolution: fold edge cases into mold.
- THEN Lane B (4 MikroORM W2 scaffolds #342/#343/#344/#345) → their parallel-impl. THEN #307, #355 items1-3, W3/W4.

## SESSION 24 cont.13 - PARALLEL-IMPL wave dispatched (6 W1 services concurrent)
- 6 impl workers dispatched, each ISOLATED submodule checkout (no collision):
  - #339 crm = a856de34 | #340 hr = ad5bc61c | #341 documents = ab0c17de | #346 geospatial = ada1e7b7 | #349 integrations = a1bdf4ed | #350 conversion = a66ea14e
- Each: full domain (model+events+TypeSpec REST+integration tests real PG+OTel+tenant-scope) per issue named-libs + research; service PR + curaos pointer on a branch (UNPUSHED - orchestrator merges pointers). Self-grill. Reference commerce-core durable-domain-outbox pattern for events.
- Service-specific guards baked into briefs: #340 ABAC comp-field authz; #341 WORM immutability; #346 PostGIS+event-catalog-for-W3; #349 webhook delivery-guarantee(#328/#332 contract)+SSRF; #350 sidecar-delegated+PHI-no-log.
- Budget 4789 at dispatch.
- ON EACH DONE: independently verify (bun test in that submodule) → cross-harness grill (each is a root event producer, moderate blast) → merge service PR → collect pointer bumps. BATCH the 6 pointer bumps into one curaos-parent commit when several land (avoid 6 separate pointer PRs). Then close each #339/#340/#341/#346/#349/#350 (now full-DoD met).
- THEN Lane B: 4 MikroORM W2 scaffolds (#342 sales/#343 procurement/#344 inventory/#345 accounting) on --orm=mikro-orm tier → their parallel-impl. THEN #307 Verdaccio, #355 items1-3 (codegen mold follow-up), W3 (#347 fleet/#348 esign/#353 site - blocked-by W1 now in flight), W4.
- ⚠️ 6 concurrent impl PRs landing → watch for pointer-bump collisions on the curaos parent (all 6 pointer bumps mutate curaos .gitmodules-adjacent state). MERGE pointer bumps SERIALLY or BATCH - do NOT let 6 pointer-bump merges race the curaos parent.

## SESSION 24 cont.14 - #350 conversion DONE (1/6 W1 impl), 5 running
- **#350 conversion impl (a66ea14e) DONE:** service 433fc84 pushed, PR conversion-core#1 open. bun run ci 61/0. Job state-machine + SidecarDispatcher port + Hl7FhirBridge + conversion.job.* events + REST + OTel + PHI-reference-only. curaos pointer on branch agent/bump-conversion-core-domain-m11-350 (1fb8381 UNPUSHED). Self-grill = fresh-context Claude fallback (Codex unavailable: gpt-5.1 unsupported + usage limit) per verification-rule fallback.
- **CROSS-LANE FLAG (from #350 worker):** geospatial-core scaffold 81e8e5d imports `express` directly = the single depcruise ERROR failing the workspace gate. Checked: NOT in codegen mold template (not mold-wide), no service src imports express NOW → geospatial IMPL worker (ada1e7b7, still running) owns it in its own ci. Watch #346's report for whether it cleared.
- Opposite-harness Codex UNAVAILABLE this session (gpt-5.1 unsupported on account + usage limit) → grills use fresh-context Claude fallback (documented verification-rule fallback). Note for all 6 grills.
- 5 W1 impl workers still running: #339 crm a856de34, #340 hr ad5bc61c, #341 documents ab0c17de, #346 geospatial ada1e7b7, #349 integrations a1bdf4ed.
- HOLD #350 merge → batch with siblings. As each lands: verify(bun test in its submodule) + grill(fresh-Claude fallback) + merge service PR; batch pointer bumps serially into curaos parent.

## SESSION 24 cont.15 - 3/6 W1 impl done (#350,#349,#341); DRIZZLE DUAL-VERSION cross-lane issue
- **#349 integrations DONE+VERIFIED:** 8ea940a, PR#1, 106/0 real-PG. SSRF guard + HMAC-sig + at-least-once webhook delivery (#332 contract) + connector framework + claim/lease fence. tsc exit 0. curaos pointer branch agent/bump-integrations-core-webhook-349 (d7883cf UNPUSHED). Generator-evolution finding: webhook-delivery+connector+OTel mold gap → folded into #355; + relay-clock fix (use DB now() not client clock) for #355 templates.
- **#341 documents DONE+VERIFIED:** c94b38a, PR#1, 51/0 real-PG. Append-only version-chain + WORM (app-layer retention) + PG-FTS(tsvector+pg_trgm) + durable domain events + retention cron. curaos pointer branch agent/bump-documents-core-341-cc-c1eeb124 (b7cd2b1 UNPUSHED).
- **#350 conversion** (earlier): 433fc84, PR#1, 61/0.
- **⚠️ CROSS-LANE: DRIZZLE DUAL-VERSION CONTAMINATION.** curaos/node_modules/.bun has 4 variants of drizzle-orm@0.45.2 (hash-distinct: 8c2d48f.. vs 89a681f.. etc) → SQL<unknown> private-prop mismatch across schema.ts files. Caused by 6 concurrent workers each bun-install-ing into the SHARED curaos node_modules with slightly divergent transitive trees. Each worker's OWN tsc passes (isolated), but workspace-AGGREGATE `just ci` will see the mismatch. NOT a per-service bug - shared-store artifact. FIX: after ALL 6 land, ONE clean root `bun install` to dedupe lockfile to a single drizzle-orm, then re-verify aggregate gate. Do NOT fix per-worker (re-contaminates while others install).
- geospatial (ada1e7b7 still running) owns BOTH the express-import depcruise error AND is the typecheck-red sibling 2 workers flagged.
- 2 W1 workers still running: #339 crm a856de34, #346 geospatial ada1e7b7.
- HOLD ALL 6 merges until wave completes → lockfile-dedupe pass → THEN verify each + grill (fresh-Claude fallback) + merge + batch pointer bumps serially.

## SESSION 24 cont.16 - 4/6 W1 done (#350,#349,#341,#340); 2 running
- **#340 hr DONE:** b7ad7e3, PR#1, 46/0 real-PG. employees/compensations(effective-dated bigint cents)/leave/time-track. ABAC comp-field gate (COMP_FIELD_POLICY seam, redact-to-null non-HR-mgr, 403 on write, no amounts in events) - security-critical, tested. curaos pointer branch agent/bump-hr-core-domain-claude-fe2035a2 (cc8bfed UNPUSHED).
- **CONFIRMED #355 high-value:** M11 mold ships ONLY audit-outbox, NO domain-event-outbox template. #340 routed events through audit-outbox (auditLeg='hr-domain'); #341/#349 hand-copied commerce-core domain-outbox. EVERY W1 producer needed it → #355 items 1-3 (fold domain-outbox+barrel+dynamic-module into mold) is the next critical codegen lane after this wave. Also FORESIGHT from #340: dedicated hr-manager platform role in identity-service (it mapped tenant-admin→HR-manager as interim).
- Still running: #339 crm a856de34, #346 geospatial ada1e7b7 (geospatial owns express-depcruise + typecheck-red).
- Wakeup 12:23 covers remaining 2. HOLD all 6 merges → post-wave lockfile-dedupe (drizzle dual-version) → verify+grill+merge+serial-pointer-batch.

## SESSION 24 cont.17 - 5/6 W1 done (#350,#349,#341,#340,#339); only geospatial running
- **#339 crm DONE:** 72b9258, PR#1 MERGEABLE, 66/0. contact/account/deal pipeline state-machine + configurable stages + custom_fields jsonb + party-anchored reference-only (no raw PII) + durable domain outbox + curaos.core.crm.* events. curaos pointer branch agent/bump-crm-core-domain-m11-339 (35e4567 UNPUSHED).
- **#360 filed by #339 worker** (priority=critical: domain-outbox mold fold) - DUPLICATE of #355 items 1-3. CONSOLIDATE: close #360 into #355 (or vice versa) when I do the codegen mold-fold lane. Both say "every M11 producer hand-copies commerce-core domain-outbox → fold into service-core mold."
- Only #346 geospatial (ada1e7b7) still running - owns express-depcruise + typecheck-red.
- 5/6 pointer-bump branches ready (UNPUSHED): conversion 1fb8381, integrations d7883cf, documents b7cd2b1, hr cc8bfed, crm 35e4567.
- WAKEUP 12:23 covers geospatial. ON GEOSPATIAL DONE → wave complete → POST-WAVE SEQUENCE:
  1. Root `bun install` to dedupe drizzle-orm dual-version (4 variants → 1).
  2. Per service: verify `bun test` in its submodule (re-confirm post-dedupe), grill (fresh-Claude fallback - Codex unavailable all session), check PR CodeRabbit+threads.
  3. Merge 6 service PRs (each its own repo, no curaos contention).
  4. BATCH the 6 curaos pointer bumps: checkout curaos main, set all 6 submodule pointers to merged-main SHAs, ONE curaos parent commit/PR (NOT 6 racing pointer PRs). + fix geospatial express-import (or confirm worker did).
  5. One workspace commit: pointer + 6 ai-doc dirs + DOC-GRAPH. Close #339/#340/#341/#346/#349/#350. Sweep.
  6. Consolidate #360↔#355. THEN Lane B (4 MikroORM W2) + #307 + #355/#360 mold-fold + W3/W4.

## SESSION 24 cont.18 - ALL 6 W1 IMPL DONE. domain-outbox uuid bug scoped+partially fixed.
- **#346 geospatial DONE:** 8ab15b1, PR#1, 62/0 + 5 live-PostGIS. PostGIS geography/geometry + 11 concrete curaos.core.geospatial.*.v1 channels (for fleet#347/site#353) + durable outbox + PMTiles proxy. curaos pointer branch agent/bump-geospatial-core-domain-346 (39d95c4 UNPUSHED). FIXED express-import depcruise.
- **ALL 6 W1 PRs OPEN+MERGEABLE:** crm/hr/documents/geospatial/integrations/conversion #1 each.
- **BUG #361 (critical) scoped PRECISELY:** domain-outbox enqueue `COALESCE(input.id, gen_random_uuid()::text)` = TEXT into uuid col → fails real PG. Masked by in-memory tests.
  - BUGGED: commerce-core (MERGED, latent), crm, documents - all had bare COALESCE(...).
  - CLEAN: geospatial (::uuid), integrations (6×::uuid, real-PG webhook test passed), conversion (::uuid), hr (audit-outbox route, no domain-outbox).
  - **FIXED THIS TICK:** crm 0ee7bd4 (66/0) + documents abd7282 (51/0) - appended `::uuid` to COALESCE, pushed to their PR branches. Now ALL 6 services correct.
  - REMAINING: commerce-core (merged) needs fix PR (src/db/domain-outbox.service.ts:485) + codegen MOLD template fix (fold into #355/#360). + add real-PG domain-outbox integration test to mold so it can't regress.
- Pushed notification to user re: 6 services ready + commerce-core latent bug.
- DRIZZLE dual-version (4 variants) persists - resolve via root bun install after pointers land on main (per-service lockfiles pin variants; reconciles when curaos main has all 6 + one install).

## REMAINING MERGE SEQUENCE (resume)
1. Per-service pre-merge: check each PR#1 CodeRabbit + threads (resolve), confirm bun test green. (crm/documents just got +1 commit → CodeRabbit re-review.)
2. Merge the 6 service PRs (each own repo, no curaos contention) - squash.
3. BATCH 6 curaos pointer bumps → one curaos-parent commit/PR (set all 6 submodule pointers to merged-main SHAs). NOT 6 racing PRs. Then root bun install (dedupe drizzle). Verify aggregate.
4. One workspace commit: pointer + 6 ai-doc dirs + DOC-GRAPH. Close #339/#340/#341/#346/#349/#350. Sweep.
5. commerce-core uuid fix PR + mold fix (consolidate #355+#360+#361 into ONE codegen mold-fold lane: domain-outbox template + barrel + dynamic-module + uuid-fix + real-PG test).
6. THEN Lane B (4 MikroORM W2: #342/#343/#344/#345) batch-scaffold → parallel-impl. THEN #307 Verdaccio. THEN W3 (#347 fleet/#348 esign/#353 site - W1 deps now impl'd)/W4.

## SESSION 24 cont.19 - 6 W1 PRs have 42 substantive threads → 6 resolvers dispatched
- All 6 W1 PRs CodeRabbit=pass but UNRESOLVED threads: crm 6, hr 8, documents 8, geospatial 6, integrations 9, conversion 5 (42 total). Sampled = 🟠 Major "Potential issue" (terminal-stage mutual-exclusion, DB guards, FK validation, empty-pipeline reject, unbound-publisher check) - SUBSTANTIVE, not nitpicks.
- **6 ce-pr-comment-resolver agents dispatched** (isolated submodule checkouts, parallel-safe): crm a0c83b12, hr ad358986, documents a8833a33, geospatial a053a2ad, integrations a6af2f7e, conversion a752204b. Each: triage每 thread → fix-valid(TDD)/justify-nonissue → reply+resolve → keep bun run ci green → push to PR branch. Security-sensitive emphasis per service (hr ABAC, integrations SSRF/delivery, documents WORM, geospatial PostGIS-SQLi, conversion PHI).
- ON ALL 6 RESOLVED (0 unresolved each + ci green): merge 6 service PRs (squash) → batch 6 curaos pointer bumps in ONE curaos-parent commit + root bun install (drizzle dedupe) → one workspace commit (pointer+ai-docs+DOC-GRAPH) → close #339/#340/#341/#346/#349/#350 → sweep.
- THEN: commerce-core uuid fix PR + consolidated codegen mold-fold lane (#355+#360+#361: domain-outbox template + ::uuid fix + barrel + dynamic-module + real-PG test). THEN Lane B (MikroORM W2 #342-345). THEN #307. THEN W3/W4.

## SESSION 24 cont.20 - USER: "1+3 in parallel" (pre-M11 tail) + #307/#321 dispatched
- User asked again re: pre-M11 / M1-M10 open items. ANSWER GIVEN: M1-M10 epics #23/#24 CLOSED wave-done; all open M1-M10-era items are FORESIGHT-quarantined backlog (#317/#318/#322/#330/#194/#208) EXCEPT #307 Verdaccio (directive-activated, not done). They show under old milestones because of STALE Project Milestone field = #321's job. Future epics #26-29 correctly blocked.
- User chose **option 1 + 3 parallel:** dispatch #307 NOW + fix board hygiene #321 NOW, AND hold W1 merges until resolvers finish.
- **#307 Verdaccio dispatched (aaebfeb5):** tiered dev-anon/live+staging-curaos-ci, agent-automated htpasswd, curaos/ops. GUARDED: own branch off curaos main, touch ONLY curaos/ops, NEVER touch dirty submodule pointers (6 W1 mid-flight), STOP-if-can't-isolate.
- **#321 board hygiene dispatched (a0ee7a63):** pure-API, re-group foresight items off completed M1-M10 milestones to true target + enforcement gate.
- **conversion resolver (a752204b) DONE:** 5→0 threads, 9007a48 pushed, 61/0. PR ready.
- 5 resolvers still running: crm a0c83b12, hr ad358986, documents a8833a33, geospatial a053a2ad, integrations a6af2f7e.
- HOLD W1 merges until ALL 6 resolvers 0-unresolved + ci-green. Then merge 6 + batch pointer bump + dedupe drizzle + close issues. #307/#321 land independently (own PRs / API).

## SESSION 24 cont.21 - resolver progress 2/6 (conversion, crm done)
- **crm resolver (a0c83b12) DONE:** 6→0 threads, 59bd02d pushed, 71/0 (+5 tests). Fixes: terminal-flags CHECK via ADDITIVE 0003 migration (rolling-update-correct, not rewriting 0002), FK validation (accountId/contactId tenant-scoped reject), no-opening-stage reject, unbound-publisher guard before pending()/claim. ::uuid fix preserved. PR ready 0-unresolved.
- **conversion (a752204b) DONE** earlier: 5→0, 9007a48, 61/0.
- 4 resolvers running: hr ad358986, documents a8833a33, geospatial a053a2ad, integrations a6af2f7e. + #307 aaebfeb5 + #321 a0ee7a63.
- crm + conversion PRs MERGE-READY (0 unresolved, ci green) - but HOLD per user option-3 until ALL 6 resolvers done, then merge batch together.

## SESSION 24 cont.22 - resolver 3/6 (hr done)
- hr resolver (ad358986) DONE: 8→0, daa271e, 46/0. Composite-FK tenant-scoping (UNIQUE(tenant_id,id)+composite FKs), closed-oneOf event payload (no-amounts enforced), pending-guard parity, conn-leak cleanup. ABAC intact. PR ready.
- Done 3/6: conversion, crm, hr. Running: documents a8833a33, geospatial a053a2ad, integrations a6af2f7e + #307 aaebfeb5 + #321 a0ee7a63.

## SESSION 24 cont.23 - resolver 4/6 (geospatial done)
- geospatial resolver (a053a2ad) DONE: 6→0, 99b164d, 68/0+6 live-PostGIS. CRITICAL fix: tx-scope (spatial insert + outbox enqueue one commit boundary, durable-before-ack + rollback-atomicity test). + turf/ST_Contains boundary parity, fail-closed-missing-outbox, prod-bindings validator. ::uuid + express-fix preserved. Self-caught reply-mapping off-by-one, corrected. PR ready.
- Done 4/6: conversion, crm, hr, geospatial. Running: documents a8833a33, integrations a6af2f7e + #307 aaebfeb5 + #321 a0ee7a63.

## SESSION 24 cont.24 - resolver 5/6 (integrations done)
- integrations resolver (a6af2f7e) DONE: 9→0, b7065ef, 114/0 live-PG. Closed REAL SSRF hole (fe80::/10 mask wrong→fixed + DNS-rebinding IP-pinning), CRITICAL Citus-safe atomic claim (SKIP LOCKED→optimistic UPDATE...RETURNING), composite FKs (Citus co-loc, additive 0003), clock-skew reschedule(delayMs server-side now()+interval), webhookEventType guard, fenced-transition lostClaim. PR ready.
- Done 5/6: conversion, crm, hr, geospatial, integrations. ONLY documents a8833a33 running + #307 aaebfeb5 + #321 a0ee7a63.
- ON documents done → ALL 6 resolvers complete → execute MERGE BATCH (see cont.18/19 sequence): re-check each PR 0-unresolved+ci, merge 6 squash, batch 6 pointer bumps one curaos commit + root bun install (drizzle dedupe), one workspace commit, close #339-341/#346/#349/#350, sweep.

## SESSION 24 cont.25 - ALL 6 W1 PRs MERGED. #321 done. Pointer-batch BLOCKED on #307 in-flight.
- ALL 6 resolvers done (documents a8833a33 last: 8→0, cff6039, 54/0). hr+geospatial had 1 straggler each (CodeRabbit incremental on resolver pushes): hr nullable:true→JSON-Schema-2020-12 [string,null] (0e8c794), geospatial NODE_ENV restore-via-delete (e404b89). Both fixed+resolved+pushed.
- **ALL 6 W1 SERVICE PRs MERGED (squash):** crm 651cc5f, hr debfb33, documents 1a7e786, geospatial 1ef8474, integrations c89a948, conversion da7b3f2. Branches deleted.
- **#321 board hygiene DONE (a0ee7a63):** all 7 mis-grouped foresight items moved off completed M8/M9/M10 → true targets (M11×4: #322/id73/#307/#208; M12×2: #317/#318; M15×1: #330). 0 foresight on completed milestones now. New script check-roadmap-milestone-fields (exit-3 gate) + milestone-wave probe. #321 CLOSED. USER'S CONCERN STRUCTURALLY FIXED.
- ⚠️ **POINTER-BATCH BLOCKED:** curaos checkout is on #307's branch agent/ops-verdaccio-publisher-307-9c481825, #307 STILL RUNNING (editing ops/dev/verdaccio/ - config.yaml+docker-compose.yml+config.authed.yaml). I synced the 6 submodules to merged SHAs (harmless working-tree pointer moves, different paths from #307's ops edits) but did NOT commit. Must WAIT for #307 to finish+push its ops branch, THEN do the 6-pointer batch on a fresh branch off curaos main.
- ON #307 DONE: verify #307 (its own PR), then: fresh branch off curaos main → sync 6 submodules to merged SHAs → ONE curaos commit (6 pointers) → root bun install (drizzle dedupe) → push → curaos PR → merge → workspace pointer bump + 6 ai-doc dirs + DOC-GRAPH → close #339/#340/#341/#346/#349/#350 → sweep.
- THEN: commerce-core uuid fix PR + consolidated mold-fold (#355/#360/#361). THEN Lane B (4 MikroORM W2). THEN W3/W4.

## SESSION 24 cont.26 - CLOSURE AUDIT (user challenge) + #330 + #307 done
- USER challenged closures. Adversarial audit (a7ffa72b) of 13 closed + 7 regrouped: VERDICT = NO issue wrongly-closed; all 13 have merged-PR-with-Closes-ref / on-disk artifact / child issues. #327 NOT mis-bookkeeping (acceptance=produce-decision, met). 6 W1 already-reopened (my earlier self-caught error). 
- Acted on 3 audit follow-ups: #328 verified (contract.md 6.9K under notify-service + research doc present) → evidence comment, leave closed; #323/#327 evidence comments added (were closed w/o closeout comment).
- #330 air-gap M8→M15: USER chose KEEP M15 (audit move stands).
- #192/#354 closed manually (PRs merged but no Closes-ref) - bookkeeping note only, work done.
- **#307 Verdaccio DONE (aaebfeb5):** PR #202, 3-tier (DEV anon/STAGING+LIVE curaos-ci authed), programmatic htpasswd provisioner (no manual/no committed secret), 7-SDK publish-smoke + codegen fold. ZERO submodule pointers touched (isolation guard held). E2E verified. Codex-grilled. curaos checkout RELEASED.
- ⚠️ syncpack 137-mismatch repo-wide failure flagged by #307 (W1 frontend files mid-flight) - proven not #307. CONFIRM transient (resolves when W1 pointers land) before pointer-batch.

## SESSION 24 cont.27 - pointer-batch #203 + #307 #202; checkout contention managed
- **Pointer-batch:** fresh branch agent/bump-m11-w1-batch6-pointers off main, 6 pointers→merged SHAs verified, root bun install reconciled bun.lock (per-service typecheck clean post-install - dual-version was editor-LSP-vs-stale-store, not real). Commit 161199f pushed. **curaos PR #203** (Closes #339/#340/#341/#346/#349/#350). CodeRabbit in progress.
- **#307 PR #202** CodeRabbit done, 7 unresolved 🟠 Major threads (.env.* ignore, Verdaccio config correctness, sdk-publish endpoint-whitelist + temp-.npmrc finally-cleanup). Resolver af564f2a dispatched (switches checkout to #307 branch - DO NOT touch checkout while it runs).
- #330 kept M15 (user). Closure-audit follow-ups done (#328/#323/#327 evidence comments).
- NEXT: #203 CodeRabbit → check threads → merge #203 (Closes 6 W1 issues w/ merged code - correct auto-close this time) → sync checkout main + workspace pointer bump (curaos main) + 6 ai-doc dirs + DOC-GRAPH + grills → sweep. #202 resolver done → merge #202 (Verdaccio). 
- THEN: commerce-core uuid fix PR (#361, merged code has the bug) + consolidated mold-fold #355/#360/#361. THEN Lane B (4 MikroORM W2 #342-345). THEN W3/W4.
- ⚠️ syncpack 137-mismatch (W1 frontend mid-flight, flagged by #307) - recheck after W1 pointers land; likely transient.

## SESSION 24 cont.28 - ALL 6 M11 W1 DOMAINS LANDED + registered + closed (legit DoD)
- #203 MERGED → curaos main 04012ad (6 W1 pointers). 6 W1 issues CLOSED with full merge-evidence (cross-repo so manual close - domain impl merged + pointers registered + threads resolved + ::uuid fix = full DoD met, NOT premature).
- Workspace pushed 28ba5c9: curaos pointer 04012ad + 6 services ai-docs + codegen CONTEXT + 4 grills + DOC-GRAPH (1109n). ai-mirror 1:1. Checkout clean on main.
- Swept 7 notifications (6 W1 + #203). #202 held (Verdaccio, CodeRabbit re-reviewing resolver push e64e5e7; 0 unresolved, MERGEABLE).
- #202 resolver (af564f2a) DONE: 7→0, e64e5e7. Real security fixes (.env.* ignore, publish-scope @curaos/* only, registry allowlist, temp-.npmrc finally-cleanup).
- The diagnostics flood during the run = checkout on #307 branch w/ submodule HEADs in flux - TRANSIENT, resolved on sync-to-main; merged service mains verified green.
- NEXT: merge #202 (pending CodeRabbit) → close #307 + workspace bump for verdaccio ops. THEN commerce-core uuid fix PR (#361 - merged code has ::text bug) + consolidated mold-fold #355/#360/#361 (domain-outbox+barrel+dynamic-module+::uuid+real-PG-test into codegen mold). THEN Lane B (4 MikroORM W2 #342/#343/#344/#345 batch-scaffold→parallel-impl). THEN W3 (#347 fleet/#348 esign/#353 site - W1 deps now done)/W4 (#351/#352).
- recheck syncpack 137-mismatch (should clear now W1 pointers landed).

## SESSION 24 cont.29 - #202 merged, #307 closed; Lane-B mold defect; zombie workflow
- #202 Verdaccio MERGED (curaos cf0dcc2, workspace faf833c). #307 CLOSED.
- **Lane B (4 MikroORM W2) STOPPED correctly** - #354 mikro-orm tier ships NON-BUILDING scaffold: audit-outbox.service.ts.hbs + audit-chain-head.store.ts.hbs hardcode `import {sql} from 'drizzle-orm'` w/ NO orm conditional → mikro-orm scaffold imports uninstalled pkg. Worker stopped at sales (1st), didn't mass-produce 4 broken trees. 4 empty W2 repos created+reusable (sales/procurement/inventory/accounting). Cleaned sales reproduction; curaos checkout clean.
- **CONSOLIDATED codegen mold-fix dispatched (a99b591d, curaos checkout):** (1) #354 mikro-orm audit-template defect (orm conditional + MikroORM-backed path), (2) #355/#360 domain-outbox+dynamic-module+barrel templates fold, (3) #361 ::uuid in mold + real-PG test + mikro-orm buildability snapshot. Parallel-safe w/ commerce fix (commerce submodule).
- **commerce-core #361 fix DONE (aeb483db):** ::uuid cast + NEW real-PG regression test (RED→GREEN verified vs real PG - the gap that masked it). PR commerce-core#2, 105/0, 8b381fd pushed. curaos pointer branch agent/bump-commerce-core-domain-outbox-uuid-361 (7704a70 UNPUSHED). audit-outbox NOT affected. crm/documents already carry fix.
- **ZOMBIE WORKFLOW (user flagged 12h task-execute 2/3):** TaskList empty, TaskStop "no task found" on all candidates, no OS process. = dead run, frozen UI display only (3rd agent was a Codex grill that errored on usage-limit/gpt-5-unsupported, leg never resolved). Work OBSOLETE (all task-execute-era issues redone via direct agents + merged). Cosmetic ghost, zero cost, clears on /workflows refresh. Cannot force-remove a display entry runtime no longer tracks.
- NEXT: commerce#2 CodeRabbit→merge+close#361+pointer. mold-fix done→verify+grill+merge→re-run Lane B W2 scaffold (4 repos reusable)→W2 parallel-impl. THEN W3/W4.

## cont.30+ - W2/W3/W4 scaffold + impl wave (2026-06-03)
- Codegen lane CLOSED: #204(mikro drizzle keep)+#205(side-effect import lock)+#206(domain-outbox mold fold)+#207(barrel export type) merged; #354res/#355/#360/#361 closed. Carve 360-1 logged.
- 8 services scaffolded via mold (--core-only, durable-outbox OOTB), wired as -core-service submodules (#208), mis-named stubs removed, ai-mirror migrated (rich specs preserved). curaos 9b701b3, workspace 0da30df.
- 8 impl workers DONE, all PR#1 green (sales58/proc78/inv57/fleet60/esign41+4skip/donation69/event65+3skip/site67), aggregate turbo 16/16 FULL TURBO.
- Grill workflow wgrz2j9p7 running (8 parallel opposite-harness skeptics).
- Foresight seeded+boarded: #365(event-sourced ledger) #366(relay guard) #367(scopedRead stub) #368(domain-events+store-seam - BIG recurring). All M11+Backlog STAGED.
- PENDING: grill verdicts → resolve P0/P1 → merge 8 PRs → bump pointers → close issues → THEN accounting #345 (blocked-by sales/proc/inv).

## cont.30 FINAL - W2/W3/W4 + accounting wave COMPLETE (2026-06-03)
- ALL 16 M11 neutral core-services shipped+registered+building. W2/W3/W4: sales#342 proc#343 inv#344 fleet#347 esign#348 donation#351 event#352 site#353 + accounting#345 - all merged.
- Grill caught 3 P0 (esign durable-iff-write+audit, donation consumer-idempotency) + accounting P1 money-precision - all fixed+re-grilled SAFE. CodeRabbit 60+ threads resolved (incl donation PHI donor-name removal).
- curaos main: 4660019 → 785ee70 → 3283531. workspace main: 3283531.
- Foresight seeded+boarded: #362-369 (mold folds). #369 labeled+boarded this turn.
- Inbox swept clean. Zero ready-for-agent in M11 active queue.
- OPEN DECISION: close Epic #25? Core-tier (16 domains) DONE; personal/business triplet-split = #325 (GA-wave-2). Escalating - do NOT unilaterally close (user sensitive to premature closes).

## cont.30 - M11 CLOSED (2026-06-03)
- Epic #25 CLOSED. All 16 neutral core-services shipped+grilled+merged.
- Mold-fold mini-wave (user-chosen): #209 (#366/#364/#369) + #210 (#368/#365) folded+grilled+merged. #210 P0 durability-theater-in-mold caught+fixed (fail-on-revert proven).
- Closed: #25 #342 #343 #344 #345 #347 #348 #351 #352 #353 #355 #360 #361 #354res #364 #365 #366 #368 #369.
- Open M11 = foresight Backlog only: #336 #357 #362 #363 + #325(GA-w2). M12-15 epics blocked (future).
- Final: curaos c542100, workspace c542100. Inbox clean. M11 TERMINAL.
