"use strict";

// Almacén de pedidos. En producción es la base de datos; aquí vive en memoria.
function createAlmacen() {
  const pedidos = new Map();
  return {
    guardar(pedido) {
      pedidos.set(pedido.id, structuredClone(pedido));
    },
    buscar(id) {
      return pedidos.has(id) ? structuredClone(pedidos.get(id)) : null;
    },
  };
}

module.exports = { createAlmacen };
