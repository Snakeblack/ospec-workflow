"use strict";

const { createAuditLog } = require("./audit.js");

class AccessDeniedError extends Error {
  constructor(message) {
    super(message);
    this.name = "AccessDeniedError";
  }
}

const csvField = (value) => (/[",\n\r]/.test(value) ? `"${String(value).replace(/"/g, "\"\"")}"` : String(value));

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

  function exportAppointmentsCsv(date, actor) {
    requireRole(actor, ["doctor", "reception"]);
    const rows = appointments.filter((item) => item.date === date)
      .sort((a, b) => a.time.localeCompare(b.time))
      .map((item) => {
        const patient = patients.find((candidate) => candidate.id === item.patientId);
        return [item.time, patient ? patient.name : "", item.reason];
      });
    audit.record({ action: "export-appointments", actorId: actor.id, date, count: rows.length });
    return [["hora", "paciente", "motivo"], ...rows].map((row) => row.map(csvField).join(",")).join("\r\n") + "\r\n";
  }

  return { getPatient, appointmentsOn, exportAppointmentsCsv, audit };
}

module.exports = { createClinic, AccessDeniedError };
