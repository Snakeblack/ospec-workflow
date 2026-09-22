"use strict";

const crypto = require("node:crypto");

function clone(value) {
  return structuredClone(value);
}

// Canonical JSON is the replay boundary shared with the Go hook. Native
// JSON.stringify preserves insertion order while Go maps do not, so hashing it
// directly makes a persisted replay hash runtime-specific. Input envelopes are
// JSON values; reject unsupported values instead of silently changing a hash.
function canonicalJson(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("Replay payload contains a non-finite number");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  if (typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  throw new TypeError("Replay payload contains a non-JSON value");
}

function computePayloadHash(payload) {
  return crypto
    .createHash("sha256")
    .update(canonicalJson(payload), "utf8")
    .digest("hex");
}

class MissingTimestampError extends Error {
  constructor() {
    super("options.now (ISO-8601 timestamp) is required: reducePhaseCompletion is pure and must not read the wall clock");
    this.name = "MissingTimestampError";
  }
}

const POSITIVE_VERIFY_OUTCOMES = new Set(["PASS", "PASS WITH WARNINGS"]);

function isPositiveVerifyOutcome(envelope) {
  const raw = envelope?.verify_outcome;
  return typeof raw === "string" && POSITIVE_VERIFY_OUTCOMES.has(raw.trim().toUpperCase());
}

/**
 * Computes next change state and effects from current state and phase completion payload.
 * Pure function: zero I/O, deterministic, no synthetic approvals or gate passes.
 * The timestamp MUST be injected via options.now (required, fail-closed): the reducer never reads the wall clock.
 *
 * @param {object} currentState - Current state (parsed state.yaml or lifecycle node graph)
 * @param {object} payload - Validated result-envelope/v1 payload with phase context
 * @param {object} options - Options ({ now: string, expectedRevision?: number, phase?: string })
 * @returns {{
 *   ok: boolean,
 *   state: object,
 *   effects: Array<{ kind: string, payload: object }>,
 *   events: Array<{ kind: string, subject: string, payload: object }>,
 *   outcome: "advanced" | "blocked" | "noop-replay" | "cas-conflict",
 *   code?: string,
 *   error?: string
 * }}
 */
function reducePhaseCompletion(currentState, payload, options = {}) {
  if (typeof options.now !== "string" || options.now.trim() === "") {
    throw new MissingTimestampError();
  }
  const current = currentState && typeof currentState === "object" ? currentState : {};
  const phase = payload?.phase || options.phase;

  if (!phase || typeof phase !== "string") {
    return {
      ok: false,
      state: clone(current),
      effects: [],
      events: [],
      outcome: "blocked",
      code: "invalid_phase",
      error: "phase is required for phase completion reduction",
    };
  }

  const envelope = payload?.envelope || payload;
  if (!envelope || typeof envelope !== "object") {
    return {
      ok: false,
      state: clone(current),
      effects: [],
      events: [],
      outcome: "blocked",
      code: "invalid_envelope",
      error: "envelope payload is required",
    };
  }

  // Replay verification: noop-replay ONLY on a stored last_payload_hash match;
  // distinct re-runs without a stored hash proceed through the CAS-gated apply.
  const payloadHash = computePayloadHash(envelope);
  const phaseEntry = current.phases?.[phase];
  if (phaseEntry?.last_payload_hash === payloadHash) {
    return {
      ok: true,
      state: clone(current),
      effects: [],
      events: [],
      outcome: "noop-replay",
    };
  }

  // 2. CAS verification: if expectedRevision is specified, check against current revision
  if (options.expectedRevision !== undefined) {
    const currentRevision = current.revision !== undefined ? current.revision : 0;
    if (currentRevision !== options.expectedRevision) {
      return {
        ok: false,
        state: clone(current),
        effects: [],
        events: [],
        outcome: "cas-conflict",
        code: "cas_conflict",
        error: `CAS revision conflict: expected ${options.expectedRevision}, head is ${currentRevision}`,
      };
    }
  }

  const nextState = clone(current);
  const effects = [];
  const events = [];

  // Advance revision counter
  nextState.revision = (current.revision || 0) + 1;
  nextState.last_updated = options.now;

  // Ensure phases map exists
  nextState.phases = nextState.phases || {};
  nextState.phases[phase] = nextState.phases[phase] || {};

  // Store replay hash
  nextState.phases[phase].last_payload_hash = payloadHash;

  // 3. Reject synthetic gate passes and uncommitted approvals:
  // Strictly preserve existing approvals and gates from current state; drop any claimed in envelope
  if (current.approvals !== undefined) {
    nextState.approvals = clone(current.approvals);
  }
  if (current.gates !== undefined) {
    nextState.gates = clone(current.gates);
  }

  const status = envelope.status;

  if (status === "blocked") {
    nextState.status = "blocked";

    // Extract blocking questions
    let questions = [];
    if (Array.isArray(envelope.question_gate?.questions) && envelope.question_gate.questions.length > 0) {
      questions = envelope.question_gate.questions.map((q) =>
        typeof q === "string" ? q : q.question || q.header || JSON.stringify(q)
      );
    } else if (envelope.question_gate?.reason) {
      questions = [envelope.question_gate.reason];
    } else if (envelope.executive_summary) {
      questions = [envelope.executive_summary];
    } else {
      questions = ["Blocked without reason specified"];
    }
    nextState.blocking_questions = questions;

    if (envelope.blocker_type) {
      nextState.phases[phase].blocker_type = envelope.blocker_type;
    }

    if (envelope.executive_summary) {
      nextState.phases[phase].summary = envelope.executive_summary.slice(0, 160);
    }

    effects.push({
      kind: "persist-state",
      payload: { phase, status: "blocked" },
    });

    events.push({
      kind: "phase-blocked",
      subject: phase,
      payload: {
        blocker_type: envelope.blocker_type || null,
        reason: envelope.question_gate?.reason || null,
        questions,
      },
    });

    return {
      ok: true,
      state: nextState,
      effects,
      events,
      outcome: "blocked",
    };
  }

  // Success or partial
  const isPartial = status === "partial";
  nextState.phases[phase].status = isPartial ? "partial" : "done";

  const summary = (envelope.executive_summary || "").slice(0, 160);
  nextState.phases[phase].summary = summary;
  nextState.phases[phase].artifacts = envelope.artifacts || "inline";

  if (Array.isArray(envelope.key_decisions) && envelope.key_decisions.length > 0) {
    nextState.phases[phase].key_decisions = envelope.key_decisions
      .filter((item) => typeof item === "string")
      .slice(0, 3);
  }

  if (phase === "verify" && envelope.verify_outcome) {
    nextState.phases[phase].verdict = envelope.verify_outcome;
  }

  // Clear resolved blocking questions on success
  nextState.blocking_questions = [];

  // Update top-level status
  if (phase === "proposal" || phase === "spec" || phase === "design") {
    if (!nextState.status || nextState.status === "blocked") {
      nextState.status = "planning";
    }
  } else if (phase === "tasks") {
    nextState.status = "ready-for-apply";
  } else if (phase === "apply") {
    nextState.status = isPartial ? "applying" : "ready-for-verify";
  } else if (phase === "verify") {
    if (!isPositiveVerifyOutcome(envelope)) {
      nextState.status = "blocked";
      nextState.blocking_questions = [
        envelope.executive_summary ||
        (envelope.verify_outcome ? `Verification verdict: ${envelope.verify_outcome}` : "Verification verdict FAIL, omitted, or invalid")
      ];
      effects.push({ kind: "persist-state", payload: { phase, status: "blocked" } });
      return { ok: true, state: nextState, effects, events, outcome: "blocked", code: "verification_failed" };
    }
    nextState.status = "verified";
  } else if (phase === "archive") {
    nextState.status = "archived";
  }
  effects.push({
    kind: "persist-state",
    payload: { phase, status: nextState.status },
  });

  events.push({
    kind: "phase-advanced",
    subject: phase,
    payload: {
      phase_status: nextState.phases[phase].status,
      summary,
    },
  });

  return {
    ok: true,
    state: nextState,
    effects,
    events,
    outcome: "advanced",
  };
}

module.exports = {
  reducePhaseCompletion,
};
