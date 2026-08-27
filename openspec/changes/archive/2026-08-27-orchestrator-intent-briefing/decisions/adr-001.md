# ADR-001: Evolucionar D2 como briefing CORE acotado

- Status: proposed
- Change: orchestrator-intent-briefing
- Date: 2026-08-27

## Context

La validación de intención debe ocurrir antes de clasificación y artefactos, para
solicitudes vagas o específicas, y la aceptación pertenece al hilo humano.

## Decision

Extender `Intent Restatement` D2 en el CORE del orquestador. El orquestador sintetiza
2–4 líneas, pregunta y admite hasta dos correcciones; después ofrece solo confirmar la
última síntesis o abortar. Un explore delegado puede únicamente leer.

## Alternatives

- Crear `sdd-brief`: introduce una fase y delega indebidamente la decisión humana.
- Añadir un handler/gate paralelo: duplica autoridad pre-classification.
- Mantener skip-if-specific: conserva el fallo que este cambio corrige.

## Consequences

El contrato queda visible y uniforme en todos los entry points elegibles. Aumenta una
interacción inicial, pero es reversible restaurando D2 y regenerando targets.
