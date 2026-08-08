# Tasks: K3 Cumulative Schema & Binding Remediation

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Low

Estimated changed lines: 250 lines
Delivery strategy: exception-ok (single batch apply)
Suggested split: 1 PR

## Work Units & Phase Sequence

### Phase 1: Deep Compute Shape Validations
- [ ] Task 1: Update `computeWorkOrderId` in `scripts/lib/execution-identities/index.js` to validate `ownership` (`owner`, `mode`), `budget` (`model_turns`, `patches`, `commands`, `wall_time_minutes`, `changed_lines`), and `dependencies` items (`sha256:<64 hex>`).
- [ ] Task 2: Update `computeWorkResultId` in `scripts/lib/execution-identities/index.js` to validate `patch` string type, `commands` items (`command`, `exit_code`, `duration_ms`), `logs` items (`stream` `"stdout"`|`"stderr"`, `content`), and `filesystem_inventory` items (`path`, `sha256`, `mode`).

### Phase 2: Structural V1 Identity Guard & EXPECTED_KINDS Cleanup
- [ ] Task 3: Clean up `EXPECTED_KINDS` table in `validateIdentityKind` so `Candidate` accepts `"candidate/v2"` and `WorkOrder` accepts `"work-order/v2"`.
- [ ] Task 4: Update `validateIdentityKind` for `SourceSnapshot` and `WorkResult`: when `kind === undefined`, execute JSON Schema validation against `source-snapshot/v1` or `work-result/v1`. Fail closed if invalid.

### Phase 3: Cumulative Binding Gates
- [ ] Task 5: Update `validateWorkOrderBinding` in `scripts/lib/execution-identities/index.js` to execute JSON Schema validation for `sourceSnapshot` (`source-snapshot/v1`) and `workOrder` (`work-order/v2`) prior to/alongside digest recompute.
- [ ] Task 6: Update `validateWorkResultBinding` in `scripts/lib/execution-identities/index.js` to execute JSON Schema validation for `workOrder` (`work-order/v2`) and `workResult` (`work-result/v1`) prior to/alongside digest recompute.

### Phase 4: Adversarial Unit Testing & Verification
- [ ] Task 7: Add adversarial TDD unit tests in `scripts/lib/execution-identities/index.test.js`:
  - WorkOrder missing `status`, empty `ownership: {}`, empty `budget: {}`, non-sha256 dependency.
  - WorkResult `patch: 42`, `commands: [42]`, `logs: [{}]`, `filesystem_inventory: ["x"]`.
  - `validateIdentityKind({}, "SourceSnapshot")` and `validateIdentityKind({}, "WorkResult")` failing closed.
  - WorkOrder v2 missing `status` passing to `validateWorkOrderBinding` failing closed.
- [ ] Task 8: Execute `npm test` (`node scripts/check.js`) and confirm all repository tests pass with 0 errors and 0 warnings.
