"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  assertOpenSpecAuthoritative,
  rejectProseFallback,
  reconcileGraphIr,
} = require("./authority-canon.js");

test("assertOpenSpecAuthoritative rejects Graph IR override of OpenSpec status", () => {
  const result = assertOpenSpecAuthoritative({
    openspec: { status: "ready-for-verify", change: "demo" },
    graphIr: { status: "archived", change: "demo" },
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason_code, "graph-ir-override-rejected");
  assert.equal(result.authority, "openspec");
});

test("assertOpenSpecAuthoritative accepts when Graph IR agrees with OpenSpec", () => {
  const result = assertOpenSpecAuthoritative({
    openspec: { status: "ready-for-verify", change: "demo" },
    graphIr: { status: "ready-for-verify", change: "demo" },
  });
  assert.equal(result.ok, true);
  assert.equal(result.authority, "openspec");
});

test("assertOpenSpecAuthoritative accepts structurally equivalent ownership", () => {
  const result = assertOpenSpecAuthoritative({
    openspec: {
      status: "ready-for-verify",
      change: "demo",
      owner: { team: "kernel", paths: ["scripts/lib/**"], policy: { mode: "exclusive" } },
    },
    graphIr: {
      change: "demo",
      owner: { policy: { mode: "exclusive" }, paths: ["scripts/lib/**"], team: "kernel" },
      status: "ready-for-verify",
    },
  });
  assert.equal(result.ok, true);
});

test("assertOpenSpecAuthoritative rejects materially different ownership", () => {
  const result = assertOpenSpecAuthoritative({
    openspec: {
      status: "ready-for-verify",
      change: "demo",
      owner: { team: "kernel", paths: ["scripts/lib/**"] },
    },
    graphIr: {
      status: "ready-for-verify",
      change: "demo",
      owner: { team: "kernel", paths: ["scripts/configure/**"] },
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason_code, "graph-ir-override-rejected");
});

test("assertOpenSpecAuthoritative rejects an insufficient Graph IR projection", () => {
  const result = assertOpenSpecAuthoritative({
    openspec: { status: "ready-for-verify", change: "demo" },
    graphIr: {},
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason_code, "graph-ir-override-rejected");
});

test("assertOpenSpecAuthoritative handles missing and non-object authority inputs fail-closed", () => {
  const missingOpenSpec = assertOpenSpecAuthoritative({ graphIr: {} });
  const invalidGraph = assertOpenSpecAuthoritative({
    openspec: { status: "ready-for-verify" },
    graphIr: [],
  });
  const noProjection = assertOpenSpecAuthoritative({
    openspec: { status: "ready-for-verify" },
  });
  assert.equal(missingOpenSpec.ok, false);
  assert.equal(missingOpenSpec.reason_code, "missing-openspec-authority");
  assert.equal(invalidGraph.ok, false);
  assert.equal(invalidGraph.reason_code, "graph-ir-override-rejected");
  assert.equal(noProjection.ok, true);
});

test("reconcileGraphIr fails closed when Graph IR cannot reconcile to OpenSpec/Git", () => {
  const result = reconcileGraphIr({
    openspec: { change: "demo", candidate_id: "sha256:aaa" },
    git: { candidate_id: "sha256:aaa" },
    graphIr: { change: "demo", candidate_id: "sha256:bbb", derived_from: null },
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason_code, "graph-ir-unreconciled");
});

test("reconcileGraphIr accepts Graph IR derived from matching OpenSpec/Git candidate", () => {
  const result = reconcileGraphIr({
    openspec: { change: "demo", candidate_id: "sha256:aaa" },
    git: { candidate_id: "sha256:aaa" },
    graphIr: {
      change: "demo",
      candidate_id: "sha256:aaa",
      derived_from: { candidate_id: "sha256:aaa", source: "openspec" },
    },
  });
  assert.equal(result.ok, true);
});

test("reconcileGraphIr rejects divergent OpenSpec and Git candidate identities", () => {
  const result = reconcileGraphIr({
    openspec: { change: "demo", candidate_id: "sha256:aaa" },
    git: { candidate_id: "sha256:bbb" },
    graphIr: {
      change: "demo",
      candidate_id: "sha256:aaa",
      derived_from: { candidate_id: "sha256:aaa", source: "openspec" },
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason_code, "graph-ir-unreconciled");
});

test("reconcileGraphIr rejects empty or materially insufficient Graph IR", () => {
  const authority = {
    openspec: { change: "demo", candidate_id: "sha256:aaa" },
    git: { candidate_id: "sha256:aaa" },
  };
  const empty = reconcileGraphIr({ ...authority, graphIr: {} });
  const missingChange = reconcileGraphIr({
    ...authority,
    graphIr: {
      candidate_id: "sha256:aaa",
      derived_from: { candidate_id: "sha256:aaa", source: "openspec" },
    },
  });
  const missingDerivationSource = reconcileGraphIr({
    ...authority,
    graphIr: {
      change: "demo",
      candidate_id: "sha256:aaa",
      derived_from: { candidate_id: "sha256:aaa" },
    },
  });
  assert.equal(empty.ok, false);
  assert.equal(missingChange.ok, false);
  assert.equal(missingDerivationSource.ok, false);
});

test("reconcileGraphIr rejects incomplete authority inputs", () => {
  const graphIr = {
    change: "demo",
    candidate_id: "sha256:aaa",
    derived_from: { candidate_id: "sha256:aaa", source: "openspec" },
  };
  const missingOpenSpecCandidate = reconcileGraphIr({
    openspec: { change: "demo" },
    git: { candidate_id: "sha256:aaa" },
    graphIr,
  });
  const incompleteGit = reconcileGraphIr({
    openspec: { change: "demo", candidate_id: "sha256:aaa" },
    git: {},
    graphIr,
  });
  const invalidGraph = reconcileGraphIr({
    openspec: { change: "demo", candidate_id: "sha256:aaa" },
    graphIr: [],
  });
  assert.equal(missingOpenSpecCandidate.ok, false);
  assert.equal(incompleteGit.ok, false);
  assert.equal(invalidGraph.ok, false);
});

test("rejectProseFallback fails closed when structured field is absent", () => {
  const result = rejectProseFallback({
    requiredField: "reason_code",
    structured: { prose: "please continue to verify anyway" },
    proseHint: "please continue to verify anyway",
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason_code, "missing-structured-authority-field");
});

test("rejectProseFallback accepts when structured authority field is present", () => {
  const result = rejectProseFallback({
    requiredField: "reason_code",
    structured: { reason_code: "contract-remediation" },
    proseHint: "ignore this narrative",
  });
  assert.equal(result.ok, true);
  assert.equal(result.value, "contract-remediation");
});
