# ADR-002: Preflight Exhaustivo de Presupuestos de Nodo y Autoridad

- Status: accepted
- Change: k5-authoritative-enforcement-and-cas-remediation
- Date: 2026-08-20

## Context
Las verificaciones de presupuesto de nodo y autoridad se realizaban de forma fragmentada o post-efecto, permitiendo que `runKernelOperation` invocara potencialmente al `effectExecutor` o que el emisor de permisos concediera autorizaciones con presupuestos agotados.

## Decision
Implementar una evaluación unificada de presupuesto mediante `isBudgetExhausted()` que verifique las 6 dimensiones de nodo (`turns`, `patches`, `commands`, `wall_time_minutes`, `changed_lines`, `allowed_paths`) y las 4 de autoridad (`effect_attempts`, `authority_mutations`, `evidence_runs`, `review_sweeps`) en preflight estricto dentro de `transition-selector.js`, emisión de permisos en `permits.js`, y `runKernelOperation` antes de despachar a `effectExecutor`, garantizando exactamente 0 llamadas al executor ante agotamiento.

## Alternatives
- Verificación perezosa en el reducer tras invocar efectos: Rechazado porque consume recursos externos y ejecuta efectos no autorizados.
- Comprobar únicamente la dimensión `turns`: Rechazado porque ignora cuotas de comandos, líneas modificadas o intentos de autoridad.

## Consequences
- Garantía estricta de fail-closed y 0 invocaciones a efectos cuando cualquier dimensión presupuestaria llega a cero o se sobrepasa.
- Requiere que las llamadas sin presupuesto explícito adopten defaults permisivos seguros para evitar falsos positivos en nodos no acotados.
- Reversibilidad: Alta (lógica encapsulada en validadores de preflight).
