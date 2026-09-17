# ADR-003: Matriz Compartida de Fixtures Negativos y Conformidad Diferencial Trifásica

- Status: proposed
- Change: remediate-cx1-strict-string-parity
- Date: 2026-09-17

## Context
Para blindar el arnés frente a futuras divergencias contractuales entre schemas y runtimes, es necesario disponer de casos de prueba atómicos compartidos que cubran cadenas de solo espacios en blanco y valores no string en `detailed_report`, verificados de forma cruzada en Node.js y Go.

## Decision
Crear `whitespace-only-required-strings.json` y `non-string-detailed-report.json` en `schemas/kernel/result-envelope/v1/fixtures/invalid/`, e integrarlos en las suites de prueba de conformidad diferencial (`result-envelope-conformance.test.js` en Node y `conformance_test.go` en Go), garantizando la invariante `schema.valid === js.valid === go.valid === false`.

## Alternatives
- Fixtures sintéticos en memoria por lenguaje: rechazada porque no son portables y propician la desincronización entre JS y Go.
- Fixture único con múltiples defectos: rechazada porque dificulta aislar qué regla exacta falló en cada evaluador.

## Consequences
Establece una frontera de prueba compartida y determinista en disco que actúa como especificación ejecutable entre múltiples lenguajes. Permite a CI detectar cualquier regresión de paridad de forma inmediata.
