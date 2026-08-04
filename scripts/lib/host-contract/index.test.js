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
const { createEvidenceDigest } = require("../capability-proof/index.js");

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
  return {
    proof: {
      schema_version: 1,
      kind: "capability-proof/v1",
      adapter_version,
      host_version,
      fixture,
      evidence_digest,
    },
    evidence,
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

test("resolveCapabilityState promotes only with verifying proof", () => {
  const { proof, evidence } = validProof("ExecutionTransport");
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
