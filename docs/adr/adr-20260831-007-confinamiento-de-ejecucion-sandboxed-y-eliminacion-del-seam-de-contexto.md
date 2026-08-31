# ADR-001: Confinamiento de Ejecución Sandboxed y Eliminación del Seam de Contexto

- Status: proposed
- Change: k6c-spec-integrity-and-runner-seam-remediation
- Date: 2026-08-31

## Context
El parámetro de contexto `context.runWorkspaceTests` en `executeChallengePlan` permitía a los llamadores inyectar un runner de pruebas simulado, omitiendo la ejecución real en sandbox de mutación y reversión. Esto generaba un seam de evasión que comprometía la veracidad del veredicto de los challenges adversariales.

## Decision
Eliminar el soporte de `context.runWorkspaceTests` en `executeChallengePlan` y `runIsolatedMutation`. Confinar `executeChallengePlan` exclusivamente a la ejecución sandboxed real (`executeSandboxedCommand`) y permitir inyección de runner únicamente mediante el parámetro posicional directo `_testRunner` en la función interna `runIsolatedMutation` para pruebas unitarias.

## Alternatives
- Mantener `context.runWorkspaceTests` con flag condicional: Rechazado porque mantiene una superficie de evasión en el contrato público de contexto.
- Envolver mocks en proxies de validación: Rechazado por complejidad innecesaria frente a la eliminación directa del seam.

## Consequences
Se elimina por completo el vector de evasión en planes adversariales y se garantiza que `executeChallengePlan` siempre ejecute tests en sandboxes efímeros aislados. Las pruebas unitarias internas de errores de proceso se adaptan invocando directamente `runIsolatedMutation(..., _testRunner)`. Decisión de alta reversibilidad interna.
