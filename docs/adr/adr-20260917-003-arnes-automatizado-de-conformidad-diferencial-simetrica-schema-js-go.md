# ADR-003: Arnés Automatizado de Conformidad Diferencial Simétrica (Schema ↔ JS ↔ Go)

- Status: proposed
- Change: remediate-cx1-conformance-parity
- Date: 2026-09-17

## Context
Para prevenir regresiones o derivas silenciosas entre la especificación JSON Schema y los validadores de runtime en JS y Go, se requería un mecanismo automatizado que asegurara paridad de veredicto sobre la matriz completa de fixtures.

## Decision
Implementar suites de pruebas de conformidad diferencial simétricas en Node (`scripts/lib/result-envelope-conformance.test.js`) y Go (`internal/resultenvelope/conformance_test.go`) que afirmen de forma estricta `schema.valid === js.valid === go.valid` sobre el 100% de los fixtures compartidos.

## Alternatives
- Validar paridad únicamente en la suite de Node: dejaba a Go sin validación nativa en `go test`.
- Incorporar una biblioteca externa de JSON Schema en Go: aumentaba dependencias innecesariamente frente a la invocación desacoplada existente en tests de integración.

## Consequences
Cualquier divergencia entre Schema, JS o Go falla de inmediato el pipeline de integración continua. Coste de ejecución mínimo (<200ms).
