# ADR-005: Contractual Zero-Delta Scoped to Stagnant Effect-Bearing Code Mutations

- Status: accepted
- Change: k5-concurrency-hardening
- Date: 2026-08-22

## Context
En `REQ-execution-budgets-004`, la contabilidad de zero-delta no delimitaba con claridad qué operaciones debían ser penalizadas con deducción dual (`turns` de nodo y `effect_attempts` de autoridad), existiendo el riesgo de penalizar transiciones legítimas de ciclo de vida (como `repair` que retorna `outcome: "advanced"` o inspecciones de solo lectura) que no modifican archivos.

## Decision
Delimitar la deducción dual de zero-delta estrictamente a operaciones de mutación de código/archivos que culminen con `effectProgress === false` y cero líneas o archivos modificados. Eximir explícitamente transiciones de control de ciclo de vida (`repair` que avanza a nivel de lifecycle, `escalate`, `stop`, consultas `status` e inspecciones). Registrar un evento durable `zero-delta-attempt` en el journal antes del commit CAS.

## Alternatives
- Penalizar cualquier operación que resulte en 0 líneas cambiadas: Rechazado porque las operaciones no mutacionales de ciclo de vida son legítimas y no deben penalizarse como mutaciones estériles.
- No penalizar las mutaciones de código vacías: Rechazado porque habilitaría bucles infinitos de reparación estéril sin consumo de intentos.

## Consequences
- Definición formal y honesta de la frontera de zero-delta.
- Prevención de bloqueos espurios en operaciones de ciclo de vida sin cambios de archivos.
- Reversibilidad: Alta (encapsulado en `isZeroDeltaMutation` y `runKernelOperation`).
