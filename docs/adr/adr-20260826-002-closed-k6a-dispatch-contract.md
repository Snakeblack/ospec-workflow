# ADR-002: Despacho K6a mediante contrato cerrado

- Status: accepted
- Change: k4b-correctness-remediation
- Date: 2026-08-25

## Context
El spread de `executorOptions` permite reemplazar autoridad del orquestador y `executorFn` elude completamente K6a. La ejecución necesita inputs por nodo sin ceder WorkOrder, workspace, transporte, aislamiento ni budget.

## Decision
Construir `executeWorkOrder({ ... })` campo a campo. La única allowlist de `executorOptionsByNode` será `commands`, `command`, `args`, `signal` y `declaredTargets`; cualquier otra clave falla con `UNSAFE_EXECUTOR_OPTION`. `executorFn` nunca se invoca.

## Alternatives
- Spread abierto de opciones: rechazado por sobrescritura de autoridad.
- Lista de denegación: rechazada porque nuevas opciones K6a quedarían permitidas por defecto.
- Executor inyectable para tests: rechazado porque no demuestra K6a real.

## Consequences
El contrato es auditable y fail-closed, y los tests deben usar WorkerTransport/WorkerIsolation reales. Añadir un nuevo input de ejecución requerirá una decisión explícita y una actualización de la allowlist.
