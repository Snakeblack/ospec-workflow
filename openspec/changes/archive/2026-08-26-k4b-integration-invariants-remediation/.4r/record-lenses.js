"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { recordLensResult, freezeFindings } = require("../../../../scripts/lib/review-lineage.js");
const { planLineageGate } = require("../../../../scripts/lib/review-gate-state.js");

const dir = __dirname;
let lineage = JSON.parse(fs.readFileSync(path.join(dir, "lineage.json"), "utf8"));
const { requestIds } = JSON.parse(fs.readFileSync(path.join(dir, "request-ids.json"), "utf8"));

const results = {
  risk: { findings: [] },
  reliability: {
    findings: [
      {
        severity: "WARNING",
        summary: "normalizeCapsuleInputs/computeWorkOrderId rechazan [] , no-array, glob, traversal y absolutos, pero execution-identities/index.test.js solo cubre capsule_inputs omitido.",
        acceptance_criteria: "Añadir tests donde computeWorkOrderId lance empty-capsule-inputs para [] e invalid-capsule-inputs para no-array, src/**, ../secret y /abs/path.",
      },
      {
        severity: "WARNING",
        summary: "materializeSourceSnapshot solo comprueba Array.isArray(capsule_inputs); [] materializa cero archivos pese al mensaje de array no vacío.",
        acceptance_criteria: "Test de que materializeSourceSnapshot lanza antes de escribir cuando capsule_inputs es [].",
      },
      {
        severity: "WARNING",
        summary: "buildComparisonProjection canonicaliza execution_metrics con JSON.stringify tras expandir telemetría; métricas equivalentes con distinto orden de claves pueden false-divergir.",
        acceptance_criteria: "Test de que compareShadowExecution sigue en match:true con graphTelemetry semánticamente igual y claves en distinto orden, o usar serialización estable.",
      },
      {
        severity: "SUGGESTION",
        summary: "uniqueItems:true de capsule_inputs v2 y la rama uniqueItems del validador no tienen fixture ni test de unidad.",
        acceptance_criteria: "Fixture o test de validador donde [src/app.js, src/app.js] falle con rule uniqueItems.",
      },
    ],
  },
  resilience: { findings: [] },
  readability: {
    findings: [
      {
        severity: "WARNING",
        summary: "detectPredecessorContextConflicts mezcla dos firmas: si el primer arg es array, el segundo (predecessors) se usa como ancestorClosure; el {node_id} de la forma de tres args no se lee. Bucles a 4+ niveles en el mismo cuerpo.",
        acceptance_criteria: "Una sola firma con nombres que coincidan con el uso (entries, ancestorClosure). El nodo actual o no se pasa o se usa. Extraer el cruce hunk/prev para no superar 3 niveles de anidación. Comentario breve del remap legado si se conserva.",
      },
      {
        severity: "WARNING",
        summary: "isDirectoryOrGlobRule no comunica el intent: true también para rutas no concretas (absolutas, travesía, vacías), no solo directorios/globs; resolveCapsuleInputsForNode duplica isConcreteRelativeCapsulePath.",
        acceptance_criteria: "Renombrar a un predicado de expansión contra inventario (p. ej. requiresInventoryExpansion) o hacer que solo cubra glob/directorio. Quitar la guarda redundante o documentar por qué hace falta.",
      },
      {
        severity: "WARNING",
        summary: "buildComparisonProjection, sin nodes, devuelve solo {kind}. El fail-closed es la ausencia de claves; steps:[] pasaría isValidComparisonProjection.",
        acceptance_criteria: "Sentinela explícito inválido (o documentar que omitir REQUIRED_DIMENSIONS es el rechazo). No tratar arrays vacíos como proyección válida si el grafo falta.",
      },
      {
        severity: "WARNING",
        summary: "parseUnifiedDiffs sigue tras hunk malformado y luego acepta diffs solo-modo mientras rechaza create/delete solo-cabecera, sin comentario de la excepción ni de por qué no retorna al primer error.",
        acceptance_criteria: "Comentario (o retorno inmediato) que explique: (1) mode-only sin hunks es válido; (2) create/delete header-only no; (3) si se sigue parseando, el error original no se pisa en silencio.",
      },
      {
        severity: "WARNING",
        summary: "El orquestador, si el baseline no es proyección, usa baseline.executionGraph || executionGraph y baseline.candidate || baseline, proyectando el baseline sobre el grafo shadow.",
        acceptance_criteria: "No reutilizar el executionGraph shadow salvo decisión documentada. Formas de baseline separadas (proyección vs artefactos) con nombres distintos, sin fallback silencioso de topología.",
      },
    ],
  },
};

for (const dimension of ["risk", "reliability", "resilience", "readability"]) {
  fs.writeFileSync(path.join(dir, `lens-${dimension}.json`), `${JSON.stringify(results[dimension], null, 2)}\n`);
  lineage = recordLensResult(lineage, {
    dimension,
    request_id: requestIds[dimension],
    expected_revision: lineage.revision,
    result: results[dimension],
  });
}

lineage = freezeFindings(lineage, {
  request_id: `freeze-${crypto.randomBytes(8).toString("hex")}`,
  expected_revision: lineage.revision,
});

const counts = { BLOCKER: 0, CRITICAL: 0, WARNING: 0, SUGGESTION: 0 };
for (const f of lineage.findings) counts[f.severity] += 1;
const findings_summary = `${counts.BLOCKER} BLOCKER, ${counts.CRITICAL} CRITICAL, ${counts.WARNING} WARNING, ${counts.SUGGESTION} SUGGESTION`;

const existingGate = JSON.parse(fs.readFileSync(path.join(dir, "gate.json"), "utf8"));
const gate = {
  ...existingGate,
  status: lineage.status,
  lineage,
  findings_summary,
};

fs.writeFileSync(path.join(dir, "lineage.json"), `${JSON.stringify(lineage, null, 2)}\n`);
fs.writeFileSync(path.join(dir, "gate.json"), `${JSON.stringify(gate, null, 2)}\n`);
fs.writeFileSync(path.join(dir, "findings-summary.json"), `${JSON.stringify({ findings_summary, findings: lineage.findings }, null, 2)}\n`);

const planned = planLineageGate({
  lineage,
  observed_candidate_id: lineage.current_candidate_id,
  downstream_gate: "archive",
});

const statePath = path.join(dir, "..", "state.yaml");
let yaml = fs.readFileSync(statePath, "utf8");
yaml = yaml.replace(/gates:\n  4r-review-gate: .*\n/, `gates:\n  4r-review-gate: ${JSON.stringify(gate)}\n`);
fs.writeFileSync(statePath, yaml);

console.log(JSON.stringify({
  lineage_status: lineage.status,
  terminal_reason: lineage.terminal_reason,
  revision: lineage.revision,
  findings_summary,
  archive_allowed: planned.archive_allowed,
  next_action: planned.next_action,
}, null, 2));
