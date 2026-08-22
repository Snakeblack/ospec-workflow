# ADR-004: Zero-Re-execution Guarantee and Side-Effect Deduplication via Journal Replay

- Status: accepted
- Change: k5-concurrency-hardening
- Date: 2026-08-22

## Context
Cuando un writer ejecuta un efecto con efectos secundarios externos y luego pierde la carrera CAS contra un competidor, el reintento del perdedor contra la nueva revisión head corre el riesgo de invocar nuevamente `effectExecutor`, duplicando efectos no idempotentes o incurriendo en doble facturación/consumo.

## Decision
Garantizar en `runKernelOperation` que todo efecto planificado se reconcilia contra el journal persistido. Si el efecto ya consta con `status: "completed"`, `reconcileEffect` emite `action: "skip"`, reutilizando el resultado previo y garantizando exactamente 0 re-ejecuciones de `effectExecutor`. Consignar esta garantía mediante un test E2E específico en `scripts/k5-e2e-budgets-recovery.test.js`.

## Alternatives
- Re-ejecutar el efecto en cada intento post-CAS: Rechazado porque produce efectos secundarios duplicados y rompe la idempotencia.
- Rollback transaccional de efectos externos: Rechazado porque los efectos en sistemas de archivos o llamadas a procesos no son atómicamente reversibles.

## Consequences
- Garantía de at-most-once execution sobre efectos autoritativos.
- Validación determinista de 0 ejecuciones duplicadas en suites de integración E2E.
- Reversibilidad: Alta (encapsulado en `reconcileEffect` y `runKernelOperation`).
