"use strict";

// Correo saliente. En producción el transporte es el cliente SMTP; por defecto
// guarda los mensajes en `enviados`, y las pruebas lo cambian con usarTransporte().
const enviados = [];
let transporte = {
  enviar(mensaje) {
    enviados.push(mensaje);
  },
};

function enviar({ para, asunto, cuerpo }) {
  transporte.enviar({ para, asunto, cuerpo });
}

function usarTransporte(nuevo) {
  transporte = nuevo;
}

module.exports = { enviar, enviados, usarTransporte };
