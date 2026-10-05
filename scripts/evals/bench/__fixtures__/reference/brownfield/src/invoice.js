// Facturacion v1 (2014). No tocar sin hablar con contabilidad.

var CODIGOS = require("./discounts.js").CODIGOS;

var IVA = 0.21;
var IVA_REDUCIDO = 0.10;
var ENVIO = 4.95;
var UMBRAL_ENVIO_GRATIS = 50;

function r2(n) { return Math.round(n * 100) / 100; }

function porcentajeDescuento(code) {
  if (code === undefined || code === null || code === "") return 0;
  var key = String(code).toUpperCase();
  if (!Object.prototype.hasOwnProperty.call(CODIGOS, key)) throw new Error("codigo de descuento desconocido: " + code);
  return CODIGOS[key];
}

function calcInvoice(order) {
  var pct = porcentajeDescuento(order.discountCode);
  var lineas = [];
  var subtotal = 0;
  var iva = 0;
  var descuento = 0;
  for (var i = 0; i < order.items.length; i++) {
    var it = order.items[i];
    var importe = r2(it.price * it.qty);
    var rebaja = pct ? r2(importe * pct / 100) : 0;
    var ivaLinea = r2((importe - rebaja) * (it.reducedVat ? IVA_REDUCIDO : IVA));
    subtotal = subtotal + importe;
    descuento = descuento + rebaja;
    iva = iva + ivaLinea;
    lineas.push({ sku: it.sku, importe: importe, iva: ivaLinea });
  }
  subtotal = r2(subtotal);
  descuento = r2(descuento);
  iva = r2(iva);
  var base = r2(subtotal - descuento);
  var envio = base >= UMBRAL_ENVIO_GRATIS ? 0 : ENVIO;
  if (order.pickup) envio = 0;
  var total = r2(base + iva + envio);
  var factura = { lineas: lineas, subtotal: subtotal, iva: iva, envio: envio, total: total };
  if (pct) factura.descuento = descuento;
  return factura;
}

module.exports = { calcInvoice: calcInvoice };
