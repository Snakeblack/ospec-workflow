# Focused TDD Module — Apply Phase

> **This module is loaded ONLY when Focused TDD Mode is enabled (`testing.tdd_mode: focused`).**
> Focused TDD balances quality with token and execution efficiency for team workflows.

## Execution Flow

For each material behavior in assigned tasks:

1. **RED**: Write ONE meaningful, targeted regression/behavior test covering the intended spec behavior.
2. **GREEN**: Implement the complete intended behavior in production code.
3. **RUN**: Execute the targeted test set ONCE to verify it passes.
4. **TRIANGULATE (Conditional)**: Add extra test cases ONLY for materially different spec branches (skip for simple/structural tasks).
5. **REFACTOR**: Refactor production and test code as ONE batch.
6. **VERIFY BATCH**: Run the targeted test set ONCE after completing the refactor batch.

## Boundaries and Exclusions

To maintain low token overhead and high execution speed, Focused TDD explicitly excludes:
- No formal TDD Cycle Evidence table in `apply-progress.md` (only standard task completion `[x]`).
- No per-task triangulation ceremony when single tests cover the contract.
- No per-step test executions during micro-refactorings (execute once after the batch).
- No assertion quality audits during the apply phase.
