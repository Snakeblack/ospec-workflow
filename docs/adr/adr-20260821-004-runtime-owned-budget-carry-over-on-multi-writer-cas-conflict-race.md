# ADR-004: Runtime-Owned Budget Carry-Over on Multi-Writer CAS Conflict Race

- Status: proposed
- Change: k5-authority-boundary-and-cas-concurrency-remediation
- Date: 2026-08-20

## Context
Cuando dos writers concurrentes ejecutan efectos sobre una revisión R0 y uno pierde la carrera CAS (`cas-conflict`), existía el riesgo de restablecer la cuota inicial de presupuestos al re-sincronizarse con R1. Además, el modelo verificaba esto inyectando manualmente `args.consumed`, en lugar de validar un comportamiento 100% gestionado por el runtime.

## Decision
Hacer que el kernel runtime gestione y preserve de forma automática el carry-over de las cuotas de presupuesto consumidas por efectos ejecutados tras un `cas-conflict`. Al resincronizarse con la revisión head ganadora, el runtime deduce monótonamente este consumo pendiente sin requerir argumentos fabricados por el llamador, y actualizar `checkK5BudgetMonotonicity()` para validar una carrera concurrente real con 2 writers.

## Alternatives
- Reabastecer las cuotas al perder la carrera CAS: Rechazado porque los efectos ya se ejecutaron en el entorno y permitiría eludir las cuotas de intentos.
- Exigir que el llamador calcule e inyecte `args.consumed`: Rechazado porque rompe la encapsulación del runtime y permite manipulación o fraude en la contabilidad.

## Consequences
- Garantía estricta de monotonicidad presupuestaria (`inv-k5-budget-monotonicity`) en entornos concurrentes multi-writer con carry-over transparente.
- Reversibilidad: Alta (gestión de carry-over en el contexto de `createKernelRuntime`).

## Reconciliación K5 (2026-08-22)
El carry-over se separa en consumo previo `P` y consumo físico nuevo `N`. El candidato CAS recibe `P + N`; ante cualquier salida post-efecto sin CAS confirmado se conserva `P + N`, y los resultados históricos del journal nunca forman parte de `N`. Un CAS exitoso borra esa partición.
