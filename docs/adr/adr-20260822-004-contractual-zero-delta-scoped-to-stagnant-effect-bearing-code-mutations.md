# ADR-004: Contractual Zero-Delta Scoped to Stagnant Effect-Bearing Code Mutations

- Status: proposed
- Change: k5-core-remediation
- Date: 2026-08-22

## Context
La evaluación de zero-delta no diferenciaba con claridad entre transiciones legítimas del ciclo de vida (que avanzan fases sin modificar archivos en disco) y mutaciones de código fallidas/vacías, arriesgando penalizaciones dobles de turnos e intentos sobre operaciones legítimas de solo lectura o control.

## Decision
Delimitar contractualmente la detección y penalización de zero-delta (`node.turns -= 1`, `authority_budget.effect_attempts -= 1`, y evento journal `zero-delta-attempt`) exclusivamente a operaciones mutantes de archivos/código donde el estado semántico no avanzó (`reduced.outcome === "unchanged"`) y se modificaron 0 archivos/líneas.

## Alternatives
- Penalizar cualquier paso con 0 archivos modificados: Rechazado porque penalizaría incorrectamente lecturas de estado, diagnósticos y transiciones de ciclo de vida.
- Penalizar únicamente turnos de nodo: Rechazado porque las mutaciones de código vacías consumen intentos de autoridad en la política de K5.

## Consequences
- Distinción limpia entre progreso de ciclo de vida (`lifecycleProgress`) y mutaciones de archivos (`effectProgress`).
- Prevención de penalizaciones injustas en transiciones legítimas de control y diagnóstico.
- Reversibilidad: Alta.
