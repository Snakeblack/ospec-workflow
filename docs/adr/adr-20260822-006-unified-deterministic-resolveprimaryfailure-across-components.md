# ADR-006: Unified Deterministic resolvePrimaryFailure across Components

- Status: accepted
- Change: k5-concurrency-hardening
- Date: 2026-08-22

## Context
La determinación del fallo primario ante descriptores de fallo mixtos u heterogéneos se realizaba con heurísticas divergentes en el selector de transiciones, el emisor de permisos y los límites de ejecución del host, causando decisiones de recuperación inconsistentes.

## Decision
Unificar e invocar `resolvePrimaryFailure()` de manera idéntica en `transition-selector.js`, `operations.js` (`validateOperationTransition`), `index.js` (`issuePermitForSelectedTransition`) y `host-boundary.js`. La precedencia causal fija es: 1: `environment_tooling` > 2: `cas_conflict` > 3: `ambiguous_effect` > 4: `validation_gap` > 5: `code_defect`, con desempates lexicográficos por `failure_id` y `code`.

## Alternatives
- Resolución local ad-hoc en cada componente: Rechazada por riesgo de divergencia y desalineación entre permisos emitidos y transiciones seleccionadas.
- Prioridad FIFO por orden de inserción: Rechazada porque ignora la gravedad causal (ej. un fallo de entorno o CAS debe tener precedencia sobre un error de código).

## Consequences
- Comportamiento causal uniforme y determinista en todo el ciclo de vida.
- Coherencia total entre la transición ofrecida, el permiso emitido y la validación en el boundary.
- Reversibilidad: Alta.
