# ADR-002: Pure PhaseCompletionReducer State Projection

- Status: proposed
- Change: phase-envelope-state-mechanical-projection
- Date: 2026-09-11

## Context
SDD phase agents currently perform ad-hoc read-merge-write updates to `state.yaml`, causing formatting anomalies, lost approval records, and occasional LLM hallucination of state advancements. State projection must be centralized in the runtime kernel as a deterministic, mechanical responsibility.

## Decision
Introduce `reducePhaseCompletion(currentState, payload, options)` as a pure function in `scripts/lib/lifecycle-kernel/phase-completion-reducer.js` that computes next change state, lifecycle node advances, explicit effects, and journal events without direct filesystem or clock I/O.

## Alternatives
- Agent-side direct state writes: rejected due to frequent YAML corruption, dropped comments, and accidental loss of existing state fields.
- Orchestrator LLM state reasoning: rejected because models non-deterministically infer gate passage and phase completion without verified invariants.

## Consequences
Isolates state transition logic from I/O and model unpredictability, makes state reduction completely unit-testable without filesystem mocks, and relieves phase agents of mechanical state persistence boilerplate. Direct agent writes to `state.yaml` are prohibited.
