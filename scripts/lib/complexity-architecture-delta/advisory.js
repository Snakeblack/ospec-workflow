"use strict";

const { sha256Fingerprint } = require("../canonical-json.js");

/**
 * Comparador canónico locale-independiente basado en unidades de código UTF-16.
 * Se usa en lugar de `localeCompare` porque los collators ICU (p. ej. `en` vs `da`)
 * asignan pesos variables a caracteres como `:` o a dígrafos como `aa`, alterando
 * el orden de `signal_id` y rompiendo la reproducibilidad de `report_id` y
 * `stableReportBytes` entre ejecuciones con distintas locales.
 *
 * @param {string} left - Primer identificador a comparar.
 * @param {string} right - Segundo identificador a comparar.
 * @returns {number} Negativo si left < right, positivo si left > right, 0 si son iguales.
 */
function compareCanonicalString(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function generateAdvisorySignals(alternatives) {
  return alternatives
    .filter((alternative) => alternative.classification === "new-abstraction")
    .map((alternative) => {
      const body = {
        code: "K6D_NEW_ABSTRACTION_REVIEW",
        question: `¿La nueva abstracción '${alternative.summary}' justifica su variabilidad y ruta de retirada?`,
        basis_refs: [alternative.alternative_id],
        authority: "advisory",
      };
      return { signal_id: sha256Fingerprint("complexity-architecture-signal:v1", body), ...body };
    })
    .sort((left, right) => compareCanonicalString(left.signal_id, right.signal_id));
}

module.exports = { generateAdvisorySignals };
