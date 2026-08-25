# ADR-002: Separación estricta WorkResult != Candidate con integración previa a freezeCandidate

- Status: proposed
- Change: k4b-repair-shadow-execution
- Date: 2026-08-25

## Context

La capa K6a produce `WorkResult` como evidencia cruda del worker (diffs, inventario, logs). Para conformar la cadena criptográfica de identidades, se debe consolidar el estado sobre la base autorizada `SourceSnapshot` y emitir un `Candidate` v2 inmutable.

## Decision

Establecer que `WorkResult` es evidencia cruda y nunca un `Candidate`. `patch-integrator.js` valida que los diffs pertenezcan a `allowed_paths`, aplica los parches deterministamente sobre el árbol base en memoria, y delega la emisión de `CandidateId` exclusivamente a `freezeCandidate()` de K3.

## Alternatives

- Que K6a emita directamente el CandidateId: descartado porque acopla la capa de worker con la semántica de Candidate v2 y rompe la separación de responsabilidades.
- Tratar WorkResult como candidato evaluable: descartado por falta de consolidación con la base autorizada y digest Merkle global.

## Consequences

Garantiza la trazabilidad criptográfica de 4 identidades (`SourceSnapshotId` → `WorkOrderId` → `WorkResultId` → `CandidateId`) y reproducibilidad estricta. Reversible vía `git revert`.
