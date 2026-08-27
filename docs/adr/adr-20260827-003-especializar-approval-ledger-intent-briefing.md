# ADR-003: Especializar el Approval Ledger para intent-briefing

- Status: proposed
- Change: orchestrator-intent-briefing
- Date: 2026-08-27

## Context

La intención acordada necesita síntesis y alcance durables. Los gates actuales no
representan esa decisión y la confirmación de route sigue siendo independiente.

## Decision

Añadir `intent-briefing` al enum `gate`. Para ese gate, `synthesis` y `scope` son
obligatorios y `applies_to` incluye `change-classification`; esos extras no se usan en
otros gates. Esta aprobación nunca satisface route confirmation.

## Alternatives

- Reusar `architecture`: mezcla decisiones con semánticas distintas.
- Reusar route confirmation: permitiría saltar una confirmación advisory posterior.
- Guardar texto fuera del ledger: fragmenta la evidencia de aprobación.

## Consequences

El modelo de estado gana dos campos condicionales y un valor de enum, manteniendo
compatibilidad con entradas antiguas. Validadores y documentación deben aplicar la
condición por gate; revertir no requiere borrar entradas históricas.
