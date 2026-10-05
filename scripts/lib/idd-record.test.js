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

const BUG_INTENT = Object.freeze({
  change: "fix-pagination",
  kind: "bug",
  summary: "Fix the last page.",
  acceptance: "Two full pages.",
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
  const resolution = { change: "improve-login", kind: "bug", summary: "Fix the timeout.", acceptance: "Login in < 2s." };
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
  const entry = {
    id: "ev-1",
    kind: "check-run",
    obligation: "checks-pass",
    recordedAt: "2026-10-05T08:00:00Z",
    detail: { command: "npm test", exit_code: 0 },
  };
  const { state, changed } = recordEvidence(opened(), entry);
  assert.strictEqual(changed, true);
  assertValid(state);
  assert.deepStrictEqual(state.evidence, [
    {
      id: "ev-1",
      kind: "check-run",
      obligation: "checks-pass",
      recorded_at: "2026-10-05T08:00:00Z",
      detail: { command: "npm test", exit_code: 0 },
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
