#!/usr/bin/env node
// Tests for check-agents-schema.js (RP-14 acceptance criteria + axis coverage).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const sourceScriptPath = path.join(__dirname, "check-agents-schema.js");

function writeFile(root, relativePath, content) {
  const fullPath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
}

function validAgentsMd() {
  return [
    "---",
    "name: sample-service",
    "description: Sample module for schema gate tests",
    "tags: [sample]",
    "language: TypeScript",
    "framework: NestJS 11",
    "infrastructure: PostgreSQL (CNPG)",
    "tooling: Bun, Drizzle",
    "apis:",
    "  - REST /api/v1/sample",
    "events:",
    "  produces: [sample.created]",
    "  consumes: []",
    "deployment_profiles: [cloud, on-prem]",
    "docs:",
    "  adr: ai/curaos/docs/adr/",
    "  context: ai/curaos/sample-service/CONTEXT.md",
    "  requirements: ai/curaos/sample-service/Requirements.md",
    "---",
    "",
    "## Mission",
    "Sample module mission text.",
    "",
    "## Toolchain Registry",
    "- Test: `bun test`",
    "",
    "## Judgment Boundaries",
    "- NEVER push to main without PR review",
    "",
  ].join("\n");
}

function initWorkspace(t) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agents-schema-"));
  t.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }));
  writeFile(tempRoot, "scripts/check-agents-schema.js", fs.readFileSync(sourceScriptPath, "utf8"));
  return tempRoot;
}

function runGate(tempRoot, args = [], env = {}) {
  return spawnSync("node", ["scripts/check-agents-schema.js", ...args], {
    cwd: tempRoot,
    encoding: "utf8",
    env: { ...process.env, CHECK_AGENTS_SCHEMA_MODE: "", ...env },
  });
}

test("fully canonical module passes in fail mode", (t) => {
  const tempRoot = initWorkspace(t);
  writeFile(tempRoot, "ai/curaos/sample-service/AGENTS.md", validAgentsMd());

  const result = runGate(tempRoot, ["--mode=fail"]);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /0 violation\(s\)/);
});

test("missing ## Mission is reported in warn mode and exits 0", (t) => {
  const tempRoot = initWorkspace(t);
  const broken = validAgentsMd().replace("## Mission\nSample module mission text.\n\n", "");
  writeFile(tempRoot, "ai/curaos/sample-service/AGENTS.md", broken);

  const result = runGate(tempRoot);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /WARN ai\/curaos\/sample-service\/AGENTS\.md: section-missing: .*## Mission/);
});

test("missing ## Mission exits 1 in fail-closed mode", (t) => {
  const tempRoot = initWorkspace(t);
  const broken = validAgentsMd().replace("## Mission\nSample module mission text.\n\n", "");
  writeFile(tempRoot, "ai/curaos/sample-service/AGENTS.md", broken);

  const result = runGate(tempRoot, ["--mode=fail"]);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /FAIL ai\/curaos\/sample-service\/AGENTS\.md: section-missing: .*## Mission/);
  assert.match(result.stderr, /fail-closed/);
});

test("allowlisted legacy file passes in warn mode with no WARN line", (t) => {
  const tempRoot = initWorkspace(t);
  const broken = validAgentsMd().replace("## Mission\nSample module mission text.\n\n", "");
  writeFile(tempRoot, "ai/curaos/legacy-service/AGENTS.md", broken);
  writeFile(
    tempRoot,
    "scripts/check-agents-schema-allowlist.txt",
    "# legacy\nai/curaos/legacy-service/AGENTS.md\n",
  );

  const result = runGate(tempRoot);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.doesNotMatch(result.stdout, /WARN/);
  assert.match(result.stdout, /1 allowlisted violation\(s\) across 1 legacy module\(s\)/);
});

test("allowlisted legacy file also passes in fail mode (ratchet semantics)", (t) => {
  const tempRoot = initWorkspace(t);
  const broken = validAgentsMd().replace("## Mission\nSample module mission text.\n\n", "");
  writeFile(tempRoot, "ai/curaos/legacy-service/AGENTS.md", broken);
  writeFile(tempRoot, "scripts/check-agents-schema-allowlist.txt", "ai/curaos/legacy-service/AGENTS.md\n");

  const result = runGate(tempRoot, ["--mode=fail"]);
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test("missing canonical frontmatter keys are named", (t) => {
  const tempRoot = initWorkspace(t);
  const broken = validAgentsMd()
    .replace("docs:\n  adr: ai/curaos/docs/adr/\n", "")
    .replace("  context: ai/curaos/sample-service/CONTEXT.md\n", "")
    .replace("  requirements: ai/curaos/sample-service/Requirements.md\n", "")
    .replace("deployment_profiles: [cloud, on-prem]\n", "");
  writeFile(tempRoot, "ai/curaos/sample-service/AGENTS.md", broken);

  const result = runGate(tempRoot, ["--mode=fail"]);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /frontmatter-keys: missing canonical frontmatter key\(s\): deployment_profiles, docs/);
});

test("file without any frontmatter reports frontmatter-missing", (t) => {
  const tempRoot = initWorkspace(t);
  writeFile(
    tempRoot,
    "ai/curaos/sample-service/AGENTS.md",
    "## Mission\nx\n\n## Toolchain Registry\nx\n\n## Judgment Boundaries\nx\n",
  );

  const result = runGate(tempRoot, ["--mode=fail"]);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /frontmatter-missing/);
});

test("file over 150 lines reports file-cap", (t) => {
  const tempRoot = initWorkspace(t);
  const padding = Array.from({ length: 140 }, (_, i) => `- boundary rule ${i}`).join("\n");
  writeFile(tempRoot, "ai/curaos/sample-service/AGENTS.md", `${validAgentsMd()}${padding}\n`);

  const result = runGate(tempRoot, ["--mode=fail"]);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /file-cap: .*150-line total cap/);
});

test("section over 50 lines reports section-cap", (t) => {
  const tempRoot = initWorkspace(t);
  const padding = Array.from({ length: 55 }, (_, i) => `- NEVER do thing ${i}`).join("\n");
  writeFile(tempRoot, "ai/curaos/sample-service/AGENTS.md", `${validAgentsMd()}${padding}\n`);

  const result = runGate(tempRoot, ["--mode=fail"]);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /section-cap: section "## Judgment Boundaries" spans \d+ lines/);
});

test("headings inside code fences do not count as sections", (t) => {
  const tempRoot = initWorkspace(t);
  const fenced = `${validAgentsMd()}## Context Map\n\n\`\`\`yaml\n## not-a-heading\nmonorepo: bun workspaces\n\`\`\`\n`;
  writeFile(tempRoot, "ai/curaos/sample-service/AGENTS.md", fenced);

  const result = runGate(tempRoot, ["--mode=fail"]);
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test("orphaned AGENTS-sections file reports sections-orphan attributed to owner", (t) => {
  const tempRoot = initWorkspace(t);
  writeFile(tempRoot, "ai/curaos/sample-service/AGENTS.md", validAgentsMd());
  writeFile(tempRoot, "ai/curaos/sample-service/AGENTS-sections/orphan.md", "## Orphan\nnobody links me\n");

  const failRun = runGate(tempRoot, ["--mode=fail"]);
  assert.equal(failRun.status, 1);
  assert.match(failRun.stdout, /AGENTS-sections\/orphan\.md: sections-orphan/);

  // Allowlisting the OWNER module covers its section files.
  writeFile(tempRoot, "scripts/check-agents-schema-allowlist.txt", "ai/curaos/sample-service/AGENTS.md\n");
  const allowRun = runGate(tempRoot, ["--mode=fail"]);
  assert.equal(allowRun.status, 0, allowRun.stdout + allowRun.stderr);
});

test("reference to nonexistent AGENTS-sections file reports sections-missing-ref", (t) => {
  const tempRoot = initWorkspace(t);
  writeFile(
    tempRoot,
    "ai/curaos/sample-service/AGENTS.md",
    `${validAgentsMd()}## Sections\n\n| 1 | Ghost | \`AGENTS-sections/ghost.md\` |\n`,
  );

  const result = runGate(tempRoot, ["--mode=fail"]);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /sections-missing-ref: references AGENTS-sections\/ghost\.md/);
});

test("AGENTS-sections file over 50 lines reports section-file-cap", (t) => {
  const tempRoot = initWorkspace(t);
  const body = Array.from({ length: 55 }, (_, i) => `- detail ${i}`).join("\n");
  writeFile(
    tempRoot,
    "ai/curaos/sample-service/AGENTS.md",
    `${validAgentsMd()}## Sections\n\n| 1 | Big | \`AGENTS-sections/big.md\` |\n`,
  );
  writeFile(tempRoot, "ai/curaos/sample-service/AGENTS-sections/big.md", `## Big\n${body}\n`);

  const result = runGate(tempRoot, ["--mode=fail"]);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /AGENTS-sections\/big\.md: section-file-cap/);
});

test("--update-allowlist writes violating owners; subsequent fail-mode run is green", (t) => {
  const tempRoot = initWorkspace(t);
  const broken = validAgentsMd().replace("## Mission\nSample module mission text.\n\n", "");
  writeFile(tempRoot, "ai/curaos/legacy-service/AGENTS.md", broken);

  const update = runGate(tempRoot, ["--update-allowlist"]);
  assert.equal(update.status, 0, update.stdout + update.stderr);
  const allowlist = fs.readFileSync(path.join(tempRoot, "scripts/check-agents-schema-allowlist.txt"), "utf8");
  assert.match(allowlist, /ai\/curaos\/legacy-service\/AGENTS\.md/);

  const rerun = runGate(tempRoot, ["--mode=fail"]);
  assert.equal(rerun.status, 0, rerun.stdout + rerun.stderr);
});

test("CHECK_AGENTS_SCHEMA_MODE env sets fail-closed mode; flag wins over env", (t) => {
  const tempRoot = initWorkspace(t);
  const broken = validAgentsMd().replace("## Mission\nSample module mission text.\n\n", "");
  writeFile(tempRoot, "ai/curaos/sample-service/AGENTS.md", broken);

  const envRun = runGate(tempRoot, [], { CHECK_AGENTS_SCHEMA_MODE: "fail" });
  assert.equal(envRun.status, 1);

  const flagWins = runGate(tempRoot, ["--mode=warn"], { CHECK_AGENTS_SCHEMA_MODE: "fail" });
  assert.equal(flagWins.status, 0, flagWins.stdout + flagWins.stderr);
});

test("explicit file argument checks just that fixture", (t) => {
  const tempRoot = initWorkspace(t);
  const broken = validAgentsMd().replace("## Mission\nSample module mission text.\n\n", "");
  writeFile(tempRoot, "fixtures/AGENTS.md", broken);
  writeFile(tempRoot, "ai/curaos/sample-service/AGENTS.md", validAgentsMd());

  const result = runGate(tempRoot, ["--mode=fail", "fixtures/AGENTS.md"]);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /FAIL fixtures\/AGENTS\.md: section-missing: .*## Mission/);
});

test("invalid mode exits 2 with usage error", (t) => {
  const tempRoot = initWorkspace(t);
  const result = runGate(tempRoot, ["--mode=bogus"]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /invalid mode/);
});

// --- RP-16 command/dependency existence drift checks -----------------------

function writeMirrorPackageJson(tempRoot) {
  writeFile(
    tempRoot,
    "curaos/sample-service/package.json",
    JSON.stringify({
      scripts: { test: "bun test", lint: "oxlint .", ci: "bun run lint && bun run test" },
      dependencies: { "@curaos/tenancy": "0.0.0", jose: "6.0.0" },
      devDependencies: { oxlint: "1.0.0" },
    }),
  );
}

test("commands.md naming a nonexistent script fails the drift gate", (t) => {
  const tempRoot = initWorkspace(t);
  writeMirrorPackageJson(tempRoot);
  writeFile(
    tempRoot,
    "ai/curaos/sample-service/AGENTS.md",
    `${validAgentsMd()}## Sections\n\n| 5 | Commands | \`AGENTS-sections/commands.md\` |\n| 6 | Dependencies | \`AGENTS-sections/dependencies.md\` |\n`,
  );
  writeFile(
    tempRoot,
    "ai/curaos/sample-service/AGENTS-sections/commands.md",
    "# Commands\n\n- `bun run test`\n- `bun run test:coverage`\n",
  );
  writeFile(
    tempRoot,
    "ai/curaos/sample-service/AGENTS-sections/dependencies.md",
    "# Deps\n\n| Package | Purpose |\n|---|---|\n| `jose` | JWT |\n",
  );

  const result = runGate(tempRoot, ["--mode=fail"]);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /command-missing: documents `bun run test:coverage`/);
  assert.doesNotMatch(result.stdout, /command-missing: documents `bun run test`/);
});

test("unmarked absent dependency is flagged; planned-marked row is exempt", (t) => {
  const tempRoot = initWorkspace(t);
  writeMirrorPackageJson(tempRoot);
  writeFile(
    tempRoot,
    "ai/curaos/sample-service/AGENTS.md",
    `${validAgentsMd()}## Sections\n\n| 6 | Dependencies | \`AGENTS-sections/dependencies.md\` |\n`,
  );
  writeFile(
    tempRoot,
    "ai/curaos/sample-service/AGENTS-sections/dependencies.md",
    [
      "# Deps",
      "",
      "| Package | Purpose |",
      "|---|---|",
      "| `@curaos/tenancy` | Tenant routing |",
      "| `better-auth` | Core auth framework |",
      "",
      "## Planned (ADR intent; planned, do not import)",
      "",
      "| Package | Purpose |",
      "|---|---|",
      "| `node-oidc-provider` | OIDC IdP |",
      "",
    ].join("\n"),
  );

  const result = runGate(tempRoot, ["--mode=fail"]);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /dependency-missing: lists `better-auth`/);
  assert.doesNotMatch(result.stdout, /node-oidc-provider/);
  assert.doesNotMatch(result.stdout, /@curaos\/tenancy/);
});

test("planned marker on the line itself exempts a command", (t) => {
  const tempRoot = initWorkspace(t);
  writeMirrorPackageJson(tempRoot);
  writeFile(
    tempRoot,
    "ai/curaos/sample-service/AGENTS.md",
    `${validAgentsMd()}## Sections\n\n| 5 | Commands | \`AGENTS-sections/commands.md\` |\n`,
  );
  writeFile(
    tempRoot,
    "ai/curaos/sample-service/AGENTS-sections/commands.md",
    "# Commands\n\n- `bun run test:e2e` (planned, do not import)\n",
  );

  const result = runGate(tempRoot, ["--mode=fail"]);
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test("drift check is skipped when the code module is not checked out", (t) => {
  const tempRoot = initWorkspace(t);
  writeFile(
    tempRoot,
    "ai/curaos/sample-service/AGENTS.md",
    `${validAgentsMd()}## Sections\n\n| 5 | Commands | \`AGENTS-sections/commands.md\` |\n`,
  );
  writeFile(
    tempRoot,
    "ai/curaos/sample-service/AGENTS-sections/commands.md",
    "# Commands\n\n- `bun run does-not-exist-anywhere`\n",
  );

  const result = runGate(tempRoot, ["--mode=fail"]);
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test("unreadable mirror package.json fails closed", (t) => {
  const tempRoot = initWorkspace(t);
  writeFile(tempRoot, "curaos/sample-service/package.json", "{not json");
  writeFile(
    tempRoot,
    "ai/curaos/sample-service/AGENTS.md",
    `${validAgentsMd()}## Sections\n\n| 5 | Commands | \`AGENTS-sections/commands.md\` |\n`,
  );
  writeFile(tempRoot, "ai/curaos/sample-service/AGENTS-sections/commands.md", "# Commands\n\n- `bun run test`\n");

  const result = runGate(tempRoot, ["--mode=fail"]);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /package-json-unreadable/);
});

// --- RP-31 status enum + STUB banner ---------------------------------------

test("frontmatter status outside the enum reports status-invalid", (t) => {
  const tempRoot = initWorkspace(t);
  const doc = validAgentsMd().replace("name: sample-service\n", "name: sample-service\nstatus: m7-s3-complete\n");
  writeFile(tempRoot, "ai/curaos/sample-service/AGENTS.md", doc);

  const result = runGate(tempRoot, ["--mode=fail"]);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /status-invalid: frontmatter status "m7-s3-complete"/);
});

test("valid enum status passes; status: stub requires the STUB banner", (t) => {
  const tempRoot = initWorkspace(t);
  const active = validAgentsMd().replace("name: sample-service\n", "name: sample-service\nstatus: active\n");
  writeFile(tempRoot, "ai/curaos/sample-service/AGENTS.md", active);
  assert.equal(runGate(tempRoot, ["--mode=fail"]).status, 0);

  const stubNoBanner = validAgentsMd().replace("name: sample-service\n", "name: sample-service\nstatus: stub\n");
  writeFile(tempRoot, "ai/curaos/sample-service/AGENTS.md", stubNoBanner);
  const failRun = runGate(tempRoot, ["--mode=fail"]);
  assert.equal(failRun.status, 1);
  assert.match(failRun.stdout, /stub-banner-missing/);

  const stubWithBanner = `${stubNoBanner}\nSTUB: no code yet, real home = curaos/backend/services/sample-service\n`;
  writeFile(tempRoot, "ai/curaos/sample-service/AGENTS.md", stubWithBanner);
  const okRun = runGate(tempRoot, ["--mode=fail"]);
  assert.equal(okRun.status, 0, okRun.stdout + okRun.stderr);
});
