"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  KERNEL_VERSION,
  canonicalizeState,
  digestLifecycleState,
} = require("./state-digest.js");

test("KERNEL_VERSION is a positive integer", () => {
  assert.equal(typeof KERNEL_VERSION, "number");
  assert.ok(Number.isInteger(KERNEL_VERSION));
  assert.ok(KERNEL_VERSION >= 1);
});

test("equivalent states with different property order share digest", () => {
  const left = {
    schema_version: 1,
    status: "ready",
    nodes: {
      b: { id: "b", phase: "pending", attempt: 0 },
      a: { id: "a", phase: "pending", attempt: 0 },
    },
    meta: { subject_id: "opaque:s1", label: "demo" },
  };
  const right = {
    meta: { label: "demo", subject_id: "opaque:s1" },
    nodes: {
      a: { attempt: 0, id: "a", phase: "pending" },
      b: { attempt: 0, phase: "pending", id: "b" },
    },
    status: "ready",
    schema_version: 1,
  };

  assert.equal(canonicalizeState(left), canonicalizeState(right));
  assert.equal(digestLifecycleState(left), digestLifecycleState(right));
  assert.match(digestLifecycleState(left), /^sha256:[a-f0-9]{64}$/);
});

test("material status change changes digest", () => {
  const base = {
    schema_version: 1,
    status: "ready",
    nodes: { a: { id: "a", phase: "pending", attempt: 0 } },
  };
  const changed = {
    schema_version: 1,
    status: "blocked",
    nodes: { a: { id: "a", phase: "pending", attempt: 0 } },
  };
  assert.notEqual(digestLifecycleState(base), digestLifecycleState(changed));
});

test("volatile clock fields are excluded from semantic digest", () => {
  const base = {
    schema_version: 1,
    status: "ready",
    nodes: { a: { id: "a", phase: "pending", attempt: 0 } },
    evaluated_at: "2026-01-01T00:00:00.000Z",
  };
  const later = {
    ...base,
    evaluated_at: "2026-08-04T12:00:00.000Z",
    wall_clock_ms: 123456,
  };
  assert.equal(digestLifecycleState(base), digestLifecycleState(later));
});
