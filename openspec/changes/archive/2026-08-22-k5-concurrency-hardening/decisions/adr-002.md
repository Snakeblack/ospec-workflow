# ADR-002: Keyed Carry-Over Partitioning by `${subjectId}:${nodeId}` for Concurrent Node Isolation

- Status: accepted
- Change: k5-concurrency-hardening
- Date: 2026-08-22

## Context
El acumulador de carry-over en `createKernelRuntime` (`pendingCarryOver`) utilizaba como clave única el `subjectId`. Cuando múltiples nodos (`N1` y `N2`) ejecutaban operaciones concurrentes bajo el mismo sujeto, si el nodo `N1` sufría un conflicto CAS tras consumir presupuesto, el carry-over acumulado penalizaba y reducía indebidamente las cuotas del nodo `N2`, generando falsos positivos de agotamiento presupuestario.

## Decision
Particionar `pendingCarryOver` mediante una clave compuesta estricta `${subjectId}:${nodeId}` (con fallback a `${subjectId}:default` si `node_id` no está presente). Aislar la acumulación de carry-over, la validación preflight de permisos (`issuePermitForSelectedTransition`) y la deducción en reintentos exclusivamente por partición de nodo.

## Alternatives
- Carry-over global a nivel de sujeto: Rechazado porque produce contaminación cruzada entre tareas concurrentes y bloqueos espurios.
- Paso efímero de carry-over en el contexto del caller: Rechazado porque los reintentos asíncronos desacoplados requieren persistencia gestionada por el runtime.

## Consequences
- Aislamiento completo de presupuestos entre nodos concurrentes bajo el mismo sujeto.
- Cumplimiento estricto de `REQ-operation-permits-005` y `REQ-execution-budgets-003`.
- Reversibilidad: Alta (encapsulado en `createKernelRuntime`).
