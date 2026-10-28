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

function validarImporte(importe) {
  if (!Number.isInteger(importe) || importe < 0) throw new Error(`importe no válido: ${importe}`);
}

/**
 * Regla de todo reparto: cada persona paga la parte entera de lo suyo,
 * redondeada hacia abajo, y los céntimos sobrantes van de uno en uno a las
 * primeras personas con peso, en el orden dado.
 */
function repartirSegun(importe, partes) {
  const pesoTotal = partes.reduce((total, [, peso]) => total + peso, 0);
  const cuotas = {};
  let sobrante = importe;
  for (const [persona, peso] of partes) {
    cuotas[persona] = Math.floor((importe * peso) / pesoTotal);
    sobrante -= cuotas[persona];
  }
  const orden = partes.filter(([, peso]) => peso > 0).map(([persona]) => persona);
  for (const persona of orden) {
    if (sobrante === 0) break;
    cuotas[persona] += 1;
    sobrante -= 1;
  }
  return cuotas;
}

/** Reparte un importe a partes iguales. */
function repartir(importe, personas) {
  validarImporte(importe);
  if (!Array.isArray(personas) || personas.length === 0) throw new Error("hace falta al menos una persona");
  if (new Set(personas).size !== personas.length) throw new Error("hay personas repetidas");
  return repartirSegun(importe, personas.map((persona) => [persona, 1]));
}

/** Reparte un importe según el peso de cada persona, { [persona]: peso }. */
function repartirPorPesos(importe, pesos) {
  validarImporte(importe);
  const partes = Object.entries(pesos || {});
  if (partes.some(([, peso]) => !Number.isInteger(peso) || peso < 0)) throw new Error("los pesos son enteros no negativos");
  if (!partes.some(([, peso]) => peso > 0)) throw new Error("hace falta al menos un peso mayor que 0");
  return repartirSegun(importe, partes);
}

module.exports = { totalPorPersona, totalDelGrupo, repartir, repartirPorPesos };
