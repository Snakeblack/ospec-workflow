# ADR-002: Recálculo Determinista de Candidatos en Evaluation Relation

- Status: proposed
- Change: k3-identities-remediation
- Date: 2026-08-07

## Context
`evaluateCandidateRelation` confiaba previamente en la propiedad `candidate_id` declarada en los objetos de entrada. Un cliente o atacante podía adjuntar un `candidate_id` válido de un estado verificado previamente sobre un objeto modificado no verificado, logrando suplantación de identidad.

## Decision
Modificar `evaluateCandidateRelation` para recalcular canónicamente los digests de baseline y target desde sus payloads frozen usando `computeCandidateId`. Si un `candidate_id` declarado está presente pero no coincide con el digest recalculado, se emite un error `DECLARED_ID_MISMATCH` asignando `relation: "unknown"` y `action: "stop"`.

## Alternatives
- Confiar implícitamente en `candidate_id` si está presente (rechazado: vulnerabilidad severa a ataques de spoofing).
- Emitir una advertencia silenciosa y continuar con el ID recalculado (rechazado: viola el principio fail-closed).

## Consequences
- Previene de forma determinista cualquier intento de suplantación de identidad.
- Añade un costo computacional menor de hasheo SHA-256 al evaluar relaciones.
