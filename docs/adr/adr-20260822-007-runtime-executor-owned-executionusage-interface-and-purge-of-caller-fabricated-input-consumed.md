# ADR-001: Runtime/Executor-Owned ExecutionUsage Interface and Purge of Caller-Fabricated input.consumed

- Status: accepted
- Change: k5-concurrency-hardening
- Date: 2026-08-22

## Context
En v2.45.12, `runKernelOperation` y el runtime aceptaban `input.consumed` suministrado por el llamador externo como autoridad para deducir el consumo presupuestario (`turns`, `commands`, `patches`, etc.). Un llamador malicioso o desalineado podía manipular o subdeclarar su consumo, eludiendo las cuotas autoritativas del sistema.

## Decision
Establecer que los deltas de consumo (`ExecutionUsage`) son propiedad exclusiva del runtime y del ejecutor de efectos. Extraer los consumos únicamente desde `result.usage` o `result.execution_usage` emitidos por `effectExecutor` al culminar el efecto. Purgar `input.consumed` como autoridad contable en `runKernelOperation`, `reduceLifecycle` y `createKernelRuntime`.

## Alternatives
- Mantener `input.consumed` como autoridad: Rechazado porque vulnera la frontera de confianza autoritativa de K5 al depender de la entrada no verificada del cliente.
- Estimación estática pre-ejecución: Rechazado porque los consumos reales (líneas cambiadas, tiempo de pared) solo se conocen tras la ejecución.

## Consequences
- Garantía de integridad autoritativa en el ledger de presupuestos.
- Los tests y entornos que simulen consumo deben devolver `result.usage` desde el mock de `effectExecutor`.
- Reversibilidad: Alta (encapsulado en la interfaz de `runKernelOperation`).

## Reconciliación K5 (2026-08-22)
La ausencia, forma inválida, número no finito o valor negativo de `usage`/`execution_usage` falla cerrado con `execution-usage-required`. Dimensiones omitidas en un objeto válido equivalen a cero; no hay estimación desde argumentos, `input.consumed`, líneas modificadas ni resultados históricos.
