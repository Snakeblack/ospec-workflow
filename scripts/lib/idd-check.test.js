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
  settleChecks,
  settleContract,
  settleMigration,
  settlePair,
  settleTreeBound,
} = require("./idd-check.js");
const { IddRecordError, recordIntent, recordSignal } = require("./idd-record.js");

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
