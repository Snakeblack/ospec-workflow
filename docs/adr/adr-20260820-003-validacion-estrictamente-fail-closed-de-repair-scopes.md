# ADR-002: Validacion Estrictamente Fail-Closed de Repair Scopes

- Status: proposed
- Change: k5-runtime-enforcement-and-wiring-remediation
- Date: 2026-08-20

## Context

`validateRepairScope()` permitía que scopes vacíos `{}` o desprovistos de arrays pasaran abiertos (`ok: true`) cuando existían mutaciones o identificadores de nodo objetivo, creando el riesgo de mutaciones no acotadas durante reparaciones automáticas.

## Decision

Reescribir `validateRepairScope()` en `scripts/lib/failure-recovery.js` para operar estrictamente fail-closed (`ok: false`) si `scope` es `{}` o `undefined` ante presencia de `targetNodeId`, `modifiedPaths` o `resolvedFindingIds`, integrando la validación en `runKernelOperation()` previa a la ejecución del efecto y previo al commit CAS.

## Alternatives

- Permitir scopes vacíos por defecto con advertencias en log: rechazada por vulnerar la contención de blast radius en reparaciones.
- Validación solo en tiempo de compilación estática: rechazada porque no intercepta mutaciones dinámicas en tiempo de ejecución.

## Consequences

- Facilita: Garantía estricta de que ninguna reparación automatizada muta fuera de sus rutas autorizadas ni resuelve findings no congelados.
- Dificulta: Los tests y arneses de reparación deben declarar explícitamente scopes válidos y completos.
- Reversibilidad: Alta — función pura y validación determinista pre-CAS.
