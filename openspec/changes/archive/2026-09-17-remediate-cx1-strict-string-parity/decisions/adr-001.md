# ADR-001: Hardening de Schemas JSON con pattern: "\\S" para campos isNonEmptyString

- Status: proposed
- Change: remediate-cx1-strict-string-parity
- Date: 2026-09-17

## Context
Los validadores de runtime en JS (`trim().length > 0`) y Go (`TrimSpace(s) != ""`) rechazan cadenas compuestas exclusivamente de espacios en blanco en campos no vacíos, pero los esquemas declarativos (`envelope.schema.json` v1 y `result-envelope.schema.json`) solo exigían `minLength: 1`, aceptando cadenas como `"   "` y creando una discrepancia de paridad.

## Decision
Incorporar `"pattern": "\\S"` junto a `"minLength": 1"` en ambos esquemas para todos los campos con semántica `isNonEmptyString` (`executive_summary`, `next_recommended`, rama string de `risks`, items de `key_decisions`, propiedades de `assumptions` y campos de `question_gate`). `kernel-schema-validator.js` evalúa este patrón nativamente mediante `new RegExp(schema.pattern).test(instance)` sin requerir cambios ni dependencias.

## Alternatives
- Formato custom `format: "non-empty-string"`: rechazado por no ser estándar JSON Schema Draft 2020-12 y requerir configuración extra en linters.
- Expresión regex anclada `^.*\\S.*$`: rechazada por verbosidad innecesaria frente a `\\S`.
- Validación exclusiva en runtime: rechazada porque permitía que tooling y esquemas aceptasen envelopes inválidos.

## Consequences
Garantiza paridad contractual estricta entre schemas y runtimes ante cadenas de solo espacios. El intérprete del kernel rechaza estos casos con `rule: "pattern"` con cero dependencias externas. Totalmente reversible vía git.
