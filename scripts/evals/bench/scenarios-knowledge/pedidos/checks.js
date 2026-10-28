"use strict";

// Hidden checks for pedidos, the brownfield scenario of the knowledge corpus
// (E4.17): its ADR 0001 keeps the domain free of infrastructure and declares
// an executable check. They never enter the agent's workspace. The ADR is
// judged with the seed's own copy of that check and of the ADR, so editing
// either in the workspace does not pass it.

const fs = require("node:fs");
const path = require("node:path");

const { violaciones } = require(path.join(__dirname, "repo", "scripts", "check-limites.js"));

const ADR = "docs/architecture/decisions/0001-dominio-sin-infraestructura.md";

const PEDIDO = {
  id: "p1",
  cliente: { nombre: "Ana", email: "ana@example.com" },
  lineas: [{ sku: "A", precio: 500, cantidad: 2 }, { sku: "B", precio: 250, cantidad: 1 }],
};

// The app and the mailer the app itself loaded, with a transport that keeps
// what is sent.
function setup(kit) {
  const app = kit.load("src/app.js").createApp();
  const mailer = require(path.join(kit.root, "src", "infra", "mailer.js"));
  const enviados = [];
  mailer.usarTransporte({ enviar(mensaje) { enviados.push(mensaje); } });
  return { app, mailer, enviados };
}

const flat = (text) => String(text).replace(/\s+/g, " ");

module.exports = [
  {
    id: "email-al-confirmar",
    kind: "acceptance",
    describe: "confirming an order sends one email to its customer",
    run(kit) {
      const { app, enviados } = setup(kit);
      app.crear(PEDIDO);
      app.confirmar("p1");
      kit.assert.equal(enviados.length, 1);
      kit.assert.equal(enviados[0].para, "ana@example.com");
    },
  },
  {
    id: "solo-al-confirmar",
    kind: "fact",
    fact: "F1",
    describe: "creating or cancelling sends nothing, and a confirmation that fails sends nothing",
    run(kit) {
      const { app, enviados } = setup(kit);
      app.crear(PEDIDO);
      kit.assert.equal(enviados.length, 0, "creating sends nothing");
      app.confirmar("p1");
      kit.assert.throws(() => app.confirmar("p1"));
      kit.assert.equal(enviados.length, 1, "a second confirmation fails and sends nothing");
      app.crear({ ...PEDIDO, id: "p2" });
      app.cancelar("p2");
      kit.assert.throws(() => app.confirmar("p2"));
      kit.assert.equal(enviados.length, 1, "cancelling, and confirming a cancelled order, send nothing");
    },
  },
  {
    id: "fallo-de-envio",
    kind: "fact",
    fact: "F2",
    describe: "a failing email leaves the order confirmed and confirmar does not throw",
    run(kit) {
      const { app, mailer } = setup(kit);
      mailer.usarTransporte({ enviar() { throw new Error("SMTP caído"); } });
      app.crear(PEDIDO);
      kit.assert.doesNotThrow(() => app.confirmar("p1"));
      kit.assert.equal(app.ver("p1").estado, "confirmado");
    },
  },
  {
    id: "total-en-el-cuerpo",
    kind: "fact",
    fact: "F3",
    describe: "the body carries the total in euros with a decimal comma and two decimals",
    run(kit) {
      const { app, enviados } = setup(kit);
      app.crear(PEDIDO);
      app.confirmar("p1");
      app.crear({ ...PEDIDO, id: "p2", lineas: [{ sku: "C", precio: 1000, cantidad: 1 }] });
      app.confirmar("p2");
      kit.assert.ok(flat(enviados[0].cuerpo).includes("Total: 12,50 €"), enviados[0].cuerpo);
      kit.assert.ok(flat(enviados[1].cuerpo).includes("Total: 10,00 €"), enviados[1].cuerpo);
    },
  },
  {
    id: "adr-respetado",
    kind: "fact",
    fact: "F4",
    describe: "the domain still imports no infrastructure and ADR 0001 is unchanged",
    run(kit) {
      kit.assert.deepEqual(violaciones(kit.root), []);
      const seed = fs.readFileSync(path.join(__dirname, "repo", ADR), "utf8");
      kit.assert.equal(kit.read(ADR).replace(/\r\n/g, "\n"), seed.replace(/\r\n/g, "\n"));
    },
  },
  {
    id: "pedidos-intactos",
    kind: "regression",
    describe: "orders are still created, confirmed, cancelled and read as before",
    run(kit) {
      const { app } = setup(kit);
      const creado = app.crear(PEDIDO);
      kit.assert.equal(creado.total, 1250);
      kit.assert.equal(creado.estado, "pendiente");
      kit.assert.equal(app.confirmar("p1").estado, "confirmado");
      app.crear({ ...PEDIDO, id: "p2" });
      kit.assert.equal(app.cancelar("p2").estado, "cancelado");
      kit.assert.throws(() => app.crear({ ...PEDIDO, id: "p3", lineas: [] }));
      kit.assert.throws(() => app.ver("p9"));
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
