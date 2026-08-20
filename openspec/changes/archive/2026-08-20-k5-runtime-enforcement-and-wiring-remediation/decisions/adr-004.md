# ADR-004: Emision Explicita de Transiciones de Recuperacion sin Sustitucion Silenciosa

- Status: proposed
- Change: k5-runtime-enforcement-and-wiring-remediation
- Date: 2026-08-20

## Context

El selector de transiciones sustituía implícitamente transiciones de escalación por `decide` genérico cuando ocurrían fallos ambiguos o agotamiento de presupuestos, ocultando la taxonomía causal del fallo y degradando la observabilidad del ciclo de recuperación.

## Decision

Configurar `transition-selector.js` para emitir explícitamente las transiciones permitidas por `getAllowlistedTransitions()` (`repair`, `replan`, `escalate`, `stop`) sin recurrir a sustituciones silenciosas de `escalate` por `decide`, permitiendo al orquestador y los clientes reaccionar con precisión a la causa de escalación.

## Alternatives

- Mantener fallback silencioso a `decide`: rechazada porque enmascara la causa raíz e impide la automatización de escalaciones específicas.
- Reintentar ciegamente `repair` en fallos de entorno o validación: rechazada porque culpa al código de problemas de infraestructura o especificación.

## Consequences

- Facilita: Trazabilidad nítida de fallos y decisiones de recuperación explícitas en el selector.
- Dificulta: Los consumidores del selector deben esperar y procesar operaciones con `kind: "escalate"`.
- Reversibilidad: Alta — estructuración declarativa en la tabla de prioridades y selector.
