"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  KIND,
  HARNESS_KIND,
  FAULTS,
  REASON,
  getModuleKind,
  runConformanceScenario,
  runHostFaultMatrix,
  detectDuplication,
} = require("./headless-conformance-host.js");

function baseAdapter(overrides = {}) {
  return {
    adapter_id: "fixture-adapter",
    adapter_version: "1.0.0",
    host_version: "k2a-host/1",
    capabilities: {
      ExecutionTransport: "partial",
      QuestionTransport: "partial",
      WorkerTransport: "partial",
      ToolExecutionTransport: "partial",
      DeliveryGateTransport: "partial",
    },
    transports: {
      ExecutionTransport: { port_id: "e", invoke: () => ({ ok: true, outcome: "ok" }) },
      QuestionTransport: { port_id: "q", invoke: () => ({ ok: true, outcome: "ok" }) },
      WorkerTransport: { port_id: "w", invoke: () => ({ ok: true, outcome: "ok" }) },
      ToolExecutionTransport: { port_id: "t", invoke: () => ({ ok: true, outcome: "ok" }) },
      DeliveryGateTransport: { port_id: "d", invoke: () => ({ ok: true, outcome: "ok" }) },
    },
    ...overrides,
  };
}

test("Headless Conformance Host kind is distinct from Minimal Kernel Harness", () => {
  assert.equal(getModuleKind(), KIND);
  assert.notEqual(KIND, HARNESS_KIND);
  assert.match(KIND, /headless-conformance-host/);
  assert.match(HARNESS_KIND, /minimal-kernel-harness/);
});

test("fault matrix exercises timeout, cancel, worker-fail, interrupt through ports", () => {
  const matrix = runHostFaultMatrix({ adapter: baseAdapter() });
  assert.deepEqual(matrix.faults_covered, FAULTS);
  assert.equal(matrix.results.length, 4);
  assert.equal(matrix.pass, true);
  for (const fault of FAULTS) {
    const row = matrix.results.find((r) => r.fault === fault);
    assert.ok(row, fault);
    assert.equal(row.pass, true, fault);
    const outcomes = Object.values(row.port_outcomes);
    assert.ok(outcomes.some((o) => o.ok === false && o.outcome.includes(fault === "worker-fail" ? "worker-fail" : fault)));
  }
});

test("lifecycle-duplicating and Graph-duplicating adapters fail with stable reason codes", () => {
  const lifecycle = runConformanceScenario({
    scenario_id: "dup-lifecycle",
    seed: 1,
    adapter: baseAdapter({
      transports: {
        ...baseAdapter().transports,
        ExecutionTransport: {
          port_id: "e",
          selectTransition: () => [{ operation: "start" }],
        },
      },
    }),
  });
  assert.equal(lifecycle.pass, false);
  assert.equal(lifecycle.reason_code, REASON.LIFECYCLE_DUPLICATION);

  const graph = runConformanceScenario({
    scenario_id: "dup-graph",
    seed: 1,
    adapter: baseAdapter({
      authority_surface: { compileGraph: true },
    }),
  });
  // authority_surface compileGraph is caught by detectDuplication before createHostAdapter
  assert.equal(graph.pass, false);
  assert.equal(graph.reason_code, REASON.GRAPH_DUPLICATION);
});

test("detectDuplication rejects snake_case authority aliases on transport ports", () => {
  for (const key of ["mint_permit", "compare_and_swap", "select_transition", "mint_operation_permit"]) {
    const result = detectDuplication(
      baseAdapter({
        transports: {
          ...baseAdapter().transports,
          ExecutionTransport: { port_id: "e", [key]: () => {} },
        },
      })
    );
    assert.equal(result.ok, false, key);
    assert.equal(result.reason_code, REASON.LIFECYCLE_DUPLICATION, key);
  }
});

test("throwing transport yields structured error outcome and pass:false without aborting loop", () => {
  const adapter = baseAdapter({
    transports: {
      ...baseAdapter().transports,
      ExecutionTransport: {
        port_id: "e",
        invoke: () => {
          throw new Error("boom");
        },
      },
      QuestionTransport: {
        port_id: "q",
        invoke: () => {
          throw Object.assign(new Error("q-fail"), { code: "q-throw" });
        },
      },
    },
  });
  const result = runConformanceScenario({
    scenario_id: "throw-ports",
    seed: 7,
    adapter,
  });
  assert.equal(result.pass, false);
  assert.equal(result.port_outcomes.ExecutionTransport.ok, false);
  assert.equal(result.port_outcomes.ExecutionTransport.outcome, "error");
  assert.ok(typeof result.port_outcomes.ExecutionTransport.code === "string");
  assert.equal(result.port_outcomes.QuestionTransport.ok, false);
  assert.equal(result.port_outcomes.QuestionTransport.outcome, "error");
  assert.equal(result.port_outcomes.QuestionTransport.code, "q-throw");
  // Remaining ports still recorded — loop did not abort mid-flight.
  assert.equal(result.port_outcomes.WorkerTransport.ok, true);
  assert.equal(result.port_outcomes.ToolExecutionTransport.ok, true);
  assert.equal(result.port_outcomes.DeliveryGateTransport.ok, true);
});

test("ok:false timeout without injected fault forces pass:false", () => {
  const result = runConformanceScenario({
    scenario_id: "silent-timeout",
    seed: 3,
    adapter: baseAdapter({
      transports: {
        ...baseAdapter().transports,
        ExecutionTransport: {
          port_id: "e",
          invoke: () => ({ ok: false, outcome: "timeout", code: "host-timeout" }),
        },
      },
    }),
  });
  assert.equal(result.pass, false);
  assert.ok(typeof result.reason_code === "string" && result.reason_code.length > 0);
  assert.equal(result.port_outcomes.ExecutionTransport.ok, false);
  assert.equal(result.port_outcomes.ExecutionTransport.outcome, "timeout");
});

test("repeated conformance runs with same seed produce byte-equivalent semantic results", () => {
  const input = {
    scenario_id: "det-1",
    seed: "seed-42",
    adapter: baseAdapter(),
    fault: "timeout",
  };
  const a = runConformanceScenario(input);
  const b = runConformanceScenario(input);
  assert.equal(a.semantic_bytes, b.semantic_bytes);
  assert.ok(!a.semantic_bytes.includes("timestamp"));
});
