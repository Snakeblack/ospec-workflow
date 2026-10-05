"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { createClinic, AccessDeniedError } = require("../src/clinic.js");

const patients = [
  { id: "p1", nationalId: "12345678Z", name: "Luis Gómez", birthDate: "1980-02-01", diagnosis: "Hipertensión" },
];
const appointments = [
  { id: "a1", patientId: "p1", date: "2026-10-06", time: "09:30", reason: "Control" },
  { id: "a2", patientId: "p1", date: "2026-10-07", time: "10:00", reason: "Analítica" },
];
const doctor = { id: "d1", role: "doctor" };
const reception = { id: "r1", role: "reception" };

test("doctors read patients and every read is audited", () => {
  const clinic = createClinic({ patients, appointments });
  assert.equal(clinic.getPatient("p1", doctor).name, "Luis Gómez");
  assert.deepEqual(clinic.audit.entries().map((entry) => entry.action), ["read-patient"]);
});

test("reception cannot read patient records", () => {
  const clinic = createClinic({ patients, appointments });
  assert.throws(() => clinic.getPatient("p1", reception), AccessDeniedError);
});

test("appointments of a day are listed and audited", () => {
  const clinic = createClinic({ patients, appointments });
  assert.deepEqual(clinic.appointmentsOn("2026-10-06", reception).map((item) => item.id), ["a1"]);
  assert.equal(clinic.audit.entries()[0].count, 1);
});
