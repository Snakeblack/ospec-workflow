# ADR-005: Fail-Closed Default Mapping of Unknown Legacy Routing Tags to Validation Gap

- Status: accepted
- Change: k5-concurrency-hardening
- Date: 2026-08-22

## Context
En `scripts/lib/causal-failure.js`, el caso `default` de `mapLegacyRoutingTag()` mapeaba tags no reconocidos a `category: "code_defect"` con código `UNKNOWN_FAILURE_CODE`. Dado que `code_defect` permite transiciones `repair` automáticas, tags desconocidos o corruptos podían habilitar bucles de reparación inapropiados.

## Decision
Modificar el caso `default` en `mapLegacyRoutingTag()` para retornar `{ category: "validation_gap", code: "UNKNOWN_ROUTING_TAG" }`. La categoría `validation_gap` restringe las transiciones allowlisteadas a `{ replan, escalate, stop }`, prohibiendo estrictamente `repair`.

## Alternatives
- Mantener default en `code_defect`: Rechazado porque habilita reparaciones de código automáticas ante fallos desconocidos o de verificación.
- Lanzar error fatal: Rechazado porque interrumpe abruptamente la evaluación sin permitir replanificación estructurada.

## Consequences
- Comportamiento fail-closed ante tags no catalogados.
- Prevención de reparaciones ciegas ante brechas de validación o tags corruptos.
- Reversibilidad: Alta.
