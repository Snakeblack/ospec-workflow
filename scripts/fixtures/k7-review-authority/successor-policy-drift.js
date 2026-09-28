"use strict";

const { createSuccessor } = require("../../lib/review-lineage.js");
const { createReducerIssuedK7Lineage } = require("./reducer-issued-lineage.js");

function createSuccessorPolicyDriftFixture() {
  const predecessor = createReducerIssuedK7Lineage({ domain: "runtime", includeFinding: false });
  const replacement = createReducerIssuedK7Lineage({ domain: "trust", includeFinding: false });
  const successor = createSuccessor(predecessor.lineage, {
    reason: "policy review domain changed",
    authority_kind: "new-scope",
    approval_reference: "architecture-bounded-review-001",
    approvals: [{ id: "architecture-bounded-review-001", applies_to: ["sdd-verify"] }],
    reducerContext: { candidate_diff: [
      "diff --git a/src/index.js b/src/index.js",
      "--- a/src/index.js",
      "+++ b/src/index.js",
      "@@ -1 +1 @@",
      "-module.exports = 0;",
      "+module.exports = 1;",
    ].join("\n") },
    issuance: replacement.issuance,
    binding: replacement.lineage.genesis.k7_binding,
  });
  return {
    ...predecessor,
    rawPredecessorLineage: predecessor.lineage,
    lineage: successor.predecessor_state,
    successor,
    successorIssuance: replacement.issuance,
  };
}

module.exports = { createSuccessorPolicyDriftFixture };
