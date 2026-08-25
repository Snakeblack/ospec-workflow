# ADR-004: Frontera arquitectónica unidireccional K4b -> K6a

- Status: proposed
- Change: k4b-repair-shadow-execution
- Date: 2026-08-25

## Context

Para mantener la modularidad y prevenir dependencias circulares en el kernel de OSPEC, se debe formalizar la relación de dependencia entre el orquestador de Repair shadow (K4b) y las primitivas de aislamiento del worker (K6a).

## Decision

Establecer una frontera unidireccional estricta K4b → K6a: los módulos de `scripts/lib/repair-shadow/` pueden importar y consumir K6a (`worker-executor.js`, `worker-workspace.js`, `worker-sandbox.js`), pero los módulos de K6a no deben importar ni referenciar nada perteneciente a K4b o al dominio Repair.

## Alternatives

- Acoplamiento bidireccional permitiendo a K6a invocar utilidades de K4b: descartado por generar ciclos y comprometer la naturaleza agnóstica de K6a.
- Fusionar K4b dentro de K6a: descartado porque mezcla responsabilidades de ejecución genérica con orquestación de Repair.

## Consequences

Mantiene K6a como componente reutilizable y genérico. Se verifica mediante tests estáticos en `roadmap-boundary.test.js`. Reversible vía `git revert`.
