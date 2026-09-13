# Apply Progress: Phase Envelope and State Mechanical Projection (CX1)

## Executive Summary

- **Change**: `phase-envelope-state-mechanical-projection`
- **Branch**: `feat/phase-envelope-state-mechanical-projection`
- **Workload Decision**: `feature-branch-chain` (approved under review id: `review-workload-001`)
- **Status**: Completed (Phases 1 through 5 fully implemented and verified)
- **Regression Suite**: `npm test` passing with zero failures.

---

## Requirements Traceability Matrix

| Requirement ID | Description | Source Files | Test Coverage | Status |
|---|---|---|---|---|
| `REQ-kernel-contract-schemas-001` | Register `result-envelope` family pin (v1) in manifest and claims | `schemas/kernel/manifest.json`, `schemas/kernel/contract-claims.json` | `result-envelope-schema-fixtures.test.js`, `k1-schema-compat.test.js` | PASS |
| `REQ-kernel-contract-schemas-031` | Define versioned `result-envelope/v1` schema and test fixtures | `schemas/kernel/result-envelope/v1/envelope.schema.json`, fixtures | `result-envelope-schema-fixtures.test.js` | PASS |
| `REQ-skills-018` | Strict `result-envelope/v1` validation with version check and signal order | `scripts/lib/result-envelope.js` (`validateEnvelope`) | `result-envelope.test.js` | PASS |
| `REQ-skills-019` | Decoupled pure human renderer (`renderEnvelopeToMarkdown`) | `scripts/lib/result-envelope.js` | `result-envelope.test.js` | PASS |
| `REQ-skills-001` | Prohibition of direct agent state writes; mechanical projection authority | `skills/_shared/sdd-phase-common.md` (§C, §D) | `clarify-signal-contract.test.js`, hook integration tests | PASS |
| `REQ-lifecycle-kernel-028` | Pure `PhaseCompletionReducer` state advance and approval rejection | `scripts/lib/lifecycle-kernel/phase-completion-reducer.js`, `reducer.js` | `phase-completion-reducer.test.js` | PASS |
| `REQ-lifecycle-kernel-029` | Locked state projection with CAS check, .bak recovery, and replay idempotency | `scripts/lib/ospec-state.js` (`projectPhaseCompletion`) | `ospec-state.test.js` | PASS |
| `REQ-lifecycle-kernel-030` | Pure legacy envelope adapter (`adaptLegacyEnvelope`) | `scripts/lib/result-envelope.js` | `result-envelope.test.js` | PASS |
| `REQ-agents-029` | Rejection of model self-attested approvals and synthetic gate advancement | `scripts/lib/lifecycle-kernel/phase-completion-reducer.js` | `phase-completion-reducer.test.js` | PASS |
| `REQ-hooks-015` | Canonical agent resolution and fail-closed validation for `sdd-spec` | `scripts/hooks/subagent-stop.js` | `subagent-stop.test.js` | PASS |
| `REQ-hooks-023` | `SubagentStop` delegates state projection to `PhaseCompletionReducer` under lock | `scripts/hooks/subagent-stop.js` (`persistResultEnvelope`) | `subagent-stop.test.js` | PASS |

---

## TDD Implementation Cycles

### Phase 1: Kernel Contract Schema, Registration & Fixtures
- **RED**: Created `scripts/lib/result-envelope-schema-fixtures.test.js` testing schema resolution, manifest indexing, and positive/negative fixtures. Failed as expected (schema absent).
- **GREEN**:
  - Implemented `schemas/kernel/result-envelope/v1/envelope.schema.json` with `$id: "https://openspec.io/schemas/kernel/result-envelope/v1.schema.json"` and backward-compatible mirrors.
  - Created canonical fixtures (`valid-v1.json`, `blocked-v1.json`, `ambiguity-spec-v1.json`, `invalid-v1.json`, `legacy-unversioned.json`) in both flat and subdirectories.
  - Registered `result-envelope` in `schemas/kernel/manifest.json` and `schemas/kernel/contract-claims.json`.
  - Updated `scripts/lib/kernel-schema-validator.js` to support `(?:\.schema\.json)?$` IDs.
- **VERIFY**: `node --test scripts/lib/result-envelope-schema-fixtures.test.js` passed (5/5).

### Phase 2: Result Envelope v1 Validator, Legacy Adapter & Decoupled Renderer
- **RED**: Added tests in `scripts/lib/result-envelope.test.js` for strict `schema_version: 1`, `adaptLegacyEnvelope`, and `renderEnvelopeToMarkdown`. Observed RED.
- **GREEN**:
  - Updated `validateEnvelope`: enforced `schema_version: 1`, `key_decisions` max 3 strings, and spec ambiguity canonical order.
  - Implemented `adaptLegacyEnvelope`: pure normalization of unversioned fences and prose-adjacent envelopes to valid v1 objects.
  - Implemented `renderEnvelopeToMarkdown`: read-only pure markdown formatter without input payload mutation.
- **VERIFY**: `node --test scripts/lib/result-envelope.test.js` passed (42/42).

### Phase 3: Pure PhaseCompletionReducer
- **RED**: Created `scripts/lib/lifecycle-kernel/phase-completion-reducer.test.js` testing pure reduction, CAS conflicts, payload hash replay idempotency, and synthetic gate rejection. Observed RED.
- **GREEN**:
  - Implemented `reducePhaseCompletion` in `scripts/lib/lifecycle-kernel/phase-completion-reducer.js`.
  - Re-exported in `scripts/lib/lifecycle-kernel/reducer.js`.
- **VERIFY**: `node --test scripts/lib/lifecycle-kernel/phase-completion-reducer.test.js` passed (6/6).

### Phase 4: State Projection & SubagentStop Hook Integration
- **RED**: Added unit tests in `scripts/lib/ospec-state.test.js` for `projectPhaseCompletion` and integration tests in `scripts/hooks/subagent-stop.test.js`. Observed RED.
- **GREEN**:
  - Implemented `projectPhaseCompletion` in `scripts/lib/ospec-state.js` with `withFileLock`, `recoverOrphanBak`, and `writeFileAtomic`.
  - Integrated `projectPhaseCompletion` and `adaptLegacyEnvelope` into `persistResultEnvelope` and `resolveDispatchStatus` in `scripts/hooks/subagent-stop.js`.
- **VERIFY**: `ospec-state.test.js` (67/67) and `subagent-stop.test.js` (69/69) passed.

### Phase 5: Skill & Protocol Alignment & Full Verification
- **Doc Updates**: Updated `skills/_shared/sdd-phase-common.md` (§C, §D) prohibiting direct agent mutations to `state.yaml` and documenting mechanical projection.
- **Compat Safeguards**: Updated `scripts/lib/contract-checkers/k1-schema-compat.js`, `scripts/lib/lifecycle-kernel/k1-compat.js`, and `scripts/lib/k1-scope-guard.test.js` to acknowledge post-K1 additive result-envelope family.
- **Full Verification**: `npm test` executed across all repository test suites, passing with zero failures.
