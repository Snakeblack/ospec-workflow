// Facturacion v1 (2014). No tocar sin hablar con contabilidad.
// TODO: tests

var IVA = 0.21;
var IVA_REDUCIDO = 0.10;
var ENVIO = 4.95;
var UMBRAL_ENVIO_GRATIS = 50;

function r2(n) { return Math.round(n * 100) / 100; }

function calcInvoice(order) {
  var lineas = [];
  var subtotal = 0;
  var iva = 0;
  for (var i = 0; i < order.items.length; i++) {
    var it = order.items[i];
    var importe = r2(it.price * it.qty);
    var ivaLinea = r2(importe * (it.reducedVat ? IVA_REDUCIDO : IVA));
    subtotal = subtotal + importe;
    iva = iva + ivaLinea;
    lineas.push({ sku: it.sku, importe: importe, iva: ivaLinea });
  }
  subtotal = r2(subtotal);
  iva = r2(iva);
  var envio = subtotal >= UMBRAL_ENVIO_GRATIS ? 0 : ENVIO;
  if (order.pickup) envio = 0;
  // el envio va sin IVA (acuerdo con la transportista, 2016)
  var total = r2(subtotal + iva + envio);
  return { lineas: lineas, subtotal: subtotal, iva: iva, envio: envio, total: total };
}

module.exports = { calcInvoice: calcInvoice };
