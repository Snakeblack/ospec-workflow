"use strict";

const { stableSerialize } = require("./canonical-json.js");
const { digestLifecycleState } = require("./lifecycle-kernel/state-digest.js");
const { validateRecoveryHonesty } = require("./lifecycle-kernel/recovery.js");

const NEXT_ACTION_KINDS = new Set(["execute", "collect", "decide", "stop"]);

function stringField(value) {
  return typeof value === "string" ? value : "";
}

/**
 * Extract material discriminants from a human projection or negotiated envelope.
 *
 * @param {object} surface
 * @returns {{code: string, cause: string, next_action: object}}
 */
function extractDiscriminants(surface) {
  if (!surface || typeof surface !== "object") {
    throw new TypeError("surface must be an object");
  }

  const code =
    surface.code ||
    surface.reason_code ||
    surface.reason ||
    (surface.blocker && surface.blocker.code) ||
    "";
  const cause = surface.cause || (surface.blocker && surface.blocker.cause) || "";
  const next =
    surface.next_action ||
    surface.next_transition ||
    (surface.envelope && surface.envelope.next_transition) ||
    {};

  const next_action = {
    kind: stringField(next.kind),
    operation: stringField(next.operation),
  };
  if (next.kind === "execute" && typeof next.command === "string") {
    next_action.command = next.command;
  }

  return { code: stringField(code), cause: stringField(cause), next_action };
}

function nonEmpty(value) {
  return typeof value === "string" && value.trim() !== "";
}

function completeNextAction(action) {
  return (
    action &&
    typeof action === "object" &&
    NEXT_ACTION_KINDS.has(action.kind) &&
    nonEmpty(action.operation) &&
    (action.kind !== "execute" || nonEmpty(action.command))
  );
}

/**
 * Compare material discriminants between two surfaces.
 *
 * @param {object} left
 * @param {object} right
 * @returns {{ok: boolean, mismatches: Array<{field: string, left: *, right: *}>}}
 */
function compareParity(left, right) {
  const a = normalize(left);
  const b = normalize(right);
  const mismatches = [];

  if (!nonEmpty(a.code) || !nonEmpty(b.code) || a.code !== b.code) {
    mismatches.push({ field: "code", left: a.code, right: b.code });
  }
  if (!nonEmpty(a.cause) || !nonEmpty(b.cause) || a.cause !== b.cause) {
    mismatches.push({ field: "cause", left: a.cause, right: b.cause });
  }
  if (
    !completeNextAction(a.next_action) ||
    !completeNextAction(b.next_action) ||
    stableSerialize(a.next_action) !== stableSerialize(b.next_action)
  ) {
    mismatches.push({ field: "next_action", left: a.next_action, right: b.next_action });
  }

  return { ok: mismatches.length === 0, mismatches };
}

function normalize(value) {
  return extractDiscriminants(value);
}

function commandForTransition(selected) {
  if (!selected || selected.kind !== "execute") return undefined;
  const nodeId = selected.arguments && selected.arguments.node_id;
  if (nodeId) return `ospec ${selected.operation} --node-id=${nodeId}`;
  return `ospec ${selected.operation}`;
}

/**
 * Derive human and negotiated surfaces from one K2-selected transition.
 */
function deriveSurfacesFromKernel({ state, selected, code, cause }) {
  const state_digest = digestLifecycleState(state);
  const next_action = {
    kind: selected.kind,
    operation: selected.operation,
  };
  const command = commandForTransition(selected);
  if (command) next_action.command = command;

  const base = {
    code,
    cause,
    state_digest,
    next_action: { ...next_action },
    next_transition: { ...selected, ...(command ? { command } : {}) },
  };
  return {
    human: { ...base, surface: "human" },
    negotiated: {
      ...base,
      surface: "negotiated",
      envelope: { next_transition: base.next_transition, state_digest },
    },
  };
}

/**
 * Validate that human/negotiated surfaces match each other and the kernel selection.
 */
function validateProjectionParity({
  human,
  negotiated,
  kernelSelected = null,
  stateDigest = null,
}) {
  if (kernelSelected) {
    const humanOp = extractDiscriminants(human).next_action.operation;
    const negotiatedOp = extractDiscriminants(negotiated).next_action.operation;
    if (
      humanOp !== kernelSelected.operation ||
      negotiatedOp !== kernelSelected.operation
    ) {
      return {
        ok: false,
        code: "projection-override",
        mismatches: [
          {
            field: "next_action.operation",
            left: humanOp,
            right: kernelSelected.operation,
          },
        ],
      };
    }
  }

  const parity = compareParity(human, negotiated);
  if (!parity.ok) {
    return { ok: false, mismatches: parity.mismatches, code: "parity-mismatch" };
  }

  if (stateDigest) {
    if (human.state_digest !== stateDigest || negotiated.state_digest !== stateDigest) {
      return {
        ok: false,
        code: "digest-mismatch",
        mismatches: [{ field: "state_digest", left: human.state_digest, right: negotiated.state_digest }],
      };
    }
  }

  return { ok: true, mismatches: [] };
}

/**
 * Command honesty: named execute/recover must advance or terminate when probed.
 */
async function validateCommandHonesty({ state, transition, executeProbe }) {
  if (!transition || (transition.kind !== "execute" && transition.operation !== "recover")) {
    return { ok: true, reason: "not-execute" };
  }
  if (typeof executeProbe !== "function") {
    return { ok: false, code: "probe-required" };
  }
  const probed = await executeProbe({ state, transition });
  const honesty = validateRecoveryHonesty({
    beforeState: state,
    afterState: probed.afterState || state,
    outcome: probed.outcome || "advanced",
  });
  if (!honesty.ok) {
    return {
      ok: false,
      code: "command-not-honest",
      replacement: { kind: "decide", operation: "decide", arguments: {} },
      honesty,
    };
  }
  return { ok: true, honesty };
}

module.exports = {
  extractDiscriminants,
  compareParity,
  deriveSurfacesFromKernel,
  validateProjectionParity,
  validateCommandHonesty,
};
