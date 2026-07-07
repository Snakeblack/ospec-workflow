# ADR-003: Registro unificado de checkers puros con reutilización de J1/I3

- Status: accepted
- Change: unified-contract-lint
- Date: 2026-07-07
- Promoted to docs/adr on 2026-07-07

## Context

J1 (commands↔agents) e I3 (budget↔constante) ya existen como tests `node:test` con guards
probados (rel-1/rel-2 en J1; techo/piso en I3). El intent exige reutilizar/envolver, no
reimplementar (REQ-contract-lint-003/004). Hay que decidir si un agregador único los orquesta
o si son checks compuestos sueltos, y cómo integrar sin duplicar lógica.

## Decision

Un agregador único (`runAllCheckers`) sobre un registro de checkers puros con firma
`check(ctx) → offenders[]`, sin cortocircuito. La lógica de J1/I3 se **extrae** a funciones
checker compartidas (`scripts/lib/contract-checkers/*.js`); tanto el agregador como los tests
legacy adaptados invocan esas mismas funciones. Los guards viven en la función extraída.

## Alternatives

- Checks compuestos independientes sin agregador común: no cumple "un solo comando corre todos"
  (REQ-contract-lint-001) y dispersa el reporte.
- Agregador que reimplementa verificación equivalente a J1/I3: viola el "adapt, not reimplement"
  y duplica lógica (riesgo de drift entre copias).

## Consequences

Reporte unificado sin cortocircuito; guards en un solo lugar; tests legacy preservan sus asserts
anclados llamando la misma función. Añadir un contrato futuro = registrar un checker más.
Reversible: los tests legacy siguen autónomos si se revierte el agregador.
