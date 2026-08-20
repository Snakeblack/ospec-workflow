"use strict";

const { sha256Fingerprint } = require("../canonical-json.js");
const { digestLifecycleState, KERNEL_VERSION } = require("./state-digest.js");

function normalizeArguments(args) {
  if (!args || typeof args !== "object") return {};
  const out = {};
  for (const key of Object.keys(args).sort()) {
    out[key] = args[key];
  }
  return out;
}

function deriveOperationId({ state, operation, arguments: args }) {
  return sha256Fingerprint("lifecycle-kernel:operation", {
    kernel_version: KERNEL_VERSION,
    state_digest: digestLifecycleState(state),
    operation,
    arguments: normalizeArguments(args),
  });
}

function deriveEffectId(operationId, effect) {
  return sha256Fingerprint("lifecycle-kernel:effect", {
    operation_id: operationId,
    kind: effect && effect.kind,
    payload: effect && effect.payload ? normalizeArguments(effect.payload) : {},
  });
}

function createJournalRecord({
  operation_id,
  effect_id,
  status,
  kernel_version = KERNEL_VERSION,
  result = null,
  effect_class = null,
}) {
  const allowed = new Set(["planned", "started", "completed", "failed", "unknown", "zero-delta-attempt"]);
  if (!allowed.has(status)) {
    throw new Error(`invalid journal status: ${status}`);
  }

  const record = {
    schema_version: 1,
    kernel_version,
    operation_id,
    effect_id,
    status,
    result,
  };
  if (effect_class) record.effect_class = effect_class;
  return record;
}

function reconcileEffect({ record, effect_class = null }) {
  if (!record || typeof record !== "object") {
    return { action: "fail-closed", code: "reconciliation-required" };
  }
  if (record.status === "completed") {
    return { action: "skip", reason: "already-completed" };
  }
  if (record.status === "planned") {
    return { action: "execute" };
  }
  if (record.status === "started") {
    // Replay-once: only pre-effect barrier proves the effect never ran (e.g. interrupt
    // after durable started, before executor). Any other started mark is ambiguous.
    if (record.result && record.result.barrier === "pre-effect") {
      const cls = effect_class || record.effect_class;
      if (cls === "irreversible") {
        // Irreversible must not blind-retry even on pre-effect if marked ambiguous externally;
        // pre-effect still proves effect never ran, so retry-execute remains safe for pre-effect.
        return { action: "retry-execute", reason: "started-pre-effect-safe-retry", same_key: true };
      }
      return { action: "retry-execute", reason: "started-pre-effect-safe-retry", same_key: true };
    }
    if ((effect_class || record.effect_class) === "irreversible") {
      return {
        action: "fail-closed",
        code: "irreversible-ambiguous",
        reason: "started-ambiguous-irreversible",
      };
    }
    return {
      action: "fail-closed",
      code: "reconciliation-required",
      reason: "started-ambiguous",
    };
  }
  if (record.status === "failed") {
    return { action: "skip", reason: "already-failed" };
  }
  if (record.status === "unknown" && (effect_class || record.effect_class) === "irreversible") {
    return {
      action: "fail-closed",
      code: "irreversible-ambiguous",
      reason: "unknown-irreversible",
    };
  }
  return { action: "fail-closed", code: "reconciliation-required" };
}

module.exports = {
  deriveOperationId,
  deriveEffectId,
  createJournalRecord,
  reconcileEffect,
  normalizeArguments,
};
