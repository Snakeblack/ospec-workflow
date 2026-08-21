# ADR-004: Contabilidad Dual Zero-Delta con Evento Durable en Journal

- Status: accepted
- Change: k5-authoritative-enforcement-and-cas-remediation
- Date: 2026-08-20

## Context
Cuando un paso de mutación ejecutaba efectos pero no producía avance semántico (0 archivos modificados, 0 líneas cambiadas, o hash idéntico), la contabilidad previa solo decrementaba `node.budget.turns`, omitiendo `state.authority_budget.effect_attempts` y sin persistir un evento durable en el journal antes del commit CAS.

## Decision
Detectar mutaciones zero-delta post-efecto mediante `isZeroDeltaMutation()` y aplicar contabilidad dual: decrementar en simultáneo `node.budget.turns` y `state.authority_budget.effect_attempts`, y persistir un registro durable con `kind: "zero-delta-attempt"` en el journal del Authority Store antes del commit CAS.

## Alternatives
- Descontar únicamente el contador de turnos del nodo: Rechazado porque permite a los agentes ejecutar bucles infinitos de parches vacíos consumiendo turnos sin agotar los intentos de autoridad.
- Emitir solo un evento volátil en memoria: Rechazado porque se pierde ante reinicios o recuperación de fallos y no queda auditado en el journal.

## Consequences
- Cumplimiento estricto de la invariante `inv-k5-zero-delta-consumption` y prevención de estancamiento silencioso en bucles de autoreparación.
- Requiere persistir el registro en el journal antes del commit CAS del estado.
- Reversibilidad: Alta (ajuste en la lógica de post-efectos y reducción de presupuestos).
