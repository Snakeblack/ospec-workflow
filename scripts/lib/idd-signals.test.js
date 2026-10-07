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
const { FLOOR_SIGNALS, IRREVERSIBLE_OPERATIONS, applyDerivation, deriveSignals } = require("./idd-signals.js");

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
      },
      patterns: patternsFor(),
    });
    assert.deepStrictEqual(derivation.signals.map((s) => s.id).sort(), expected.signals);
    assert.deepStrictEqual(
      derivation.gates.map((g) => g.id).sort(),
      expected.gates.filter((g) => g !== "ambiguous-intent"),
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
      diff: { paths: input.diff.paths, addedLines: input.diff.added_lines },
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

test("no signal is derived while the intent is ambiguous", () => {
  const derivation = deriveSignals({
    intent: null,
    declaration: { paths: ["src/api/a.js"], operations: ["drop-table"] },
    patterns: patternsFor(),
  });
  assert.deepStrictEqual(derivation, { signals: [], gates: [], floor: null, floor_source: null });
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
  return recordIntent(null, { change: "c", kind, summary: "s", acceptance: "a", noOpenFacts: true, basis: "The request fixes every behavior." }).state;
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
