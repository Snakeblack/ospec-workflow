# ADR-004: Replay criptográficamente íntegro en Assurance Graph

- Status: accepted
- Change: k6b-trusted-evidence-replay-closure
- Date: 2026-08-28

## Context
La validación en `replayAssuranceGraph` (`validateReplayRecords`) omitía la recomputación de `computeEvidenceId` y la invocación de `evaluateProvenanceSufficiency` durante la revalidación de evidencias, lo que permitía persistir o reproducir grafos con identificadores desfasados o procedencias débiles sin detección.

## Decision
Extender `validateReplayRecords` para exigir bytes inline o un `observation_blob_id` content-addressed resoluble, recomputar exhaustivamente el digest con `digestRawBytes(bytes)`, recomputar `computeEvidenceId(record, bytes)`, contrastar ambos contra `record.digest` y `record.evidence_id`, y ejecutar `evaluateProvenanceSufficiency(record)`. La ausencia de material de observación, una referencia no resoluble, cualquier discrepancia, mutación de bytes o insuficiencia de procedencia detona inmediatamente `GRAPH_DIVERGENCE`; no existe modo de replay criptográfico parcial.

## Alternatives
- Revalidar únicamente la conformidad sintáctica contra el esquema JSON — rechazado: no detecta sustitución de hashes ni inconsistencias en identificadores derivados.
- Asumir que los identificadores persistidos son válidos por construcción — rechazado: ignora posibles corrupciones o modificaciones en el medio de persistencia.

## Consequences
- Facilita: Replay determinista e inmutable donde cualquier manipulación o degradación de evidencias es detectada y rechazada.
- Dificulta: El proceso de replay debe recibir o tener acceso a los bytes de las evidencias para la recomputación criptográfica.
- Reversibilidad: Alta (ajustable en `assurance-graph/index.js`).
