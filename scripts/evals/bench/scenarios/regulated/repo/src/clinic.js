"use strict";

const { createAuditLog } = require("./audit.js");

class AccessDeniedError extends Error {
  constructor(message) {
    super(message);
    this.name = "AccessDeniedError";
  }
}

// Patient: { id, nationalId, name, birthDate, diagnosis }
// Appointment: { id, patientId, date: "YYYY-MM-DD", time: "HH:MM", reason }
function createClinic({ patients = [], appointments = [], audit = createAuditLog() } = {}) {
  function requireRole(actor, roles) {
    if (!actor || !roles.includes(actor.role)) {
      throw new AccessDeniedError(`role ${actor && actor.role} cannot perform this action`);
    }
  }

  function getPatient(patientId, actor) {
    requireRole(actor, ["doctor"]);
    const patient = patients.find((item) => item.id === patientId);
    audit.record({ action: "read-patient", actorId: actor.id, patientId });
    return patient ? { ...patient } : null;
  }

  function appointmentsOn(date, actor) {
    requireRole(actor, ["doctor", "reception"]);
    const result = appointments.filter((item) => item.date === date).map((item) => ({ ...item }));
    audit.record({ action: "list-appointments", actorId: actor.id, date, count: result.length });
    return result;
  }

  return { getPatient, appointmentsOn, audit };
}

module.exports = { createClinic, AccessDeniedError };
