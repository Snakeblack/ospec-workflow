"use strict";

const { stableSerialize } = require("./canonical-json.js");

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

module.exports = { extractDiscriminants, compareParity };
