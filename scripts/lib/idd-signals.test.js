"use strict";

// E1.3 impact-signals: signals and gates derived from the declared intent, the
// planned paths and the real diff, reusing the K1 hard floors
// (openspec/specs/idd/spec.md, REQ-idd-006, REQ-idd-008, REQ-idd-012).

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const { HARD_FLOORS } = require("./change-classification.js");
const { SIGNALS } = require("./idd-contract.js");
const { IMPACT_SIGNALS, resolvePatterns } = require("./idd-impact.js");
const { recordGate, recordIntent, recordSignal } = require("./idd-record.js");
const { resolveContractPatterns } = require("./idd-contracts.js");
const { FLOOR_SIGNALS, IRREVERSIBLE_OPERATIONS, applyDerivation, citesOutsidePlan, deriveSignals, kindMismatch } = require("./idd-signals.js");

const FIXTURES_DIR = path.join(__dirname, "..", "fixtures", "idd");

function readJsonDir(dir) {
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => JSON.parse(fs.readFileSync(path.join(dir, name), "utf8")));
}

function patternsFor(stacks = []) {
  return resolvePatterns({ stacks, impact: {} });
}

// ---------------------------------------------------------------------------
// The reference fixtures of E1.1 (REQ-idd-010) from their declaration alone
// ---------------------------------------------------------------------------

for (const fixture of readJsonDir(FIXTURES_DIR)) {
  test(`declaration of reference fixture ${fixture.id} derives its expected signals and gates`, () => {
    const { input, expected } = fixture;
    const derivation = deriveSignals({
      intent: input.intent.ambiguous ? null : input.intent,
      strictTdd: input.project.strict_tdd,
      declaration: {
        paths: input.paths,
        workUnits: input.work_units,
        nonObviousDecision: input.non_obvious_decision,
        operations: input.operations,
        adrs: input.architecture?.adrs,
        scenarios: input.architecture?.quality,
      },
      patterns: patternsFor(),
    });
    assert.deepStrictEqual(derivation.signals.map((s) => s.id).sort(), expected.signals);
    // record intent opens ambiguous-intent and record impact opens
    // adr-amend-or-contradict; no derivation does.
    assert.deepStrictEqual(
      derivation.gates.map((g) => g.id).sort(),
      expected.gates.filter((g) => !["ambiguous-intent", "adr-amend-or-contradict"].includes(g)),
    );
    for (const signal of derivation.signals) {
      assert.strictEqual(signal.source, "declaration");
      assert.ok(signal.reason.length > 0, `${signal.id} needs a reason`);
    }
  });
}

// ---------------------------------------------------------------------------
// Diff-driven cases (scripts/fixtures/idd/signals/)
// ---------------------------------------------------------------------------

for (const fixture of readJsonDir(path.join(FIXTURES_DIR, "signals"))) {
  test(`signal fixture ${fixture.id}`, () => {
    const { input, expected } = fixture;
    const derivation = deriveSignals({
      intent: input.intent,
      strictTdd: input.project.strict_tdd,
      declaration: {
        paths: input.declaration.paths,
        workUnits: input.declaration.work_units,
        nonObviousDecision: input.declaration.non_obvious_decision,
        operations: input.declaration.operations,
      },
      diff: { paths: input.diff.paths, addedLines: input.diff.added_lines, sources: input.diff.sources },
      patterns: patternsFor(input.project.stacks),
    });
    const signals = derivation.signals.map(({ id, source, reason }) => {
      const want = expected.signals.find((s) => s.id === id);
      return want && want.reason ? { id, source, reason } : { id, source };
    });
    assert.deepStrictEqual(signals, expected.signals);
    assert.deepStrictEqual(derivation.gates, expected.gates);
    assert.strictEqual(derivation.floor, expected.floor);
  });
}

test("a large mechanical refactor outside every impact pattern opens no gate", () => {
  const paths = [];
  for (let n = 0; n < 120; n += 1) paths.push(`src/lib/module-${n}.js`, `src/lib/module-${n}.test.js`);
  const derivation = deriveSignals({
    intent: { kind: "refactor", summary: "Rename the logger helpers.", acceptance: "Checks pass." },
    strictTdd: false,
    declaration: { paths, workUnits: 1, nonObviousDecision: false, operations: [] },
    diff: { paths, addedLines: Object.fromEntries(paths.map((p) => [p, ["const log = createLogger();"]])) },
    patterns: patternsFor(["node"]),
  });
  assert.deepStrictEqual(derivation.signals.map((s) => s.id), ["always"]);
  assert.deepStrictEqual(derivation.gates, []);
});

test("strict TDD owes a red test to new behavior only: not to docs or a refactor", () => {
  const derive = (kind) =>
    deriveSignals({
      intent: { kind, summary: "s", acceptance: "a" },
      strictTdd: true,
      declaration: { paths: ["src/lib/paginate.js"] },
      patterns: patternsFor(),
    }).signals.map((s) => s.id);
  assert.deepStrictEqual(derive("feature"), ["always", "strict-tdd"]);
  assert.deepStrictEqual(derive("bug"), ["always", "strict-tdd", "bug-fix"]);
  assert.deepStrictEqual(derive("refactor"), ["always"]);
  assert.deepStrictEqual(derive("docs"), ["always"]);
});

// ---------------------------------------------------------------------------
// Reasons, sources and determinism
// ---------------------------------------------------------------------------

test("every derived signal carries a reason naming why it fired", () => {
  const derivation = deriveSignals({
    intent: { kind: "bug", summary: "s", acceptance: "a" },
    strictTdd: true,
    declaration: {
      paths: ["src/api/a.js", "src/api/b.js", "src/api/c.js"],
      workUnits: 3,
      nonObviousDecision: false,
      operations: [],
    },
    patterns: patternsFor(),
  });
  const reasons = Object.fromEntries(derivation.signals.map((s) => [s.id, s.reason]));
  assert.deepStrictEqual(reasons, {
    always: "every change with a resolved intent",
    "strict-tdd": "the project declares strict_tdd",
    "bug-fix": "the intent is a bug fix",
    "multi-unit-or-decision": "declared 3 work units",
    "public-contract": "public contract: touches src/api/a.js and 2 more (matches **/api/**)",
  });
});

test("a file a public package publishes derives the public contract, naming the manifest", () => {
  const derivation = deriveSignals({
    intent: { kind: "feature", summary: "s", acceptance: "a" },
    declaration: { paths: ["index.d.ts", "test/duration.js"] },
    patterns: resolvePatterns({ stacks: ["node"], impact: {}, published: ["index.js", "index.d.ts"] }),
  });
  const contract = derivation.signals.find((s) => s.id === "public-contract");
  assert.deepStrictEqual(contract, {
    id: "public-contract",
    reason: "public contract: touches index.d.ts (published by package.json)",
    source: "declaration",
  });
});

test("a non-obvious decision alone derives the living document", () => {
  const derivation = deriveSignals({
    intent: { kind: "feature", summary: "s", acceptance: "a" },
    declaration: { paths: [], workUnits: 1, nonObviousDecision: true, operations: [] },
    patterns: patternsFor(),
  });
  assert.deepStrictEqual(derivation.signals.find((s) => s.id === "multi-unit-or-decision").reason, "declared a non-obvious decision");
});

test("a signal both planned and in the diff keeps the declaration as its source", () => {
  const derivation = deriveSignals({
    intent: { kind: "feature", summary: "s", acceptance: "a" },
    declaration: { paths: ["src/auth/session.js"], operations: [] },
    diff: { paths: ["src/auth/session.js", "src/auth/cookie.js"], addedLines: {} },
    patterns: patternsFor(),
  });
  const signal = derivation.signals.find((s) => s.id === "security-boundary");
  assert.strictEqual(signal.source, "declaration");
});

test("declared irreversible operations open the gate; additive ones do not", () => {
  for (const operation of IRREVERSIBLE_OPERATIONS) {
    const derivation = deriveSignals({
      intent: { kind: "refactor", summary: "s", acceptance: "a" },
      declaration: { paths: [], operations: [operation] },
      patterns: patternsFor(),
    });
    assert.deepStrictEqual(derivation.gates, [
      { id: "irreversible-operation", reason: `irreversible operation: declared ${operation}` },
    ]);
  }
  const additive = deriveSignals({
    intent: { kind: "feature", summary: "s", acceptance: "a" },
    declaration: { paths: [], operations: ["add-nullable-column"] },
    patterns: patternsFor(),
  });
  assert.deepStrictEqual(additive.gates, []);
});

test("destructive statements are read only from persistent-data files", () => {
  const statement = ["DROP TABLE customers;"];
  const outside = deriveSignals({
    intent: { kind: "docs", summary: "s", acceptance: "a" },
    diff: { paths: ["docs/runbook.md"], addedLines: { "docs/runbook.md": statement } },
    patterns: patternsFor(),
  });
  assert.deepStrictEqual(outside.gates, []);

  for (const [line, label] of [
    ["DROP TABLE customers;", "DROP TABLE"],
    ["drop table if exists customers;", "DROP TABLE"],
    ["TRUNCATE TABLE orders;", "TRUNCATE"],
    ["ALTER TABLE t DROP fax;", "DROP COLUMN"],
    ["DELETE FROM sessions;", "DELETE without WHERE"],
    ["    op.drop_column('customers', 'fax')", "DROP COLUMN"],
    ["migrationBuilder.DropTable(name: \"Fax\");", "DROP TABLE"],
    ["await queryInterface.removeColumn('customers', 'fax');", "DROP COLUMN"],
  ]) {
    const derivation = deriveSignals({
      intent: { kind: "refactor", summary: "s", acceptance: "a" },
      diff: { paths: ["db/migrations/x.sql"], addedLines: { "db/migrations/x.sql": [line] } },
      patterns: patternsFor(),
    });
    assert.deepStrictEqual(
      derivation.gates,
      [{ id: "irreversible-operation", reason: `irreversible operation: ${label} in db/migrations/x.sql` }],
      line,
    );
  }

  const safe = deriveSignals({
    intent: { kind: "feature", summary: "s", acceptance: "a" },
    diff: {
      paths: ["db/migrations/x.sql"],
      addedLines: { "db/migrations/x.sql": ["DELETE FROM sessions WHERE expires_at < now();", "-- DROP TABLE legacy later"] },
    },
    patterns: patternsFor(),
  });
  assert.deepStrictEqual(safe.gates, []);
});

test("persistent data needs a call or an access, not a mention of the API", () => {
  const persistent = (line) =>
    deriveSignals({
      intent: { kind: "refactor", summary: "s", acceptance: "a" },
      diff: { paths: ["src/a.js"], addedLines: { "src/a.js": [line] } },
      patterns: patternsFor(),
    }).signals.find((s) => s.id === "persistent-data")?.reason;

  for (const line of [
    '{ label: "localStorage", pattern: /\\blocalStorage\\b/ },',
    'const { writeFileSync } = require("node:fs");',
    'const why = "indexedDB is slow";',
    "import java.io.File; // File.WriteAllText",
  ]) {
    assert.strictEqual(persistent(line), undefined, line);
  }
  for (const [line, label] of [
    ['window.localStorage["tasks"] = "[]";', "localStorage"],
    ["const request = indexedDB.open('db');", "indexedDB"],
    ["await fs.promises.writeFile (file, data);", "writeFile"],
    ["err := os.WriteFile(path, data, 0o600)", "os.WriteFile"],
    ["File.AppendAllText(path, line);", "File.WriteAllText"],
  ]) {
    assert.strictEqual(persistent(line), `persistent data: src/a.js adds ${label}`, line);
  }
});

test("impact.exclude silences persistent data from content, on the touched file and on the imported module", () => {
  const intent = { kind: "feature", summary: "s", acceptance: "a" };
  const diff = {
    paths: ["src/cli.js", "src/hosts/agy.js"],
    addedLines: { "src/cli.js": ["run();"], "src/hosts/agy.js": ["fs.writeFileSync(home, '{}');"] },
    sources: {
      "src/cli.js": { lines: ["require('./store.js');", "run();"], imports: { "src/store.js": ["fs.writeFileSync(f, d);"] } },
      "src/hosts/agy.js": { lines: ["fs.writeFileSync(home, '{}');"], imports: {} },
    },
  };
  const persistent = (exclude) =>
    deriveSignals({ intent, diff, patterns: resolvePatterns({ impact: { exclude } }) }).signals.find((s) => s.id === "persistent-data");

  assert.strictEqual(persistent([])?.reason, "persistent data: src/hosts/agy.js adds writeFile");
  assert.strictEqual(persistent(["src/hosts/**"])?.reason, "persistent data: src/cli.js imports src/store.js, which uses writeFile");
  assert.strictEqual(persistent(["src/hosts/**", "src/store.js"]), undefined);
  assert.strictEqual(persistent(["src/hosts/**", "src/cli.js"]), undefined);
});

// #416: a build script writes the build output, not persistent data.
test("a build script derives no persistent data from content unless impact.defaults is false", () => {
  const intent = { kind: "feature", summary: "s", acceptance: "a" };
  const postbuild = [
    'import { writeFile } from "node:fs/promises";',
    'const root = new URL("../dist/client/", import.meta.url).pathname;',
    "const HEADER_ONLY = [\"frame-ancestors 'none'\", \"report-uri /api/report/\"];",
    "await writeFile(`${root}_headers`, HEADER_ONLY.join('; '));",
  ];
  const persistent = (diff, impact = {}) =>
    deriveSignals({ intent, diff, patterns: resolvePatterns({ impact }) }).signals.find((s) => s.id === "persistent-data");
  const constantEdit = {
    paths: ["scripts/postbuild.mjs"],
    addedLines: { "scripts/postbuild.mjs": [postbuild[2]] },
    sources: { "scripts/postbuild.mjs": { lines: postbuild, imports: {} } },
  };
  assert.strictEqual(persistent(constantEdit), undefined, "a constant edit in a build script");
  for (const file of ["scripts/prebuild.js", "build.ts", "scripts/build.mjs", "tools/og/build.js", "packages/web/scripts/build/og.mjs", "astro.config.mjs", "vite.config.ts", "webpack.config.cjs", "rollup.config.js"]) {
    const added = { paths: [file], addedLines: { [file]: postbuild }, sources: { [file]: { lines: postbuild, imports: {} } } };
    assert.strictEqual(persistent(added), undefined, file);
  }
  const importsBuild = {
    paths: ["src/cli.js"],
    addedLines: { "src/cli.js": ["run();"] },
    sources: { "src/cli.js": { lines: ["require('../scripts/postbuild.mjs');", "run();"], imports: { "scripts/postbuild.mjs": postbuild } } },
  };
  assert.strictEqual(persistent(importsBuild), undefined, "a product file that imports a build script");
  assert.strictEqual(persistent(constantEdit, { defaults: false })?.reason, "persistent data: scripts/postbuild.mjs uses writeFile");
  const store = { ...constantEdit, paths: ["src/store.js"], addedLines: { "src/store.js": [postbuild[2]] }, sources: { "src/store.js": { lines: postbuild, imports: {} } } };
  assert.strictEqual(persistent(store)?.reason, "persistent data: src/store.js uses writeFile", "a module that is not a build script still counts");
  const productBuild = { paths: ["src/build.ts"], addedLines: { "src/build.ts": [postbuild[3]] }, sources: { "src/build.ts": { lines: postbuild, imports: {} } } };
  assert.strictEqual(persistent(productBuild)?.reason, "persistent data: src/build.ts adds writeFile", "a product module named build.* outside scripts/ and tools/");
});

// #416 trust review: the user's answer covers the writes it saw, not every
// later write under the same first reason.
test("an answered retraction holds only while the diff has no content hit beyond the answered ones", () => {
  const intent = { kind: "bug", summary: "s", acceptance: "a" };
  const patterns = resolvePatterns({ impact: {} });
  const gen = ["const fs = require('node:fs');", "fs.writeFileSync('dist/a.txt', A);"];
  const diffOf = (files) => ({
    paths: Object.keys(files),
    addedLines: Object.fromEntries(Object.entries(files).map(([file, lines]) => [file, lines.slice(-1)])),
    sources: Object.fromEntries(Object.entries(files).map(([file, lines]) => [file, { lines, imports: {} }])),
  });
  const answered = diffOf({ "src/gen.js": gen });
  const { persistentHits } = require("./idd-signals.js");
  const retracted = [{
    id: "persistent-data", reason: "r", source: "diff", retract_reason: "dist only",
    confirmed_by: "persistent data: src/gen.js adds writeFile", hits: persistentHits(answered, patterns).map((hit) => hit.key),
    answer: "Only dist/ is written.", answer_source: "user",
  }];
  const persistent = (diff) => deriveSignals({ intent, diff, patterns, retracted }).signals.find((s) => s.id === "persistent-data");

  assert.strictEqual(persistent(answered), undefined, "the answered hits stay retracted");
  assert.ok(persistent(diffOf({ "src/gen.js": [...gen, "fs.writeFileSync('data/tasks.json', T);"] })), "a second write in the same file");
  assert.ok(persistent(diffOf({ "src/gen.js": gen, "src/z-store.js": ["fs.appendFileSync(log, line);"] })), "a write in a file that sorts later");
  assert.ok(persistent(diffOf({ "src/gen.js": [gen[0], "fs.writeFileSync('data/a.txt', A);"] })), "the answered write, changed");
  assert.strictEqual(deriveSignals({ intent, diff: answered, patterns }).signals.some((s) => s.id === "persistent-data"), true, "without the retraction it derives");
});

test("no signal is derived while the intent is ambiguous", () => {
  const derivation = deriveSignals({
    intent: null,
    declaration: { paths: ["src/api/a.js"], operations: ["drop-table"], adrs: ["0004"] },
    patterns: patternsFor(),
  });
  assert.deepStrictEqual(derivation, { signals: [], gates: [], references: [], floor: null, floor_source: null });
});

test("signals follow the catalog order whatever the input order", () => {
  const input = {
    intent: { kind: "bug", summary: "s", acceptance: "a" },
    strictTdd: true,
    declaration: { paths: ["src/auth/a.js", "db/migrations/1.sql", "src/api/x.js"], workUnits: 2, operations: [] },
    patterns: patternsFor(),
  };
  const reversed = { ...input, declaration: { ...input.declaration, paths: [...input.declaration.paths].reverse() } };
  const order = SIGNALS.map((s) => s.id);
  const ids = deriveSignals(input).signals.map((s) => s.id);
  assert.deepStrictEqual(ids, [...ids].sort((a, b) => order.indexOf(a) - order.indexOf(b)));
  assert.deepStrictEqual(deriveSignals(reversed), deriveSignals(input));
});

// ---------------------------------------------------------------------------
// Reuse of the K1 hard floors (PP1/PP2)
// ---------------------------------------------------------------------------

test("every K1 hard floor but the mechanical one maps to an IDD signal, and back", () => {
  const keys = HARD_FLOORS.map((rule) => rule.evidenceKey).filter((key) => key !== "mechanical_no_behavior");
  assert.deepStrictEqual(Object.keys(FLOOR_SIGNALS).sort(), keys.sort());
  for (const signal of IMPACT_SIGNALS) {
    assert.ok(Object.values(FLOOR_SIGNALS).includes(signal), `${signal} has no K1 floor`);
  }
});

test("the K1 floor comes from the derived signals", () => {
  const floorOf = (kind, paths) =>
    deriveSignals({ intent: { kind, summary: "s", acceptance: "a" }, declaration: { paths }, patterns: patternsFor() });
  assert.deepStrictEqual(
    (({ floor, floor_source }) => ({ floor, floor_source }))(floorOf("feature", ["src/auth/a.js"])),
    { floor: "critical", floor_source: "hard_floor.auth_security" },
  );
  assert.strictEqual(floorOf("feature", ["src/api/a.js"]).floor, "planned");
  assert.strictEqual(floorOf("bug", ["src/lib/a.js"]).floor, "repair");
  assert.strictEqual(floorOf("docs", ["README.md"]).floor, "direct");
  assert.strictEqual(floorOf("feature", ["src/lib/a.js"]).floor, "bounded");
});

// ---------------------------------------------------------------------------
// Applying a derivation to the stored state
// ---------------------------------------------------------------------------

function openChange(kind = "feature") {
  const input = { change: "c", kind, summary: "s", acceptance: "a", noOpenFacts: true, basis: "The request fixes every behavior." };
  if (kind === "feature") {
    input.coverage = require("./idd-facts.js").citedCoverage();
    delete input.noOpenFacts;
    delete input.basis;
  }
  return recordIntent(null, input).state;
}

test("applyDerivation records new signals and gates and is idempotent", () => {
  const derivation = deriveSignals({
    intent: { kind: "refactor", summary: "s", acceptance: "a" },
    diff: { paths: ["db/migrations/x.sql"], addedLines: { "db/migrations/x.sql": ["DROP TABLE t;"] } },
    patterns: patternsFor(),
  });
  const first = applyDerivation(openChange("refactor"), derivation);
  assert.strictEqual(first.changed, true);
  assert.deepStrictEqual(first.added, { signals: ["persistent-data"], gates: ["irreversible-operation"] });
  assert.deepStrictEqual(first.state.signals.find((s) => s.id === "persistent-data").source, "diff");
  assert.ok(first.state.obligations.some((o) => o.id === "migration-compat-and-test" && o.status === "pending"));

  const again = applyDerivation(first.state, derivation);
  assert.strictEqual(again.changed, false);
  assert.deepStrictEqual(again.added, { signals: [], gates: [] });
  assert.strictEqual(JSON.stringify(again.state), JSON.stringify(first.state));
});

test("applyDerivation never drops a recorded signal the new derivation misses", () => {
  let state = openChange();
  state = recordSignal(state, { id: "security-boundary", reason: "declared", source: "declaration" }).state;
  const derivation = deriveSignals({
    intent: { kind: "feature", summary: "s", acceptance: "a" },
    declaration: { paths: ["src/lib/a.js"] },
    patterns: patternsFor(),
  });
  const result = applyDerivation(state, derivation);
  assert.strictEqual(result.changed, false);
  assert.ok(result.state.signals.some((s) => s.id === "security-boundary"));
  assert.ok(result.state.obligations.some((o) => o.id === "trust-review" && o.status === "pending"));
});

test("applyDerivation leaves a resolved irreversible gate resolved", () => {
  let state = openChange("refactor");
  state = recordGate(state, { id: "irreversible-operation", action: "open" }).state;
  state = recordGate(state, { id: "irreversible-operation", action: "resolve", answer: "approved", source: "user" }).state;
  const derivation = deriveSignals({
    intent: { kind: "refactor", summary: "s", acceptance: "a" },
    declaration: { paths: [], operations: ["drop-column"] },
    patterns: patternsFor(),
  });
  const result = applyDerivation(state, derivation);
  assert.strictEqual(result.state.gates.find((g) => g.id === "irreversible-operation").status, "resolved");
  assert.deepStrictEqual(result.added.gates, []);
});

// ---------------------------------------------------------------------------
// Parity with the spec (REQ-idd-012)
// ---------------------------------------------------------------------------

test("REQ-idd-012 names every operation, stack, config key, exclusion and K1 floor", () => {
  const { CONFIG_KEYS, DEFAULT_EXCLUDE, STACKS } = require("./idd-impact.js");
  const spec = fs.readFileSync(path.join(__dirname, "..", "..", "openspec", "specs", "idd", "spec.md"), "utf8");
  const start = spec.indexOf("{#REQ-idd-012}");
  assert.ok(start !== -1, "REQ-idd-012 is missing");
  const end = spec.indexOf("\n### Requirement:", start);
  const section = spec.slice(start, end === -1 ? undefined : end);
  const named = [...IRREVERSIBLE_OPERATIONS, ...STACKS, ...Object.keys(CONFIG_KEYS), ...DEFAULT_EXCLUDE, ...Object.keys(FLOOR_SIGNALS)];
  for (const name of named) {
    assert.ok(section.includes(`\`${name}\``), `REQ-idd-012 must name ${name}`);
  }
});

// ---------------------------------------------------------------------------
// Declared architecture references (E3.1, REQ-idd-020)
// ---------------------------------------------------------------------------

test("declared ADRs and quality scenarios activate the ADR signal with a reason naming them", () => {
  const derivation = deriveSignals({
    intent: { kind: "feature", summary: "s", acceptance: "a" },
    declaration: { adrs: ["0004", "0002", "0004"], scenarios: ["deterministic-resume"] },
    patterns: patternsFor(),
  });
  const signal = derivation.signals.find((s) => s.id === "adr-or-quality-attribute");
  assert.deepStrictEqual(signal, {
    id: "adr-or-quality-attribute",
    reason: "declared ADR 0002, 0004 and quality scenario deterministic-resume",
    source: "declaration",
  });
  assert.deepStrictEqual(derivation.references, [
    { kind: "adr", id: "0002" },
    { kind: "adr", id: "0004" },
    { kind: "scenario", id: "deterministic-resume" },
  ]);
  assert.deepStrictEqual(derivation.gates, []);
});

test("paths without a component map never activate the ADR signal", () => {
  const derivation = deriveSignals({
    intent: { kind: "feature", summary: "s", acceptance: "a" },
    declaration: { paths: ["docs/architecture/decisions/0002-x.md", "src/api/orders.js"] },
    diff: { paths: ["src/orders/place-order.js"] },
    patterns: patternsFor(),
  });
  assert.ok(!derivation.signals.some((s) => s.id === "adr-or-quality-attribute"));
  assert.deepStrictEqual(derivation.references, []);
});

// ---------------------------------------------------------------------------
// References derived from the touched components (E3.2, REQ-idd-021)
// ---------------------------------------------------------------------------

const KNOWLEDGE = {
  map: {
    schema: "ospec-component-map/v2",
    components: [
      { id: "orders", summary: "s", evidence: ["src/orders/a.js:1"], paths: ["src/orders/**"], knowledge: { adrs: ["0002", "0007"], scenarios: ["fast"] } },
      { id: "api", summary: "s", evidence: ["src/api/a.js:1"], paths: ["src/api/**"], knowledge: { adrs: ["0003"] } },
    ],
    boundaries: [],
    dependencies: [],
    divergences: [],
  },
  sources: {
    adrs: new Map([
      ["0002", { path: "docs/architecture/decisions/0002-x.md", status: "accepted", evidence: [] }],
      ["0003", { path: "docs/architecture/decisions/0003-y.md", status: "accepted", evidence: [] }],
    ]),
    scenarios: new Set(["fast"]),
    slots: new Map(),
    terms: null,
  },
};

test("[REQ-idd-021] touched components derive the ADR signal from their current references only", () => {
  const derivation = deriveSignals({
    intent: { kind: "feature", summary: "s", acceptance: "a" },
    declaration: { paths: ["src/orders/place-order.js"] },
    patterns: patternsFor(),
    knowledge: KNOWLEDGE,
  });
  assert.deepStrictEqual(derivation.signals.find((s) => s.id === "adr-or-quality-attribute"), {
    id: "adr-or-quality-attribute",
    reason: "component orders: ADR 0002 and quality scenario fast",
    source: "declaration",
  });
  assert.deepStrictEqual(derivation.references, [
    { kind: "adr", id: "0002" },
    { kind: "scenario", id: "fast" },
  ]);
});

test("[REQ-idd-021] the diff derives the signal too, and declared references come first", () => {
  const fromDiff = deriveSignals({
    intent: { kind: "feature", summary: "s", acceptance: "a" },
    diff: { paths: ["src/api/routes.js"] },
    patterns: patternsFor(),
    knowledge: KNOWLEDGE,
  });
  assert.deepStrictEqual(fromDiff.signals.find((s) => s.id === "adr-or-quality-attribute"), {
    id: "adr-or-quality-attribute",
    reason: "component api: ADR 0003",
    source: "diff",
  });

  const both = deriveSignals({
    intent: { kind: "feature", summary: "s", acceptance: "a" },
    declaration: { adrs: ["0003"] },
    diff: { paths: ["src/orders/a.js", "src/api/a.js"] },
    patterns: patternsFor(),
    knowledge: KNOWLEDGE,
  });
  assert.strictEqual(both.signals.find((s) => s.id === "adr-or-quality-attribute").reason, "declared ADR 0003");
  assert.deepStrictEqual(both.references, [
    { kind: "adr", id: "0002" },
    { kind: "adr", id: "0003" },
    { kind: "scenario", id: "fast" },
  ]);
});

test("[REQ-idd-021] a component whose references are all stale or absent derives no signal", () => {
  const derivation = deriveSignals({
    intent: { kind: "feature", summary: "s", acceptance: "a" },
    declaration: { paths: ["src/orders/a.js"] },
    patterns: patternsFor(),
    knowledge: { ...KNOWLEDGE, sources: { ...KNOWLEDGE.sources, adrs: new Map(), scenarios: new Set() } },
  });
  assert.ok(!derivation.signals.some((s) => s.id === "adr-or-quality-attribute"));
  assert.deepStrictEqual(derivation.references, []);
});

test("applyDerivation records the declared references with the signal and its obligation", () => {
  const derivation = deriveSignals({
    intent: { kind: "feature", summary: "s", acceptance: "a" },
    declaration: { adrs: ["0002"] },
    patterns: patternsFor(),
  });
  const first = applyDerivation(openChange(), derivation);
  assert.strictEqual(first.changed, true);
  assert.deepStrictEqual(first.added.signals, ["adr-or-quality-attribute"]);
  assert.deepStrictEqual(first.state.impacts, [{ kind: "adr", id: "0002", impact: null }]);
  assert.ok(first.state.obligations.some((o) => o.id === "adr-impact-declaration" && o.status === "pending"));

  const widened = applyDerivation(first.state, deriveSignals({ intent: { kind: "feature" }, declaration: { scenarios: ["target-parity"] }, patterns: patternsFor() }));
  assert.strictEqual(widened.changed, true);
  assert.deepStrictEqual(widened.added.signals, []);
  assert.deepStrictEqual(widened.state.impacts.map((entry) => entry.id), ["0002", "target-parity"]);
  assert.strictEqual(applyDerivation(widened.state, derivation).changed, false);
});

// ---------------------------------------------------------------------------
// E1.44: the declared kind and the feature cites against the diff (B6, B9)
// ---------------------------------------------------------------------------

const CONTRACTS = resolveContractPatterns({ contracts: { documents: ["specs/**"] } });

test("a docs change that touches product code contradicts its kind; tests and manifests do not", () => {
  const docs = { kind: "docs" };
  const mismatch = kindMismatch(docs, { paths: ["README.md", "src/a.js", "src/b.py"] }, CONTRACTS);
  assert.deepStrictEqual(mismatch, { reason: "kind docs, but the diff changes product code: src/a.js and 1 more", kinds: ["refactor", "bug", "feature"] });
  assert.strictEqual(kindMismatch(docs, { paths: ["README.md", "scripts/manifest-sync.test.js", "package.json", "idd/config.yaml"] }, CONTRACTS), null);
  for (const kind of ["bug", "feature"]) assert.strictEqual(kindMismatch({ kind }, { paths: ["src/a.js"] }, CONTRACTS), null, kind);
});

test("a refactor that removes a contract line contradicts its kind, a moved or blank line does not", () => {
  const refactor = { kind: "refactor" };
  const diff = (removedLines, addedLines = {}) => ({ paths: [...new Set([...Object.keys(removedLines), ...Object.keys(addedLines)])], removedLines, addedLines });
  assert.deepStrictEqual(kindMismatch(refactor, diff({ "specs/orders.md": ["Orders MUST list 50 per page."] }), CONTRACTS), {
    reason: 'kind refactor, but the diff removes a line of a contract: specs/orders.md: "Orders MUST list 50 per page."',
    kinds: ["bug", "feature"],
  });
  assert.match(kindMismatch(refactor, diff({ "api/openapi.yaml": ["  /pages: {}"] }), CONTRACTS).reason, /api\/openapi\.yaml/, "the base patterns count too");
  assert.match(kindMismatch(refactor, diff({ "README.md": ["`GET /orders` lists the orders."] }), CONTRACTS).reason, /README\.md/, "documentation that states a contract");
  assert.strictEqual(kindMismatch(refactor, diff({ "README.md": ["Run the tests first."] }), CONTRACTS), null, "documentation without a contract");
  assert.strictEqual(kindMismatch(refactor, diff({ "specs/orders.md": ["   "] }), CONTRACTS), null, "a blank line");
  assert.strictEqual(kindMismatch(refactor, diff({ "specs/orders.md": ["Orders MUST list 50."] }, { "specs/pages.md": ["  Orders MUST list 50."] }), CONTRACTS), null, "a line moved to another contract");
  assert.notStrictEqual(kindMismatch(refactor, diff({ "specs/orders.md": ["Orders MUST list 50."] }, { "test/fixture.txt": ["Orders MUST list 50."] }), CONTRACTS), null, "a copy outside the contracts is no move");
  assert.strictEqual(kindMismatch(refactor, diff({ "src/api/orders.js": ["const size = 20;"] }), CONTRACTS), null, "code is not a contract document");
});

test("a feature cite outside the documentation names a file of the plan or the diff", () => {
  const coverage = [
    { category: "inputs", question: "Is a size above 100 refused?" },
    { category: "persistence", cite: { kind: "path", path: "src/store.js", line: 1 } },
    { category: "copy", cite: { kind: "path", path: "README.md", line: 2 } },
    { category: "errors", cite: { kind: "request", text: "the request fixes it" } },
  ];
  const state = { facts: { coverage }, plan: { paths: [] } };
  assert.deepStrictEqual(citesOutsidePlan(state, { paths: ["src/paginate.js"] }), [{ category: "persistence", path: "src/store.js", line: 1 }]);
  assert.deepStrictEqual(citesOutsidePlan(state, { paths: ["src/store.js"] }), [], "in the diff");
  assert.deepStrictEqual(citesOutsidePlan({ ...state, plan: { paths: ["src/store.js"] } }, { paths: [] }), [], "in the plan");
  assert.deepStrictEqual(citesOutsidePlan({ facts: { open: ["Does case matter?"] } }, { paths: [] }), [], "only a feature cites");
});

test("untested-product needs a test the diff adds a line to, not a deleted or emptied one (B3)", () => {
  const derive = (diff) => deriveSignals({ intent: { kind: "feature" }, diff, patterns: patternsFor() }).signals.some((signal) => signal.id === "untested-product");
  const product = { "src/a.js": ["module.exports = 1;"] };
  assert.strictEqual(derive({ paths: ["src/a.js", "test/a.test.js"], addedLines: { ...product, "test/a.test.js": ["assert(1);"] } }), false);
  assert.strictEqual(derive({ paths: ["src/a.js", "test/old.test.js"], addedLines: product }), true, "a deleted test");
  assert.strictEqual(derive({ paths: ["src/a.js", "test/empty.test.js"], addedLines: { ...product, "test/empty.test.js": ["", "  "] } }), true, "an emptied test");
});
