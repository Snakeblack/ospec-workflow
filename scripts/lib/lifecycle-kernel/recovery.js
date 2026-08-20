"use strict";

const { digestLifecycleState, stripVolatile } = require("./state-digest.js");
const { selectTransitions } = require("./transition-selector.js");
const { sha256Fingerprint } = require("../canonical-json.js");
const { KERNEL_VERSION } = require("./state-digest.js");

/**
 * Blocking fingerprint ignores attempt counters so a refreshed counter is not
 * treated as lifecycle progress (REQ-lifecycle-kernel-runtime-005).
 */
function blockingFingerprint(state) {
  const cleaned = stripVolatile(state);
  const nodes = cleaned.nodes && typeof cleaned.nodes === "object" ? cleaned.nodes : {};
  const normalizedNodes = {};
  for (const key of Object.keys(nodes).sort()) {
    const node = { ...nodes[key] };
    delete node.attempt;
    delete node.zero_delta_attempts;
    delete node.telemetry;
    delete node.consumption;
    normalizedNodes[key] = node;
  }
  return sha256Fingerprint(`lifecycle-kernel:blocking:v${KERNEL_VERSION}`, {
    status: cleaned.status,
    nodes: normalizedNodes,
  });
}

/**
 * Recovery is honest only when execution advances the blocking fingerprint
 * or reaches an explicit terminal outcome.
 */
function validateRecoveryHonesty({ beforeState, afterState, outcome, causalFailure }) {
  const before_digest = digestLifecycleState(beforeState);
  const after_digest = digestLifecycleState(afterState);
  if (outcome === "terminal" || (afterState && afterState.status === "terminal")) {
    return { ok: true, before_digest, after_digest, reason: "terminal" };
  }

  if (causalFailure && causalFailure.category === "ambiguous_effect" && outcome !== "reconciled") {
    return {
      ok: false,
      code: "ambiguous-effect-unresolved",
      reason: "reconciliation-required",
      before_digest,
      after_digest,
    };
  }

  const beforeBlock = blockingFingerprint(beforeState);
  const afterBlock = blockingFingerprint(afterState);
  if (beforeBlock === afterBlock) {
    return {
      ok: false,
      code: "recovery-non-advancing",
      before_digest,
      after_digest,
      before_blocking: beforeBlock,
      after_blocking: afterBlock,
    };
  }
  return { ok: true, before_digest, after_digest, reason: "advanced", before_blocking: beforeBlock, after_blocking: afterBlock };
}

/**
 * Filter advertised recover transitions through an optional probe.
 * Non-advancing recoveries are replaced with decide/stop.
 */
function selectHonestTransitions(state, options = {}) {
  const base = selectTransitions(state);
  const probe = typeof options.probeRecovery === "function" ? options.probeRecovery : null;
  if (!probe) return base;

  const out = [];
  let replaced = false;
  for (const transition of base) {
    if (transition.operation !== "recover") {
      out.push(transition);
      continue;
    }
    const probed = probe({ state, transition }) || {};
    const honesty = validateRecoveryHonesty({
      beforeState: state,
      afterState: probed.afterState || state,
      outcome: probed.outcome || "advanced",
    });
    if (honesty.ok) {
      out.push(transition);
    } else {
      replaced = true;
    }
  }
  if (replaced && !out.some((t) => t.kind === "decide" || t.kind === "stop")) {
    out.push({ kind: "decide", operation: "decide", arguments: {} });
    out.push({ kind: "stop", operation: "stop", arguments: {} });
  }
  return out;
}

module.exports = {
  validateRecoveryHonesty,
  selectHonestTransitions,
  blockingFingerprint,
};
