# ADR-001: Conexión de Fallback Legacy en SubagentStop con Preservación Fail-Closed para sdd-spec

- Status: proposed
- Change: remediate-cx1-envelope-projection
- Date: 2026-09-14

## Context
Cuando un subagente emite un resultado o transcript sin fence `json:result-envelope` canónico, `SubagentStop` omitía la adaptación legacy en `persistResultEnvelope`. Asimismo, respuestas de `sdd-spec` en formato legacy podían eludir la validación phase-aware de señales de ambigüedad.

## Decision
Conectar `adaptLegacyEnvelope` (tanto en JS como en Go) en `persistResultEnvelope` y `resolveDispatchStatus` cuando no se detecte un fence canónico, y condicionar toda proyección o resolución de estado a la validación phase-aware con `canonicalAgent`, forzando status `blocked` si `sdd-spec` carece de señales de ambigüedad.

## Alternatives
- Ignorar resultados sin fence: descartado porque rompe retrocompatibilidad con subagentes legacy o transcripciones en prosa estructurada.
- Aceptar resultados legacy sin validar ambigüedad: descartado porque introduce riesgos de contratos incompletos en especificaciones.

## Consequences
Permite proyectar estados de subagentes que no emiten fences canónicos, unifica el comportamiento entre Node.js y Go, y blinda la especificación (`sdd-spec`) frente a falsos positivos. Altamente reversible mediante git revert.
