"use strict";

const { sha256Fingerprint } = require("../canonical-json.js");
const { digestLifecycleState } = require("./state-digest.js");

function eventId(descriptor) {
  return sha256Fingerprint("lifecycle-kernel:event", {
    kind: descriptor.kind,
    subject: descriptor.subject ?? null,
    effect_id: descriptor.effect_id ?? null,
    operation_id: descriptor.operation_id ?? null,
    state_digest: descriptor.state_digest,
    payload: descriptor.payload || {},
  });
}

/**
 * Derived, non-authoritative event projection.
 * Ordering is by effect_id ascending for stable rebuilds.
 */
function projectEvents({ state, journal = [] }) {
  const stateDigest = digestLifecycleState(state);
  const records = Array.isArray(journal) ? [...journal] : [];
  records.sort((a, b) => {
    const ea = (a && a.effect_id) || "";
    const eb = (b && b.effect_id) || "";
    if (ea < eb) return -1;
    if (ea > eb) return 1;
    return 0;
  });

  return records
    .filter((record) => record && (record.status === "completed" || record.status === "failed"))
    .map((record) => {
      const descriptor = {
        kind: record.status === "failed" ? "effect-failed" : "effect-completed",
        subject: record.subject || null,
        effect_id: record.effect_id,
        operation_id: record.operation_id,
        state_digest: stateDigest,
        payload: record.result || {},
      };
      return {
        ...descriptor,
        event_id: eventId(descriptor),
      };
    });
}

module.exports = { projectEvents, eventId };
