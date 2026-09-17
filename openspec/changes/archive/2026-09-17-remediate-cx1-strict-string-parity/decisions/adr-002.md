# ADR-002: Validación de Tipo String para detailed_report en Runtimes JS y Go

- Status: proposed
- Change: remediate-cx1-strict-string-parity
- Date: 2026-09-17

## Context
El esquema formal de `result-envelope/v1` declara `detailed_report` con `"type": "string"`. Sin embargo, las implementaciones de runtime en JS (`result-envelope.js`) y Go (`resultenvelope.go`) no comprobaban el tipo de este campo cuando estaba presente, permitiendo que valores no string (números, booleanos u objetos) fuesen admitidos en runtime mientras fallaban en validación de schema.

## Decision
Incorporar validación estricta de tipo en ambos runtimes ante la presencia de `detailed_report`:
`typeof obj.detailed_report !== "string"` en JS y aserción `s, isString := v.(string); if !isString` en Go, emitiendo de forma determinista el mensaje de error `"detailed_report must be a string"`.

## Alternatives
- Omitir validación en runtime: rechazada porque perpetuaba una discrepancia donde el schema rechazaba el payload pero el runtime lo admitía.
- Permitir tipos heterogéneos: rechazada porque viola el contrato canónico del schema y rompe renderers como `renderEnvelopeToMarkdown`.
- Coerción implícita a string: rechazada porque oculta errores de emisión en lugar de fallar cerrado.

## Consequences
Alinea la ejecución de runtime con la especificación del schema, asegurando paridad exacta de rechazo ante tipos inválidos en `detailed_report`. No impone penalizaciones de rendimiento ($O(1)$) y es 100% reversible vía git.
