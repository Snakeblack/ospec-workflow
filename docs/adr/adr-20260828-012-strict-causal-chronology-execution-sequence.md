# ADR-003: Cronología causal estricta mediante execution_sequence

- Status: proposed
- Change: k6b-trusted-evidence-replay-closure
- Date: 2026-08-28

## Context
Las estrategias temporales (`strict-tdd`, `bug`, `refactor`) recurrían al orden posicional de los elementos en el array JSON de `rawEvidence` para evaluar la secuencia cronológica, lo que permitía simular TDD o refactorizaciones invirtiendo el orden de las evidencias en el array sin atestación causal.

## Decision
Exigir obligatoriamente en `assertRoleOrder` un objeto `execution_sequence` válido (`run_id` consistente, `ordinal` monotónico creciente y encadenamiento `previous_evidence_id`) para cada evidencia en estrategias `strict-tdd`, `bug` y `refactor`. Se prohíbe de forma tajante el fallback a índices de array JSON, fallando inmediatamente con `STRATEGY_SEQUENCE_VIOLATION` ante ausencia o violación de orden.

## Alternatives
- Mantener el índice de array como fallback si falta `execution_sequence` — rechazado: la posición en un array JSON no tiene valor criptográfico ni atestación temporal.
- Comparar timestamps de archivo (mtime/ctime) — rechazado: no deterministas y fácilmente manipulables por el sistema operativo o workers.

## Consequences
- Facilita: Garantía causal matemática de que RED precedió a GREEN y que `characterization-before` precedió a `after`.
- Dificulta: Requiere que todos los pipelines y tests emitan metadatos de secuencia causal en sus observaciones de prueba.
- Reversibilidad: Alta (ajustable en `strategy-policy.js`).
