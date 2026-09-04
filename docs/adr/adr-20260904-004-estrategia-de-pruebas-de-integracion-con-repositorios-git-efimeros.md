# ADR-004: Estrategia de pruebas de integración con repositorios Git efímeros

- Status: proposed
- Change: fast-precommit-remediation
- Date: 2026-09-04

## Context

Las pruebas existentes utilizaban únicamente mocks de `fs` y `child_process.spawnSync`, lo que ocultaba discrepancias reales con la CLI de Git, problemas de formato en el output de diffs, diferencias de rutas entre plataformas y comportamientos de staging parcial.

## Decision

Crear `scripts/hooks/lib/staged-validator.integration.test.js` para ejecutar pruebas automatizadas contra repositorios Git efímeros creados dinámicamente con `fs.mkdtempSync` y `git init`, garantizando su destrucción completa tras la ejecución con `fs.rmSync`.

## Alternatives

- Pruebas exclusivamente con mocks: No verifican la interacción real con Git CLI ni la normalización de rutas en Windows.
- Ejecutar pruebas en el repositorio de trabajo local: Riesgo inaceptable de ensuciar o alterar el índice y el working tree de desarrollo.

## Consequences

Verificación confiable y de alta fidelidad de los escenarios de staging parcial (staged roto / working tree limpio, y staged limpio / working tree roto) sin afectar el repositorio local. Limpieza garantizada. Reversibilidad alta.
