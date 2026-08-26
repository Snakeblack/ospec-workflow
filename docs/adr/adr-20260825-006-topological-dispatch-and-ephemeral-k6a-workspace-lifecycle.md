# ADR-006: Despacho topológico y ciclo de vida de workspace efímero por nodo vía K6a

- Status: accepted
- Number: 006 (matches filename `adr-20260825-006-*.md`; not change-local ADR-001)
- Change: k4b-repair-shadow-execution
- Refined-by: k4b-correctness-remediation (local ADR-001, ADR-002)
- Date: 2026-08-25

## Context

La orquestación shadow de Repair necesita ejecutar órdenes de trabajo (`WorkOrder` v2) derivadas de un `ExecutionGraph` compilado. Para garantizar reproducibilidad y prevenir fugas de estado entre nodos dependientes o independientes, se debe definir el ciclo de vida y aislamiento del espacio de trabajo. El spread de `executorOptions` y un `executorFn` inyectable permiten reemplazar autoridad del orquestador o eludir K6a.

## Decision

Despachar las órdenes de trabajo en orden topológico estricto asignando a cada nodo un workspace aislado efímero gestionado exclusivamente a través de las primitivas de K6a (`createWorkspace`, `materializeSourceSnapshot`, `disposeWorkspace`). La ejecución se invoca con `executeWorkOrder({ ... })` construido campo a campo: `executorOptionsByNode` solo admite `commands`, `command`, `args`, `signal` y `declaredTargets`; cualquier otra clave falla con `UNSAFE_EXECUTOR_OPTION` antes del despacho; `executorFn` nunca se invoca. Los nodos dependientes materializan un `EffectiveShadowBase` derivado (bytes + digest) sin emitir un `SourceSnapshotId` sintético; cada nodo recibe un workspace nuevo. El aislamiento reportado debe ser `enforced`.

## Alternatives

- Reutilizar un único workspace compartido entre todos los nodos: descartado por riesgo de contaminación cruzada y falta de aislamiento.
- Ejecución directa sobre el filesystem de producción: descartado porque violaría la no-mutación de la ejecución shadow.
- Spread abierto de opciones o lista de denegación: descartado porque permite sobrescribir autoridad o admite nuevas claves K6a por defecto.
- Executor inyectable para tests: descartado porque no demuestra K6a real.
- SourceSnapshot sintético por nodo: descartado porque rompe WorkOrderId y el anclaje de Candidate.

## Consequences

Mayor robustez, contención garantizada y limpieza automática fail-closed ante cualquier error. El contrato de despacho es auditable; añadir un input de ejecución exige actualizar la allowlist. Introduce coste I/O de materialización por nodo, mitigable mediante cápsulas mínimas de entrada. Reversible mediante refactor de orquestación.
