"use strict";

const {
  createPermitLedger,
  mintOperationPermit,
} = require("./permits.js");

const DEFAULT_HEAD =
  "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

/**
 * Attach a runtime-minted permit to a reducer/authorize action for tests.
 */
function withRuntimePermit(action = {}, options = {}) {
  const ledger = options.ledger || createPermitLedger();
  const headRevision = options.headRevision || action.headRevision || DEFAULT_HEAD;
  const permit =
    action.operationPermit ||
    mintOperationPermit({
      ledger,
      operation: action.operation,
      expected_revision: headRevision,
      arguments: action.arguments || {},
      subject_id: options.subject_id || "lifecycle:default",
    });
  return {
    ...action,
    operationPermit: permit,
    permitLedger: ledger,
    headRevision,
  };
}

module.exports = {
  DEFAULT_HEAD,
  withRuntimePermit,
  createPermitLedger,
  mintOperationPermit,
};
