# ADR-005: Zero-Delta Accounting Bounded to Non-Advancing Effect Mutations

- Status: proposed
- Change: k5-authority-boundary-and-cas-concurrency-remediation
- Date: 2026-08-20

## Context
La contabilidad post-efecto evaluaba `isZeroDeltaMutation()` de forma genérica en cualquier operación donde no se modificaran archivos, penalizando indebidamente operaciones legítimas de ciclo de vida (como `fail`, `replan`, `escalate`, `stop`) que avanzan el estado del reducer (`reduced.outcome !== "unchanged"`) sin tocar archivos del sistema.

## Decision
Acotar la evaluación de zero-delta exclusivamente a operaciones de mutación de código (`repair`, mutaciones de parches) que no produzcan avance semántico (`reduced.outcome === "unchanged"` y 0 archivos/líneas modificados), aplicando contabilidad dual (`node.turns` y `authority_budget.effect_attempts`) y persistiendo un evento durable `zero-delta-attempt` en el journal antes del commit CAS.

## Alternatives
- Penalizar cualquier operación con 0 archivos modificados: Rechazado porque penaliza transiciones legítimas de ciclo de vida e inspecciones de solo lectura.
- Descontar únicamente turnos de nodo: Rechazado porque permite a los agentes ejecutar bucles infinitos de autoreparación vacía sin agotar los intentos de autoridad.

## Consequences
- Contabilidad de zero-delta precisa y honesta: previene bucles de autoreparación sin progreso sin penalizar transiciones legítimas del ciclo de vida.
- Reversibilidad: Alta (ajuste en las condiciones de evaluación de zero-delta post-efecto).
