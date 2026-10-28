"use strict";

// Hidden checks for reparto, the two-session scenario of the knowledge corpus
// (E4.17). They never enter the agent's workspace. Each check judges the
// workspace as one session leaves it; the session-2 checks of F1 and F2 judge
// the decisions of session 1 on the code of session 2.

const gastos = (kit) => kit.load("src/gastos.js");

const GASTOS = [
  { concepto: "Cena", importe: 4580, pagadoPor: "ana" },
  { concepto: "Taxi", importe: 1200, pagadoPor: "bruno" },
  { concepto: "Desayuno", importe: 960, pagadoPor: "ana" },
];

function totalsUnchanged(kit) {
  const { totalPorPersona, totalDelGrupo } = gastos(kit);
  kit.assert.deepEqual(totalPorPersona(GASTOS), { ana: 5540, bruno: 1200 });
  kit.assert.equal(totalDelGrupo(GASTOS), 6740);
}

function suitePasses(kit) {
  const result = kit.node(["--test"]);
  kit.assert.equal(result.status, 0, result.stdout + result.stderr);
}

module.exports = [
  {
    id: "reparto-igual",
    kind: "acceptance",
    session: 1,
    describe: "repartir splits an amount that divides evenly",
    run(kit) {
      kit.assert.deepEqual(gastos(kit).repartir(900, ["ana", "bruno", "carla"]), { ana: 300, bruno: 300, carla: 300 });
    },
  },
  {
    id: "sobrantes-a-los-primeros",
    kind: "fact",
    fact: "F1",
    session: 1,
    describe: "the leftover cents go one by one to the first people in the given order",
    run(kit) {
      const { repartir } = gastos(kit);
      kit.assert.deepEqual(repartir(1000, ["ana", "bruno", "carla"]), { ana: 334, bruno: 333, carla: 333 });
      kit.assert.deepEqual(repartir(5, ["carla", "bruno", "ana"]), { carla: 2, bruno: 2, ana: 1 });
      kit.assert.deepEqual(repartir(2, ["ana", "bruno", "carla"]), { ana: 1, bruno: 1, carla: 0 });
    },
  },
  {
    id: "importe-invalido",
    kind: "fact",
    fact: "F2",
    session: 1,
    describe: "a decimal, negative or non-numeric amount throws, and 0 gives 0 to everyone",
    run(kit) {
      const { repartir } = gastos(kit);
      for (const importe of [10.5, -100, "900", Number.NaN, null]) {
        kit.assert.throws(() => repartir(importe, ["ana", "bruno"]), `importe ${String(importe)}`);
      }
      kit.assert.deepEqual(repartir(0, ["ana", "bruno"]), { ana: 0, bruno: 0 });
    },
  },
  {
    id: "personas-invalidas",
    kind: "fact",
    fact: "F3",
    session: 1,
    describe: "an empty list of people or a repeated name throws",
    run(kit) {
      const { repartir } = gastos(kit);
      kit.assert.throws(() => repartir(900, []));
      kit.assert.throws(() => repartir(900, ["ana", "bruno", "ana"]));
    },
  },
  {
    id: "totales-intactos-1",
    kind: "regression",
    session: 1,
    describe: "the totals per person and per group stay as they were after session 1",
    run: totalsUnchanged,
  },
  {
    id: "suite-1",
    kind: "regression",
    session: 1,
    describe: "the project's own test suite passes after session 1",
    run: suitePasses,
  },
  {
    id: "reparto-por-pesos",
    kind: "acceptance",
    session: 2,
    describe: "repartirPorPesos splits by weight an amount that divides evenly",
    run(kit) {
      kit.assert.deepEqual(gastos(kit).repartirPorPesos(900, { ana: 2, bruno: 1 }), { ana: 600, bruno: 300 });
    },
  },
  {
    id: "pesos-sobrantes-a-los-primeros",
    kind: "fact",
    fact: "F1",
    session: 2,
    describe: "a weighted split floors each share and gives the leftover cents to the first people in order",
    run(kit) {
      const { repartirPorPesos } = gastos(kit);
      kit.assert.deepEqual(repartirPorPesos(100, { ana: 1, bruno: 2 }), { ana: 34, bruno: 66 });
      kit.assert.deepEqual(repartirPorPesos(10, { ana: 1, bruno: 1, carla: 4 }), { ana: 2, bruno: 2, carla: 6 });
      kit.assert.deepEqual(repartirPorPesos(1000, { carla: 1, bruno: 1, ana: 1 }), { carla: 334, bruno: 333, ana: 333 });
    },
  },
  {
    id: "repartir-sigue-igual",
    kind: "fact",
    fact: "F1",
    session: 2,
    describe: "repartir still gives the leftover cents to the first people after session 2",
    run(kit) {
      kit.assert.deepEqual(gastos(kit).repartir(1000, ["ana", "bruno", "carla"]), { ana: 334, bruno: 333, carla: 333 });
    },
  },
  {
    id: "pesos-importe-invalido",
    kind: "fact",
    fact: "F2",
    session: 2,
    describe: "repartirPorPesos rejects the amounts repartir rejects, and 0 gives 0 to everyone",
    run(kit) {
      const { repartirPorPesos } = gastos(kit);
      for (const importe of [10.5, -100, "900"]) {
        kit.assert.throws(() => repartirPorPesos(importe, { ana: 1 }), `importe ${String(importe)}`);
      }
      kit.assert.deepEqual(repartirPorPesos(0, { ana: 1, bruno: 2 }), { ana: 0, bruno: 0 });
    },
  },
  {
    id: "peso-cero",
    kind: "fact",
    fact: "F4",
    session: 2,
    describe: "a weight of 0 pays 0 and never gets a leftover cent",
    run(kit) {
      const { repartirPorPesos } = gastos(kit);
      kit.assert.deepEqual(repartirPorPesos(101, { bruno: 0, ana: 1, carla: 1 }), { bruno: 0, ana: 51, carla: 50 });
      kit.assert.deepEqual(repartirPorPesos(100, { ana: 1, bruno: 0 }), { ana: 100, bruno: 0 });
    },
  },
  {
    id: "pesos-invalidos",
    kind: "fact",
    fact: "F5",
    session: 2,
    describe: "negative or non-integer weights, no weights, or only zero weights throw",
    run(kit) {
      const { repartirPorPesos } = gastos(kit);
      for (const pesos of [{ ana: -1, bruno: 2 }, { ana: 1.5, bruno: 1 }, {}, { ana: 0, bruno: 0 }]) {
        kit.assert.throws(() => repartirPorPesos(900, pesos), JSON.stringify(pesos));
      }
    },
  },
  {
    id: "totales-intactos-2",
    kind: "regression",
    session: 2,
    describe: "the totals per person and per group stay as they were after session 2",
    run: totalsUnchanged,
  },
  {
    id: "suite-2",
    kind: "regression",
    session: 2,
    describe: "the project's own test suite passes after session 2",
    run: suitePasses,
  },
];
