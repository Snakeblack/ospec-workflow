# ADR-006: Per-Node Required Evidence Enforcement in Replay Engine

- Status: proposed
- Change: k4a-integrity-and-bindings-remediation
- Date: 2026-08-16

## Context
In `replayExecutionGraph`, a recorded node result was marked as completed based solely on `status: "completed"`, without verifying whether all `node.required_evidence` items were present in `recorded.evidence`. This allowed downstream nodes to execute on incomplete prerequisite outputs, deferring detection to final obligation checks.

## Decision
Enforce node-level required evidence verification: before adding any node to `completedNodes`, verify that `node.required_evidence ⊆ Object.keys(recorded.evidence)`. If any required evidence item is missing, mark the node as failed/unfulfilled, block downstream dependent nodes, and generate a counterexample trace.

## Alternatives
- End-of-replay obligation check only: rejected because DAG dependency progression should halt when prerequisite evidence is missing.
- Warn and proceed with node completion: rejected because unfulfilled evidence violates semantic node completion contracts.

## Consequences
- Easier: Precise diagnosis of which node failed to supply required evidence in the counterexample trace.
- Harder: Replay fixtures must include all required evidence keys declared by the graph nodes.
- Reversibility: Medium; strengthens deterministic replay fidelity.
