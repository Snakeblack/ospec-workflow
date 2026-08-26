# ADR-007: Separación estricta WorkResult != Candidate con integración previa a freezeCandidate

- Status: accepted
- Number: 007 (matches filename `adr-20260825-007-*.md`; not change-local ADR-002)
- Change: k4b-repair-shadow-execution
- Refined-by: k4b-correctness-remediation (local ADR-003)
- Date: 2026-08-25

## Context

La capa K6a produce `WorkResult` como evidencia cruda del worker (diffs, inventario, logs). Para conformar la cadena criptográfica de identidades, se debe consolidar el estado sobre la base autorizada `SourceSnapshot` y emitir un `Candidate` v2 inmutable. Integrar todos los WorkResults al final impide que un dependiente ejecute el resultado material de su predecesor; congelar por nodo confundiría bases intermedias con Candidates promovibles.

## Decision

Establecer que `WorkResult` es evidencia cruda y nunca un `Candidate`. `patch-integrator.js` valida hunks (contexto, deletion, counts, overlaps), modos de archivo y que los diffs pertenezcan a `WorkOrder.allowed_paths` del productor, aplica cada parche de forma incremental sobre la base efectiva del nodo, y conserva árbol/modos/diff canónico para dependientes. Invocar `freezeCandidate()` de K3 una sola vez al completar el grafo, con el árbol final, modos reenviados y `base_tree` del SourceSnapshot original. Conflictos de predecesores sobre el mismo contexto fallan cerrados.

## Alternatives

- Que K6a emita directamente el CandidateId: descartado porque acopla la capa de worker con la semántica de Candidate v2 y rompe la separación de responsabilidades.
- Tratar WorkResult como candidato evaluable: descartado por falta de consolidación con la base autorizada y digest Merkle global.
- Integración diferida de todos los parches al final: descartada porque no propaga material a dependientes.
- Candidate por nodo: descartado porque expone identidades intermedias sin autoridad de promoción.
- Aplicación tolerante de hunks: descartada porque oculta divergencias de contexto.

## Consequences

Garantiza la trazabilidad criptográfica de 4 identidades (`SourceSnapshotId` → `WorkOrderId` → `WorkResultId` → `CandidateId`) y reproducibilidad estricta. Los errores de contexto, eliminación, modo, containment o conflicto aparecen antes de ejecutar dependientes. K3 conserva la responsabilidad exclusiva de CandidateId. Reversible vía `git revert`.
