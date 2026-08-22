# ADR-006: Unified Causal Failure Normalization in Host Boundary via resolvePrimaryFailure

- Status: accepted
- Change: k5-concurrency-hardening
- Date: 2026-08-22

## Context
Los errores de puertos, desconexiones y fallos de transporte en `scripts/lib/lifecycle-kernel/host-boundary.js` se manejaban con códigos de error ad-hoc sin pasar por el clasificador causal central `resolvePrimaryFailure()`. Esto fragmentaba la taxonomía de fallos y causaba inconsistencias con la matriz de recuperación de fallos y los emisores de permisos.

## Decision
Integrar `resolvePrimaryFailure` en la normalización de errores y requisitos post-fallo de `host-boundary.js`. Mapear los fallos de transporte y puertos a la categoría canónica `environment_tooling` con su correspondiente nivel de prioridad, garantizando que el selector de transiciones y el emisor de permisos reciban la clasificación causal unificada.

## Alternatives
- Mantener taxonomías de error independientes por host: Rechazado porque rompe la matriz canónica de recuperación en capas superiores del kernel.
- Clasificar los fallos de host como `code_defect`: Rechazado porque permitiría transiciones ilegítimas de `repair` sobre fallos de infraestructura.

## Consequences
- Normalización causal homogénea en todas las capas del kernel y fronteras de host.
- Derivación estricta de transiciones de recuperación permitidas (`replan`, `escalate`, `stop`).
- Reversibilidad: Alta (encapsulado en `host-boundary.js`).
