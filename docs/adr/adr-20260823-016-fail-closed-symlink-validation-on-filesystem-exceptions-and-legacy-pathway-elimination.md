# ADR-005: Fail-Closed Symlink Validation on Filesystem Exceptions and Legacy Pathway Elimination

- Status: proposed
- Change: k6a-runtime-boundary-closure
- Date: 2026-08-23

## Context
`checkSymlinkEscape` swallowed exceptions from `fs.realpathSync` and filesystem errors during ancestor path resolution, returning `{ isEscape: false }` and potentially allowing unauthorized operations. Additionally, runtime and contract checker files retained legacy `.files` fallbacks on `SourceSnapshot v1` and non-SHA-256 dependencies on `WorkOrder v2`.

## Decision
Make `checkSymlinkEscape` fail closed: any exception or `realpathSync` failure during path resolution immediately returns `{ isEscape: true, offendingPath: targetPath, reason: err.message }`, triggering a `containment-violation/v1` with `violation_type: "symlink_escape"`. Purge all runtime fallback paths expecting `.files` or path dependencies, and extend `k6a-canonical-contracts` checker (per REQ-contract-lint-018) to audit JS files and test fixtures for synthetic non-canonical contracts.

## Alternatives
- *Treat realpathSync failure as non-existent path (pass)*: Rejected because unresolvable symlink loops or permission anomalies must never grant write access.
- *Preserve legacy .files backward compatibility*: Rejected because K3 and K4a canonical contracts mandate decoupled `capsule_inputs` and pure SHA-256 DAG dependencies.
- *Warning-only contract linting*: Rejected because non-canonical contract usage compromises cryptographic identity guarantees.

## Consequences
- Prevents symlink bypasses resulting from unusual filesystem states or permission errors.
- Enforces strict canonical contract compliance across all runtime modules, tests, and fixtures.
- Reversibility: High; isolated to `allowed-paths-validator.js`, `worker-workspace.js`, and `k6a-canonical-contracts.js`.
