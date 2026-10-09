"use strict";

// E1.2 ospec-cli-core: pure record reducers over the idd-state/v1 contract
// (openspec/specs/idd/spec.md, REQ-idd-003, 005–008, 011). Each reducer returns
// { state, changed }, never mutates its input, repeats as a no-op and refuses
// conflicting rewrites with a coded error.

const test = require("node:test");
const assert = require("node:assert");

const { validateState } = require("./idd-contract.js");
const {
  IddRecordError,
  recordEvidence,
  recordGate,
  recordIntent,
  recordSignal,
  recordWithdraw,
} = require("./idd-record.js");

// The open-facts declaration every resolved intent needs (REQ-idd-018).
const NO_OPEN_FACTS = Object.freeze({ noOpenFacts: true, basis: "The request fixes every behavior." });

const BUG_INTENT = Object.freeze({
  change: "fix-pagination",
  kind: "bug",
  summary: "Fix the last page.",
  acceptance: "Two full pages.",
  ...NO_OPEN_FACTS,
});

function opened(input = BUG_INTENT) {
  return recordIntent(null, input).state;
}

function assertCode(fn, code) {
  assert.throws(fn, (error) => error instanceof IddRecordError && error.code === code);
}

function assertValid(state) {
  assert.deepStrictEqual(validateState(state), { ok: true, errors: [] });
}

// ---------------------------------------------------------------------------
// record intent
// ---------------------------------------------------------------------------

test("a resolved intent opens the change with the always signal and checks-pass", () => {
  const { state, changed } = recordIntent(null, BUG_INTENT);
  assert.strictEqual(changed, true);
  assertValid(state);
  assert.strictEqual(state.mode, "idd");
  assert.strictEqual(state.status, "open");
  assert.deepStrictEqual(state.intent, { kind: "bug", summary: "Fix the last page.", acceptance: "Two full pages." });
  assert.deepStrictEqual(state.signals.map((s) => [s.id, s.source]), [["always", "declaration"]]);
  assert.deepStrictEqual(state.obligations, [{ id: "checks-pass", signal: "always", status: "pending", evidence: [] }]);
  assert.deepStrictEqual(state.gates, []);
});

test("an ambiguous intent opens the gate, keeps the request and derives nothing", () => {
  const { state } = recordIntent(null, { change: "improve-login", ambiguous: true, request: "Improve the login." });
  assertValid(state);
  assert.deepStrictEqual(state.intent, { request: "Improve the login.", kind: null, summary: null, acceptance: null });
  assert.deepStrictEqual(state.gates, [{ id: "ambiguous-intent", status: "open" }]);
  assert.deepStrictEqual(state.signals, []);
  assert.deepStrictEqual(state.obligations, []);
});

test("repeating the same intent is a no-op and a different one is refused", () => {
  const state = opened();
  const repeat = recordIntent(state, BUG_INTENT);
  assert.strictEqual(repeat.changed, false);
  assert.deepStrictEqual(repeat.state, state);
  assertCode(() => recordIntent(state, { ...BUG_INTENT, summary: "Something else." }), "intent-conflict");
});

test("resolving an ambiguous intent needs the user's answer and its source", () => {
  const ambiguous = recordIntent(null, { change: "improve-login", ambiguous: true, request: "Improve the login." }).state;
  const resolution = {
    change: "improve-login",
    kind: "bug",
    summary: "Fix the timeout.",
    acceptance: "Login in < 2s.",
    ...NO_OPEN_FACTS,
  };
  assertCode(() => recordIntent(ambiguous, resolution), "gate-answer-required");

  const { state, changed } = recordIntent(ambiguous, { ...resolution, answer: "the timeout bug", source: "AskUserQuestion" });
  assert.strictEqual(changed, true);
  assertValid(state);
  assert.deepStrictEqual(state.intent, {
    request: "Improve the login.",
    kind: "bug",
    summary: "Fix the timeout.",
    acceptance: "Login in < 2s.",
  });
  assert.deepStrictEqual(state.gates, [
    { id: "ambiguous-intent", status: "resolved", answer: "the timeout bug", source: "AskUserQuestion" },
  ]);
  assert.deepStrictEqual(state.obligations.map((o) => o.id), ["checks-pass"]);
});

// ---------------------------------------------------------------------------
// open facts (REQ-idd-018)
// ---------------------------------------------------------------------------

const FEATURE = Object.freeze({
  change: "discount-codes",
  kind: "feature",
  summary: "Discount codes.",
  acceptance: "VERANO10 takes 10%.",
});

test("a resolved intent must declare its open facts or why there are none", () => {
  assertCode(() => recordIntent(null, FEATURE), "facts-undeclared");
  assertCode(() => recordIntent(null, { ...FEATURE, noOpenFacts: true }), "facts-undeclared");
  assertCode(() => recordIntent(null, { ...FEATURE, noOpenFacts: true, basis: "  " }), "facts-undeclared");
  assertCode(() => recordIntent(null, { ...FEATURE, openFacts: [] }), "facts-undeclared");
  assertCode(() => recordIntent(null, { ...FEATURE, openFacts: ["Case?"], ...NO_OPEN_FACTS }), "facts-undeclared");
  assertCode(() => recordIntent(null, { ...FEATURE, openFacts: [" "] }), "facts-undeclared");
});

test("no open facts records the basis and opens no gate", () => {
  const { state } = recordIntent(null, { ...FEATURE, ...NO_OPEN_FACTS });
  assertValid(state);
  assert.deepStrictEqual(state.facts, { basis: "The request fixes every behavior." });
  assert.deepStrictEqual(state.gates, []);
});

test("open facts open the open-facts gate, which only the user's answer resolves", () => {
  const questions = ["Is the threshold checked after the discount?", "Is an unknown code an error?"];
  const { state } = recordIntent(null, { ...FEATURE, openFacts: [...questions, questions[0]] });
  assertValid(state);
  assert.deepStrictEqual(state.facts, { open: questions });
  assert.deepStrictEqual(state.gates, [{ id: "open-facts", status: "open" }]);
  assert.deepStrictEqual(state.obligations.map((o) => o.id), ["checks-pass"]);

  assert.strictEqual(recordIntent(state, { ...FEATURE, openFacts: questions }).changed, false);
  assertCode(() => recordIntent(state, { ...FEATURE, openFacts: ["Other?"] }), "intent-conflict");
  assertCode(() => recordGate(state, { id: "open-facts", action: "open" }), "gate-managed-by-intent");
  assertCode(() => recordGate(state, { id: "open-facts", action: "resolve" }), "gate-answer-required");

  const answer = "After the discount; an unknown code throws.";
  const resolved = recordGate(state, { id: "open-facts", action: "resolve", answer, source: "user" });
  assertValid(resolved.state);
  assert.deepStrictEqual(resolved.state.gates, [{ id: "open-facts", status: "resolved", answer, source: "user" }]);
});

test("resolving an ambiguous intent also declares its open facts", () => {
  const ambiguous = recordIntent(null, { change: "improve-login", ambiguous: true, request: "Improve the login." }).state;
  const resolution = {
    change: "improve-login",
    kind: "bug",
    summary: "Fix the timeout.",
    acceptance: "Login in < 2s.",
    answer: "the timeout bug",
    source: "user",
  };
  assertCode(() => recordIntent(ambiguous, resolution), "facts-undeclared");
  const { state } = recordIntent(ambiguous, { ...resolution, openFacts: ["Which timeout?"] });
  assertValid(state);
  assert.deepStrictEqual(
    state.gates.map((g) => [g.id, g.status]),
    [
      ["ambiguous-intent", "resolved"],
      ["open-facts", "open"],
    ],
  );
});

test("the state validator checks the facts declaration", () => {
  const { state } = recordIntent(null, { ...FEATURE, openFacts: ["Case?"] });
  assert.strictEqual(validateState({ ...state, facts: { open: [] } }).ok, false);
  assert.strictEqual(validateState({ ...state, facts: { open: ["Case?"], basis: "both" } }).ok, false);
  assert.strictEqual(validateState({ ...state, facts: { basis: "" }, gates: [] }).ok, false);
  assert.strictEqual(validateState({ ...state, facts: { basis: "fixed" } }).ok, false, "open-facts needs open facts");
  const legacy = structuredClone(opened());
  delete legacy.facts;
  assertValid(legacy);
});

test("an incomplete or malformed intent is refused", () => {
  assertCode(() => recordIntent(null, { change: "fix-it", kind: "bug", summary: "x" }), "intent-incomplete");
  assertCode(() => recordIntent(null, { ...BUG_INTENT, kind: "chore" }), "intent-incomplete");
  assertCode(() => recordIntent(null, { change: "improve-login", ambiguous: true }), "intent-incomplete");
  assertCode(() => recordIntent(null, { ...BUG_INTENT, change: "Fix Pagination" }), "invalid-change-id");
});

test("reducers never mutate their input", () => {
  const state = opened();
  const snapshot = structuredClone(state);
  recordSignal(state, { id: "bug-fix", reason: "intent kind bug", source: "declaration" });
  recordGate(state, { id: "irreversible-operation", action: "open", reason: "drops a column" });
  assert.deepStrictEqual(state, snapshot);
});

// ---------------------------------------------------------------------------
// record signal (REQ-idd-005, REQ-idd-006, REQ-idd-008)
// ---------------------------------------------------------------------------

test("a signal adds its catalog obligation once, however often it is recorded", () => {
  const first = recordSignal(opened(), { id: "bug-fix", reason: "intent kind bug", source: "declaration" });
  assert.strictEqual(first.changed, true);
  assertValid(first.state);
  assert.deepStrictEqual(first.state.obligations.map((o) => [o.id, o.signal, o.status]), [
    ["checks-pass", "always", "pending"],
    ["repro-test", "bug-fix", "pending"],
  ]);

  const again = recordSignal(first.state, { id: "bug-fix", reason: "seen in the diff", source: "diff" });
  assert.strictEqual(again.changed, false);
  assert.deepStrictEqual(again.state, first.state);
});

test("a signal needs a reason and a known source, and must be in the catalog and available", () => {
  const state = opened();
  assertCode(() => recordSignal(state, { id: "bug-fix", source: "declaration" }), "reason-required");
  assertCode(() => recordSignal(state, { id: "bug-fix", reason: "r", source: "guess" }), "invalid-source");
  assertCode(() => recordSignal(state, { id: "size-large", reason: "r", source: "diff" }), "unknown-signal");
  assertCode(
    () => recordSignal(state, { id: "adr-or-quality-attribute", reason: "r", source: "diff" }),
    "signal-unavailable",
  );
});

test("no signal is recorded while the intent is ambiguous", () => {
  const ambiguous = recordIntent(null, { change: "improve-login", ambiguous: true, request: "Improve the login." }).state;
  assertCode(() => recordSignal(ambiguous, { id: "always", reason: "r", source: "declaration" }), "ambiguous-intent-open");
});

test("a returning signal reopens its withdrawn obligation", () => {
  const state = opened();
  state.obligations.push({
    id: "repro-test",
    signal: "bug-fix",
    status: "withdrawn",
    evidence: [],
    withdrawn_reason: "not a bug",
  });
  const { state: next } = recordSignal(state, { id: "bug-fix", reason: "diff touches a repro", source: "diff" });
  assert.deepStrictEqual(next.obligations[1], { id: "repro-test", signal: "bug-fix", status: "pending", evidence: [] });
});

// ---------------------------------------------------------------------------
// record gate (REQ-idd-008)
// ---------------------------------------------------------------------------

test("a gate opens once with its reason and resolves only with an answer and a source", () => {
  const open = recordGate(opened(), { id: "irreversible-operation", action: "open", reason: "drops fax_number" });
  assertValid(open.state);
  assert.deepStrictEqual(open.state.gates, [{ id: "irreversible-operation", status: "open", reason: "drops fax_number" }]);
  assert.strictEqual(recordGate(open.state, { id: "irreversible-operation", action: "open", reason: "x" }).changed, false);

  assertCode(() => recordGate(open.state, { id: "irreversible-operation", action: "resolve" }), "gate-answer-required");
  const resolved = recordGate(open.state, {
    id: "irreversible-operation",
    action: "resolve",
    answer: "approve the data loss",
    source: "AskUserQuestion",
  });
  assertValid(resolved.state);
  assert.deepStrictEqual(resolved.state.gates[0], {
    id: "irreversible-operation",
    status: "resolved",
    reason: "drops fax_number",
    answer: "approve the data loss",
    source: "AskUserQuestion",
  });

  const repeat = { id: "irreversible-operation", action: "resolve", answer: "approve the data loss", source: "AskUserQuestion" };
  assert.strictEqual(recordGate(resolved.state, repeat).changed, false);
  assertCode(() => recordGate(resolved.state, { ...repeat, answer: "reject" }), "gate-conflict");
});

test("gate records reject unknown gates, unopened resolutions and the intent-owned gate", () => {
  const state = opened();
  assertCode(() => recordGate(state, { id: "size-review", action: "open" }), "unknown-gate");
  assertCode(
    () => recordGate(state, { id: "irreversible-operation", action: "resolve", answer: "a", source: "s" }),
    "gate-not-open",
  );
  assertCode(() => recordGate(state, { id: "ambiguous-intent", action: "open" }), "gate-managed-by-intent");
  assertCode(() => recordGate(state, { id: "irreversible-operation", action: "skip" }), "invalid-action");
});

// ---------------------------------------------------------------------------
// record withdraw (REQ-idd-006)
// ---------------------------------------------------------------------------

test("a withdrawal is refused while a signal still derives the obligation", () => {
  const state = recordSignal(opened(), { id: "bug-fix", reason: "intent kind bug", source: "declaration" }).state;
  assertCode(() => recordWithdraw(state, { obligation: "repro-test", reason: "not a bug" }), "withdraw-refused");
  assert.strictEqual(state.obligations[1].status, "pending");
});

test("a withdrawal needs a reason, is recorded once and never undoes satisfied evidence", () => {
  const state = opened();
  state.obligations.push({ id: "repro-test", signal: "bug-fix", status: "pending", evidence: [] });
  assertCode(() => recordWithdraw(state, { obligation: "repro-test" }), "reason-required");
  assertCode(() => recordWithdraw(state, { obligation: "trust-review", reason: "r" }), "unknown-obligation");

  const withdrawn = recordWithdraw(state, { obligation: "repro-test", reason: "not a bug after all" });
  assertValid(withdrawn.state);
  assert.deepStrictEqual(withdrawn.state.obligations[1], {
    id: "repro-test",
    signal: "bug-fix",
    status: "withdrawn",
    evidence: [],
    withdrawn_reason: "not a bug after all",
  });
  assert.strictEqual(recordWithdraw(withdrawn.state, { obligation: "repro-test", reason: "not a bug after all" }).changed, false);

  const satisfied = recordEvidence(opened(), {
    id: "ev-1",
    kind: "check-run",
    obligation: "checks-pass",
    recordedAt: "2026-10-05T08:00:00Z",
  }).state;
  satisfied.signals = [];
  assertCode(() => recordWithdraw(satisfied, { obligation: "checks-pass", reason: "r" }), "obligation-satisfied");
});

// ---------------------------------------------------------------------------
// recordEvidence — library only until E1.4 (REQ-idd-007)
// ---------------------------------------------------------------------------

test("evidence of the catalog kind satisfies its obligation once", () => {
  const tree = `sha256:${"a".repeat(64)}`;
  const entry = {
    id: "ev-1",
    kind: "check-run",
    obligation: "checks-pass",
    recordedAt: "2026-10-05T08:00:00Z",
    detail: { tree, runs: ["run-1"] },
  };
  const withRun = opened();
  withRun.runs = [
    {
      id: "run-1",
      purpose: "checks",
      name: "test",
      command: "npm test",
      exit_code: 0,
      output_sha256: `sha256:${"0".repeat(64)}`,
      tree,
      recorded_at: "2026-10-05T08:00:00Z",
    },
  ];
  const { state, changed } = recordEvidence(withRun, entry);
  assert.strictEqual(changed, true);
  assertValid(state);
  assert.deepStrictEqual(state.evidence, [
    {
      id: "ev-1",
      kind: "check-run",
      obligation: "checks-pass",
      recorded_at: "2026-10-05T08:00:00Z",
      detail: { tree, runs: ["run-1"] },
    },
  ]);
  assert.deepStrictEqual(state.obligations[0], { id: "checks-pass", signal: "always", status: "satisfied", evidence: ["ev-1"] });

  assert.strictEqual(recordEvidence(state, entry).changed, false);
  assertCode(() => recordEvidence(state, { ...entry, detail: { exit_code: 1 } }), "evidence-conflict");
});

test("evidence of the wrong kind or for an absent obligation is refused", () => {
  const state = opened();
  assertCode(
    () => recordEvidence(state, { id: "ev-1", kind: "repro-run-pair", obligation: "checks-pass", recordedAt: "t" }),
    "evidence-kind-mismatch",
  );
  assertCode(
    () => recordEvidence(state, { id: "ev-1", kind: "repro-run-pair", obligation: "repro-test", recordedAt: "t" }),
    "unknown-obligation",
  );
});

// ---------------------------------------------------------------------------
// Closed changes are immutable
// ---------------------------------------------------------------------------

test("every record is refused on a closed change", () => {
  const state = { ...opened(), status: "closed" };
  assertCode(() => recordIntent(state, BUG_INTENT), "change-closed");
  assertCode(() => recordSignal(state, { id: "bug-fix", reason: "r", source: "diff" }), "change-closed");
  assertCode(() => recordGate(state, { id: "irreversible-operation", action: "open" }), "change-closed");
  assertCode(() => recordWithdraw(state, { obligation: "checks-pass", reason: "r" }), "change-closed");
  assertCode(
    () => recordEvidence(state, { id: "ev-1", kind: "check-run", obligation: "checks-pass", recordedAt: "t" }),
    "change-closed",
  );
});

test("opening a change records its base commit, which must be a commit id or null", () => {
  const input = BUG_INTENT;
  assert.strictEqual(recordIntent(null, { ...input, base: "3b0378e3" }).state.base, "3b0378e3");
  assert.strictEqual(recordIntent(null, { ...input, base: null }).state.base, null);
  assert.ok(!("base" in recordIntent(null, input).state));
  assertCode(() => recordIntent(null, { ...input, base: "" }), "invalid-base");

  const { state } = recordIntent(null, { ...input, base: "3b0378e3" });
  assert.strictEqual(recordIntent(state, { ...input, base: "ffffffff" }).changed, false, "the base never moves");
});

// ---------------------------------------------------------------------------
// E1.11: record plan and record retract
// ---------------------------------------------------------------------------

test("the declared plan is recorded once, widened by later declarations and kept valid", () => {
  const { recordPlan } = require("./idd-record.js");
  const first = recordPlan(opened(), { paths: ["src\\b.js", "src/a.js", "src/a.js"], workUnits: 1 });
  assert.strictEqual(first.changed, true);
  assertValid(first.state);
  assert.deepStrictEqual(first.state.plan, { paths: ["src/a.js", "src/b.js"], work_units: 1, decision: false, operations: [] });
  assert.strictEqual(recordPlan(first.state, { paths: ["src/a.js"] }).changed, false);

  const widened = recordPlan(first.state, { paths: ["src/c.js"], workUnits: 3, nonObviousDecision: true, operations: ["drop-table"] });
  assert.deepStrictEqual(widened.state.plan, {
    paths: ["src/a.js", "src/b.js", "src/c.js"],
    work_units: 3,
    decision: true,
    operations: ["drop-table"],
  });
  assert.strictEqual(recordPlan(widened.state, { paths: [], workUnits: 1 }).changed, false);
  assertCode(() => recordPlan({ ...opened(), status: "closed" }, { paths: [] }), "change-closed");

  const invalid = validateState({ ...opened(), plan: { paths: "src/a.js", work_units: 0, decision: "no", operations: [] } });
  assert.strictEqual(invalid.ok, false);
  assert.ok(invalid.errors.some((error) => /plan/.test(error)));
});

test("a declared signal the diff does not confirm is retracted with its reason", () => {
  const { recordRetract } = require("./idd-record.js");
  const state = recordSignal(opened(), { id: "public-contract", reason: "public contract: touches src/api/a.js", source: "declaration" }).state;
  const { state: retracted, changed } = recordRetract(state, { id: "public-contract", reason: "no API change", confirmedBy: null });
  assert.strictEqual(changed, true);
  assertValid(retracted);
  assert.ok(!retracted.signals.some((signal) => signal.id === "public-contract"));
  assert.deepStrictEqual(retracted.obligations.find((o) => o.id === "contract-spec-and-test"), {
    id: "contract-spec-and-test",
    signal: "public-contract",
    status: "withdrawn",
    evidence: [],
    withdrawn_reason: "no API change",
  });
  assert.deepStrictEqual(retracted.retracted, [
    { id: "public-contract", reason: "public contract: touches src/api/a.js", source: "declaration", retract_reason: "no API change" },
  ]);
  assert.deepStrictEqual(state.signals.map((s) => s.id), ["always", "public-contract"], "the input is not mutated");
  assert.strictEqual(recordRetract(retracted, { id: "public-contract", reason: "no API change" }).changed, false);
  assertCode(() => recordRetract(retracted, { id: "public-contract", reason: "other" }), "retract-conflict");

  // Declared again, it comes back pending and can be retracted again.
  const again = recordSignal(retracted, { id: "public-contract", reason: "declared again", source: "declaration" }).state;
  assert.strictEqual(again.obligations.find((o) => o.id === "contract-spec-and-test").status, "pending");
  const twice = recordRetract(again, { id: "public-contract", reason: "still no API change" }).state;
  assert.strictEqual(twice.retracted.length, 2);
  assertValid(twice);
});

test("retract is refused for confirmed, diff, satisfied, unknown and non-path signals", () => {
  const { recordRetract } = require("./idd-record.js");
  let state = recordSignal(opened(), { id: "persistent-data", reason: "plan", source: "declaration" }).state;
  assertCode(() => recordRetract(state, { id: "persistent-data", reason: "r", confirmedBy: "persistent data: touches db/m.sql" }), "signal-confirmed-by-diff");
  assertCode(() => recordRetract(state, { id: "persistent-data", reason: " " }), "reason-required");
  assertCode(() => recordRetract(state, { id: "bug-fix", reason: "r" }), "signal-not-retractable");
  assertCode(() => recordRetract(state, { id: "always", reason: "r" }), "signal-not-retractable");
  assertCode(() => recordRetract(state, { id: "nope", reason: "r" }), "unknown-signal");
  assertCode(() => recordRetract(state, { id: "security-boundary", reason: "r" }), "signal-not-recorded");

  const fromDiff = recordSignal(opened(), { id: "security-boundary", reason: "diff", source: "diff" }).state;
  assertCode(() => recordRetract(fromDiff, { id: "security-boundary", reason: "r" }), "signal-confirmed-by-diff");

  state = recordSignal(opened(), { id: "multi-unit-or-decision", reason: "two units", source: "declaration" }).state;
  const satisfied = structuredClone(state);
  const doc = satisfied.obligations.find((o) => o.id === "living-doc");
  doc.status = "satisfied";
  doc.evidence = ["ev-1"];
  satisfied.evidence.push({ id: "ev-1", kind: "living-doc-current", obligation: "living-doc", recorded_at: "t" });
  assertCode(() => recordRetract(satisfied, { id: "multi-unit-or-decision", reason: "r" }), "obligation-satisfied");
  assertCode(() => recordRetract({ ...state, status: "closed" }, { id: "multi-unit-or-decision", reason: "r" }), "change-closed");
});
