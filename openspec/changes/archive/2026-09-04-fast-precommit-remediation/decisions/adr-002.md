# ADR-002: Matriz conservadora de invalidación de targets con fallback a `ALL_TARGETS`

- Status: proposed
- Change: fast-precommit-remediation
- Date: 2026-09-04

## Context

`findAffectedTargets` no invalidaba targets cuando se modificaban generadores comunes (`cli.js`, `install-engine.js`, `install-target.js`, `validate-phase.js`), perfiles de configuración (`scripts/lib/target-profiles/*.js`), el transformador de targets o `models.yaml`, provocando artefactos generados desactualizados y roturas silenciosas en `dist/`.

## Decision

Definir `ALL_TARGETS = ["claude", "vscode", "github-copilot", "opencode", "codex", "cursor", "antigravity"]` y retornar la lista completa de todos los targets si se modifica cualquier componente de la infraestructura compartida de targets o modelos. Si solo se modifica un validador o instalador aislado, validar únicamente dicho target.

## Alternatives

- Regenerar siempre todos los targets en todo commit: Penalización de 8-15s en commits triviales.
- Análisis estático de AST de dependencias: Demasiada complejidad y fragilidad sin librerías externas.
- Heurística optimista anterior: Falsos negativos críticos en compilación multi-target.

## Consequences

Garantiza que cualquier cambio estructural o de configuración regenere y valide los 7 targets soportados, previniendo regresiones silenciosas. Preserva la velocidad en commits específicos o ajenos a generadores. Reversibilidad alta.
