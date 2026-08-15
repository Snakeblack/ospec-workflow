"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { check: checkMicroscopicNodes } = require("./k4a-microscopic-nodes.js");
const { check: checkObligationCompleteness } = require("./k4a-obligation-completeness.js");

const ROOT = path.resolve(__dirname, "..", "..", "..");

test("k4a-microscopic-nodes checker: reports offenders for microscopic operations", () => {
  const badGraph = {
    schema_version: 1,
    graph_id: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
    nodes: [
      {
        node_id: "micro-1",
        operation: "file_edit",
      },
      {
        node_id: "micro-2",
        operation: "test",
      },
    ],
  };

  const offenders = checkMicroscopicNodes({ root: ROOT, graphs: [badGraph] });
  assert.equal(offenders.length, 2);
  assert.equal(offenders[0].checker, "k4a-microscopic-nodes");
  assert.ok(offenders[0].message.includes("file_edit"));
  assert.ok(offenders[1].message.includes("test"));
});

test("k4a-microscopic-nodes checker: reports zero offenders on clean repository fixtures", () => {
  const offenders = checkMicroscopicNodes({ root: ROOT });
  assert.deepEqual(offenders, []);
});

test("k4a-microscopic-nodes checker: fails closed for unreadable or malformed graph files", (t) => {
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "k4a-microscopic-nodes-"));
  t.after(() => fs.rmSync(fixtureDir, { recursive: true, force: true }));
  const malformedPath = path.join(fixtureDir, "malformed.json");
  const missingPath = path.join(fixtureDir, "missing.json");
  fs.writeFileSync(malformedPath, "{not-json");

  const offenders = checkMicroscopicNodes({
    root: fixtureDir,
    graphFiles: [malformedPath, missingPath],
  });

  assert.equal(offenders.length, 2);
  assert.deepEqual(offenders.map(({ checker, path: offenderPath, expected }) => ({ checker, path: offenderPath, expected })), [
    { checker: "k4a-microscopic-nodes", path: "malformed.json", expected: "readable execution graph JSON" },
    { checker: "k4a-microscopic-nodes", path: "missing.json", expected: "readable execution graph JSON" },
  ]);
  assert.match(offenders[0].actual, /Unexpected token|Expected property name/);
  assert.match(offenders[0].message, /malformed\.json could not be read/);
  assert.match(offenders[1].actual, /ENOENT/);
  assert.match(offenders[1].message, /missing\.json could not be read/);
});

test("k4a-obligation-completeness checker: reports offenders for unmapped MUST obligations", () => {
  const badGraph = {
    schema_version: 1,
    graph_id: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
    nodes: [
      { node_id: "n1", operation: "apply_repair_patch" },
    ],
    obligations: [
      {
        id: "req-unmapped-must",
        criticality: "must",
        implemented_by: [],
        required_evidence: ["ev:test"],
      },
      {
        id: "req-no-evidence-must",
        criticality: "must",
        implemented_by: ["n1"],
        required_evidence: [],
      },
      {
        id: "req-deferred-must",
        criticality: "must",
        implemented_by: [],
        required_evidence: [],
        deferred: {
          reason: "Approved deferral",
          approved_by: "lead",
        },
      },
    ],
  };

  const offenders = checkObligationCompleteness({ root: ROOT, graphs: [badGraph] });
  assert.equal(offenders.length, 2);
  assert.equal(offenders[0].checker, "k4a-obligation-completeness");
  assert.ok(offenders[0].message.includes("req-unmapped-must"));
  assert.ok(offenders[1].message.includes("req-no-evidence-must"));
});

test("k4a-obligation-completeness checker: reports zero offenders on clean repository fixtures", () => {
  const offenders = checkObligationCompleteness({ root: ROOT });
  assert.deepEqual(offenders, []);
});

test("k4a-obligation-completeness checker: fails closed for unreadable or malformed graph files", (t) => {
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "k4a-obligation-completeness-"));
  t.after(() => fs.rmSync(fixtureDir, { recursive: true, force: true }));
  const malformedPath = path.join(fixtureDir, "malformed.json");
  const missingPath = path.join(fixtureDir, "missing.json");
  fs.writeFileSync(malformedPath, "{not-json");

  const offenders = checkObligationCompleteness({
    root: fixtureDir,
    graphFiles: [malformedPath, missingPath],
  });

  assert.equal(offenders.length, 2);
  assert.deepEqual(offenders.map(({ checker, path: offenderPath, expected }) => ({ checker, path: offenderPath, expected })), [
    { checker: "k4a-obligation-completeness", path: "malformed.json", expected: "readable execution graph JSON" },
    { checker: "k4a-obligation-completeness", path: "missing.json", expected: "readable execution graph JSON" },
  ]);
  assert.match(offenders[0].actual, /Unexpected token|Expected property name/);
  assert.match(offenders[0].message, /malformed\.json could not be read/);
  assert.match(offenders[1].actual, /ENOENT/);
  assert.match(offenders[1].message, /missing\.json could not be read/);
});
