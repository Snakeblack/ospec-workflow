# ADR-002: Contrato Canónico de verify_outcome y Gating Estricto en PhaseCompletionReducer

- Status: proposed
- Change: remediate-cx1-envelope-projection
- Date: 2026-09-14

## Context
`PhaseCompletionReducer` avanzaba el estado de un cambio a `verified` siempre que el envelope exterior de la fase de verificación indicara `status: "success"`, salvo que se especificara explícitamente `verify_outcome: "FAIL"`. Esto provocaba que verificaciones sin veredicto explícito o con valores omitidos se marcaran erróneamente como verificadas.

## Decision
Definir la propiedad opcional `verify_outcome` (`PASS`, `PASS WITH WARNINGS`, `FAIL`) en el esquema `result-envelope/v1`, exigir su emisión obligatoria en `skills/sdd-verify/SKILL.md`, y condicionar la proyección de `status: "verified"` en `PhaseCompletionReducer` a la presencia explícita de `PASS` o `PASS WITH WARNINGS`. Ante `FAIL`, omisión o valor inválido, proyectar `status: "blocked"`.

## Alternatives
- Mantener deducción heurística de fallo: descartado porque la ausencia de evidencia no equivale a una verificación aprobada.
- Bloquear en el schema la ausencia de verify_outcome: descartado para mantener el esquema genérico para las demás fases SDD.

## Consequences
Previene falsos positivos en la certificación de cambios. Obliga a `sdd-verify` a emitir un veredicto estructurado e inequívoco. Reversibilidad inmediata sin impacto destructivo.
