"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { derivedReferences, parseGlossaryTerms, resolveReferences, touchedComponents } = require("./idd-knowledge.js");

function map(components) {
  return { schema: "ospec-component-map/v2", components, boundaries: [], dependencies: [], divergences: [] };
}

const MAP = map([
  {
    id: "engine",
    summary: "s",
    evidence: ["src/engine.js:1"],
    paths: ["src/engine/**", "src/engine.js"],
    knowledge: { adrs: ["0001", "0002", "0004"], scenarios: ["fast-resume"], terms: ["Change"], constraints: ["team.shape"] },
  },
  {
    id: "store",
    summary: "s",
    evidence: ["src/store.js:1"],
    paths: ["src/store.js"],
    knowledge: { adrs: ["0001", "0003"], scenarios: ["gone"], terms: ["Ledger"], constraints: ["business.constraints", "quality.drivers", "team.production-owner", "architecture.data"] },
  },
  { id: "docs", summary: "s", evidence: ["README.md:1"] },
]);

const SOURCES = {
  adrs: new Map([
    ["0001", { path: "docs/architecture/decisions/0001-a.md", status: "accepted", evidence: [] }],
    ["0002", { path: "docs/architecture/decisions/0002-b.md", status: "superseded", evidence: [] }],
    ["0003", { path: "docs/architecture/decisions/0003-c.md", status: "accepted", evidence: ['"src/old.js:4" names a file that does not exist'] }],
  ]),
  scenarios: new Set(["fast-resume"]),
  terms: new Set(["change"]),
  slots: new Map([
    ["team.shape", "confirmed"],
    ["team.production-owner", "n/a"],
    ["business.constraints", "assumed"],
    ["quality.drivers", "deferred"],
  ]),
};

test("[REQ-idd-021] only the components whose paths a change touches give references", () => {
  assert.deepEqual(touchedComponents(MAP, ["src/engine/next.js", "README.md"]), ["engine"]);
  assert.deepEqual(touchedComponents(MAP, ["lib/other.js"]), []);
  const { references } = resolveReferences({ map: MAP, paths: ["src/engine/next.js"], sources: SOURCES });
  assert.deepEqual(
    references.map((ref) => `${ref.kind}:${ref.id}`),
    ["adr:0001", "adr:0002", "adr:0004", "scenario:fast-resume", "term:Change", "constraint:team.shape"],
  );
  assert.ok(references.every((ref) => ref.components.length === 1 && ref.components[0] === "engine"));
});

test("[REQ-idd-021] each reference is current, stale or absent, and only stale or absent ones warn", () => {
  const { references, warnings } = resolveReferences({ map: MAP, paths: ["src/store.js", "src/engine.js"], sources: SOURCES });
  const status = Object.fromEntries(references.map((ref) => [`${ref.kind}:${ref.id}`, ref.status]));
  assert.deepEqual(status, {
    "adr:0001": "current",
    "adr:0002": "stale",
    "adr:0003": "stale",
    "adr:0004": "absent",
    "scenario:fast-resume": "current",
    "scenario:gone": "absent",
    "term:Change": "current",
    "term:Ledger": "absent",
    "constraint:architecture.data": "absent",
    "constraint:business.constraints": "stale",
    "constraint:quality.drivers": "absent",
    "constraint:team.production-owner": "current",
    "constraint:team.shape": "current",
  });
  const shared = references.find((ref) => ref.id === "0001");
  assert.deepEqual(shared.components, ["engine", "store"]);
  assert.equal(shared.path, "docs/architecture/decisions/0001-a.md");
  assert.equal(shared.reason, undefined);
  assert.match(references.find((ref) => ref.id === "0002").reason, /superseded/);
  assert.match(references.find((ref) => ref.id === "0003").reason, /src\/old\.js:4/);
  assert.equal(warnings.length, references.filter((ref) => ref.status !== "current").length);
  assert.match(warnings.find((warning) => warning.includes("0002")), /^stale ADR 0002 \(engine\): /);
});

test("[REQ-idd-021] without a glossary every term is absent, and a v1 map or no map gives nothing", () => {
  const { references } = resolveReferences({ map: MAP, paths: ["src/engine.js"], sources: { ...SOURCES, terms: null } });
  assert.match(references.find((ref) => ref.kind === "term").reason, /glossary/);
  assert.equal(references.find((ref) => ref.kind === "term").status, "absent");
  assert.deepEqual(resolveReferences({ map: null, paths: ["src/engine.js"], sources: SOURCES }), { references: [], warnings: [] });
  const v1 = { ...MAP, schema: "ospec-component-map/v1" };
  assert.deepEqual(resolveReferences({ map: v1, paths: ["src/engine.js"], sources: SOURCES }), { references: [], warnings: [] });
});

test("[REQ-idd-021] only current ADRs and scenarios feed the architecture signal", () => {
  const { references } = resolveReferences({ map: MAP, paths: ["src/store.js", "src/engine.js"], sources: SOURCES });
  assert.deepEqual(derivedReferences(references), [
    { kind: "adr", id: "0001" },
    { kind: "scenario", id: "fast-resume" },
  ]);
});

test("[REQ-idd-021] glossary terms are headings and first table cells, compared without case", () => {
  const text = [
    "# Glossary",
    "",
    "## **Change**",
    "",
    "| Term | Meaning |",
    "| --- | --- |",
    "| `Obligation` | What a change owes |",
    "| Gate | A user decision |",
    "",
    "Change log is prose, not a term.",
  ].join("\n");
  assert.deepEqual([...parseGlossaryTerms(text)].sort(), ["change", "gate", "glossary", "obligation"]);
});
