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

/**
 * Reparte un importe a partes iguales. Cada persona paga la parte entera,
 * redondeada hacia abajo, y los céntimos sobrantes van de uno en uno a las
 * primeras personas en el orden dado.
 */
function repartir(importe, personas) {
  if (!Number.isInteger(importe) || importe < 0) throw new Error(`importe no válido: ${importe}`);
  if (!Array.isArray(personas) || personas.length === 0) throw new Error("hace falta al menos una persona");
  if (new Set(personas).size !== personas.length) throw new Error("hay personas repetidas");
  const parte = Math.floor(importe / personas.length);
  let sobrante = importe - parte * personas.length;
  const cuotas = {};
  for (const persona of personas) {
    cuotas[persona] = parte + (sobrante > 0 ? 1 : 0);
    if (sobrante > 0) sobrante -= 1;
  }
  return cuotas;
}

module.exports = { totalPorPersona, totalDelGrupo, repartir };
