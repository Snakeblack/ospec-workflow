"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const {
  recordLensResult,
  freezeFindings,
  nextLineageAction,
} = require("../../../../scripts/lib/review-lineage.js");
const { planLineageGate } = require("../../../../scripts/lib/review-gate-state.js");

const outDir = __dirname;
let lineage = JSON.parse(fs.readFileSync(path.join(outDir, "lineage.json"), "utf8"));

const readabilityFindings = [
  {
    severity: "CRITICAL",
    summary:
      "Semántica mid-op oculta en compareAndSwap vía midOpJournalOk sin comentario ni nombre claro.",
    acceptance_criteria:
      "Documentar invariante baseline state_digest + renombrar midOpJournalOk; comentar por qué expectedRevision puede diferir del head tras commitJournal.",
  },
  {
    severity: "CRITICAL",
    summary:
      "commitJournal no declara que muta journal fuera del chequeo de revisión del CAS.",
    acceptance_criteria:
      "JSDoc en commitJournal y compareAndSwap describiendo protocolo mid-op de dos fases (durabilidad pre-CAS + CAS tolerante a baseline).",
  },
  {
    severity: "WARNING",
    summary:
      "consumePermit tiene if vacío que mezcla expected_revision (permit) y revision (receipt).",
    acceptance_criteria:
      "Eliminar if vacío o rechazar de verdad; documentar que consume emite receipt post-CAS sin revalidar stale.",
  },
  {
    severity: "WARNING",
    summary:
      "transitionOffer como parámetro peer de permit sugiere que el offer autoriza.",
    acceptance_criteria:
      "Quitar transitionOffer de authorize* o JSDoc explícito: offer non-authorizing / solo offer-only reject.",
  },
  {
    severity: "WARNING",
    summary: "Loop de efectos en runKernelOperation anida más de 3 niveles.",
    acceptance_criteria:
      "Extraer helpers de barrier/interrupt para ≤3 niveles en el loop principal.",
  },
  {
    severity: "WARNING",
    summary:
      "Interrupt reescribe barrier executing→pre-effect sin comentario.",
    acceptance_criteria:
      "Comentar la justificación en el sitio o materializar estado ambiguo distinto de pre-effect.",
  },
  {
    severity: "SUGGESTION",
    summary:
      "Rama irreversible en reconcileEffect es idéntica a la no irreversible.",
    acceptance_criteria:
      "Colapsar ramas o implementar diferencia real alineada al comentario.",
  },
];

lineage = recordLensResult(lineage, {
  dimension: "readability",
  request_id: "result-readability-k21",
  expected_revision: lineage.revision,
  result: { findings: readabilityFindings },
});

fs.writeFileSync(path.join(outDir, "lineage.json"), JSON.stringify(lineage, null, 2));
fs.writeFileSync(
  path.join(outDir, "lens-readability.json"),
  JSON.stringify({ findings: readabilityFindings }, null, 2),
);

const planned = planLineageGate({ lineage });
console.log(
  JSON.stringify(
    {
      readability: lineage.lenses.readability.status,
      pending: Object.entries(lineage.lenses)
        .filter(([, l]) => l.selected && l.status !== "completed")
        .map(([k, l]) => [k, l.status]),
      next_action: planned.next_action,
      revision: lineage.revision,
    },
    null,
    2,
  ),
);
