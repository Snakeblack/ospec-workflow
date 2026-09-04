# ADR-002: Precedencia de detección de host Claude

- Status: proposed
- Change: claude-cx0-telemetry-adapter
- Date: 2026-09-03

## Context

REQ-context-measurement-008 exige resolver `host: claude` por "señales de sesión" sin fijar el orden entre `CLAUDE_PLUGIN_ROOT`, `OSPEC_TARGET=claude` y firmas de transcripción. El valor es observable (dimensión de cohortes CX0) y ambas piezas (dimensión CX0 y rama del launcher en REQ-hooks-019) necesitan una regla determinística compartida.

## Decision

Precedencia de lo explícito a lo inferido: (1) `input.host` válido explícito; (2) `OSPEC_TARGET === "codex"`; (3) `OSPEC_TARGET === "claude"`; (4) `CLAUDE_PLUGIN_ROOT` no vacío; (5) firma de transcripción (`type === "assistant"` con `message` objeto en la ventana leída); (6) `unknown-host`. El launcher usa solo marcadores de entorno (`isClaudeCodeHost` = tiers 3–4), con `OSPEC_TARGET` por encima de `CLAUDE_PLUGIN_ROOT` para que hosts que reutilizan layouts de plugin Claude puedan sobreescribir. `OSPEC_PLUGIN_ROOT` queda excluido como señal: el launcher lo inyecta en todos los hosts.

## Alternatives

- Solo `CLAUDE_PLUGIN_ROOT`: pierde configurabilidad explícita y simetría con la rama codex.
- Solo firma de transcripción: indisponible en el launcher sin I/O adicional a stdin/transcripción.

## Consequences

Regla auditable en un solo lugar por pieza; la firma se obtiene gratis del mismo tail-read del uso (un pase de I/O). Un host no-Claude que exponga contadores compatibles podría poblar métricas `host-observed` sin cambiar su dimensión de cohortes (aceptado: lane aditiva sin autoridad). Reversible: cada tier es una condición independiente.
