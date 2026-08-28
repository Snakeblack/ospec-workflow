# ADR-001: Proportional Policy-Selected Challenges vs Universal Fixed Suite

- Status: proposed
- Change: k6c-policy-selected-challenges
- Date: 2026-08-28

## Context
Ejecutar un cuarteto universal de challenges exhaustivos en cada candidate genera un consumo desmedido de tokens y tiempo en pipelines rápidos (ej. docs o fixes mínimos), mientras que aplicar pruebas genéricas a refactors o migraciones ignora sus riesgos específicos.

## Decision
Emitir deterministamente un `ChallengePlan` proporcional derivado de `PolicySnapshot`, estrategia de evidencia (`bug`, `refactor`, `feature`, `migration`, `config-docs`, `strict-tdd`) y `CandidateId`, registrando motivos explícitos para cada tipo omitido.

## Alternatives
- **Suite universal fija**: Descartada por explosión de costes computacionales y lentitud.
- **Selección heurística/no-determinista por LLM**: Descartada por romper la reproducibilidad e idéntico replay.

## Consequences
- **Positivas**: Optimización del presupuesto de cómputo, validación focalizada y determinismo estricto.
- **Negativas**: Mayor granularidad en la lógica de selección y necesidad de mantener matrices de omisión justificadas.
- **Reversibilidad**: Alta.
