# ADR-002: Delegación Estricta de Identidad Criptográfica de WorkResult en execution-identities

- Status: proposed
- Change: k6a-contract-runtime-integration-remediation
- Date: 2026-08-23

## Context
`worker-executor.js` mantenía una función local duplicada para calcular `work_result_id` que divergía del estándar K3 e incorporaba `execution_usage` en el hash canónico, impidiendo la validación criptográfica en `execution-identities`.

## Decision
Delegar estrictamente todo cálculo de `work_result_id` y validación de binding en `computeWorkResultId` y `validateWorkResultBinding` de `scripts/lib/execution-identities/index.js`, tratando `execution_usage` como evidencia externa enlazada.

## Alternatives
- Mantener algoritmo de hash local aislado en `worker-executor.js`: Rechazado porque genera deriva criptográfica y rompe la verificación formal de binding en pipelines E2E.

## Consequences
Garantiza coherencia total en la emisión de `work-result/v1` en todo el repositorio y prohíbe `CandidateId` en K6a; acopla K6a al módulo canónico de identidades K3. Reversibilidad baja (canónica).
