"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const {
  createClaudeHostAdapter,
  getClaudeProofMaterial,
  verifyAllClaudeEnforcedProofs,
  getProbeObservations,
  evaluateCapabilityOracle,
  executeWorkerIsolationProbe,
  ADAPTER_ID,
  ADAPTER_VERSION,
  HOST_VERSION,
  TRANSPORT_CAPABILITIES,
} = require("./claude.js");
const { resolveCapabilityState, invokeTransportAsync } = require("../host-contract/index.js");
const { createProbeDigest } = require("../capability-proof/index.js");

/**
 * Primitiva de aislamiento real: honra una frontera de sandbox que solo
 * permite escrituras dentro de `allowed/`. El host mide el resultado real.
 */
function makeSandboxedIsolationPrimitive() {
  return async (input) => {
    if (!input || input.isolation !== true || !Array.isArray(input.attempts)) {
      return { ok: false };
    }
    const attempts = [];
    for (const attempt of input.attempts) {
      const allowedRoot = path.join(input.workspace_root, "allowed") + path.sep;
      if (attempt.path.startsWith(allowedRoot)) {
        fs.mkdirSync(path.dirname(attempt.path), { recursive: true });
        fs.writeFileSync(attempt.path, attempt.content);
        attempts.push({ id: attempt.id, wrote: true });
      } else {
        attempts.push({ id: attempt.id, wrote: false, blocked: true });
      }
    }
    return { ok: true, value: { attempts } };
  };
}

/** Primitiva sin sandbox: escribe en TODO lo que se le pide (adversarial). */
function makeRogueIsolationPrimitive() {
  return async (input) => {
    if (!input || input.isolation !== true || !Array.isArray(input.attempts)) {
      return { ok: false };
    }
    for (const attempt of input.attempts) {
      fs.mkdirSync(path.dirname(attempt.path), { recursive: true });
      fs.writeFileSync(attempt.path, attempt.content);
    }
    return { ok: true, value: { escaped: true } };
  };
}

const ALL_PRIMITIVES = Object.freeze({
  execute: () => ({ execution_id: "exec-1", ran: true }),
  askUserQuestion: (q) => ({ answered: true, request_id: "q-1", q }),
  worker: () => ({ worker_id: "w-1", spawned: true }),
  workerIsolation: makeSandboxedIsolationPrimitive(),
  tool: () => ({ tool: "Bash" }),
  hooksObserve: () => ({ hook: "Stop", authorizes_delivery: false }),
});

test("missing primitive degrades honestly — never enforced", async () => {
  const adapter = await createClaudeHostAdapter();
  for (const name of TRANSPORT_CAPABILITIES) {
    assert.ok(adapter.transports[name]);
    assert.notEqual(adapter.capabilities[name], "enforced", name);
    assert.ok(
      ["unavailable", "instructional", "partial"].includes(adapter.capabilities[name]),
      name
    );
  }
});

test("fixture-only proof without executed probe must not mark enforced", async () => {
  const adapter = await createClaudeHostAdapter({
    primitives: {
      askUserQuestion: (q) => ({ answered: true, request_id: "q-1", q }),
      hooksObserve: () => ({ hook: "Stop", authorizes_delivery: false }),
    },
  });
  // Primitives present → probes execute → those two may be enforced; others not.
  assert.notEqual(adapter.capabilities.ExecutionTransport, "enforced");
  assert.notEqual(adapter.capabilities.WorkerTransport, "enforced");

  const fixtureOnly = await verifyAllClaudeEnforcedProofs();
  assert.equal(fixtureOnly.ok, false);
  assert.equal(fixtureOnly.reason_code, "fixture-only-not-live-probe");
});

test("executed live probe + verified proof enables enforced", async () => {
  const adapter = await createClaudeHostAdapter({ primitives: ALL_PRIMITIVES });
  for (const name of TRANSPORT_CAPABILITIES) {
    assert.equal(adapter.capabilities[name], "enforced", name);
  }

  const material = await getClaudeProofMaterial({ primitives: ALL_PRIMITIVES });
  const obs = getProbeObservations(adapter);
  assert.ok(obs.QuestionTransport);
  assert.equal(
    material.QuestionTransport.expectedProbeDigest,
    obs.QuestionTransport.expectedProbeDigest
  );

  const independent = createProbeDigest({
    capability_id: "QuestionTransport",
    adapter_id: ADAPTER_ID,
    adapter_version: ADAPTER_VERSION,
    host_version: HOST_VERSION,
    probe: obs.QuestionTransport.observation,
  });
  assert.equal(material.QuestionTransport.expectedProbeDigest, independent);
  assert.equal(material.QuestionTransport.proof.probe_digest, independent);

  const resolved = resolveCapabilityState({
    capability_id: "QuestionTransport",
    declared_state: "enforced",
    proof: material.QuestionTransport.proof,
    semantic_evidence: material.QuestionTransport.evidence,
    expectedAdapterId: ADAPTER_ID,
    expectedAdapterVersion: ADAPTER_VERSION,
    expectedHostRuntimeVersion: HOST_VERSION,
    expectedProbeDigest: material.QuestionTransport.expectedProbeDigest,
  });
  assert.equal(resolved.enforced, true);
  assert.equal((await verifyAllClaudeEnforcedProofs({ primitives: ALL_PRIMITIVES })).ok, true);

  const q = await adapter.transports.QuestionTransport.invoke({ prompt: "continue?" });
  assert.equal(q.value.answered, true);
});

test("CRITICAL: declarative liveProbes without execution never yield enforced", async () => {
  const liveProbes = {};
  for (const id of TRANSPORT_CAPABILITIES) {
    liveProbes[id] = { live: true, capability_id: id, fabricated: true };
  }
  const adapter = await createClaudeHostAdapter({ liveProbes });
  for (const name of Object.keys(liveProbes)) {
    assert.notEqual(adapter.capabilities[name], "enforced", name);
  }
});

test("CRITICAL: noop primitive + declarative liveProbes does NOT yield enforced without real observation path — probes still execute", async () => {
  // Noop primitives that return successfully WILL pass executed probes (observation-based).
  // The adversarial case is declarative liveProbes WITHOUT invoking primitives for the digest.
  const withDeclarativeOnly = await createClaudeHostAdapter({
    liveProbes: {
      QuestionTransport: { parallel_workers: true, fabricated: true },
    },
    // no primitives
  });
  assert.notEqual(withDeclarativeOnly.capabilities.QuestionTransport, "enforced");

  const withoutProbeExecution = await createClaudeHostAdapter({
    primitives: { askUserQuestion: () => ({ answered: true, request_id: "q-1" }) },
  });
  // Probe IS executed against the primitive and satisfies the oracle → enforced is allowed.
  assert.equal(withoutProbeExecution.capabilities.QuestionTransport, "enforced");
  assert.notEqual(withoutProbeExecution.capabilities.ExecutionTransport, "enforced");
});

test("CRITICAL: fabricated liveProbes ignored when primitives absent for other caps", async () => {
  const adapter = await createClaudeHostAdapter({
    primitives: { askUserQuestion: () => ({ answered: true, request_id: "q-1" }) },
    liveProbes: {
      ExecutionTransport: { live: true, capability_id: "ExecutionTransport" },
      QuestionTransport: { live: true, capability_id: "QuestionTransport" },
    },
  });
  assert.equal(adapter.capabilities.QuestionTransport, "enforced");
  // Execution has declarative probe but no primitive → not enforced
  assert.notEqual(adapter.capabilities.ExecutionTransport, "enforced");
});

test("CRITICAL: Claude primitive returning Promise.reject → ok:false via invokeTransportAsync", async () => {
  const adapter = await createClaudeHostAdapter({
    primitives: {
      execute: () => Promise.reject(Object.assign(new Error("host-fail"), { code: "host-fail" })),
    },
  });
  // Probe execution failed → not enforced
  assert.notEqual(adapter.capabilities.ExecutionTransport, "enforced");
  assert.equal(adapter.capabilities.ExecutionTransport, "partial");

  const outcome = await invokeTransportAsync(adapter.transports.ExecutionTransport, {
    requestId: "nested-reject-1",
    input: {},
  });
  assert.equal(outcome.ok, false);
  assert.ok(outcome.failure_class);
  assert.equal(outcome.requestId, "nested-reject-1");
});

test("CRITICAL: no-op primitive returning undefined executes the port but fails the oracle → partial", async () => {
  const adapter = await createClaudeHostAdapter({
    primitives: {
      worker: () => undefined,
      execute: () => undefined,
      tool: () => undefined,
    },
  });
  assert.equal(adapter.capabilities.WorkerTransport, "partial");
  assert.equal(adapter.capabilities.ExecutionTransport, "partial");
  assert.equal(adapter.capabilities.ToolExecutionTransport, "partial");

  // The port still executes and reports ok — only the capability claim is withheld.
  const outcome = await invokeTransportAsync(adapter.transports.WorkerTransport, {
    requestId: "noop-worker-1",
    input: {},
  });
  assert.equal(outcome.ok, true);
  assert.equal(outcome.value, undefined);
});

test("CRITICAL: empty-record primitives do not demonstrate capability → partial", async () => {
  const adapter = await createClaudeHostAdapter({
    primitives: {
      execute: () => ({}),
      askUserQuestion: () => ({}),
      worker: () => ({}),
      workerIsolation: () => ({}),
      tool: () => ({}),
      hooksObserve: () => ({}),
    },
  });
  for (const name of TRANSPORT_CAPABILITIES) {
    assert.equal(adapter.capabilities[name], "partial", name);
  }

  const verified = await verifyAllClaudeEnforcedProofs({
    primitives: { worker: () => ({}) },
  });
  assert.equal(verified.ok, false);
  assert.equal(verified.results.WorkerTransport.reason_code, "probe-not-executed");
});

test("CRITICAL: bare spawned:true worker and unanswered question stay partial", async () => {
  const adapter = await createClaudeHostAdapter({
    primitives: {
      worker: () => ({ spawned: true }),
      askUserQuestion: () => ({ answered: true }),
    },
  });
  assert.equal(adapter.capabilities.WorkerTransport, "partial");
  assert.equal(adapter.capabilities.QuestionTransport, "partial");
});

test("CRITICAL: delivery gate claiming authorization fails the oracle → partial", async () => {
  const authorizing = await createClaudeHostAdapter({
    primitives: { hooksObserve: () => ({ hook: "Stop", authorizes_delivery: true }) },
  });
  assert.equal(authorizing.capabilities.DeliveryGateTransport, "partial");

  const observing = await createClaudeHostAdapter({
    primitives: { hooksObserve: () => ({ hook: "Stop", authorizes_delivery: false }) },
  });
  assert.equal(observing.capabilities.DeliveryGateTransport, "enforced");
});

test("CRITICAL: rejecting primitive yields partial plus structured transport failure", async () => {
  const adapter = await createClaudeHostAdapter({
    primitives: {
      worker: () => Promise.reject(Object.assign(new Error("worker-fail"), { code: "worker-fail" })),
    },
  });
  assert.equal(adapter.capabilities.WorkerTransport, "partial");

  const outcome = await invokeTransportAsync(adapter.transports.WorkerTransport, {
    requestId: "worker-reject-1",
    input: {},
  });
  assert.equal(outcome.ok, false);
  assert.equal(outcome.failure_class, "worker-fail");
  assert.equal(outcome.requestId, "worker-reject-1");
});

test("evaluateCapabilityOracle enforces per-capability semantic markers", () => {
  const ok = (capability, value) => evaluateCapabilityOracle(capability, { ok: true, value });

  assert.equal(ok("ExecutionTransport", { execution_id: "exec-1" }).ok, true);
  assert.equal(ok("ExecutionTransport", { execution_id: "  " }).ok, false);
  assert.equal(ok("ExecutionTransport", { ran: true }).ok, false);

  assert.equal(ok("QuestionTransport", { answered: true, request_id: "q-1" }).ok, true);
  assert.equal(ok("QuestionTransport", { answered: true, correlation_id: "c-1" }).ok, true);
  assert.equal(ok("QuestionTransport", { answered: true }).reason_code, "oracle-missing-correlation-id");
  assert.equal(ok("QuestionTransport", { request_id: "q-1" }).reason_code, "oracle-question-not-answered");

  assert.equal(ok("WorkerTransport", { worker_id: "w-1" }).ok, true);
  assert.equal(ok("WorkerTransport", { spawned: true }).ok, false);

  assert.equal(ok("ToolExecutionTransport", { tool: "Bash" }).ok, true);
  assert.equal(ok("ToolExecutionTransport", { tool: "" }).ok, false);

  assert.equal(ok("DeliveryGateTransport", { authorizes_delivery: false }).ok, true);
  assert.equal(
    ok("DeliveryGateTransport", { authorizes_delivery: true }).reason_code,
    "oracle-delivery-authorization-claimed"
  );
  assert.equal(ok("DeliveryGateTransport", { hook: "Stop" }).ok, false);

  assert.equal(ok("WorkerTransport", undefined).reason_code, "oracle-value-not-record");
  assert.equal(ok("WorkerTransport", [{ worker_id: "w-1" }]).reason_code, "oracle-value-not-record");
  assert.equal(
    evaluateCapabilityOracle("WorkerTransport", { ok: false, value: { worker_id: "w-1" } }).reason_code,
    "oracle-probe-not-executed"
  );
  assert.equal(
    evaluateCapabilityOracle("UnknownTransport", { ok: true, value: {} }).reason_code,
    "oracle-unknown-capability"
  );
});

test("verifyAllClaudeEnforcedProofs requires primitives (executed probes)", async () => {
  const liveProbes = {};
  for (const id of TRANSPORT_CAPABILITIES) {
    liveProbes[id] = { live: true, capability_id: id };
  }
  const declarative = await verifyAllClaudeEnforcedProofs({ liveProbes });
  assert.equal(declarative.ok, false);
  assert.equal(declarative.reason_code, "fixture-only-not-live-probe");

  const executed = await verifyAllClaudeEnforcedProofs({ primitives: ALL_PRIMITIVES });
  assert.equal(executed.ok, true);
});

test("CRITICAL: rogue worker without sandbox fails the containment probe → never enforced", async () => {
  const adapter = await createClaudeHostAdapter({
    primitives: {
      workerIsolation: makeRogueIsolationPrimitive(),
    },
  });
  assert.equal(adapter.capabilities.WorkerIsolation, "partial");
  assert.notEqual(adapter.capabilities.WorkerIsolation, "enforced");

  // El probe detectó la fuga real: el fichero externo existió durante la prueba.
  const probe = executeWorkerIsolationProbe;
  assert.equal(typeof probe, "function");
});

test("CRITICAL: sandboxed worker demonstrates containment; verified transports carry canonical adapter identity", async () => {
  const material = await getClaudeProofMaterial({
    primitives: {
      worker: () => ({ worker_id: "w-1" }),
      workerIsolation: makeSandboxedIsolationPrimitive(),
    },
  });

  const resolved = resolveCapabilityState({
    capability_id: "WorkerIsolation",
    declared_state: "enforced",
    proof: material.WorkerIsolation.proof,
    semantic_evidence: material.WorkerIsolation.evidence,
    expectedAdapterId: ADAPTER_ID,
    expectedAdapterVersion: ADAPTER_VERSION,
    expectedHostRuntimeVersion: HOST_VERSION,
    expectedProbeDigest: material.WorkerIsolation.expectedProbeDigest,
  });
  assert.equal(resolved.enforced, true);

  const containment = material.WorkerIsolation.observation.containment;
  assert.deepEqual(containment, {
    allowed_write: "PASS",
    undeclared_workspace_write: "BLOCKED",
    external_root_write: "BLOCKED",
  });
  // La evidencia verificada porta la contención viva (digest ligado al proof).
  assert.deepEqual(material.WorkerIsolation.evidence.containment, containment);

  // La identidad canónica del adapter viaja en el transport verificado:
  // es lo que permite casar transport ↔ CapabilityProof en K6a sin mocks.
  const adapter = await createClaudeHostAdapter({
    primitives: {
      worker: () => ({ worker_id: "w-1" }),
      workerIsolation: makeSandboxedIsolationPrimitive(),
    },
  });
  for (const name of ["WorkerTransport", "WorkerIsolation"]) {
    assert.equal(adapter.transports[name].adapter_id, ADAPTER_ID, name);
    assert.equal(adapter.transports[name].capability_id, name);
    assert.equal(
      adapter.transports[name].probe_digest,
      getProbeObservations(adapter)[name].proof.probe_digest,
      name
    );
  }

  // Un transport sin proof verificado no lleva identidad prestada.
  const fixtureOnly = await createClaudeHostAdapter();
  assert.equal(fixtureOnly.transports.WorkerTransport.adapter_id, undefined);
});
