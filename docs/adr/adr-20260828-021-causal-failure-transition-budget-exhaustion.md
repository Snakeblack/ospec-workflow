# ADR-003: Causal Failure Transition on Challenge Budget Exhaustion

- Status: proposed
- Change: k6c-policy-selected-challenges
- Date: 2026-08-28

## Context
Las pruebas adversariales y mutaciones de código pueden caer en bucles lentos o reintentos ciegos idénticos ante escenarios complejos, agotando cuotas y tokens sin aportar valor incremental de verificación.

## Decision
Establecer un `ChallengeBudget` explícito (`max_challenges`, `mutation_budget`, `timeout_seconds`) con decremento monótono. Al agotarse cualquiera de las cuotas, el ejecutor detiene de inmediato el proceso y emite una transición causal tipada (`causal-failure/v1`) con código `CHALLENGE_BUDGET_EXHAUSTED` y categoría `validation_gap`, prohibiendo reintentos idénticos no remediados.

## Alternatives
- **Reintentos ciegos con backoff exponencial**: Descartada porque repetir la misma prueba sobre un candidato congelado produce el mismo agotamiento.
- **Degradar el fallo a WARNING y continuar**: Descartada porque violaría la garantía fail-closed del verifier.

## Consequences
- **Positivas**: Bounding estricto de costes de cómputo, diagnóstico determinista de cuellos de botella y parada fail-closed limpia.
- **Negativas**: Obliga a dimensionar adecuadamente las cuotas por política y estrategia.
- **Reversibilidad**: Media.
