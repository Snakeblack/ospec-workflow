# ADR-001: Despacho topológico y ciclo de vida de workspace efímero por nodo vía K6a

- Status: proposed
- Change: k4b-repair-shadow-execution
- Date: 2026-08-25

## Context

La orquestación shadow de Repair necesita ejecutar órdenes de trabajo (`WorkOrder` v2) derivadas de un `ExecutionGraph` compilado. Para garantizar reproducibilidad y prevenir fugas de estado entre nodos dependientes o independientes, se debe definir el ciclo de vida y aislamiento del espacio de trabajo.

## Decision

Despachar las órdenes de trabajo en orden topológico estricto asignando a cada nodo un workspace aislado efímero gestionado exclusivamente a través de las primitivas de K6a (`createWorkspace`, `materializeSourceSnapshot`, `disposeWorkspace`). La ejecución de comandos se delega a `executeWorkOrder` bajo aislamiento verificado (`isolationReported === "enforced"`).

## Alternatives

- Reutilizar un único workspace compartido entre todos los nodos: descartado por riesgo de contaminación cruzada y falta de aislamiento.
- Ejecución directa sobre el filesystem de producción: descartado porque violaría la no-mutación de la ejecución shadow.

## Consequences

Mayor robustez, contención garantizada y limpieza automática fail-closed ante cualquier error. Introduce coste I/O de materialización por nodo, mitigable mediante cápsulas mínimas de entrada. Reversible mediante refactor de orquestación.
