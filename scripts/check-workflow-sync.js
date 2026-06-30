#!/usr/bin/env node
// Verify each agent-workflow playbook (.md) and its executor (.js) declare the SAME CONTRACT.
// Scope (intentionally narrow, per HIERARCHY-DESIGN grill F6): deep-equal the machine-checkable
// CONTRACT block only (name/kind/version/inputs/outputs/guarantees/verification/models/composes).
// Does NOT attempt prose-vs-code semantic diff.
//
// REVERSE pass (RP-19): every scripts/workflows/*.workflow.js executor must have a paired playbook
// at docs/agents/workflows/<name>.md OR an explicit INTERNAL_EXECUTORS allowlist entry below.
// The forward pass alone reported "N in sync, 0 problems" while an executor with NO playbook
// existed; non-Claude harnesses told to follow the playbooks natively had nothing to follow.
//
// Usage: node scripts/check-workflow-sync.js [--json]
// Exit 0 = all pairs in sync (or no workflows yet). Exit 1 = drift / missing pair / parse error.

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const PLAYBOOK_DIR = path.join(root, "docs/agents/workflows");
const EXEC_DIR = path.join(root, "scripts/workflows");
const jsonOut = process.argv.includes("--json");

// Executors with NO playbook on purpose: composed exclusively by other executors and never offered
// to non-Claude harnesses as a "follow the playbook" fallback. Keep this list SHORT; every entry
// needs an inline justification. A stale entry (playbook exists, or executor gone) FAILS the gate.
const INTERNAL_EXECUTORS = new Set([
  // frontend v1 buildout executors (#726/#730): one-shot orchestration drivers that
  // built/landed the 22-app fleet + Helm charts. Internal-only, not reusable library
  // workflows, so they carry no playbook + no trigger-map row. Kept tracked for
  // provenance + resume; remove once the v1 fleet buildout is fully closed.
  "fe-commit-fanned-apps",
  "fe-design-fold",
  "fe-fanout-web-apps",
  "fe-flagship-depth",
  "fe-foundation",
  "fe-foundation-repair",
  "fe-generator-depth",
  "fe-helm-chart-land",
  "fe-helm-charts",
  "fe-hosted-login",
  "fe-od-icon-set",
  "fe-pkce-tests-palette",
  "fe-reemit-fanned-apps",
  "fe-rn-icons",
  "fe-rn-recipe",
  "fe-security-propagate",
  "fe-test-regression-fix",
  "fe-v1-audit",
  "fe-v1-closure",
  "fe-v1-closure-2",
  "fe-v1-closure-3",
  // v1 functional-parity program (ADR-0219): measurement + dependency-issue seeding.
  "fe-v1-coverage-matrix",
  "fe-v1-coverage-rerun",
  "fe-v1-backend-deps-seed",
  // v1 backend build wave: scaffold + domain contract per trio root (epic #734).
  "v1-backend-build-wave",
  "v1-backend-pr-verify",
  "v1-fe-wave",
  // v1 FE parity wave (native Claude orchestration): per-app submodule PR to ADR-0219 Done-criteria.
  "v1-fe-native-wave",
]);

const problems = [];
const ok = [];

function rel(p) {
  return path.relative(root, p).replaceAll(path.sep, "/");
}

// --- minimal YAML frontmatter extractor (the CONTRACT subset we control: scalars, nested maps, arrays) ---
function extractFrontmatter(md) {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  return m ? m[1] : null;
}

// Parse the YAML subset our contracts use into a normalized JS object.
// Supports: nested 2-space-indented maps, `key: scalar`, `key: { inline }`, `key: [a, b]`.
function parseContractYaml(yaml) {
  // Normalize inline flow maps/arrays to a parseable shape by walking lines with an indent stack.
  const lines = yaml.split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith("#"));
  const rootObj = {};
  const stack = [{ indent: -1, obj: rootObj }];
  for (const raw of lines) {
    const indent = raw.length - raw.trimStart().length;
    const line = raw.trim();
    const cm = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!cm) continue;
    const key = cm[1];
    const val = cm[2];
    while (stack.length && indent <= stack[stack.length - 1].indent) stack.pop();
    const parent = stack[stack.length - 1].obj;
    if (val === "") {
      const child = {};
      parent[key] = child;
      stack.push({ indent, obj: child });
    } else {
      parent[key] = parseScalarOrFlow(val);
    }
  }
  return rootObj;
}

function parseScalarOrFlow(v) {
  v = v.trim();
  if (v.startsWith("{") && v.endsWith("}")) {
    // inline map: { a: x, b: y }
    const obj = {};
    const inner = v.slice(1, -1).trim();
    if (inner) {
      for (const part of splitTopLevel(inner)) {
        const i = part.indexOf(":");
        if (i === -1) continue;
        obj[part.slice(0, i).trim()] = parseScalarOrFlow(part.slice(i + 1));
      }
    }
    return obj;
  }
  if (v.startsWith("[") && v.endsWith("]")) {
    const inner = v.slice(1, -1).trim();
    return inner ? splitTopLevel(inner).map((s) => parseScalarOrFlow(s)) : [];
  }
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) return v.slice(1, -1);
  if (v === "true") return true;
  if (v === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  return v;
}

// split on top-level commas (ignore commas inside nested {} [] AND inside quoted strings)
function splitTopLevel(s) {
  const out = [];
  let depth = 0;
  let cur = "";
  let quote = null;
  for (const ch of s) {
    if (quote) {
      cur += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
      continue;
    }
    if (ch === "{" || ch === "[") depth++;
    else if (ch === "}" || ch === "]") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

// --- extract `export const CONTRACT = {...}` from a JS file and eval it in a tiny sandbox ---
function extractJsContract(js) {
  const m = js.match(/(?:export\s+)?const\s+CONTRACT\s*=\s*(\{[\s\S]*?\n\})/);
  if (!m) return null;
  try {
    // eslint-disable-next-line no-new-func
    return Function(`"use strict"; return (${m[1]});`)();
  } catch (e) {
    return { __parseError: String(e) };
  }
}

// --- normalized deep-equal (order-independent for objects; arrays compared as sets of scalars) ---
function normalize(x) {
  if (Array.isArray(x)) return [...x.map(normalize)].sort((a, b) => JSON.stringify(a) < JSON.stringify(b) ? -1 : 1);
  if (x && typeof x === "object") {
    const o = {};
    for (const k of Object.keys(x).sort()) o[k] = normalize(x[k]);
    return o;
  }
  return x;
}
function deepEqual(a, b) {
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
}

const CONTRACT_KEYS = ["name", "kind", "version", "inputs", "outputs", "guarantees", "verification", "composition", "models", "composes"];

function pickContract(obj) {
  const out = {};
  for (const k of CONTRACT_KEYS) if (obj[k] !== undefined) out[k] = obj[k];
  return out;
}

function main() {
  const playbooks = fs.existsSync(PLAYBOOK_DIR)
    ? fs
        .readdirSync(PLAYBOOK_DIR)
        .filter((f) => f.endsWith(".md") && !["README.md", "HIERARCHY-DESIGN.md"].includes(f))
    : [];
  const executors = fs.existsSync(EXEC_DIR)
    ? fs.readdirSync(EXEC_DIR).filter((f) => f.endsWith(".workflow.js"))
    : [];

  // Only "nothing to check" when BOTH sides are empty. A bare-executor tree (playbook dir missing
  // or empty while executors exist) must fall through to the reverse pass, not exit green.
  if (playbooks.length === 0 && executors.length === 0) {
    console.log("workflow-sync: no workflow playbooks or executors yet - nothing to check");
    process.exit(0);
  }

  for (const pb of playbooks) {
    const name = pb.replace(/\.md$/, "");
    const mdPath = path.join(PLAYBOOK_DIR, pb);
    const jsPath = path.join(EXEC_DIR, `${name}.workflow.js`);
    const md = fs.readFileSync(mdPath, "utf8");
    const fm = extractFrontmatter(md);
    if (!fm) {
      problems.push(`${rel(mdPath)}: no YAML frontmatter (CONTRACT required)`);
      continue;
    }
    const mdContract = pickContract(parseContractYaml(fm));
    if (!mdContract.name) {
      problems.push(`${rel(mdPath)}: frontmatter missing CONTRACT keys (need at least name/kind/version)`);
      continue;
    }
    if (!fs.existsSync(jsPath)) {
      problems.push(`${rel(mdPath)}: no matching executor at ${rel(jsPath)}`);
      continue;
    }
    const jsContract = extractJsContract(fs.readFileSync(jsPath, "utf8"));
    if (!jsContract) {
      problems.push(`${rel(jsPath)}: no \`export const CONTRACT = {...}\``);
      continue;
    }
    if (jsContract.__parseError) {
      problems.push(`${rel(jsPath)}: CONTRACT parse error: ${jsContract.__parseError}`);
      continue;
    }
    const jsPicked = pickContract(jsContract);
    if (!deepEqual(mdContract, jsPicked)) {
      problems.push(
        `${name}: CONTRACT drift between playbook and executor\n` +
          `    .md: ${JSON.stringify(normalize(mdContract))}\n` +
          `    .js: ${JSON.stringify(normalize(jsPicked))}`
      );
      continue;
    }
    if (mdContract.name !== name) {
      problems.push(`${name}: CONTRACT.name "${mdContract.name}" != filename "${name}"`);
      continue;
    }
    // composes must name real sibling executors (catches phantom-composition contracts)
    const composes = Array.isArray(jsContract.composes) ? jsContract.composes : [];
    const missing = composes.filter((c) => !fs.existsSync(path.join(EXEC_DIR, `${c}.workflow.js`)));
    if (missing.length) {
      problems.push(`${name}: composes names non-existent executor(s): ${missing.join(", ")} (build them or remove from composes)`);
      continue;
    }
    // a composite must actually call workflow(); an atomic must not
    // A composite must compose its declared atomics. composition: "nested" (default) means it calls
    // workflow() directly; composition: "inline" means it INLINES a child's body (because workflow()
    // nesting caps at 1 level and this composite is itself composed/at the top) and must STILL reach
    // its composed units via at least one 1-level workflow() call to a real executor.
    const jsBody = fs.readFileSync(jsPath, "utf8");
    const callsWorkflow = /\bworkflow\s*\(/.test(jsBody.replace(/\/\/.*$/gm, ""));
    const composition = jsContract.composition || "nested";
    if (jsContract.kind === "composite" && composes.length) {
      if (composition === "nested" && !callsWorkflow) {
        problems.push(`${name}: kind=composite composition=nested with composes=[${composes.join(",")}] but the executor makes no workflow() call (relabel kind:atomic + composes:[], set composition:inline, or actually compose)`);
        continue;
      }
      if (composition === "inline" && !callsWorkflow) {
        problems.push(`${name}: kind=composite composition=inline but the executor makes NO workflow() call at all (an inline composite still reaches its composed ATOMICS 1-level deep - it must call workflow() on at least one)`);
        continue;
      }
      if (composition !== "nested" && composition !== "inline") {
        problems.push(`${name}: CONTRACT.composition must be "nested" or "inline" (got "${composition}")`);
        continue;
      }
    }
    ok.push(name);
  }

  // --- reverse pass: executor -> playbook (or allowlist) ---
  const playbookNames = new Set(playbooks.map((f) => f.replace(/\.md$/, "")));
  for (const ex of executors) {
    const name = ex.replace(/\.workflow\.js$/, "");
    const hasPlaybook = playbookNames.has(name);
    const allowlisted = INTERNAL_EXECUTORS.has(name);
    if (!hasPlaybook && !allowlisted) {
      problems.push(
        `${rel(path.join(EXEC_DIR, ex))}: executor has NO playbook at docs/agents/workflows/${name}.md and NO INTERNAL_EXECUTORS allowlist entry (write the playbook + trigger-map row in docs/agents/workflows.md, or allowlist it with a justification)`
      );
      continue;
    }
    if (hasPlaybook && allowlisted) {
      problems.push(
        `${name}: listed in INTERNAL_EXECUTORS but a playbook exists at docs/agents/workflows/${name}.md - stale allowlist entry (remove it so the pair check binds)`
      );
      continue;
    }
    if (!hasPlaybook && allowlisted) ok.push(`${name} (internal executor, allowlisted - no playbook required)`);
    // hasPlaybook && !allowlisted: already covered by the forward pair pass above
  }
  // a stale allowlist entry naming a non-existent executor is itself drift
  for (const name of INTERNAL_EXECUTORS) {
    if (!executors.includes(`${name}.workflow.js`)) {
      problems.push(`INTERNAL_EXECUTORS entry "${name}" names no existing executor under scripts/workflows/ (remove the stale entry)`);
    }
  }

  if (jsonOut) {
    console.log(JSON.stringify({ ok, problems }, null, 2));
  } else {
    for (const o of ok) console.log(`workflow-sync ok: ${o}`);
    for (const p of problems) console.error(`workflow-sync FAIL: ${p}`);
    console.log(`\n${ok.length} in sync, ${problems.length} problem(s)`);
  }
  process.exit(problems.length ? 1 : 0);
}

main();
