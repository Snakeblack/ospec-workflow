# ADR-002: Matriz Compartida de Fixtures Negativos para Paridad Contractual

- Status: proposed
- Change: remediate-cx1-conformance-parity
- Date: 2026-09-17

## Context
Se requería verificar de forma reproducible y multi-lenguaje que los validadores rechazan payloads bloqueados sin gate o con cadenas vacías, pero no existían fixtures negativos específicos en el catálogo versionado en disco.

## Decision
Crear tres fixtures atómicos en `schemas/kernel/result-envelope/v1/fixtures/invalid/`: `blocked-missing-question-gate.json`, `empty-question-gate-fields.json` y `empty-assumption-fields.json`.

## Alternatives
- Tests unitarios sintéticos ad-hoc en cada lenguaje: inducen a divergencias y pruebas asimétricas entre runtimes.
- Un único fixture combinado con múltiples defectos: enmascara rechazos incompletos en analizadores que abortan tempranamente.

## Consequences
Establece una verdad física compartida que cualquier runtime o herramienta puede consumir para verificar conformidad sin suposiciones.
