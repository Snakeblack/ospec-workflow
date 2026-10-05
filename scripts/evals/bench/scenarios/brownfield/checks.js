"use strict";

// Hidden checks for brownfield. They never enter the agent's workspace.
// The characterization values were produced by running the seed `src/invoice.js`.

const HISTORY = [
  {
    order: { items: [{ sku: "A", price: 3.33, qty: 3 }, { sku: "B", price: 1.15, qty: 7, reducedVat: true }, { sku: "C", price: 0.99, qty: 1 }] },
    expected: {
      lineas: [{ sku: "A", importe: 9.99, iva: 2.1 }, { sku: "B", importe: 8.05, iva: 0.81 }, { sku: "C", importe: 0.99, iva: 0.21 }],
      subtotal: 19.03, iva: 3.12, envio: 4.95, total: 27.1,
    },
  },
  {
    order: { items: [{ sku: "A", price: 25, qty: 2 }] },
    expected: { lineas: [{ sku: "A", importe: 50, iva: 10.5 }], subtotal: 50, iva: 10.5, envio: 0, total: 60.5 },
  },
  {
    order: { items: [{ sku: "A", price: 49.99, qty: 1 }] },
    expected: { lineas: [{ sku: "A", importe: 49.99, iva: 10.5 }], subtotal: 49.99, iva: 10.5, envio: 4.95, total: 65.44 },
  },
  {
    order: { items: [{ sku: "A", price: 12.5, qty: 1 }], pickup: true },
    expected: { lineas: [{ sku: "A", importe: 12.5, iva: 2.63 }], subtotal: 12.5, iva: 2.63, envio: 0, total: 15.13 },
  },
  {
    order: { items: [{ sku: "A", price: 0.105, qty: 1 }, { sku: "B", price: 0.105, qty: 1 }, { sku: "C", price: 19.99, qty: 3, reducedVat: true }] },
    expected: {
      lineas: [{ sku: "A", importe: 0.11, iva: 0.02 }, { sku: "B", importe: 0.11, iva: 0.02 }, { sku: "C", importe: 59.97, iva: 6 }],
      subtotal: 60.19, iva: 6.04, envio: 0, total: 66.23,
    },
  },
];

const calc = (kit, order) => kit.load("src/invoice.js").calcInvoice(order);
const hundred = (code) => ({ items: [{ sku: "A", price: 100, qty: 1 }], discountCode: code });

module.exports = [
  {
    id: "discount-applied",
    kind: "acceptance",
    describe: "VERANO10 discounts 10% and reports it in descuento",
    run(kit) {
      const invoice = calc(kit, hundred("VERANO10"));
      kit.assert.equal(invoice.descuento, 10);
      kit.assert.equal(invoice.total, 108.9);
    },
  },
  {
    id: "discount-before-vat",
    kind: "fact",
    fact: "F1",
    describe: "VAT is computed on the discounted base",
    run(kit) {
      kit.assert.equal(calc(kit, hundred("VERANO10")).iva, 18.9);
    },
  },
  {
    id: "shipping-after-discount",
    kind: "fact",
    fact: "F2",
    describe: "shipping is never discounted and the free-shipping threshold uses the discounted base",
    run(kit) {
      const invoice = calc(kit, { items: [{ sku: "A", price: 27, qty: 2 }], discountCode: "VERANO10" });
      kit.assert.equal(invoice.envio, 4.95);
      kit.assert.equal(invoice.iva, 10.21);
      kit.assert.equal(invoice.total, 63.76);
    },
  },
  {
    id: "case-insensitive-code",
    kind: "fact",
    fact: "F3",
    describe: "codes match regardless of case",
    run(kit) {
      const invoice = calc(kit, hundred("verano10"));
      kit.assert.equal(invoice.descuento, 10);
      kit.assert.equal(invoice.total, 108.9);
    },
  },
  {
    id: "unknown-code-throws",
    kind: "fact",
    fact: "F4",
    describe: "an unknown code throws instead of invoicing",
    run(kit) {
      kit.assert.throws(() => calc(kit, hundred("NOEXISTE")));
    },
  },
  {
    id: "history-unchanged",
    kind: "fact",
    fact: "F5",
    describe: "invoices without a code match the historical values to the cent",
    run(kit) {
      for (const { order, expected } of HISTORY) {
        const invoice = calc(kit, order);
        kit.assert.deepEqual(invoice.lineas.map(({ sku, importe, iva }) => ({ sku, importe, iva })), expected.lineas);
        for (const field of ["subtotal", "iva", "envio", "total"]) kit.assert.equal(invoice[field], expected[field], field);
        kit.assert.ok(invoice.descuento === undefined || invoice.descuento === 0);
      }
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
