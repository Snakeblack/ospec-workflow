"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { extractDiscriminants, compareParity } = require("./transition-parity.js");

const FIXTURES_DIR = path.join(
  __dirname,
  "..",
  "..",
  "schemas",
  "kernel",
  "parity",
  "fixtures"
);

test("parity fixture recovers shared discriminants including execute command", () => {
  const fixture = JSON.parse(
    fs.readFileSync(path.join(FIXTURES_DIR, "match-execute.json"), "utf8")
  );
  const human = extractDiscriminants(fixture.human);
  const envelope = extractDiscriminants(fixture.envelope);
  const parity = compareParity(human, envelope);
  assert.equal(parity.ok, true);
  assert.equal(human.code, envelope.code);
  assert.equal(human.cause, envelope.cause);
  assert.equal(human.next_action.kind, "execute");
  assert.equal(human.next_action.command, envelope.next_action.command);
});

test("divergent next action fails parity", () => {
  const fixture = JSON.parse(
    fs.readFileSync(path.join(FIXTURES_DIR, "diverge-next-action.json"), "utf8")
  );
  const human = extractDiscriminants(fixture.human);
  const envelope = extractDiscriminants(fixture.envelope);
  const parity = compareParity(human, envelope);
  assert.equal(parity.ok, false);
  assert.ok(parity.mismatches.some((m) => m.field === "next_action"));
});

test("compareParity matches code/cause/next_action directly", () => {
  const left = {
    code: "contract-remediation",
    cause: "missing-field",
    next_action: { kind: "decide", operation: "approve" },
  };
  const right = {
    code: "contract-remediation",
    cause: "missing-field",
    next_action: { kind: "decide", operation: "approve" },
  };
  assert.equal(compareParity(left, right).ok, true);

  right.next_action = { kind: "stop", operation: "halt" };
  assert.equal(compareParity(left, right).ok, false);
});

test("compareParity rejects two empty surfaces instead of manufacturing parity", () => {
  const parity = compareParity({}, {});
  assert.equal(parity.ok, false);
  assert.deepEqual(
    new Set(parity.mismatches.map((m) => m.field)),
    new Set(["code", "cause", "next_action"])
  );
});

test("compareParity requires code and cause even when both surfaces omit them", () => {
  const next_action = { kind: "decide", operation: "approve" };
  const missingCode = compareParity(
    { cause: "missing-field", next_action },
    { cause: "missing-field", next_action }
  );
  const missingCause = compareParity(
    { code: "contract-remediation", next_action },
    { code: "contract-remediation", next_action }
  );
  assert.equal(missingCode.ok, false);
  assert.ok(missingCode.mismatches.some((m) => m.field === "code"));
  assert.equal(missingCause.ok, false);
  assert.ok(missingCause.mismatches.some((m) => m.field === "cause"));
});

test("compareParity requires a complete next action on both surfaces", () => {
  const base = { code: "contract-remediation", cause: "missing-field" };
  const incomplete = compareParity(
    { ...base, next_action: { kind: "decide" } },
    { ...base, next_action: { kind: "decide" } }
  );
  const invalidKind = compareParity(
    { ...base, next_action: { kind: "retry", operation: "approve" } },
    { ...base, next_action: { kind: "retry", operation: "approve" } }
  );
  const missingExecuteCommand = compareParity(
    { ...base, next_action: { kind: "execute", operation: "repair" } },
    { ...base, next_action: { kind: "execute", operation: "repair" } }
  );
  assert.equal(incomplete.ok, false);
  assert.equal(invalidKind.ok, false);
  assert.equal(missingExecuteCommand.ok, false);
  assert.ok(incomplete.mismatches.some((m) => m.field === "next_action"));
  assert.ok(invalidKind.mismatches.some((m) => m.field === "next_action"));
  assert.ok(missingExecuteCommand.mismatches.some((m) => m.field === "next_action"));
});
