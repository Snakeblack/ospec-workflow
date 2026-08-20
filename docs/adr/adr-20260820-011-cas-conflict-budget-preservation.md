# ADR-005: Preservación de Monotonicidad Presupuestaria ante Conflicto CAS Multi-Writer

- Status: proposed
- Change: k5-authoritative-enforcement-and-cas-remediation
- Date: 2026-08-20

## Context
Cuando múltiples writers concurrentes compiten por la misma revisión head y uno pierde la carrera CAS tras haber ejecutado efectos reales, existía el riesgo de restablecer la cuota presupuestaria inicial al re-sincronizar con el nuevo head, violando la monotonicidad estricta de presupuestos. Además, el checker `inv-k5-budget-monotonicity` no ejecutaba una prueba concurrente real con 2 writers.

## Decision
Preservar de forma estrictamente monótona y no creciente el consumo presupuestario de cualquier efecto ejecutado ante un conflicto CAS. Al reintentar contra la nueva revisión head, el writer perdedor debe deducir sobre la base del presupuesto ya consumido. Refactorizar el checker `inv-k5-budget-monotonicity` para instanciar 2 writers concurrentes compitiendo por la misma revisión del Authority Store y verificar que el perdedor retiene el presupuesto consumido en su reintento.

## Alternatives
- Reabastecer la cuota completa al perder la carrera CAS: Rechazado porque los efectos ya se ejecutaron en el entorno y permitiría eludir las cuotas de intentos.
- Mantener la prueba secuencial con un único writer: Rechazado porque no somete la lógica a condiciones de carrera concurrentes ni valida el comportamiento ante `cas-conflict`.

## Consequences
- Garantía absoluta de que ningún reintento o reconciliación CAS incremente o restaure cuotas de ejecución ya consumidas.
- Mayor realismo y cobertura en los tests de conformidad del modelo de ciclo de vida con 2 runtimes concurrentes.
- Reversibilidad: Alta (ajuste en la política de retención de presupuestos en runtime y en el test model).
