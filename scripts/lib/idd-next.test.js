"use strict";

// E1.2 ospec-cli-core: `next` and `status` are pure, deterministic reads of
// idd-state/v1 (openspec/specs/idd/spec.md, REQ-idd-011). The reference
// fixtures of E1.1 pin the expected next step of each change type.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const { nextForChange, nextForProject, statusOf } = require("./idd-next.js");
const { recordEvidence, recordGate, recordIntent, recordSignal } = require("./idd-record.js");

const FIXTURES_DIR = path.join(__dirname, "..", "fixtures", "idd");
const NO_OPEN_FACTS = Object.freeze({ noOpenFacts: true, basis: "The request fixes every behavior." });

function loadFixtures() {
  return fs
    .readdirSync(FIXTURES_DIR)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, name), "utf8")));
}

// Builds the state a fixture reaches through the record reducers, recording its
// expected signals in the given order.
function stateFromFixture(fixture, signalOrder = (ids) => ids) {
  const { input, expected } = fixture;
  const intent = input.intent.ambiguous
    ? { change: fixture.id, ambiguous: true, request: input.request }
    : {
        change: fixture.id,
        kind: input.intent.kind,
        summary: input.intent.summary,
        acceptance: input.intent.acceptance,
        ...NO_OPEN_FACTS,
      };
  let state = recordIntent(null, intent).state;
  for (const id of signalOrder(expected.signals.filter((s) => s !== "always"))) {
    state = recordSignal(state, { id, reason: `fixture ${fixture.id}`, source: "declaration" }).state;
  }
  for (const id of expected.gates.filter((g) => g !== "ambiguous-intent")) {
    state = recordGate(state, { id, action: "open", reason: `fixture ${fixture.id}` }).state;
  }
  return state;
}

for (const fixture of loadFixtures()) {
  test(`next is deterministic for fixture ${fixture.id}`, () => {
    const state = stateFromFixture(fixture);
    const result = nextForChange(state);
    const { expected } = fixture;

    assert.deepStrictEqual(result.pending_obligations.map((o) => o.id).sort(), expected.obligations);
    const step = { action: result.next_step.action };
    if (result.next_step.obligation) step.obligation = result.next_step.obligation;
    if (result.next_step.gate) step.gate = result.next_step.gate;
    step.pending_decision = result.pending_decision ? result.pending_decision.gate : null;
    assert.deepStrictEqual(step, expected.next);
    assert.deepStrictEqual(
      result.knowledge_refs,
      expected.living_doc ? [`idd/${fixture.id}/change.md`] : [],
    );

    const reversed = stateFromFixture(fixture, (ids) => [...ids].reverse());
    assert.strictEqual(JSON.stringify(nextForChange(reversed)), JSON.stringify(nextForChange(state)));
    assert.strictEqual(JSON.stringify(nextForChange(state)), JSON.stringify(result));
  });
}

test("next names the evidence kind of the obligation to satisfy", () => {
  const bug = loadFixtures().find((f) => f.id === "bug");
  const result = nextForChange(stateFromFixture(bug));
  assert.deepStrictEqual(result.next_step, {
    action: "satisfy-obligation",
    obligation: "repro-test",
    evidence: "repro-run-pair",
    how: `ospec run --change ${result.change} --obligation repro-test --command "<test>": once failing before the fix, again passing after it`,
  });
  assert.deepStrictEqual(result.pending_obligations, [
    { id: "repro-test", signal: "bug-fix", evidence: "repro-run-pair" },
    { id: "checks-pass", signal: "always", evidence: "check-run" },
  ]);
});

test("an ambiguous intent blocks on its gate with the original request", () => {
  const ambiguous = loadFixtures().find((f) => f.id === "ambiguous-intent");
  const result = nextForChange(stateFromFixture(ambiguous));
  assert.deepStrictEqual(result.next_step, { action: "resolve-gate", gate: "ambiguous-intent" });
  assert.strictEqual(result.pending_decision.gate, "ambiguous-intent");
  assert.ok(result.pending_decision.question.length > 0);
  assert.strictEqual(result.pending_decision.reason, "Improve the login.");
  assert.deepStrictEqual(result.pending_obligations, []);
});

test("open facts are asked before any obligation, as one batch of questions", () => {
  const questions = ["Is the threshold checked after the discount?", "Is an unknown code an error?"];
  let state = recordIntent(null, { change: "discount-codes", kind: "feature", summary: "s", acceptance: "a", openFacts: questions }).state;
  const result = nextForChange(state);
  assert.deepStrictEqual(result.next_step, { action: "resolve-gate", gate: "open-facts" });
  assert.strictEqual(result.pending_decision.gate, "open-facts");
  assert.ok(result.pending_decision.question.length > 0);
  assert.deepStrictEqual(result.pending_decision.questions, questions);
  assert.deepStrictEqual(result.pending_obligations.map((o) => o.id), ["checks-pass"]);

  state = recordGate(state, { id: "open-facts", action: "resolve", answer: "after; it throws", source: "user" }).state;
  assert.deepStrictEqual(nextForChange(state).next_step.obligation, "checks-pass");
  assert.strictEqual(nextForChange(state).pending_decision, null);
});

test("an open gate blocks close once obligations are settled, then close is next", () => {
  let state = recordIntent(null, { change: "drop-fax", kind: "refactor", summary: "s", acceptance: "a", ...NO_OPEN_FACTS }).state;
  state = recordGate(state, { id: "irreversible-operation", action: "open", reason: "drops fax_number" }).state;
  state = recordEvidence(state, { id: "ev-1", kind: "check-run", obligation: "checks-pass", recordedAt: "t" }).state;
  assert.deepStrictEqual(nextForChange(state).next_step, { action: "resolve-gate", gate: "irreversible-operation" });

  state = recordGate(state, { id: "irreversible-operation", action: "resolve", answer: "ok", source: "AskUserQuestion" }).state;
  const result = nextForChange(state);
  assert.deepStrictEqual(result.next_step, { action: "close" });
  assert.strictEqual(result.pending_decision, null);
});

test("a closed change has no next step", () => {
  const state = { ...recordIntent(null, { change: "fix-it", kind: "bug", summary: "s", acceptance: "a", ...NO_OPEN_FACTS }).state, status: "closed" };
  assert.deepStrictEqual(nextForChange(state).next_step, { action: "none" });
});

test("project next picks the only open change, asks to choose among several, or to open one", () => {
  const a = recordIntent(null, { change: "b-change", kind: "docs", summary: "s", acceptance: "a", ...NO_OPEN_FACTS }).state;
  const b = recordIntent(null, { change: "a-change", kind: "docs", summary: "s", acceptance: "a", ...NO_OPEN_FACTS }).state;
  const closed = { ...recordIntent(null, { change: "c-change", kind: "docs", summary: "s", acceptance: "a", ...NO_OPEN_FACTS }).state, status: "closed" };

  assert.deepStrictEqual(nextForProject([]).next_step, { action: "open-change" });
  assert.strictEqual(nextForProject([a, closed]).change, "b-change");
  assert.deepStrictEqual(nextForProject([a, b, closed]), {
    change: null,
    next_step: { action: "choose-change", changes: ["a-change", "b-change"] },
  });
  assert.strictEqual(nextForProject([a, b], { change: "a-change" }).change, "a-change");
  assert.throws(() => nextForProject([a], { change: "missing" }), /unknown change: missing/);
});

test("status summarizes each change in id order", () => {
  let fix = recordIntent(null, { change: "fix-it", kind: "bug", summary: "Fix it.", acceptance: "a", ...NO_OPEN_FACTS }).state;
  fix = recordSignal(fix, { id: "bug-fix", reason: "bug", source: "declaration" }).state;
  fix = recordEvidence(fix, { id: "ev-1", kind: "check-run", obligation: "checks-pass", recordedAt: "t" }).state;
  const vague = recordIntent(null, { change: "improve-login", ambiguous: true, request: "Improve the login." }).state;

  assert.deepStrictEqual(statusOf([vague, fix]), {
    changes: [
      {
        change: "fix-it",
        status: "open",
        kind: "bug",
        summary: "Fix it.",
        obligations: { pending: ["repro-test"], satisfied: ["checks-pass"], withdrawn: [] },
        open_gates: [],
      },
      {
        change: "improve-login",
        status: "open",
        kind: null,
        summary: null,
        obligations: { pending: [], satisfied: [], withdrawn: [] },
        open_gates: ["ambiguous-intent"],
      },
    ],
  });
});

test("the work order and gate questions cover the whole catalog", () => {
  const { GATES, OBLIGATIONS } = require("./idd-contract.js");
  const { GATE_QUESTIONS, WORK_ORDER } = require("./idd-next.js");
  assert.deepStrictEqual([...WORK_ORDER].sort(), OBLIGATIONS.map((o) => o.id).sort());
  assert.deepStrictEqual(Object.keys(GATE_QUESTIONS).sort(), [...GATES].sort());
});

test("the work order is the one REQ-idd-011 names", () => {
  const { WORK_ORDER } = require("./idd-next.js");
  const spec = fs.readFileSync(path.join(__dirname, "..", "..", "openspec", "specs", "idd", "spec.md"), "utf8");
  const section = spec.slice(spec.indexOf("{#REQ-idd-011}")).replace(/\s+/g, " ");
  const listed = WORK_ORDER.slice(0, -1).map((id) => `\`${id}\``).join(", ");
  assert.ok(section.includes(`${listed}, \`${WORK_ORDER.at(-1)}\``), "REQ-idd-011 must list the work order");
});
