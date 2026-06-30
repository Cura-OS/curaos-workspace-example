#!/usr/bin/env node
// Tests for scripts/generate-project-schema.js (RP-32). Pure node:test with an injected
// gql stub (same injection pattern as gh-project.js throttleContentOp nowMs): no network.
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  PAGE_CAP,
  sanitizeDashes,
  fetchProjectSchema,
  renderSchemaDoc,
  normalizeForCheck,
} = require("./generate-project-schema");

const EM = "\u2014";
const EN = "\u2013";

function projectNode(overrides = {}) {
  return {
    id: "PVT_test",
    number: 2,
    title: "CuraOS Roadmap",
    url: "https://github.com/orgs/your-org/projects/2",
    closed: false,
    fields: {
      pageInfo: { hasNextPage: false },
      nodes: [
        { id: "F1", name: "Title", dataType: "TITLE" },
        {
          id: "F2",
          name: "Status",
          dataType: "SINGLE_SELECT",
          options: [{ id: "o1", name: "Backlog" }, { id: "o2", name: "Done" }],
        },
        { id: "F3", name: "Module", dataType: "TEXT" },
      ],
    },
    views: {
      pageInfo: { hasNextPage: false },
      nodes: [
        { id: "V1", name: "Roadmap", number: 1, layout: "ROADMAP_LAYOUT", filter: "-status:Done" },
        { id: "V2", name: "By Domain", number: 7, layout: "BOARD_LAYOUT", filter: null },
      ],
    },
    ...overrides,
  };
}

function gqlReturning(nodes, { hasNextPage = false } = {}) {
  return () => ({
    data: { organization: { projectsV2: { pageInfo: { hasNextPage }, nodes } } },
  });
}

test("fetchProjectSchema resolves the OPEN project by exact title among noise", () => {
  const target = projectNode();
  const gql = gqlReturning([
    projectNode({ id: "PVT_closed", title: "CuraOS Roadmap", closed: true, number: 1 }),
    projectNode({ id: "PVT_other", title: "CuraOS Roadmap (archive)", number: 3 }),
    target,
  ]);
  const got = fetchProjectSchema({ gql });
  assert.equal(got.id, "PVT_test");
  assert.equal(got.number, 2);
});

test("fetchProjectSchema fails closed: missing, ambiguous, truncated pages", () => {
  assert.throws(() => fetchProjectSchema({ gql: gqlReturning([]) }), /no OPEN project titled/);
  assert.throws(
    () => fetchProjectSchema({ gql: gqlReturning([projectNode(), projectNode({ id: "PVT_dup" })]) }),
    /ambiguous/,
  );
  assert.throws(
    () => fetchProjectSchema({ gql: gqlReturning([projectNode()], { hasNextPage: true }) }),
    new RegExp(`>${PAGE_CAP} projects matched`),
  );
  const truncatedFields = projectNode();
  truncatedFields.fields.pageInfo.hasNextPage = true;
  assert.throws(
    () => fetchProjectSchema({ gql: gqlReturning([truncatedFields]) }),
    /fields exceed one/,
  );
  assert.throws(
    () => fetchProjectSchema({ gql: () => ({ data: {} }) }),
    /malformed GraphQL response/,
  );
});

test("renderSchemaDoc splits custom vs built-in fields and renders views", () => {
  const doc = renderSchemaDoc(projectNode(), { generatedDate: "2026-06-10" });
  assert.match(doc, /## Custom fields \(2\)/);
  assert.match(doc, /\| `Status` \| SINGLE_SELECT \| `Backlog` \/ `Done` \|/);
  assert.match(doc, /\| `Module` \| TEXT \|  \|/);
  assert.match(doc, /## Built-in fields \(1\)/);
  assert.match(doc, /\| `Title` \| TITLE \|/);
  assert.match(doc, /## Views \(2\)/);
  assert.match(doc, /\| 1 \| Roadmap \| ROADMAP_LAYOUT \| `-status:Done` \|/);
  assert.match(doc, /\| 7 \| By Domain \| BOARD_LAYOUT \| \(none\) \|/);
  assert.match(doc, /\| Number \| 2 \(informational; resolve by TITLE/);
  // The doc tells consumers to resolve by title, never the hardcoded number.
  assert.match(doc, /never hardcode the number/);
});

test("renderSchemaDoc sanitizes em/en dashes and pipes from live strings", () => {
  const node = projectNode();
  node.views.nodes[0].filter = `status:Done ${EM} legacy`;
  node.fields.nodes[2].name = `Module ${EN} owner`;
  node.fields.nodes[1].options.push({ id: "o3", name: "A|B" });
  const doc = renderSchemaDoc(node, { generatedDate: "2026-06-10" });
  assert.equal(new RegExp(`[${EM}${EN}]`).test(doc), false, "generated doc must carry zero em/en dashes");
  assert.match(doc, /status:Done - legacy/);
  assert.match(doc, /Module - owner/);
  assert.match(doc, /`A\\\|B`/);
});

test("sanitizeDashes replaces both banned glyphs and tolerates null", () => {
  assert.equal(sanitizeDashes(`a${EM}b${EN}c`), "a-b-c");
  assert.equal(sanitizeDashes(null), "");
});

test("normalizeForCheck: date-only refresh is NOT drift; schema change IS", () => {
  const a = renderSchemaDoc(projectNode(), { generatedDate: "2026-06-10" });
  const b = renderSchemaDoc(projectNode(), { generatedDate: "2027-01-01" });
  assert.equal(normalizeForCheck(a), normalizeForCheck(b));
  const changed = projectNode();
  changed.fields.nodes[1].options.push({ id: "o9", name: "Quarantined" });
  const c = renderSchemaDoc(changed, { generatedDate: "2026-06-10" });
  assert.notEqual(normalizeForCheck(a), normalizeForCheck(c));
});
