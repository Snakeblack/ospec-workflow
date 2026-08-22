# ADR-005: Contractual Zero-Delta Scoped to Stagnant Effect-Bearing Code Mutations

- Status: accepted
- Change: k5-concurrency-hardening
- Date: 2026-08-22

## Context
En `REQ-execution-budgets-004`, la contabilidad de zero-delta no delimitaba con claridad qué operaciones debían ser penalizadas con deducción dual (`turns` de nodo y `effect_attempts` de autoridad), existiendo el riesgo de penalizar transiciones legítimas de ciclo de vida (como `repair` que retorna `outcome: "advanced"` o inspecciones de solo lectura) que no modifican archivos.

## Decision
Delimitar la deducción dual de zero-delta estrictamente a operaciones de mutación de código/archivos que culminen con `effectProgress === false` y cero líneas o archivos modificados. Las transiciones terminales, consultas `status` e inspecciones permanecen exentas. Un `repair` que sólo avanza el lifecycle pero no produce efecto físico sigue siendo zero-delta. Registrar un evento durable `zero-delta-attempt` en el journal antes del commit CAS.

## Alternatives
- Penalizar cualquier operación que resulte en 0 líneas cambiadas: Rechazado porque las operaciones no mutacionales de ciclo de vida son legítimas y no deben penalizarse como mutaciones estériles.
- No penalizar las mutaciones de código vacías: Rechazado porque habilitaría bucles infinitos de reparación estéril sin consumo de intentos.

## Consequences
- Definición formal y honesta de la frontera de zero-delta.
- Prevención de bloqueos espurios en operaciones de ciclo de vida sin cambios de archivos.
- Reversibilidad: Alta (encapsulado en `isZeroDeltaMutation` y `runKernelOperation`).

## Reconciliación K5 (2026-08-22)
`lifecycleProgress` y `effectProgress` son señales distintas: el primero no exime un `repair` estéril de la penalización dual. La contabilidad exacta emitida por el ejecutor se suma a la penalización zero-delta, sin inventar un mínimo implícito.
