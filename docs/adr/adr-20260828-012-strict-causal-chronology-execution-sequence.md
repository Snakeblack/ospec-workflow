# ADR-003: Cronología causal estricta mediante execution_sequence

- Status: accepted
- Change: k6b-trusted-evidence-replay-closure
- Date: 2026-08-28

## Context
Las estrategias temporales (`strict-tdd`, `bug`, `refactor`) recurrían al orden posicional de los elementos en el array JSON de `rawEvidence` para evaluar la secuencia cronológica, lo que permitía simular TDD o refactorizaciones invirtiendo el orden de las evidencias en el array sin atestación causal.

## Decision
Exigir obligatoriamente en `assertRoleOrder` un `execution_sequence` emitido por el receipt confiable para cada transición temporal de `strict-tdd`, `bug` y `refactor`. Todos los eventos usan un `run_id` no vacío y consistente; los ordinales son enteros positivos, únicos y crecientes; cada evento posterior a la raíz declara `previous_evidence_id` igual al EvidenceId inmediatamente anterior. Se prohíbe el fallback a índices del array JSON y se falla con `STRATEGY_SEQUENCE_VIOLATION` ante ausencia o violación causal.

## Alternatives
- Mantener el índice de array como fallback si falta `execution_sequence` — rechazado: la posición en un array JSON no tiene valor criptográfico ni atestación temporal.
- Comparar timestamps de archivo (mtime/ctime) — rechazado: no deterministas y fácilmente manipulables por el sistema operativo o workers.

## Consequences
- Facilita: Garantía causal matemática de que RED precedió a GREEN y que `characterization-before` precedió a `after`.
- Dificulta: Requiere que todos los pipelines y tests emitan metadatos de secuencia causal en sus observaciones de prueba.
- Reversibilidad: Alta (ajustable en `strategy-policy.js`).
