"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  hasCycle,
  topologicalSort,
  computeDescendantClosure,
} = require("./dag.js");

test("DAG: hasCycle returns false for empty or non-array inputs", () => {
  assert.equal(hasCycle([]), false);
  assert.equal(hasCycle(null), false);
  assert.equal(hasCycle(undefined), false);
  assert.equal(hasCycle({}), false);
});

test("DAG: hasCycle returns false for linear and diamond acyclic DAGs", () => {
  const linear = [
    { node_id: "A", dependencies: [] },
    { node_id: "B", dependencies: ["A"] },
    { node_id: "C", dependencies: ["B"] },
  ];
  assert.equal(hasCycle(linear), false);

  const diamond = [
    { node_id: "A", dependencies: [] },
    { node_id: "B", dependencies: ["A"] },
    { node_id: "C", dependencies: ["A"] },
    { node_id: "D", dependencies: ["B", "C"] },
  ];
  assert.equal(hasCycle(diamond), false);
});

test("DAG: hasCycle detects direct 2-node cycle (A -> B -> A)", () => {
  const cyclic = [
    { node_id: "A", dependencies: ["B"] },
    { node_id: "B", dependencies: ["A"] },
  ];
  assert.equal(hasCycle(cyclic), true);
});

test("DAG: hasCycle detects indirect 3-node cycle (A -> B -> C -> A)", () => {
  const cyclic = [
    { node_id: "A", dependencies: ["C"] },
    { node_id: "B", dependencies: ["A"] },
    { node_id: "C", dependencies: ["B"] },
  ];
  assert.equal(hasCycle(cyclic), true);
});

test("DAG: hasCycle detects cycle in disconnected subgraph component", () => {
  const disconnected = [
    { node_id: "A", dependencies: [] },
    { node_id: "B", dependencies: ["A"] },
    // Disconnected cycle
    { node_id: "X", dependencies: ["Y"] },
    { node_id: "Y", dependencies: ["X"] },
  ];
  assert.equal(hasCycle(disconnected), true);
});

test("DAG: topologicalSort sorts nodes in dependency order", () => {
  const nodes = [
    { node_id: "D", dependencies: ["B", "C"] },
    { node_id: "B", dependencies: ["A"] },
    { node_id: "A", dependencies: [] },
    { node_id: "C", dependencies: ["A"] },
  ];
  const sorted = topologicalSort(nodes);
  const ids = sorted.map((n) => n.node_id);
  assert.equal(ids[0], "A");
  assert.ok(ids.indexOf("B") > ids.indexOf("A"));
  assert.ok(ids.indexOf("C") > ids.indexOf("A"));
  assert.equal(ids[3], "D");
});

test("DAG: topologicalSort throws cyclic-dependency-detected on cycle", () => {
  const cyclic = [
    { node_id: "A", dependencies: ["B"] },
    { node_id: "B", dependencies: ["A"] },
  ];
  assert.throws(
    () => topologicalSort(cyclic),
    (err) => err.code === "cyclic-dependency-detected"
  );
});

test("DAG: computeDescendantClosure calculates transitive closure of affected nodes", () => {
  const nodes = [
    { node_id: "A", dependencies: [] },
    { node_id: "B", dependencies: ["A"] },
    { node_id: "C", dependencies: ["B"] },
    { node_id: "D", dependencies: ["A"] },
  ];
  const closureA = computeDescendantClosure(nodes, ["A"]);
  assert.deepEqual(Array.from(closureA).sort(), ["A", "B", "C", "D"]);

  const closureB = computeDescendantClosure(nodes, ["B"]);
  assert.deepEqual(Array.from(closureB).sort(), ["B", "C"]);
});
