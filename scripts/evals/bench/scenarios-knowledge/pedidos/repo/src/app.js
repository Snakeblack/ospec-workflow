"use strict";

const { crearPedido, confirmarPedido, cancelarPedido } = require("./domain/pedidos.js");
const { createAlmacen } = require("./infra/almacen.js");

// Casos de uso: cargan el pedido, aplican la regla del dominio y lo guardan.
function createApp({ almacen = createAlmacen() } = {}) {
  function cargar(id) {
    const pedido = almacen.buscar(id);
    if (!pedido) throw new Error(`no existe el pedido ${id}`);
    return pedido;
  }

  return {
    crear(datos) {
      const pedido = crearPedido(datos);
      almacen.guardar(pedido);
      return pedido;
    },
    confirmar(id) {
      const pedido = confirmarPedido(cargar(id));
      almacen.guardar(pedido);
      return pedido;
    },
    cancelar(id) {
      const pedido = cancelarPedido(cargar(id));
      almacen.guardar(pedido);
      return pedido;
    },
    ver(id) {
      return cargar(id);
    },
  };
}

module.exports = { createApp };
