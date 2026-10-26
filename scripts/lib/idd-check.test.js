"use strict";

// E1.4 (a) ospec check and ospec run: CLI-observed runs, checks settled
// against the current tree, red → green pairs and the check verdict
// (openspec/specs/idd/spec.md, REQ-idd-007, REQ-idd-014).

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const { RUN_PURPOSES, validateState } = require("./idd-contract.js");
const {
  checkVerdict,
  recordRuns,
  settleBoundary,
  settleChecks,
  settleChecksChange,
  settleContract,
  settleImpacts,
  settleMigration,
  settlePair,
  settleTreeBound,
} = require("./idd-check.js");
const { IddRecordError, recordGate, recordImpact, recordIntent, recordReferences, recordSignal } = require("./idd-record.js");

const TREE_A = `sha256:${"a".repeat(64)}`;
const TREE_B = `sha256:${"b".repeat(64)}`;
const DIGEST = `sha256:${"0".repeat(64)}`;
const AT = "2026-10-05T08:00:00.000Z";

function openBug() {
  let { state } = recordIntent(null, {
    change: "fix-pagination",
    kind: "bug",
    summary: "Fix the last page.",
    acceptance: "Two full pages.",
    noOpenFacts: true, basis: "The request fixes every behavior.",
  });
  ({ state } = recordSignal(state, { id: "bug-fix", reason: "the intent is a bug fix", source: "declaration" }));
  return state;
}

function checkRun(overrides = {}) {
  return { purpose: "checks", name: "test", command: "npm test", exit_code: 0, output_sha256: DIGEST, tree: TREE_A, recorded_at: AT, ...overrides };
}

function reproRun(overrides = {}) {
  return { purpose: "repro-test", command: "node --test test/paginate.test.js", exit_code: 1, output_sha256: DIGEST, tree: TREE_A, recorded_at: AT, ...overrides };
}

function assertCode(fn, code) {
  assert.throws(fn, (error) => error instanceof IddRecordError && error.code === code);
}

function obligation(state, id) {
  return state.obligations.find((entry) => entry.id === id);
}

test("runs get sequential ids and never replace earlier runs", () => {
  const { state, ids } = recordRuns(openBug(), [checkRun(), checkRun({ name: "lint", command: "npm run lint" })]);
  assert.deepStrictEqual(ids, ["run-1", "run-2"]);
  const again = recordRuns(state, [checkRun()]);
  assert.deepStrictEqual(again.ids, ["run-3"]);
  assert.strictEqual(again.state.runs.length, 3);
  assert.ok(validateState(again.state).ok, validateState(again.state).errors.join("; "));
});

test("checks-pass is satisfied only when every declared check passed on the current tree", () => {
  const { state, ids } = recordRuns(openBug(), [checkRun(), checkRun({ name: "lint", command: "npm run lint" })]);
  const settled = settleChecks(state, { tree: TREE_A, runIds: ids, recordedAt: AT });
  assert.strictEqual(obligation(settled.state, "checks-pass").status, "satisfied");
  const [entry] = settled.state.evidence;
  assert.deepStrictEqual(entry, {
    id: "ev-1",
    kind: "check-run",
    obligation: "checks-pass",
    recorded_at: AT,
    detail: { tree: TREE_A, runs: ["run-1", "run-2"] },
  });
  assert.ok(validateState(settled.state).ok, validateState(settled.state).errors.join("; "));
});

test("zero tests are not evidence, and boundary-tests needs a test the diff adds (B3)", () => {
  const { recordSignal } = require("./idd-record.js");
  const state = recordSignal(openBug(), { id: "untested-product", reason: "product code without a test: touches index.html", source: "diff" }).state;
  const tests = ["test/index.test.js"];
  const empty = recordRuns(state, [checkRun({ tests: 0 })]);
  assert.strictEqual(obligation(settleChecks(empty.state, { tree: TREE_A, runIds: empty.ids, recordedAt: AT }).state, "checks-pass").status, "pending");
  assert.strictEqual(obligation(settleBoundary(empty.state, { tree: TREE_A, runIds: empty.ids, recordedAt: AT, tests }).state, "boundary-tests").status, "pending");
  const ran = recordRuns(state, [checkRun({ tests: 2 })]);
  const checked = settleChecks(ran.state, { tree: TREE_A, runIds: ran.ids, recordedAt: AT }).state;
  const suiteOnly = settleBoundary(checked, { tree: TREE_A, runIds: ran.ids, recordedAt: AT });
  assert.strictEqual(obligation(suiteOnly.state, "boundary-tests").status, "pending", "the suite that already passed is not evidence");
  assert.match(suiteOnly.reason, /^the diff adds no line to a test: .*ospec check --change fix-pagination$/);
  const settled = settleBoundary(checked, { tree: TREE_A, runIds: ran.ids, recordedAt: AT, tests });
  assert.strictEqual(obligation(settled.state, "checks-pass").status, "satisfied");
  assert.strictEqual(obligation(settled.state, "boundary-tests").status, "satisfied");
  assert.strictEqual(settled.reason, null);
  assert.deepStrictEqual(settled.state.evidence.at(-1).detail, { tree: TREE_A, run: "run-1", tests });
  const unknown = recordRuns(state, [checkRun()]);
  const byFile = settleBoundary(unknown.state, { tree: TREE_A, runIds: unknown.ids, recordedAt: AT, tests }).state;
  assert.strictEqual(obligation(byFile, "boundary-tests").status, "satisfied", "an uncounted run passes with a test in the diff");
  assert.ok(validateState(byFile).ok, validateState(byFile).errors.join("; "));
  assert.ok(validateState(settled.state).ok, validateState(settled.state).errors.join("; "));

  // A state recorded before B3 marks an uncounted run with has_test.
  const legacy = structuredClone(byFile);
  legacy.evidence.at(-1).detail = { tree: TREE_A, run: "run-1", has_test: true };
  assert.ok(validateState(legacy).ok, validateState(legacy).errors.join("; "));
  legacy.evidence.at(-1).detail = { tree: TREE_A, run: "run-1", tests: [] };
  assert.ok(!validateState(legacy).ok, "an uncounted run needs a test in the diff");
});

test("a failing check, a changed tree or no declared check leaves checks-pass pending", () => {
  const failing = recordRuns(openBug(), [checkRun({ exit_code: 1 })]);
  assert.strictEqual(obligation(settleChecks(failing.state, { tree: TREE_A, runIds: failing.ids, recordedAt: AT }).state, "checks-pass").status, "pending");

  const moved = recordRuns(openBug(), [checkRun({ tree: TREE_A })]);
  assert.strictEqual(obligation(settleChecks(moved.state, { tree: TREE_B, runIds: moved.ids, recordedAt: AT }).state, "checks-pass").status, "pending");

  assert.strictEqual(obligation(settleChecks(openBug(), { tree: TREE_A, runIds: [], recordedAt: AT }).state, "checks-pass").status, "pending");
});

test("passing checks on a new tree replace the evidence of the old one, and a later failure reopens", () => {
  const first = recordRuns(openBug(), [checkRun({ tree: TREE_A })]);
  const onA = settleChecks(first.state, { tree: TREE_A, runIds: first.ids, recordedAt: AT }).state;
  const second = recordRuns(onA, [checkRun({ tree: TREE_B })]);
  const onB = settleChecks(second.state, { tree: TREE_B, runIds: second.ids, recordedAt: AT }).state;
  assert.deepStrictEqual(obligation(onB, "checks-pass"), { id: "checks-pass", signal: "always", status: "satisfied", evidence: ["ev-2"] });
  assert.strictEqual(onB.evidence.length, 2, "earlier evidence stays as history");

  const third = recordRuns(onB, [checkRun({ tree: TREE_B, exit_code: 1 })]);
  const reopened = settleChecks(third.state, { tree: TREE_B, runIds: third.ids, recordedAt: AT }).state;
  assert.deepStrictEqual(obligation(reopened, "checks-pass"), { id: "checks-pass", signal: "always", status: "pending", evidence: [] });
  assert.ok(validateState(reopened).ok);
});

test("a failing run then a passing run of the same command on another tree satisfies repro-test", () => {
  const red = recordRuns(openBug(), [reproRun()]);
  const afterRed = settlePair(red.state, { obligation: "repro-test", runId: red.ids[0], recordedAt: AT });
  assert.strictEqual(afterRed.evidence, null);
  assert.strictEqual(obligation(afterRed.state, "repro-test").status, "pending");

  const green = recordRuns(afterRed.state, [reproRun({ exit_code: 0, tree: TREE_B })]);
  const paired = settlePair(green.state, { obligation: "repro-test", runId: green.ids[0], recordedAt: AT });
  assert.strictEqual(paired.evidence, "ev-1");
  assert.deepStrictEqual(paired.state.evidence[0].detail, { red: "run-1", green: "run-2" });
  assert.strictEqual(obligation(paired.state, "repro-test").status, "satisfied");
  assert.ok(validateState(paired.state).ok, validateState(paired.state).errors.join("; "));
});

test("a passing run without an earlier failure on another tree proves nothing", () => {
  const sameTree = recordRuns(openBug(), [reproRun(), reproRun({ exit_code: 0 })]);
  assert.strictEqual(settlePair(sameTree.state, { obligation: "repro-test", runId: "run-2", recordedAt: AT }).evidence, null);

  const otherCommand = recordRuns(openBug(), [reproRun(), reproRun({ exit_code: 0, tree: TREE_B, command: "node -e 0" })]);
  assert.strictEqual(settlePair(otherCommand.state, { obligation: "repro-test", runId: "run-2", recordedAt: AT }).evidence, null);

  const greenOnly = recordRuns(openBug(), [reproRun({ exit_code: 0 })]);
  assert.strictEqual(settlePair(greenOnly.state, { obligation: "repro-test", runId: "run-1", recordedAt: AT }).evidence, null);
});

test("TDD pairs stay within their unit of work", () => {
  let state = openBug();
  ({ state } = recordSignal(state, { id: "strict-tdd", reason: "the project declares strict_tdd", source: "declaration" }));
  const tdd = (overrides) => ({ ...reproRun(overrides), purpose: "tdd-red-green" });
  const runs = recordRuns(state, [tdd({ unit: "parser" }), tdd({ unit: "printer", exit_code: 0, tree: TREE_B })]);
  assert.strictEqual(settlePair(runs.state, { obligation: "tdd-red-green", runId: "run-2", recordedAt: AT }).evidence, null);
  const same = recordRuns(runs.state, [tdd({ unit: "parser", exit_code: 0, tree: TREE_B })]);
  assert.strictEqual(settlePair(same.state, { obligation: "tdd-red-green", runId: "run-3", recordedAt: AT }).evidence, "ev-1");
});

test("runs are refused for a closed change", () => {
  const closed = { ...openBug(), status: "closed" };
  assertCode(() => recordRuns(closed, [checkRun()]), "change-closed");
});

test("the verdict is missing while an obligation is pending, then needs-decision, then ready", () => {
  const state = openBug();
  const missing = checkVerdict(state, { checks: [{ name: "test", command: "npm test" }] });
  assert.strictEqual(missing.verdict, "missing");
  assert.deepStrictEqual(
    missing.missing.map((entry) => entry.obligation),
    ["repro-test", "checks-pass"],
  );
  assert.match(missing.missing[0].reason, /no failing run/);

  const noChecks = checkVerdict(state, { checks: [] });
  assert.match(noChecks.missing.find((entry) => entry.obligation === "checks-pass").reason, /no checks declared in idd\/config.yaml/);

  const failed = checkVerdict(state, { checks: [{ name: "test" }], results: [{ name: "test", exit_code: 3 }] });
  assert.match(failed.missing.find((entry) => entry.obligation === "checks-pass").reason, /check test failed with exit code 3/);

  const settledState = structuredClone(state);
  for (const entry of settledState.obligations) entry.status = "withdrawn";
  settledState.gates.push({ id: "irreversible-operation", status: "open", reason: "drops a column" });
  const decision = checkVerdict(settledState, { checks: [] });
  assert.strictEqual(decision.verdict, "needs-decision");
  assert.strictEqual(decision.decision.gate, "irreversible-operation");

  settledState.gates[0] = { id: "irreversible-operation", status: "resolved", answer: "yes", source: "user" };
  assert.strictEqual(checkVerdict(settledState, { checks: [] }).verdict, "ready");
});

function openMigration() {
  let state = openBug();
  ({ state } = recordSignal(state, { id: "persistent-data", reason: "touches db/migrations/004.sql", source: "diff" }));
  ({ state } = recordSignal(state, { id: "public-contract", reason: "touches src/api/orders.js", source: "diff" }));
  return state;
}

function migrationRun(overrides = {}) {
  return { ...reproRun({ exit_code: 0 }), purpose: "migration-test", command: "npm run test:migrations", ...overrides };
}

test("a passing migration test with a plan satisfies the migration obligation on its tree only", () => {
  const recorded = recordRuns(openMigration(), [migrationRun()]);
  const plan = "additive column; old readers ignore it";
  const passed = settleMigration(recorded.state, { runId: recorded.ids[0], plan, recordedAt: AT });
  assert.strictEqual(passed.evidence, "ev-1");
  assert.deepStrictEqual(passed.state.evidence[0].detail, { run: "run-1", tree: TREE_A, plan });
  assert.strictEqual(obligation(passed.state, "migration-compat-and-test").status, "satisfied");
  assert.ok(validateState(passed.state).ok, validateState(passed.state).errors.join("; "));

  const same = settleTreeBound(passed.state, { tree: TREE_A });
  assert.strictEqual(obligation(same, "migration-compat-and-test").status, "satisfied");
  const moved = settleTreeBound(passed.state, { tree: TREE_B });
  assert.deepStrictEqual(obligation(moved, "migration-compat-and-test").evidence, []);
  assert.strictEqual(obligation(moved, "migration-compat-and-test").status, "pending");

  const failing = recordRuns(passed.state, [migrationRun({ exit_code: 1 })]);
  const reopened = settleMigration(failing.state, { runId: failing.ids[0], plan, recordedAt: AT });
  assert.strictEqual(reopened.evidence, null);
  assert.strictEqual(obligation(reopened.state, "migration-compat-and-test").status, "pending");
});

test("contract evidence needs a document, a test and this check's passing evidence", () => {
  const checks = recordRuns(openMigration(), [checkRun()]);
  const checked = settleChecks(checks.state, { tree: TREE_A, runIds: checks.ids, recordedAt: AT });
  const input = { tree: TREE_A, checkEvidence: checked.evidence, documents: ["api/openapi.yaml"], tests: ["src/api/orders.test.js"], recordedAt: AT };

  const settled = settleContract(checked.state, input);
  assert.strictEqual(settled.reason, null);
  assert.strictEqual(obligation(settled.state, "contract-spec-and-test").status, "satisfied");
  assert.deepStrictEqual(settled.state.evidence.at(-1).detail, {
    tree: TREE_A,
    check: "ev-1",
    documents: ["api/openapi.yaml"],
    tests: ["src/api/orders.test.js"],
  });
  assert.ok(validateState(settled.state).ok, validateState(settled.state).errors.join("; "));

  const noDocument = settleContract(settled.state, { ...input, documents: [] });
  assert.match(noDocument.reason, /touches no contract document/);
  assert.strictEqual(obligation(noDocument.state, "contract-spec-and-test").status, "pending");
  assert.match(settleContract(checked.state, { ...input, tests: [] }).reason, /touches no test/);
  assert.match(settleContract(checked.state, { ...input, checkEvidence: null }).reason, /every check must pass/);
});

test("the verdict names how to prove the migration and contract obligations", () => {
  const verdict = checkVerdict(openMigration(), { checks: [], reasons: { "contract-spec-and-test": "the diff touches no test" } });
  const reasons = Object.fromEntries(verdict.missing.map((entry) => [entry.obligation, entry.reason]));
  assert.match(reasons["migration-compat-and-test"], /no passing migration test on the current tree/);
  assert.strictEqual(reasons["contract-spec-and-test"], "the diff touches no test");
});

test("REQ-idd-014 names every run purpose, run field and answer", () => {
  const spec = fs.readFileSync(path.join(__dirname, "..", "..", "openspec", "specs", "idd", "spec.md"), "utf8");
  const start = spec.indexOf("{#REQ-idd-014}");
  assert.ok(start !== -1, "REQ-idd-014 is missing");
  const end = spec.indexOf("### Requirement:", start);
  const section = spec.slice(start, end === -1 ? undefined : end);
  const runFields = ["id", "purpose", "command", "exit_code", "output_sha256", "tree", "recorded_at", "name"];
  for (const name of [...RUN_PURPOSES, ...runFields, "missing", "needs-decision", "ready", "not-a-git-repo", "base"]) {
    assert.ok(section.includes(`\`${name}\``), `REQ-idd-014 must name ${name}`);
  }
});

test("the repro reason says what the next run must show", () => {
  const red = recordRuns(openBug(), [reproRun()]).state;
  const verdict = checkVerdict(red, { checks: [] });
  assert.match(verdict.missing[0].reason, /run the same command again after the fix/);
});

// ---------------------------------------------------------------------------
// adr-impact-declaration settles at check (E3.1, REQ-idd-020)
// ---------------------------------------------------------------------------

const NEW_ADR = "docs/architecture/decisions/0012-modulos-por-eventos.md";
const GOOD_RECORD = Object.freeze({ exists: true, errors: [], id: "0012", cites: ["0002", "0012"] });

function declaring(refs = [{ kind: "adr", id: "0002" }]) {
  let { state } = recordSignal(openBug(), { id: "adr-or-quality-attribute", reason: "declared ADR 0002", source: "declaration" });
  ({ state } = recordReferences(state, refs));
  return state;
}

function impactOf(state) {
  return state.obligations.find((entry) => entry.id === "adr-impact-declaration");
}

test("a conforming declaration settles at check with the references it covers", () => {
  const state = recordImpact(declaring(), { kind: "adr", id: "0002", impact: "conforms", reason: "keeps direct calls" }).state;
  const settled = settleImpacts(state, { records: {}, recordedAt: AT });
  assert.strictEqual(settled.reason, null);
  assert.strictEqual(impactOf(settled.state).status, "satisfied");
  const evidence = settled.state.evidence.find((entry) => entry.id === settled.evidence);
  assert.deepStrictEqual(evidence.detail, { refs: ["adr:0002 conforms"], records: [] });
  assert.deepStrictEqual(validateState(settled.state), { ok: true, errors: [] });

  // A second check on the same declaration keeps the evidence it has.
  const again = settleImpacts(settled.state, { records: {}, recordedAt: AT });
  assert.strictEqual(again.evidence, settled.evidence);
  assert.strictEqual(again.state.evidence.length, settled.state.evidence.length);
});

test("an undeclared impact or an unanswered gate keeps the declaration pending with its reason", () => {
  const undeclared = settleImpacts(declaring(), { records: {}, recordedAt: AT });
  assert.strictEqual(impactOf(undeclared.state).status, "pending");
  assert.match(undeclared.reason, /declare the impact on ADR 0002: ospec record impact --change fix-pagination --adr 0002/);

  const amended = recordImpact(declaring(), { kind: "adr", id: "0002", impact: "amends", reason: "events" }).state;
  const waiting = settleImpacts(amended, { records: {}, recordedAt: AT });
  assert.match(waiting.reason, /ADR 0002 amends: the user answers adr-amend-or-contradict first/);
});

test("an amendment needs its new ADR to exist, pass the lint, be new and cite the amended ADR", () => {
  let state = recordImpact(declaring(), { kind: "adr", id: "0002", impact: "amends", reason: "events" }).state;
  state = recordGate(state, { id: "adr-amend-or-contradict", action: "resolve", answer: "amend it", source: "user" }).state;
  assert.match(settleImpacts(state, { records: {}, recordedAt: AT }).reason, /write the new ADR under docs\/architecture\/decisions\/ and attach it/);

  state = recordImpact(state, { kind: "adr", id: "0002", record: NEW_ADR }).state;
  const cases = [
    [{ exists: false }, /0012-modulos-por-eventos\.md does not exist/],
    [{ ...GOOD_RECORD, errors: ["/date: missing required property \"date\""] }, /fails the decision-record lint: \/date/],
    [{ ...GOOD_RECORD, id: "0002" }, /rewrites ADR 0002: an accepted ADR is never rewritten/],
    [{ ...GOOD_RECORD, cites: ["0012"] }, /must cite the ADR 0002 it amends/],
  ];
  for (const [read, reason] of cases) {
    const settled = settleImpacts(state, { records: { [NEW_ADR]: read }, recordedAt: AT });
    assert.match(settled.reason, reason);
    assert.strictEqual(impactOf(settled.state).status, "pending");
  }
  const settled = settleImpacts(state, { records: { [NEW_ADR]: GOOD_RECORD }, recordedAt: AT });
  assert.strictEqual(settled.reason, null);
  assert.deepStrictEqual(settled.state.evidence.at(-1).detail, { refs: ["adr:0002 amends"], records: [NEW_ADR] });

  // The new ADR breaking later reopens the declaration.
  const broken = settleImpacts(settled.state, { records: { [NEW_ADR]: { exists: false } }, recordedAt: AT });
  assert.strictEqual(impactOf(broken.state).status, "pending");
});

test("a contradiction or a scenario amendment needs only the user's answer", () => {
  let state = declaring([{ kind: "adr", id: "0002" }, { kind: "scenario", id: "deterministic-resume" }]);
  state = recordImpact(state, { kind: "adr", id: "0002", impact: "contradicts", reason: "a shortcut" }).state;
  state = recordImpact(state, { kind: "scenario", id: "deterministic-resume", impact: "amends", reason: "replays" }).state;
  state = recordGate(state, { id: "adr-amend-or-contradict", action: "resolve", answer: "accept both", source: "user" }).state;
  const settled = settleImpacts(state, { records: {}, recordedAt: AT });
  assert.strictEqual(settled.reason, null);
  assert.deepStrictEqual(settled.state.evidence.at(-1).detail.refs, ["adr:0002 contradicts", "scenario:deterministic-resume amends"]);
});

test("a change without the ADR signal settles nothing", () => {
  const settled = settleImpacts(openBug(), { records: {}, recordedAt: AT });
  assert.deepStrictEqual([settled.evidence, settled.reason], [null, null]);
  assert.deepStrictEqual(settled.state, openBug());
});

// ---------------------------------------------------------------------------
// Fitness runs settle with the impact declaration (E3.3, REQ-idd-022)
// ---------------------------------------------------------------------------

function fitnessRun(overrides = {}) {
  return { purpose: "fitness", ref: "adr:0002", command: "node --test boundary.test.js", exit_code: 0, output_sha256: DIGEST, tree: TREE_A, recorded_at: AT, ...overrides };
}

function conforming() {
  return recordImpact(declaring(), { kind: "adr", id: "0002", impact: "conforms", reason: "keeps direct calls" }).state;
}

test("[REQ-idd-022] passing fitness runs settle the declaration and are named in its evidence", () => {
  const { state, ids } = recordRuns(conforming(), [fitnessRun(), fitnessRun({ command: "npm run lint:deps" })]);
  const settled = settleImpacts(state, { records: {}, fitness: { tree: TREE_A, runIds: ids }, recordedAt: AT });
  assert.strictEqual(settled.reason, null);
  assert.strictEqual(impactOf(settled.state).status, "satisfied");
  assert.deepStrictEqual(settled.state.evidence.at(-1).detail, { refs: ["adr:0002 conforms"], records: [], tree: TREE_A, fitness: ["run-1", "run-2"] });
  assert.deepStrictEqual(validateState(settled.state), { ok: true, errors: [] });
});

test("[REQ-idd-022] a failing fitness run reopens the declaration with a reason naming its ADR", () => {
  const first = recordRuns(conforming(), [fitnessRun()]);
  const settled = settleImpacts(first.state, { records: {}, fitness: { tree: TREE_A, runIds: first.ids }, recordedAt: AT });
  assert.strictEqual(impactOf(settled.state).status, "satisfied");

  const second = recordRuns(settled.state, [fitnessRun({ tree: TREE_B, exit_code: 1 })]);
  const failed = settleImpacts(second.state, { records: {}, fitness: { tree: TREE_B, runIds: second.ids }, recordedAt: AT });
  assert.strictEqual(failed.evidence, null);
  assert.strictEqual(impactOf(failed.state).status, "pending");
  assert.strictEqual(failed.reason, "ADR 0002: fitness check `node --test boundary.test.js` failed with exit code 1");
  assert.match(checkVerdict(failed.state, { checks: [], reasons: { "adr-impact-declaration": failed.reason } }).missing.find((entry) => entry.obligation === "adr-impact-declaration").reason, /^ADR 0002: fitness check/);
});

test("[REQ-idd-022] a fitness failure is reported before an undeclared impact, and a moving tree does not settle", () => {
  const { state, ids } = recordRuns(declaring(), [fitnessRun({ exit_code: 3 })]);
  assert.match(settleImpacts(state, { records: {}, fitness: { tree: TREE_A, runIds: ids }, recordedAt: AT }).reason, /^ADR 0002: fitness check .* exit code 3$/);
  const moved = recordRuns(conforming(), [fitnessRun()]);
  assert.match(settleImpacts(moved.state, { records: {}, fitness: { tree: TREE_B, runIds: moved.ids }, recordedAt: AT }).reason, /the tree changed while the fitness checks ran/);
});

test("[REQ-idd-022] fitness runs are a run purpose", () => {
  assert.ok(RUN_PURPOSES.includes("fitness"));
});

test("checks that differ from the base open one checks-changed entry per set (B7)", () => {
  const base = [{ name: "test", command: "npm test" }];
  const trivial = [{ name: "test", command: "true" }];
  const same = settleChecksChange(openBug(), { baseChecks: base, checks: base });
  assert.deepStrictEqual(same.gates, [], "the base checks need no answer");

  const opened = settleChecksChange(openBug(), { baseChecks: base, checks: trivial });
  assert.deepStrictEqual(opened.gates, [
    { id: "checks-changed", status: "open", reason: "idd/config.yaml declares test: true, and the base declares test: npm test", checks: trivial },
  ]);
  assert.ok(validateState(opened).ok, validateState(opened).errors.join("; "));
  assert.match(settleChecksChange(openBug(), { baseChecks: [], checks: trivial }).gates[0].reason, /the base declares no checks$/);

  // An entry nobody answered follows the checks, and leaves with them.
  const lint = [...trivial, { name: "lint", command: "npm run lint" }];
  const followed = settleChecksChange(opened, { baseChecks: base, checks: lint });
  assert.deepStrictEqual(followed.gates.map((gate) => [gate.status, gate.checks]), [["open", lint]]);
  assert.deepStrictEqual(settleChecksChange(followed, { baseChecks: base, checks: base }).gates, []);

  // An answer approves the set it was asked about, and only that one.
  const resolved = recordGate(opened, { id: "checks-changed", action: "resolve", answer: "Yes, true.", source: "user" }).state;
  assert.strictEqual(settleChecksChange(resolved, { baseChecks: base, checks: trivial }).gates.length, 1);
  const again = settleChecksChange(resolved, { baseChecks: base, checks: lint });
  assert.deepStrictEqual(again.gates.map((gate) => gate.status), ["resolved", "open"]);
  assert.deepStrictEqual(settleChecksChange(again, { baseChecks: base, checks: trivial }).gates.map((gate) => gate.status), ["resolved"], "an approved set drops the open entry");
});
