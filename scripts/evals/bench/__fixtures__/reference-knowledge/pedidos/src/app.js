"use strict";

const { crearPedido, confirmarPedido, cancelarPedido } = require("./domain/pedidos.js");
const { createAlmacen } = require("./infra/almacen.js");
const mailer = require("./infra/mailer.js");

const euros = (centimos) => `${Math.floor(centimos / 100)},${String(centimos % 100).padStart(2, "0")} €`;

// Casos de uso: cargan el pedido, aplican la regla del dominio y lo guardan.
// El aviso por email sale de aquí, no del dominio (ADR 0001), y su fallo no
// deshace la confirmación.
function createApp({ almacen = createAlmacen(), correo = mailer } = {}) {
  function cargar(id) {
    const pedido = almacen.buscar(id);
    if (!pedido) throw new Error(`no existe el pedido ${id}`);
    return pedido;
  }

  function avisar(pedido) {
    try {
      correo.enviar({
        para: pedido.cliente.email,
        asunto: `Pedido ${pedido.id} confirmado`,
        cuerpo: `Hola ${pedido.cliente.nombre}, tu pedido ${pedido.id} está confirmado.\nTotal: ${euros(pedido.total)}`,
      });
    } catch {
      // El pedido ya está confirmado: un fallo del correo no lo deshace.
    }
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
      avisar(pedido);
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
