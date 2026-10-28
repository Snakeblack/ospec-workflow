"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { crearPedido, confirmarPedido, cancelarPedido } = require("../src/domain/pedidos.js");
const { createApp } = require("../src/app.js");

const DATOS = {
  id: "p1",
  cliente: { nombre: "Ana", email: "ana@example.com" },
  lineas: [{ sku: "A", precio: 500, cantidad: 2 }, { sku: "B", precio: 250, cantidad: 1 }],
};

test("un pedido nuevo está pendiente y suma sus líneas", () => {
  const pedido = crearPedido(DATOS);
  assert.equal(pedido.estado, "pendiente");
  assert.equal(pedido.total, 1250);
});

test("un pedido sin líneas o sin email no se crea", () => {
  assert.throws(() => crearPedido({ ...DATOS, lineas: [] }));
  assert.throws(() => crearPedido({ ...DATOS, cliente: { nombre: "Ana" } }));
});

test("solo un pedido pendiente se confirma o se cancela", () => {
  const confirmado = confirmarPedido(crearPedido(DATOS));
  assert.equal(confirmado.estado, "confirmado");
  assert.throws(() => confirmarPedido(confirmado));
  assert.throws(() => cancelarPedido(confirmado));
  assert.equal(cancelarPedido(crearPedido(DATOS)).estado, "cancelado");
});

test("la aplicación guarda cada cambio de estado", () => {
  const app = createApp();
  app.crear(DATOS);
  app.confirmar("p1");
  assert.equal(app.ver("p1").estado, "confirmado");
  assert.throws(() => app.ver("p9"));
});
