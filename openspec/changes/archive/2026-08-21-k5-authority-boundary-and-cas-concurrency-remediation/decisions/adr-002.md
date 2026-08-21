# ADR-002: Terminal Control Transitions (`escalate`, `stop`) Commit via CAS Under Budget Exhaustion

- Status: proposed
- Change: k5-authority-boundary-and-cas-concurrency-remediation
- Date: 2026-08-20

## Context
El preflight de `isBudgetExhausted()` en `runKernelOperation` bloqueaba indiscriminadamente todas las operaciones cuando los presupuestos se agotaban, impidiendo que las operaciones de control terminal (`escalate`, `stop`) consolidaran su estado y ejecutaran el commit CAS en el Authority Store.

## Decision
Discriminar y exceptuar las operaciones terminales de control (`escalate`, `stop`) del bloqueo preflight de agotamiento de presupuesto en `runKernelOperation`, permitiendo que avancen a `reduceLifecycle` y ejecuten el commit CAS para persistir el estado terminal consolidado en el Authority Store.

## Alternatives
- Bloquear toda operación ante agotamiento presupuestario: Rechazado porque deja el sistema congelado en estado fallido sin persistir el desenlace terminal.
- Abortar `escalate`/`stop` en memoria sin commit CAS: Rechazado porque deja el Authority Store en un estado inconsistente no terminal.

## Consequences
- Las transiciones terminales `escalate` y `stop` garantizan persistencia durable en CAS incluso cuando todos los presupuestos de nodo y autoridad estén en cero.
- Reversibilidad: Alta (ajuste de excepción en el validador preflight de `runKernelOperation`).
