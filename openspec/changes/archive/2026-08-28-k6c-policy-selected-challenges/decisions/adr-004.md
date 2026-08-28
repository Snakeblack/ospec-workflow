# ADR-004: Focal Seeded Mutations and Rejection of Complacent/Tautological Tests

- Status: proposed
- Change: k6c-policy-selected-challenges
- Date: 2026-08-28

## Context
Los tests que siempre pasan independientemente del estado del código (tests tautológicos o complacientes) ofrecen una falsa sensación de garantía y reducen la efectividad de la verificación automatizada.

## Decision
Implementar mutaciones focales deterministas aplicadas exclusivamente a las líneas y ramas modificadas en el parche del Candidate, e inspección estructural de aserciones. Si la suite de tests pasa sobre un defecto sembrado, se emite `COMPLACENT_TEST_DETECTED`; si se detectan aserciones vacías o incondicionales, se emite `TAUTOLOGICAL_TEST_DETECTED`.

## Alternatives
- **Mutación global estocástica (Chaos/Fuzzing amplio)**: Descartada por lentitud, falsos positivos y no-determinismo.
- **Análisis estático de cobertura de líneas únicamente**: Descartada porque una línea ejecutada no garantiza aserción sobre su comportamiento.

## Consequences
- **Positivas**: Detección de alta precisión de tests que no verifican el comportamiento real, manteniendo un tiempo de ejecución bajo.
- **Negativas**: Requiere operadores de mutación focales bien calibrados (operadores relacionales, booleanos, valores de retorno).
- **Reversibilidad**: Media.
