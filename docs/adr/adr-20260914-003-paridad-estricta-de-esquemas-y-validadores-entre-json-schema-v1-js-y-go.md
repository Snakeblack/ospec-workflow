# ADR-003: Paridad Estricta de Esquemas y Validadores entre JSON Schema v1, JS y Go

- Status: proposed
- Change: remediate-cx1-envelope-projection
- Date: 2026-09-14

## Context
Se detectaron divergencias de validación entre `envelope.schema.json` y los validadores de runtime en JavaScript (`scripts/lib/result-envelope.js`) y Go (`internal/resultenvelope/resultenvelope.go`). Específicamente, no se validaban tipos de elementos en arrays (`artifacts` y `risks`), se omitía el chequeo del enum `skill_resolution`, la validación de `question_gate` era superficial y Go no comprobaba `schema_version == 1`.

## Decision
Lograr paridad estricta en ambos runtimes asegurando que: `schema_version` sea 1 obligatorio en Go; arrays `artifacts` y `risks` contengan exclusivamente strings; `skill_resolution` se valide contra su enum cerrado; `question_gate` valide `reason`, array `questions`, `header`, `options` y labels; y `verify_outcome` se valide contra su enum en ambos lenguajes.

## Alternatives
- Validar sólo con JSON Schema en CI: descartado porque los hooks y CLI operan en tiempo de ejecución nativo sin dependencias externas.
- Incorporar una biblioteca externa de JSON Schema en Go: descartado para mantener el módulo Go con cero dependencias externas.

## Consequences
Elimina drift entre entornos de ejecución, garantiza consistencia determinista de errores entre JS y Go, y previene la corrupción de estructuras de envelopes. Completamente reversible mediante git revert.
