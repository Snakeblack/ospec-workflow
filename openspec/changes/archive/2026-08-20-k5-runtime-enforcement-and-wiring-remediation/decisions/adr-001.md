# ADR-001: Evaluador Unificado y Puro de Presupuestos isBudgetExhausted

- Status: proposed
- Change: k5-runtime-enforcement-and-wiring-remediation
- Date: 2026-08-20

## Context

Las cuotas de ejecución para las 6 dimensiones de nodo (`turns`, `patches`, `commands`, `wall_time_minutes`, `changed_lines`, `allowed_paths`) y las 4 de autoridad (`effect_attempts`, `authority_mutations`, `evidence_runs`, `review_sweeps`) se evaluaban de manera parcial y fragmentada en funciones disjuntas, arriesgando ejecuciones descontroladas o podados asimétricos.

## Decision

Implementar una función pura canonical `isBudgetExhausted(budget, consumed, options)` en `scripts/lib/execution-budgets.js` que evalúa exhaustivamente las 10 dimensiones ortogonales e informa la dimensión específica agotada, gobernando de forma unificada a `reducer.js`, `transition-selector.js` y el runtime.

## Alternatives

- Evaluadores fragmentados separados (`evaluateNodeBudget` vs `evaluateAuthorityBudget`): rechazados por inconsistencia de condiciones de borde y omisiones en dimensiones secundarias.
- Evaluación mutable con estado embebido en el objeto: rechazada por violar la pureza funcional y complicar la determinismo en concurrencia.

## Consequences

- Facilita: Detección exhaustiva e inequívoca del agotamiento presupuestario en todos los componentes del kernel.
- Dificulta: Los llamadores deben suministrar objetos de presupuesto y métricas de consumo tipadas.
- Reversibilidad: Alta — lógica pura encapsulada con tipos explícitos.
