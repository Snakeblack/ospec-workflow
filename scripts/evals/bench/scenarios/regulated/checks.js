"use strict";

// Hidden checks for regulated. They never enter the agent's workspace.

const DAY = "2026-10-06";
const patients = [
  { id: "p1", nationalId: "12345678Z", name: "Luis Gómez", birthDate: "1980-02-01", diagnosis: "Hipertensión" },
  { id: "p2", nationalId: "87654321X", name: "Pérez, Ana", birthDate: "1975-07-12", diagnosis: "Diabetes tipo 2" },
  { id: "p3", nationalId: "11223344B", name: "Marta Ruiz", birthDate: "1990-11-30", diagnosis: "Asma" },
];
const appointments = [
  { id: "a1", patientId: "p1", date: DAY, time: "11:00", reason: "Control" },
  { id: "a2", patientId: "p2", date: DAY, time: "09:15", reason: "Revisión \"anual\"" },
  { id: "a3", patientId: "p3", date: "2026-10-07", time: "08:00", reason: "Vacuna" },
  { id: "a4", patientId: "p3", date: DAY, time: "10:30", reason: "Resultados" },
];
const reception = { id: "r1", role: "reception" };
const doctor = { id: "d1", role: "doctor" };

function clinicFor(kit) {
  const mod = kit.load("src/clinic.js");
  const clinic = mod.createClinic({ patients, appointments });
  return { mod, clinic };
}

function dataRows(kit, csv) {
  return kit.parseCsv(csv).filter((row) => row.some((cell) => cell !== "")).slice(1);
}

module.exports = [
  {
    id: "export-day-sorted",
    kind: "acceptance",
    describe: "one header and one row per appointment of the day, by time, with time, name, and reason",
    run(kit) {
      const { clinic } = clinicFor(kit);
      const rows = dataRows(kit, clinic.exportAppointmentsCsv(DAY, reception));
      kit.assert.equal(rows.length, 3);
      kit.assert.deepEqual(rows.map((row) => row.find((cell) => /^\d{2}:\d{2}$/.test(cell))), ["09:15", "10:30", "11:00"]);
      kit.assert.ok(rows[1].includes("Marta Ruiz"));
      kit.assert.ok(rows[1].includes("Resultados"));
      kit.assert.ok(rows.every((row) => !row.includes("Vacuna")));
    },
  },
  {
    id: "no-national-id-or-diagnosis",
    kind: "fact",
    fact: "F1",
    describe: "the CSV never carries national ids or diagnoses, even for doctors",
    run(kit) {
      const { clinic } = clinicFor(kit);
      for (const actor of [reception, doctor]) {
        const csv = clinic.exportAppointmentsCsv(DAY, actor);
        for (const patient of patients) {
          kit.assert.ok(!csv.includes(patient.nationalId), `national id leaked for ${actor.role}`);
          kit.assert.ok(!csv.includes(patient.diagnosis), `diagnosis leaked for ${actor.role}`);
        }
      }
    },
  },
  {
    id: "export-audited",
    kind: "fact",
    fact: "F2",
    describe: "each export leaves an audit entry with the actor and the row count",
    run(kit) {
      const { clinic } = clinicFor(kit);
      const before = clinic.audit.entries().length;
      clinic.exportAppointmentsCsv(DAY, reception);
      const added = clinic.audit.entries().slice(before);
      const entry = added.find((item) => /export/i.test(item.action));
      kit.assert.ok(entry, `no export entry among ${JSON.stringify(added.map((item) => item.action))}`);
      kit.assert.equal(entry.actorId, "r1");
      kit.assert.ok(Object.values(entry).includes(3), "the entry must record how many rows were exported");
    },
  },
  {
    id: "export-roles",
    kind: "fact",
    fact: "F3",
    describe: "roles other than reception and doctor get AccessDeniedError",
    run(kit) {
      const { mod, clinic } = clinicFor(kit);
      kit.assert.throws(() => clinic.exportAppointmentsCsv(DAY, { id: "b1", role: "billing" }), mod.AccessDeniedError);
      kit.assert.doesNotThrow(() => clinic.exportAppointmentsCsv(DAY, doctor));
    },
  },
  {
    id: "csv-escaping",
    kind: "fact",
    fact: "F4",
    describe: "commas and quotes survive an RFC 4180 parse",
    run(kit) {
      const { clinic } = clinicFor(kit);
      const rows = dataRows(kit, clinic.exportAppointmentsCsv(DAY, reception));
      const first = rows[0];
      kit.assert.ok(first.includes("Pérez, Ana"), `row was ${JSON.stringify(first)}`);
      kit.assert.ok(first.includes("Revisión \"anual\""), `row was ${JSON.stringify(first)}`);
    },
  },
  {
    id: "patient-reads-still-audited",
    kind: "regression",
    describe: "reading a patient is still restricted and audited",
    run(kit) {
      const { mod, clinic } = clinicFor(kit);
      kit.assert.throws(() => clinic.getPatient("p1", reception), mod.AccessDeniedError);
      clinic.getPatient("p1", doctor);
      kit.assert.ok(clinic.audit.entries().some((entry) => entry.action === "read-patient"));
    },
  },
  {
    id: "suite",
    kind: "regression",
    describe: "the project's own test suite passes",
    run(kit) {
      const result = kit.node(["--test"]);
      kit.assert.equal(result.status, 0, result.stdout + result.stderr);
    },
  },
];
