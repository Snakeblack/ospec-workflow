# ADR-002: Persistir aceptación antes de clasificar

- Status: proposed
- Change: orchestrator-intent-briefing
- Date: 2026-08-27

## Context

El briefing no puede fabricar `openspec/changes/{name}/` mientras espera, pero una
aceptación debe quedar durable antes de `classifyChange`.

## Decision

No escribir durante briefing o correcciones. Tras aceptar, permitir una primera
creación mínima de `state.yaml` cuyo único hecho de workflow sea la aprobación
`intent-briefing`; luego clasificación y route completan el estado por merge. Abort
no crea directorio ni invoca clasificación.

## Alternatives

- Crear estado pendiente antes de preguntar: viola ausencia de artefactos.
- Clasificar antes de persistir: pierde el orden auditable.
- Confiar en memoria conversacional: no es una fuente válida de aprobación.

## Consequences

Se preservan auditabilidad y abort limpio. El bootstrap exige que los escritores
posteriores acepten estado parcial y hagan read-merge-write; el rollback deja las
entradas existentes como auditoría inerte.
