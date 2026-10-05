"use strict";

// Append-only audit trail. Health data is a special category (GDPR art. 9):
// every access to patient data must leave an entry.
function createAuditLog({ now = () => new Date().toISOString() } = {}) {
  const entries = [];
  return {
    record(event) {
      if (!event || !event.action || !event.actorId) throw new TypeError("audit events need action and actorId");
      entries.push(Object.freeze({ ...event, at: now() }));
    },
    entries() {
      return entries.slice();
    },
  };
}

module.exports = { createAuditLog };
