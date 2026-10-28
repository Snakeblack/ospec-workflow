"use strict";

// Reglas de los pedidos. Dominio puro: no importa infraestructura ni hace E/S
// (docs/architecture/decisions/0001-dominio-sin-infraestructura.md).
// Los precios y el total son céntimos enteros.

function crearPedido({ id, cliente, lineas }) {
  if (!id) throw new Error("el pedido necesita un id");
  if (!cliente || !cliente.email) throw new Error("el pedido necesita un cliente con email");
  if (!Array.isArray(lineas) || lineas.length === 0) throw new Error("el pedido necesita al menos una línea");
  const total = lineas.reduce((suma, linea) => suma + linea.precio * linea.cantidad, 0);
  return {
    id,
    cliente: { ...cliente },
    lineas: lineas.map((linea) => ({ ...linea })),
    total,
    estado: "pendiente",
  };
}

function confirmarPedido(pedido) {
  if (pedido.estado !== "pendiente") throw new Error(`no se puede confirmar un pedido ${pedido.estado}`);
  return { ...pedido, estado: "confirmado" };
}

function cancelarPedido(pedido) {
  if (pedido.estado !== "pendiente") throw new Error(`no se puede cancelar un pedido ${pedido.estado}`);
  return { ...pedido, estado: "cancelado" };
}

module.exports = { crearPedido, confirmarPedido, cancelarPedido };
