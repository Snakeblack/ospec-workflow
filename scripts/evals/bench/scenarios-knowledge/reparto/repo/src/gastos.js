"use strict";

// Gastos compartidos de un grupo. Todos los importes son céntimos enteros.
// Un gasto es { concepto, importe, pagadoPor }.

/** Lo que ha pagado cada persona, { [persona]: céntimos }, en el orden en que aparecen. */
function totalPorPersona(gastos) {
  const totales = {};
  for (const gasto of gastos) {
    totales[gasto.pagadoPor] = (totales[gasto.pagadoPor] || 0) + gasto.importe;
  }
  return totales;
}

/** La suma de todos los gastos del grupo. */
function totalDelGrupo(gastos) {
  return gastos.reduce((total, gasto) => total + gasto.importe, 0);
}

module.exports = { totalPorPersona, totalDelGrupo };
