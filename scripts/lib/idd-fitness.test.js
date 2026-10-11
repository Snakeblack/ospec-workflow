"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { fitnessPlan, fitnessReason } = require("./idd-fitness.js");

const DIR = "docs/architecture/decisions";
const MAP = "docs/architecture/knowledge-map.yaml";

function sources() {
  return {
    adrs: new Map([
      ["0002", { path: `${DIR}/0002-sync.md`, status: "accepted", checks: ["npm run lint:deps"], fitness: "No module imports another's adapter." }],
      ["0003", { path: `${DIR}/0003-cli.md`, status: "accepted", checks: [], fitness: "A skill that restates a rule is rejected in review." }],
      ["0004", { path: `${DIR}/0004-old.md`, status: "superseded", checks: ["npm run old"], fitness: "Old." }],
    ]),
    scenarios: new Map([
      ["latency", { path: MAP, checks: ["npm run bench:p95", "npm run bench:p99"], description: null }],
      ["auditability", { path: MAP, checks: [], description: "An auditor reads the log by hand." }],
    ]),
  };
}

function state(impacts, extra = {}) {
  return { change: "c", gates: [], impacts, ...extra };
}

test("[REQ-idd-022] each declared reference brings its checks or its manual item, in impacts order", () => {
  const plan = fitnessPlan(
    state([
      { kind: "adr", id: "0002", impact: "conforms", reason: "r" },
      { kind: "adr", id: "0003", impact: null },
      { kind: "scenario", id: "latency", impact: null },
      { kind: "scenario", id: "auditability", impact: "none", reason: "r" },
    ]),
    sources(),
  );
  assert.deepEqual(plan.checks, [
    { kind: "adr", id: "0002", path: `${DIR}/0002-sync.md`, command: "npm run lint:deps" },
    { kind: "scenario", id: "latency", path: MAP, command: "npm run bench:p95" },
    { kind: "scenario", id: "latency", path: MAP, command: "npm run bench:p99" },
  ]);
  assert.deepEqual(plan.manual, [
    { kind: "adr", id: "0003", path: `${DIR}/0003-cli.md`, fitness: "A skill that restates a rule is rejected in review.", evidence: null },
    { kind: "scenario", id: "auditability", path: MAP, fitness: "An auditor reads the log by hand.", evidence: null },
  ]);
});

test("[REQ-idd-022] a superseded ADR, a reference absent at the base and an approved departure bring nothing", () => {
  const impacts = [
    { kind: "adr", id: "0004", impact: null },
    { kind: "adr", id: "0009", impact: null },
    { kind: "scenario", id: "unknown", impact: null },
    { kind: "adr", id: "0002", impact: "amends", reason: "async messaging" },
  ];
  const open = fitnessPlan(state(impacts, { gates: [{ id: "adr-amend-or-contradict", status: "open" }] }), sources());
  assert.deepEqual(open.checks.map((check) => check.id), ["0002"]);
  const resolved = fitnessPlan(state(impacts, { gates: [{ id: "adr-amend-or-contradict", status: "resolved", answer: "yes", source: "user" }] }), sources());
  assert.deepEqual(resolved, { checks: [], manual: [] });
});

test("[REQ-idd-022] a manual item carries the evidence recorded for it", () => {
  const plan = fitnessPlan(
    state([{ kind: "adr", id: "0003", impact: "conforms", reason: "r" }], {
      attestations: [{ kind: "adr", id: "0003", evidence: "skills/idd/SKILL.md:17 cites ospec next", recorded_at: "t" }],
    }),
    sources(),
  );
  assert.equal(plan.manual[0].evidence, "skills/idd/SKILL.md:17 cites ospec next");
});

test("[REQ-idd-022] the first failing fitness run names its ADR or scenario", () => {
  assert.equal(fitnessReason([{ ref: "adr:0002", command: "npm run lint:deps", exit_code: 0 }]), null);
  assert.equal(
    fitnessReason([
      { ref: "adr:0002", command: "npm run lint:deps", exit_code: 0 },
      { ref: "adr:0006", command: "node --test boundary.test.js", exit_code: 1 },
      { ref: "scenario:latency", command: "npm run bench:p95", exit_code: 2 },
    ]),
    "ADR 0006: fitness check `node --test boundary.test.js` failed with exit code 1",
  );
  assert.equal(
    fitnessReason([{ ref: "scenario:latency", command: "npm run bench:p95", exit_code: 2 }]),
    "quality scenario latency: fitness check `npm run bench:p95` failed with exit code 2",
  );
});
