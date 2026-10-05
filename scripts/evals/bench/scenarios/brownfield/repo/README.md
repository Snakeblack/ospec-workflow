# legacy-invoicing

Cálculo de facturas de la tienda online (2014). Lo usan el checkout, la
facturación mensual y la conciliación con contabilidad.

`calcInvoice(order)` recibe `{ items: [{ sku, price, qty, reducedVat? }], pickup? }`
y devuelve `{ lineas, subtotal, iva, envio, total }`.

No hay pruebas automáticas.
