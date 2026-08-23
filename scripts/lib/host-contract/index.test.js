"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createHostAdapter,
  resolveCapabilityState,
  normalizeTransportOutcome,
  CAPABILITY_STATES,
  REQUIRED_TRANSPORTS,
  REASON,
} = require("./index.js");
const { createEvidenceDigest, createProbeDigest } = require("../capability-proof/index.js");

function baseTransports(overrides = {}) {
  return {
    ExecutionTransport: { port_id: "e" },
    QuestionTransport: { port_id: "q" },
    WorkerTransport: { port_id: "w" },
    ToolExecutionTransport: { port_id: "t" },
    DeliveryGateTransport: { port_id: "d" },
    ...overrides,
  };
}

function validProof(capabilityId, evidence = { ok: true }) {
  const adapter_id = "claude";
  const adapter_version = "1.0.0";
  const host_version = "k2a-host/1";
  const fixture = `fixture/${capabilityId}.json`;
  const evidence_digest = createEvidenceDigest({
    capability_id: capabilityId,
    adapter_version,
    host_version,
    fixture,
    evidence,
  });
  const probe_digest = createProbeDigest({
    capability_id: capabilityId,
    adapter_id,
    adapter_version,
    host_version,
    probe: { live: true, capabilityId },
  });
  return {
    proof: {
      schema_version: 1,
      kind: "capability-proof/v1",
      adapter_id,
      adapter_version,
      host_version,
      fixture,
      evidence_digest,
      probe_digest,
    },
    evidence,
    expected: {
      expectedAdapterId: adapter_id,
      expectedAdapterVersion: adapter_version,
      expectedHostRuntimeVersion: host_version,
      expectedProbeDigest: probe_digest,
    },
  };
}

test("createHostAdapter accepts closed capability states", () => {
  const caps = {};
  for (const state of CAPABILITY_STATES) {
    caps[`cap-${state}`] = state;
  }
  const adapter = createHostAdapter({
    adapter_id: "claude",
    adapter_version: "1.0.0",
    host_version: "k2a-host/1",
    capabilities: caps,
    transports: baseTransports(),
  });
  assert.equal(adapter.adapter_id, "claude");
  assert.equal(adapter.capabilities["cap-enforced"], "enforced");
});

test("createHostAdapter rejects unknown capability state with path", () => {
  assert.throws(
    () =>
      createHostAdapter({
        adapter_id: "claude",
        adapter_version: "1.0.0",
        host_version: "k2a-host/1",
        capabilities: { ExecutionTransport: "full" },
        transports: baseTransports(),
      }),
    (err) => err.code === REASON.UNKNOWN_CAPABILITY_STATE && err.path === "/capabilities/ExecutionTransport"
  );
});

test("createHostAdapter fails closed when any of five transports is missing", () => {
  for (const missing of REQUIRED_TRANSPORTS) {
    const transports = baseTransports();
    delete transports[missing];
    assert.throws(
      () =>
        createHostAdapter({
          adapter_id: "claude",
          adapter_version: "1.0.0",
          host_version: "k2a-host/1",
          capabilities: {},
          transports,
        }),
      (err) => err.code === REASON.MISSING_TRANSPORT_PORT && err.path === `/transports/${missing}`
    );
  }
});

test("createHostAdapter rejects authority surface (permit mint / CAS / lifecycle)", () => {
  assert.throws(
    () =>
      createHostAdapter({
        adapter_id: "claude",
        adapter_version: "1.0.0",
        host_version: "k2a-host/1",
        capabilities: {},
        transports: baseTransports(),
        authority_surface: { mintPermit: true },
      }),
    (err) => err.code === REASON.AUTHORITY_SURFACE_REJECTED
  );

  assert.throws(
    () =>
      createHostAdapter({
        adapter_id: "claude",
        adapter_version: "1.0.0",
        host_version: "k2a-host/1",
        capabilities: {},
        transports: baseTransports({
          ExecutionTransport: { port_id: "e", selectTransition: () => [] },
        }),
      }),
    (err) => err.code === REASON.AUTHORITY_SURFACE_REJECTED
  );
});

test("createHostAdapter rejects snake_case authority aliases on transport ports", () => {
  for (const key of ["mint_permit", "compare_and_swap", "select_transition", "mint_operation_permit"]) {
    assert.throws(
      () =>
        createHostAdapter({
          adapter_id: "claude",
          adapter_version: "1.0.0",
          host_version: "k2a-host/1",
          capabilities: {},
          transports: baseTransports({
            ExecutionTransport: { port_id: "e", [key]: () => {} },
          }),
        }),
      (err) => err.code === REASON.AUTHORITY_SURFACE_REJECTED,
      key
    );
  }
});

test("resolveCapabilityState refuses unavailable/instructional/partial → enforced without proof", () => {
  for (const declared of ["unavailable", "instructional", "partial"]) {
    const result = resolveCapabilityState({
      capability_id: "ExecutionTransport",
      declared_state: declared,
      request_enforced: true,
    });
    assert.equal(result.ok, false, declared);
    assert.equal(result.enforced, false, declared);
    assert.equal(result.effective_state, declared, declared);
    assert.equal(result.reason_code, REASON.SILENT_PROMOTION_REFUSED, declared);
  }
});

test("resolveCapabilityState promotes only with verifying live-bound proof", () => {
  const { proof, evidence, expected } = validProof("ExecutionTransport");
  const refused = resolveCapabilityState({
    capability_id: "ExecutionTransport",
    declared_state: "enforced",
  });
  assert.equal(refused.ok, false);
  assert.notEqual(refused.effective_state, "enforced");

  const ok = resolveCapabilityState({
    capability_id: "ExecutionTransport",
    declared_state: "partial",
    proof,
    semantic_evidence: evidence,
    request_enforced: true,
    expectedAdapterId: expected.expectedAdapterId,
    expectedAdapterVersion: expected.expectedAdapterVersion,
    expectedHostRuntimeVersion: expected.expectedHostRuntimeVersion,
    expectedProbeDigest: expected.expectedProbeDigest,
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.enforced, true);
  assert.equal(ok.effective_state, "enforced");
});

test("DeliveryGateTransport and WorkerTransport with embedded policy are rejected", () => {
  assert.throws(
    () =>
      createHostAdapter({
        adapter_id: "claude",
        adapter_version: "1.0.0",
        host_version: "k2a-host/1",
        capabilities: {},
        transports: baseTransports({
          DeliveryGateTransport: { port_id: "d", authorizeDelivery: true },
        }),
      }),
    (err) => err.code === REASON.POLICY_OWNING_TRANSPORT
  );

  assert.throws(
    () =>
      createHostAdapter({
        adapter_id: "claude",
        adapter_version: "1.0.0",
        host_version: "k2a-host/1",
        capabilities: {},
        transports: baseTransports({
          WorkerTransport: { port_id: "w", isolation_policy: { mode: "jail" } },
        }),
      }),
    (err) => err.code === REASON.POLICY_OWNING_TRANSPORT
  );
});

test("normalizeTransportOutcome triangulates {ok,outcome,code?,value?}", () => {
  assert.deepEqual(normalizeTransportOutcome({ ok: true, outcome: "ok", value: 1 }), {
    ok: true,
    outcome: "ok",
    value: 1,
  });
  assert.deepEqual(normalizeTransportOutcome({ ok: false, outcome: "timeout", code: "host-fault-timeout" }), {
    ok: false,
    outcome: "timeout",
    code: "host-fault-timeout",
  });
});

test("normalizeTransportOutcome preserves telemetry fields: stdout, stderr, exit_code", () => {
  const raw = {
    ok: true,
    outcome: "ok",
    exit_code: 0,
    stdout: "build output line\n",
    stderr: "warning text\n",
  };
  const normalized = normalizeTransportOutcome(raw);
  assert.equal(normalized.exit_code, 0);
  assert.equal(normalized.stdout, "build output line\n");
  assert.equal(normalized.stderr, "warning text\n");
});

test("invokeTransportAsync: rejected Promise becomes ok:false classified failure", async () => {
  const { invokeTransportAsync, classifyTransportFailure } = require("./index.js");
  const port = {
    invoke: async () => {
      throw Object.assign(new Error("boom"), { code: "reject-boom" });
    },
  };
  const outcome = await invokeTransportAsync(port, { requestId: "r-1", input: {} });
  assert.equal(outcome.ok, false);
  assert.equal(outcome.failure_class, "reject");
  assert.equal(outcome.requestId, "r-1");
  assert.notEqual(outcome.ok, true);

  const classified = classifyTransportFailure(
    Object.assign(new Error("worker crashed"), { code: "worker-fail" }),
    { requestId: "r-2", portName: "WorkerTransport" }
  );
  assert.equal(classified.ok, false);
  assert.equal(classified.failure_class, "worker-fail");
  assert.equal(classified.requestId, "r-2");
});

test("invokeTransportAsync: nested rejecting Promise in value becomes ok:false", async () => {
  const { invokeTransportAsync } = require("./index.js");
  const port = {
    port_id: "nested-reject",
    invoke: async () => ({
      ok: true,
      outcome: "ok",
      value: Promise.reject(Object.assign(new Error("nested-fail"), { code: "nested-fail" })),
    }),
  };
  const outcome = await invokeTransportAsync(port, { requestId: "r-nested", input: {} });
  assert.equal(outcome.ok, false);
  assert.ok(outcome.failure_class);
  assert.equal(outcome.requestId, "r-nested");
});

test("invokeTransportAsync: AbortSignal and deadline classify as cancel/timeout with requestId", async () => {
  const { invokeTransportAsync } = require("./index.js");

  const ac = new AbortController();
  ac.abort();
  const cancelled = await invokeTransportAsync(
    { invoke: async () => ({ ok: true, outcome: "ok" }) },
    { requestId: "abort-1", signal: ac.signal, input: {} }
  );
  assert.equal(cancelled.ok, false);
  assert.equal(cancelled.failure_class, "cancel");
  assert.equal(cancelled.requestId, "abort-1");

  const timedOut = await invokeTransportAsync(
    {
      invoke: () =>
        new Promise((resolve) => {
          setTimeout(() => resolve({ ok: true, outcome: "ok" }), 200);
        }),
    },
    { requestId: "dl-1", deadlineMs: 5, input: {} }
  );
  assert.equal(timedOut.ok, false);
  assert.equal(timedOut.failure_class, "timeout");
  assert.equal(timedOut.requestId, "dl-1");
});

test("F-ea52b9c672375e23: late invoke rejection after timeout does not unhandledReject", async () => {
  const { invokeTransportAsync } = require("./index.js");
  const unhandled = [];
  const onUnhandled = (err) => {
    unhandled.push(err);
  };
  process.on("unhandledRejection", onUnhandled);
  try {
    const outcome = await invokeTransportAsync(
      {
        invoke: () =>
          new Promise((_, reject) => {
            setTimeout(() => reject(new Error("late-orphan-reject")), 80);
          }),
      },
      { requestId: "orphan-1", deadlineMs: 5, input: {} }
    );
    assert.equal(outcome.ok, false);
    assert.equal(outcome.failure_class, "timeout");
    assert.equal(outcome.requestId, "orphan-1");
    await new Promise((resolve) => setTimeout(resolve, 120));
    assert.equal(unhandled.length, 0, `unexpected unhandledRejection: ${unhandled.map(String)}`);
  } finally {
    process.removeListener("unhandledRejection", onUnhandled);
  }
});

test("createHostAdapter deep-freezes ports and capabilities (post-create mutation fails closed)", () => {
  const adapter = createHostAdapter({
    adapter_id: "claude",
    adapter_version: "1.0.0",
    host_version: "k2a-host/1",
    capabilities: { ExecutionTransport: "partial" },
    transports: baseTransports({
      ExecutionTransport: { port_id: "e", invoke: () => ({ ok: true, outcome: "ok" }) },
    }),
  });

  assert.throws(() => {
    adapter.capabilities.ExecutionTransport = "enforced";
  });
  assert.equal(adapter.capabilities.ExecutionTransport, "partial");

  assert.throws(() => {
    adapter.transports.ExecutionTransport = { port_id: "hijacked" };
  });
  assert.equal(adapter.transports.ExecutionTransport.port_id, "e");

  assert.throws(() => {
    adapter.transports.ExecutionTransport.port_id = "mutated";
  });
  assert.equal(adapter.transports.ExecutionTransport.port_id, "e");
});
