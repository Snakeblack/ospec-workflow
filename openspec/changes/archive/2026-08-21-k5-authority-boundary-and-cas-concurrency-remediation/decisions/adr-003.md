# ADR-003: Causal Recovery Allowlist Enforcement at Boundary Validation

- Status: proposed
- Change: k5-authority-boundary-and-cas-concurrency-remediation
- Date: 2026-08-20

## Context
La validación en el boundary del runtime (`validateOperationTransition` en `operations.js`) solo verificaba la fase estructural del nodo, sin consultar la taxonomía causal del fallo activo, permitiendo potencialmente que invocaciones directas ejecutaran transiciones no permitidas (como `repair` ante `ambiguous_effect`).

## Decision
Integrar `validateRecoveryTransition(primaryFailure.category, operation)` dentro de `validateOperationTransition()` en `operations.js` y en el preflight de `runKernelOperation()`, asegurando que cualquier operación no allowlisteada para el fallo causal activo falle de forma closed con exactamente 0 llamadas a `effectExecutor`.

## Alternatives
- Validar únicamente en el selector de transiciones: Rechazado porque las invocaciones directas al kernel eluden el selector y podrían ejecutar transiciones prohibidas.
- Confiar en que el llamador respete la taxonomía causal: Rechazado porque vulnera el principio de boundary autoritativo y defensa en profundidad.

## Consequences
- Blindaje absoluto del boundary contra transiciones de recuperación incompatibles con la causa raíz del fallo.
- Reversibilidad: Alta (integración de validación existente en `operations.js`).
