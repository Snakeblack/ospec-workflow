"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { validatePhaseTransition } = require("./flow-validator.js");

test("flow-validator: allows everything if routePhases is empty or absent", () => {
  const result = validatePhaseTransition("sdd-tasks", null, {});
  assert.equal(result.allowed, true);
  assert.equal(result.reason, null);

  const resultEmpty = validatePhaseTransition("sdd-tasks", [], {});
  assert.equal(resultEmpty.allowed, true);
  assert.equal(resultEmpty.reason, null);
});

test("flow-validator: fails if targetPhase is not declared in routePhases", () => {
  const routePhases = ["sdd-propose", "sdd-apply"];
  const result = validatePhaseTransition("sdd-tasks", routePhases, {});
  assert.equal(result.allowed, false);
  assert.match(result.reason, /no forma parte de las fases/);
});

test("flow-validator: standard route transitions", () => {
  const standardPhases = [
    "sdd-propose",
    "sdd-spec",
    "sdd-design",
    "sdd-tasks",
    "sdd-apply",
    "sdd-verify",
    "sdd-archive"
  ];

  // 1. sdd-tasks requires design.md
  const t1 = validatePhaseTransition("sdd-tasks", standardPhases, { "design.md": false });
  assert.equal(t1.allowed, false);
  assert.match(t1.reason, /Falta el documento de diseño/);

  const t1Ok = validatePhaseTransition("sdd-tasks", standardPhases, { "design.md": true });
  assert.equal(t1Ok.allowed, true);

  // 2. sdd-apply requires tasks.md
  const t2 = validatePhaseTransition("sdd-apply", standardPhases, { "tasks.md": false });
  assert.equal(t2.allowed, false);
  assert.match(t2.reason, /Falta el plan de tareas/);

  const t2Ok = validatePhaseTransition("sdd-apply", standardPhases, { "tasks.md": true });
  assert.equal(t2Ok.allowed, true);

  // 3. sdd-verify requires apply-progress.md
  const t3 = validatePhaseTransition("sdd-verify", standardPhases, { "apply-progress.md": false });
  assert.equal(t3.allowed, false);
  assert.match(t3.reason, /Falta el registro de progreso/);

  const t3Ok = validatePhaseTransition("sdd-verify", standardPhases, { "apply-progress.md": true });
  assert.equal(t3Ok.allowed, true);

  // 4. sdd-archive requires verify-report.md
  const t4 = validatePhaseTransition("sdd-archive", standardPhases, { "verify-report.md": false });
  assert.equal(t4.allowed, false);
  assert.match(t4.reason, /Falta el reporte de verificación/);

  const t4Ok = validatePhaseTransition("sdd-archive", standardPhases, { "verify-report.md": true });
  assert.equal(t4Ok.allowed, true);
});

test("flow-validator: lite route transitions (sdd-tasks doesn't require design.md)", () => {
  const litePhases = ["sdd-propose", "sdd-tasks", "sdd-apply", "sdd-verify", "sdd-archive"];

  // Lite starts tasks from proposal-lite, not fabricated full-planning artifacts.
  const t1 = validatePhaseTransition("sdd-tasks", litePhases, {
    "proposal-lite.md": true,
    "proposal.md": false,
    "specs": false,
    "design.md": false,
  });
  assert.equal(t1.allowed, true);

  const t1Missing = validatePhaseTransition("sdd-tasks", litePhases, {
    "proposal-lite.md": false,
    "design.md": false,
  });
  assert.equal(t1Missing.allowed, false);
  assert.match(t1Missing.reason, /proposal-lite\.md/);

  // sdd-apply still requires tasks.md
  const t2 = validatePhaseTransition("sdd-apply", litePhases, { "tasks.md": false });
  assert.equal(t2.allowed, false);
});

test("flow-validator: standard route requires each declared predecessor artifact", () => {
  const standardPhases = [
    "sdd-propose",
    "sdd-spec",
    "sdd-design",
    "sdd-tasks",
    "sdd-apply",
    "sdd-verify",
    "sdd-archive",
  ];

  const cases = [
    ["sdd-spec", "proposal.md"],
    ["sdd-design", "specs"],
    ["sdd-tasks", "design.md"],
    ["sdd-apply", "tasks.md"],
    ["sdd-verify", "apply-progress.md"],
    ["sdd-archive", "verify-report.md"],
  ];

  for (const [phase, artifact] of cases) {
    const missing = validatePhaseTransition(phase, standardPhases, { [artifact]: false });
    assert.equal(missing.allowed, false, `${phase} must require ${artifact}`);

    const present = validatePhaseTransition(phase, standardPhases, { [artifact]: true });
    assert.equal(present.allowed, true, `${phase} must allow ${artifact}`);
  }
});
