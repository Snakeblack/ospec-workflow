# ADR-004: Replay criptográficamente íntegro en Assurance Graph

- Status: proposed
- Change: k6b-trusted-evidence-replay-closure
- Date: 2026-08-28

## Context
La validación en `replayAssuranceGraph` (`validateReplayRecords`) omitía la recomputación de `computeEvidenceId` y la invocación de `evaluateProvenanceSufficiency` durante la revalidación de evidencias, lo que permitía persistir o reproducir grafos con identificadores desfasados o procedencias débiles sin detección.

## Decision
Extender `validateReplayRecords` para recomputar exhaustivamente el digest de bytes con `digestRawBytes(bytes)`, recomputar `computeEvidenceId(record, bytes)`, contrastar ambos contra `record.digest` y `record.evidence_id`, y ejecutar `evaluateProvenanceSufficiency(record)`. Cualquier discrepancia, mutación de bytes o insuficiencia de procedencia detona inmediatamente un fallo `GRAPH_DIVERGENCE`.

## Alternatives
- Revalidar únicamente la conformidad sintáctica contra el esquema JSON — rechazado: no detecta sustitución de hashes ni inconsistencias en identificadores derivados.
- Asumir que los identificadores persistidos son válidos por construcción — rechazado: ignora posibles corrupciones o modificaciones en el medio de persistencia.

## Consequences
- Facilita: Replay determinista e inmutable donde cualquier manipulación o degradación de evidencias es detectada y rechazada.
- Dificulta: El proceso de replay debe recibir o tener acceso a los bytes de las evidencias para la recomputación criptográfica.
- Reversibilidad: Alta (ajustable en `assurance-graph/index.js`).
