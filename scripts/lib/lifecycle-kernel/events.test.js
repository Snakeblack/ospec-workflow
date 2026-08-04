"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { projectEvents, eventId } = require("./events.js");
const { digestLifecycleState } = require("./state-digest.js");
const { selectTransitions } = require("./transition-selector.js");

const state = {
  schema_version: 1,
  status: "running",
  nodes: { n1: { id: "n1", phase: "started", attempt: 1 } },
};

const journal = [
  {
    schema_version: 1,
    operation_id: "sha256:op1",
    effect_id: "sha256:ef1",
    status: "completed",
    kernel_version: 1,
  },
];

test("projectEvents rebuilds equivalent ids and order from identical commit", () => {
  const a = projectEvents({ state, journal });
  const b = projectEvents({
    journal: [...journal],
    state: {
      nodes: { n1: { attempt: 1, id: "n1", phase: "started" } },
      status: "running",
      schema_version: 1,
    },
  });
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  assert.ok(a.length >= 1);
  assert.match(a[0].event_id, /^sha256:[a-f0-9]{64}$/);
  assert.equal(a[0].event_id, eventId(a[0]));
});

test("deleting event projection does not change status digest or transitions", () => {
  const beforeDigest = digestLifecycleState(state);
  const beforeTransitions = JSON.stringify(selectTransitions(state));
  const events = projectEvents({ state, journal });
  assert.ok(events.length >= 1);

  // Projection is non-authoritative: dropping it leaves state/transitions intact.
  const afterDigest = digestLifecycleState(state);
  const afterTransitions = JSON.stringify(selectTransitions(state));
  assert.equal(afterDigest, beforeDigest);
  assert.equal(afterTransitions, beforeTransitions);
});

test("reordered journal still yields deterministic event order by effect_id", () => {
  const j2 = [
    {
      schema_version: 1,
      operation_id: "sha256:op2",
      effect_id: "sha256:ef2",
      status: "completed",
      kernel_version: 1,
    },
    {
      schema_version: 1,
      operation_id: "sha256:op1",
      effect_id: "sha256:ef1",
      status: "completed",
      kernel_version: 1,
    },
  ];
  const j1 = [j2[1], j2[0]];
  const a = projectEvents({ state, journal: j1 });
  const b = projectEvents({ state, journal: j2 });
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  assert.ok(a[0].effect_id <= a[1].effect_id);
});
