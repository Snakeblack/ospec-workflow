"use strict";

// E1.49 gate-turn-fence: the count of turn ends the Stop hook keeps and the
// fence it puts on the answers to the IDD gates (REQ-idd-008).

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { TURNS_FILE, countTurnEnd, fenceGates, readTurn, unverifiedGateWarnings } = require("./turn-fence.js");

function workspace(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "turn-fence-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function writeTurns(root, text) {
  fs.mkdirSync(path.join(root, ".ospec"), { recursive: true });
  fs.writeFileSync(path.join(root, ...TURNS_FILE.split("/")), text);
}

function state(...gates) {
  return { gates };
}

test("the turn count reads a whole number and nothing else", (t) => {
  const root = workspace(t);
  assert.strictEqual(readTurn(root), null, "no count yet");
  for (const [text, turn] of [["4\n", 4], ["0", 0], [" 12 \r\n", 12], ["-1", null], ["4.5", null], ["seven", null], ["", null], ["9007199254740993", null]]) {
    writeTurns(root, text);
    assert.strictEqual(readTurn(root), turn, JSON.stringify(text));
  }
});

test("each turn end adds one, an unreadable count starts again, and .ospec/ ignores itself", async (t) => {
  const root = workspace(t);
  assert.strictEqual(await countTurnEnd(root), 1);
  assert.strictEqual(await countTurnEnd(root), 2);
  assert.strictEqual(fs.readFileSync(path.join(root, ".ospec", "turns"), "utf8"), "2\n");
  assert.strictEqual(fs.readFileSync(path.join(root, ".ospec", ".gitignore"), "utf8"), "*\n");
  writeTurns(root, "garbage");
  assert.strictEqual(await countTurnEnd(root), 1);
});

test("a gate opened by the command takes the turn, one it left as it was keeps its own", () => {
  const before = state({ id: "irreversible-operation", status: "open", reason: "drop column", opened_turn: 2 });
  const after = state(
    { id: "irreversible-operation", status: "open", reason: "drop column", opened_turn: 2 },
    { id: "open-facts", status: "open" },
  );
  assert.deepStrictEqual(fenceGates(before, after, 5), []);
  assert.deepStrictEqual(after.gates.map((gate) => gate.opened_turn), [2, 5]);

  const opened = state({ id: "ambiguous-intent", status: "open" });
  fenceGates(null, opened, null);
  assert.strictEqual(opened.gates[0].opened_turn, null, "no count: the gate opens with none");
});

test("a checks-changed asked again about other checks opens again at the new turn", () => {
  const before = state({ id: "checks-changed", status: "open", reason: "test changed", checks: [{ name: "test", command: "npm test" }], opened_turn: 3 });
  const after = structuredClone(before);
  Object.assign(after.gates[0], { reason: "test changed again", checks: [{ name: "test", command: "npm run test:all" }] });
  fenceGates(before, after, 6);
  assert.strictEqual(after.gates[0].opened_turn, 6);
});

test("an answer declared user after a turn ended keeps its source", () => {
  const before = state({ id: "open-facts", status: "open", opened_turn: 3 });
  const after = state({ id: "open-facts", status: "resolved", answer: "the recommended ones", source: "user", opened_turn: 3 });
  assert.deepStrictEqual(fenceGates(before, after, 4), []);
  assert.deepStrictEqual(after.gates[0], { id: "open-facts", status: "resolved", answer: "the recommended ones", source: "user", opened_turn: 3, resolved_turn: 4 });
});

test("an answer declared user without a turn end after the opening is recorded user-unverified", () => {
  const cases = [
    { opened: 3, turn: 3, reason: /^no turn ended between the gate's opening and the answer$/ },
    { opened: 3, turn: null, reason: /^no turn count in \.ospec\/turns: no end-of-turn hook ran/ },
    { opened: null, turn: 1, reason: /^no turn count in \.ospec\/turns when the gate opened$/ },
    { opened: 5, turn: 2, reason: /^no turn ended/, label: "a count that started again" },
  ];
  for (const { opened, turn, reason, label } of cases) {
    const before = state({ id: "irreversible-operation", status: "open", opened_turn: opened });
    const after = state({ id: "irreversible-operation", status: "resolved", answer: "go ahead", source: "user", opened_turn: opened });
    const unverified = fenceGates(before, after, turn);
    const [gate] = after.gates;
    assert.strictEqual(gate.source, "user-unverified", label ?? `${opened} → ${turn}`);
    assert.strictEqual(gate.declared_source, "user");
    assert.strictEqual(gate.resolved_turn, turn);
    assert.match(gate.unverified_reason, reason);
    assert.deepStrictEqual(unverified, [{ gate: "irreversible-operation", reason: gate.unverified_reason }]);
  }
});

test("a relayed answer, an earlier answer and a gate opened before E1.49 are left as they are", () => {
  const relayed = state({ id: "open-facts", status: "resolved", answer: "forwarded", source: "user-unverified", opened_turn: 3 });
  assert.deepStrictEqual(fenceGates(state({ id: "open-facts", status: "open", opened_turn: 3 }), relayed, 3), []);
  assert.strictEqual(relayed.gates[0].source, "user-unverified");
  assert.strictEqual(relayed.gates[0].declared_source, undefined);

  const answered = { id: "review-limit", status: "resolved", answer: "one more", source: "user", opened_turn: 1, resolved_turn: 2 };
  const again = state(structuredClone(answered), { id: "review-limit", status: "open", opened_turn: 2 });
  fenceGates(state(answered, { id: "review-limit", status: "open", opened_turn: 2 }), again, 2);
  assert.deepStrictEqual(again.gates[0], answered);

  const legacy = state({ id: "open-facts", status: "resolved", answer: "yes", source: "user" });
  assert.deepStrictEqual(fenceGates(state({ id: "open-facts", status: "open" }), legacy, 0), []);
  assert.deepStrictEqual(legacy.gates[0], { id: "open-facts", status: "resolved", answer: "yes", source: "user" });
});

test("close names every gate answered user-unverified, with the reason of a fenced one", () => {
  const closed = state(
    { id: "open-facts", status: "resolved", answer: "yes", source: "user-unverified", declared_source: "user", unverified_reason: "no turn ended between the gate's opening and the answer" },
    { id: "irreversible-operation", status: "resolved", answer: "go ahead", source: "user-unverified" },
    { id: "review-limit", status: "resolved", answer: "one more", source: "user" },
  );
  assert.deepStrictEqual(unverifiedGateWarnings(closed), [
    "gate open-facts was answered user-unverified: no turn ended between the gate's opening and the answer",
    "gate irreversible-operation was answered user-unverified: the answer was relayed",
  ]);
});
