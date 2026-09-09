# Apply Progress: Compact Lite Contract and Consumer Compatibility

## PR 1 — Route Contracts and Validators

### Completed tasks

- [x] 1.1 Route-aware predecessor validation
  - RED: Added lite and standard transition fixtures plus CLI coverage for persisted-route authority, route conflicts, and undeclared persisted routes.
  - GREEN: `validate-phase.js` resolves `state.yaml.route.actual_route`, rejects conflicts and undeclared persisted routes, and supplies route-aware artifacts to `validatePhaseTransition`.
  - Verification: `node --test scripts/lib/flow-validator.test.js scripts/configure/validate-phase.test.js scripts/lib/route-dispatcher.test.js` — 116 passing, 0 failing.
- [x] 1.2 Routing floors and five-phase lite regression
  - Added a configuration-backed routing fixture proving the single lite route remains `sdd-propose → sdd-tasks → sdd-apply → sdd-verify → sdd-archive` and a `public_api` impact selects `standard` with the planned floor.
  - Verification: same focused test command — 116 passing, 0 failing.

### Batch verification

- `npm test` — exit 0.

### Files changed

- `skills/_shared/openspec-convention.md`: documented the persisted-route artifact-precondition matrix.
- `scripts/lib/flow-validator.js` and tests: validate proposal/spec/design predecessors for standard routes and `proposal-lite.md` for lite tasks.
- `scripts/configure/validate-phase.js` and tests: make the persisted route authoritative at CLI validation time.
- `scripts/lib/route-dispatcher.test.js`: pin routing-table lite phase order and public API floor behavior.

### Scope and next batch

This chained PR slice starts from `feat/compact-lite-contract-and-consumer-compatibility` and ends with route/dependency validation only. It does not modify phase producers/consumers, recovery, archive integrity, generated targets, or `dist/`.

Remaining tasks: 2.1–5.3.

## Integration remediation — K1 scope guard

- [~] 1.1–1.2 are awaiting the staged pre-commit equivalent after the initial hook rejected unmanifested `flow-validator` changes and a `validate-phase.js` byte drift against the frozen K1 baseline.
- The correction adds an explicit post-K1 successor classification for the flow validator files and a singleton protected-path successor contract for `validate-phase.js`; both preserve the K1 allowlist boundary and standard-route gate.

### Integration verification

- [x] 1.1–1.2: `node --test scripts/lib/k1-scope-guard.test.js scripts/lib/flow-validator.test.js scripts/configure/validate-phase.test.js scripts/lib/route-dispatcher.test.js` — 122 passing, 0 failing.
- [x] Staged pre-commit equivalent: `node scripts/check.js --staged` — exit 0.
- [x] Pre-commit wrapper: `node scripts/hooks/pre-commit-hook.js` — exit 0.
- K1 protection remains narrow: the frozen K1 inventory is not edited, the K1 allowlist is unchanged, and only `scripts/configure/validate-phase.js` is admitted as a named post-K1 protected-path evolution with standard/lite regression coverage.
