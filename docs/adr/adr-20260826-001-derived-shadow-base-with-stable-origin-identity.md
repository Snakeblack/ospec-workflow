# ADR-001: Base shadow derivada con identidad de origen estable

- Status: accepted
- Change: k4b-correctness-remediation
- Date: 2026-08-25

## Context
Los nodos dependientes deben consumir materialmente los cambios integrados de sus predecesores sin compartir workspace. Candidate v2, WorkOrders y workspaces deben continuar ligados al SourceSnapshot original.

## Decision
Mantener un `EffectiveShadowBase` interno por nodo, derivado determinísticamente del SourceSnapshot original y del cierre transitivo de predecesores. K6a verificará sus bytes y digest al materializar, sin emitir un SourceSnapshotId derivado; cada nodo recibirá un workspace nuevo.

## Alternatives
- Workspace mutable compartido: rechazado por aliasing y contaminación entre nodos.
- SourceSnapshot sintético por nodo: rechazado porque rompe WorkOrderId y el anclaje de Candidate.
- Propagación solo lógica: rechazada porque N2 no observaría el código producido por N1.

## Consequences
La ejecución dependiente es material y reproducible; el freeze final conserva `candidate.base_tree` original. Aumentan la materialización y el estado en memoria, y los conflictos de predecesores fallan cerrados.
