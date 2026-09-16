# ADR-001: Regla Condicional if/then y minLength: 1 en Schemas JSON

- Status: proposed
- Change: remediate-cx1-conformance-parity
- Date: 2026-09-17

## Context
Los validadores de runtime en JS y Go exigen `question_gate` obligatorio cuando `status == "blocked"` y rechazan cadenas vacías en campos de texto, pero los schemas JSON declarativos (`envelope.schema.json` v1 y `result-envelope.schema.json`) no formalizaban estas restricciones, generando divergencias de validación.

## Decision
Incorporar la regla condicional `if: { properties: { status: { const: "blocked" } } }, then: { required: ["question_gate"] }` en la raíz de ambos schemas y añadir `minLength: 1` a todos los campos de texto obligatorios de `question_gate` (`reason`, `header`, `question`, `label`) y `assumptions` (`id`, `phase`, `statement`, `basis`).

## Alternatives
- Validación exclusiva en runtime JS/Go: permitía que tooling y linters externos aceptaran payloads inválidos.
- Exigir `question_gate` incondicionalmente en `required`: rompía todos los envelopes con status `success` o `partial`.

## Consequences
Garantiza paridad contractual estricta entre la especificación declarativa y los motores de ejecución de runtime. Totalmente compatible con `kernel-schema-validator.js` y limpiamente reversible vía `git revert`.
