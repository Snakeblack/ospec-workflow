"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { totalPorPersona, totalDelGrupo } = require("../src/gastos.js");

const GASTOS = [
  { concepto: "Cena", importe: 4580, pagadoPor: "ana" },
  { concepto: "Taxi", importe: 1200, pagadoPor: "bruno" },
  { concepto: "Desayuno", importe: 960, pagadoPor: "ana" },
];

test("totalPorPersona suma lo que pagó cada persona", () => {
  assert.deepEqual(totalPorPersona(GASTOS), { ana: 5540, bruno: 1200 });
  assert.deepEqual(totalPorPersona([]), {});
});

test("totalDelGrupo suma todos los gastos", () => {
  assert.equal(totalDelGrupo(GASTOS), 6740);
  assert.equal(totalDelGrupo([]), 0);
});
