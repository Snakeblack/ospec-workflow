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
  injectFault,
  evaluateFaultMatrixCoverage,
} = require("./headless-conformance-host.js");
const { createProbeDigest, createEvidenceDigest } = require("./capability-proof/index.js");

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
      ExecutionTransport: { port_id: "e", invoke: async () => ({ ok: true, outcome: "ok" }) },
      QuestionTransport: { port_id: "q", invoke: async () => ({ ok: true, outcome: "ok" }) },
      WorkerTransport: { port_id: "w", invoke: async () => ({ ok: true, outcome: "ok" }) },
      ToolExecutionTransport: { port_id: "t", invoke: async () => ({ ok: true, outcome: "ok" }) },
      DeliveryGateTransport: { port_id: "d", invoke: async () => ({ ok: true, outcome: "ok" }) },
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

test("fault matrix exercises timeout, cancel, worker-fail, interrupt through ports", async () => {
  const matrix = await runHostFaultMatrix({ adapter: baseAdapter() });
  assert.deepEqual(matrix.faults_covered, FAULTS);
  assert.equal(matrix.results.length, 4);
  assert.equal(matrix.pass, true);
  assert.equal(matrix.coverage.complete, true);
  for (const fault of FAULTS) {
    const row = matrix.results.find((r) => r.fault === fault);
    assert.ok(row, fault);
    assert.equal(row.pass, true, fault);
    assert.equal(row.port_traversal, true, fault);
    const outcomes = Object.values(row.port_outcomes);
    assert.ok(
      outcomes.some(
        (o) =>
          o.ok === false &&
          (o.outcome.includes(fault === "worker-fail" ? "worker-fail" : fault) ||
            o.failure_class === (fault === "worker-fail" ? "worker-fail" : fault))
      )
    );
  }
});

test("synthetic injectFault alone does not satisfy fault coverage", () => {
  const synthetic = injectFault("timeout", "ExecutionTransport");
  assert.equal(synthetic.ok, false);
  const coverage = evaluateFaultMatrixCoverage({
    port_invocations: [],
    synthetic_only: true,
  });
  assert.equal(coverage.complete, false);
  assert.equal(coverage.reason_code, REASON.SYNTHETIC_INJECT_ALONE);
});

test("rejected port Promise is recorded as failure not success", async () => {
  const result = await runConformanceScenario({
    scenario_id: "reject-promise",
    seed: 9,
    adapter: baseAdapter({
      transports: {
        ...baseAdapter().transports,
        ExecutionTransport: {
          port_id: "e",
          invoke: async () => {
            throw Object.assign(new Error("reject"), { code: "async-reject" });
          },
        },
      },
    }),
  });
  assert.equal(result.pass, false);
  assert.equal(result.port_outcomes.ExecutionTransport.ok, false);
  assert.notEqual(result.port_outcomes.ExecutionTransport.ok, true);
  assert.equal(result.port_outcomes.ExecutionTransport.failure_class, "reject");
});

test("lifecycle-duplicating and Graph-duplicating adapters fail with stable reason codes", async () => {
  const lifecycle = await runConformanceScenario({
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

  const graph = await runConformanceScenario({
    scenario_id: "dup-graph",
    seed: 1,
    adapter: baseAdapter({
      authority_surface: { compileGraph: true },
    }),
  });
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

test("throwing transport yields structured error outcome and pass:false without aborting loop", async () => {
  const adapter = baseAdapter({
    transports: {
      ...baseAdapter().transports,
      ExecutionTransport: {
        port_id: "e",
        invoke: async () => {
          throw new Error("boom");
        },
      },
      QuestionTransport: {
        port_id: "q",
        invoke: async () => {
          throw Object.assign(new Error("q-fail"), { code: "q-throw" });
        },
      },
    },
  });
  const result = await runConformanceScenario({
    scenario_id: "throw-ports",
    seed: 7,
    adapter,
  });
  assert.equal(result.pass, false);
  assert.equal(result.port_outcomes.ExecutionTransport.ok, false);
  assert.ok(typeof result.port_outcomes.ExecutionTransport.code === "string");
  assert.equal(result.port_outcomes.QuestionTransport.ok, false);
  assert.equal(result.port_outcomes.QuestionTransport.code, "q-throw");
  assert.equal(result.port_outcomes.WorkerTransport.ok, true);
  assert.equal(result.port_outcomes.ToolExecutionTransport.ok, true);
  assert.equal(result.port_outcomes.DeliveryGateTransport.ok, true);
});

test("ok:false timeout without injected fault forces pass:false", async () => {
  const result = await runConformanceScenario({
    scenario_id: "silent-timeout",
    seed: 3,
    adapter: baseAdapter({
      transports: {
        ...baseAdapter().transports,
        ExecutionTransport: {
          port_id: "e",
          invoke: async () => ({ ok: false, outcome: "timeout", code: "host-timeout", failure_class: "timeout" }),
        },
      },
    }),
  });
  assert.equal(result.pass, false);
  assert.ok(typeof result.reason_code === "string" && result.reason_code.length > 0);
  assert.equal(result.port_outcomes.ExecutionTransport.ok, false);
  assert.equal(result.port_outcomes.ExecutionTransport.outcome, "timeout");
});

test("repeated conformance runs with same seed produce byte-equivalent semantic results", async () => {
  const input = {
    scenario_id: "det-1",
    seed: "seed-42",
    adapter: baseAdapter(),
    fault: "timeout",
  };
  const a = await runConformanceScenario(input);
  const b = await runConformanceScenario(input);
  assert.equal(a.semantic_bytes, b.semantic_bytes);
  assert.ok(!a.semantic_bytes.includes("timestamp"));
});

function liveBoundProofEntry(capabilityId, probe) {
  const fixture = `scripts/lib/host-adapters/claude/fixtures/${capabilityId}.json`;
  const evidence = { capability_id: capabilityId, observed: true };
  const evidence_digest = createEvidenceDigest({
    capability_id: capabilityId,
    adapter_version: "1.0.0",
    host_version: "k2a-host/1",
    fixture,
    evidence,
  });
  const expectedProbeDigest = createProbeDigest({
    capability_id: capabilityId,
    adapter_id: "fixture-adapter",
    adapter_version: "1.0.0",
    host_version: "k2a-host/1",
    probe,
  });
  return {
    expectedProbeDigest,
    expectedAdapterId: "fixture-adapter",
    expectedAdapterVersion: "1.0.0",
    expectedHostRuntimeVersion: "k2a-host/1",
    evidence,
    proof: {
      schema_version: 1,
      kind: "capability-proof/v1",
      adapter_id: "fixture-adapter",
      adapter_version: "1.0.0",
      host_version: "k2a-host/1",
      fixture,
      evidence_digest,
      probe_digest: expectedProbeDigest,
    },
  };
}

test("F-257363d612b4f8ad: missing expectedProbeDigest fails closed (no proof.probe_digest fallback)", async () => {
  const probe = { live: true, capability_id: "ExecutionTransport" };
  const entry = liveBoundProofEntry("ExecutionTransport", probe);
  const { expectedProbeDigest: _independent, ...proofOnly } = entry;

  const withoutIndependent = await runConformanceScenario({
    scenario_id: "no-independent-digest",
    seed: 1,
    adapter: baseAdapter({
      capabilities: {
        ...baseAdapter().capabilities,
        ExecutionTransport: "enforced",
      },
    }),
    proof_material: { ExecutionTransport: proofOnly },
  });
  assert.notEqual(withoutIndependent.capability_states.ExecutionTransport, "enforced");
  assert.equal(withoutIndependent.proof_verification.ExecutionTransport.ok, false);

  const withIndependent = await runConformanceScenario({
    scenario_id: "with-independent-digest",
    seed: 1,
    adapter: baseAdapter({
      capabilities: {
        ...baseAdapter().capabilities,
        ExecutionTransport: "enforced",
      },
    }),
    proof_material: { ExecutionTransport: entry },
  });
  assert.equal(withIndependent.capability_states.ExecutionTransport, "enforced");
  assert.equal(withIndependent.proof_verification.ExecutionTransport.ok, true);
});
