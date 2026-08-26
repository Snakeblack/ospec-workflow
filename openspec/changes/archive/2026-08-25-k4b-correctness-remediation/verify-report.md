# Verification Report: k4b-correctness-remediation

- Change: `k4b-correctness-remediation`
- Version: `2.48.0`
- Mode: standard
- TDD mode: focused (not strict)
- Status: full discovery completed after superseded lineage
- Verdict: PASS WITH WARNINGS
- Date: 2026-08-26
- Genesis candidate: `sha256:68dc36747b628b347b223da413a4d1c77dde56bb874af21eefa5861a5e1a3ddb`
- Superseded-lineage candidate: `sha256:279d779fb8b5fc5c3360be05e3948355dea88a2b272fbc0cf16195739b2bc8bc`
- Lineage router: `supersede-and-discovery` (`contract-changed`)

## Completeness

| Metric | Value |
|---|---:|
| Tasks complete | 37 / 38 |
| Core tasks complete | 37 / 37 |
| Optional cleanup task incomplete | 6.6 (`docs/architecture/harness-evolution.md`) |
| Spec scenarios | 20 |
| Scenarios with acceptable evidence | 20 |
| Scenarios without required runtime proof | 0 |

## Build, Tests, and Coverage

| Check | Command | Result |
|---|---|---|
| Full repository suite | `npm test` | PASS — 2651 tests: 2649 passed, 0 failed, 2 skipped; exit 0; `All checks passed.` |
| K4b E2E within full suite | `scripts/k4b-repair-shadow-e2e.test.js` | PASS — real K6a happy path plus fault/isolation cases |
| Maturity contract within full suite | `scripts/lib/k2a-maturity-docs.test.js` | PASS — K3 done, K4b in-progress, K6b blocked |
| Build/type-check | Not configured | Not evaluated |
| Coverage | Unavailable in project configuration | Not evaluated |
| Manual verification | Not performed | Automated runtime and source inspection used |

Runtime evidence was freshly executed at `2026-08-25T22:07:46Z`; the command completed in 66.491 seconds with exit code 0. This supersedes the stale 2648-pass/1-fail evidence from the previous discovery.

## Production-Path Audit

| Audit target | Evidence | Result |
|---|---|---|
| No `executorFn` production bypass | `orchestrator.js` calls only `workerExecutor.executeWorkOrder(invocation)`; repository search finds `executorFn` only in negative tests | PASS |
| Object signature and authority | Frozen invocation contains `workOrder`, `workspace`, WorkerTransport and isolation authority after filtering five allowlisted node inputs | PASS |
| Real K6a E2E | E2E constructs Claude `WorkerTransport` plus `WorkerIsolation`; N1 writes `multiply()`, N2 imports it from a fresh derived-base workspace and logs `multiply_ok=6` | PASS |
| Per-WorkOrder patch authority | Integrator resolves each `WorkResult.work_order_id` and validates the target against that WorkOrder's `allowed_paths`; hunk context/deletion and modes fail closed before freeze | PASS |
| Seven dimensions | Comparator always pushes steps, dependencies, diffs, inventory, obligations, invariants, and execution metrics; empty values remain evaluated | PASS |
| Mandatory execution record | Success requires a usable store; missing store returns `MISSING_EXECUTION_STORE`, persistence failure remains `promoted:false`, and successful E2E reloads `repair-shadow-execution/v1` by CandidateId | PASS |
| Candidate origin anchor | Final integration passes `sourceSnapshot.base_tree_digest` to `freezeCandidate`; E2E and unit tests assert the original base tree | PASS |

## Spec Compliance Matrix

| Requirement | Scenario | Evidence level | Source | Result | Notes |
|---|---|---|---|---|---|
| REQ-repair-shadow-008 | N2 executes N1 `multiply()` on derived base with fresh workspaces | `runtime-test` | `scripts/k4b-repair-shadow-e2e.test.js` E2E happy path | PASS | Real WorkerTransport and WorkerIsolation; no executor substitute |
| REQ-repair-shadow-008 | Identical predecessors produce identical derived digest | `runtime-test` | `index.test.js` Phase 3.3b | PASS | Two independent stores/runs |
| REQ-repair-shadow-008 | Shared mutable workspace is not reused | `runtime-test` | K4b E2E + Phase 3.3 | PASS | Distinct workspace IDs; both disposed |
| REQ-repair-shadow-009 | Successful run persists bound v1 record | `runtime-test` | K4b E2E + Phase 3.6 | PASS | Candidate, graph, and policy bindings asserted |
| REQ-repair-shadow-009 | Record is queryable for replay/audit | `runtime-test` | K4b E2E + Phase 3.4 | PASS | Reload by CandidateId and defensive copy |
| REQ-repair-shadow-009 | Missing/divergent bindings fail closed without promotion | `runtime-test` | Phases 1.7, 3.4, 3.8 | PASS | Includes missing store and unusable store |
| REQ-repair-shadow-001 | Acyclic graph executes topologically through K6a | `runtime-test` | K4b real E2E | PASS | N1 precedes N2 through production executor |
| REQ-repair-shadow-001 | Invalid graph binding halts before allocation | `runtime-test` | `index.test.js` Phase 3.1 | PASS | Invalid binding and cycle paths |
| REQ-repair-shadow-001 | Node failure blocks dependents and cleans workspace | `runtime-test` | K4b fault-injection E2E + Phase 3.7 | PASS | N2/N3 blocked; workspace disposed |
| REQ-repair-shadow-001 | Caller `executorFn` is never invoked | `runtime-test` | `index.test.js` Phase 1.4 | PASS | Spy remains at zero; object signature asserted |
| REQ-repair-shadow-001 | Unsafe dispatch authority is rejected | `runtime-test` | `index.test.js` Phase 1.1 | PASS | Non-allowlisted per-node keys fail before dispatch |
| REQ-repair-shadow-003 | Raw WorkResult integrates and freezes Candidate v2 | `runtime-test` | `index.test.js` Phase 2.3/2.5 | PASS | CandidateId recomputed and base anchored |
| REQ-repair-shadow-003 | Path outside WorkOrder authority fails before freeze | `runtime-test` | `index.test.js` Phase 2.1 | PASS | WorkOrder authority wins over broader options |
| REQ-repair-shadow-003 | Identical source and patches produce identical CandidateId | `runtime-test` | `index.test.js` deterministic integration case | PASS | Repeated freeze is byte-identical |
| REQ-repair-shadow-003 | Context/deletion mismatch fails closed | `runtime-test` | `index.test.js` Phase 2.1 mismatch cases | PASS | No Candidate emitted |
| REQ-repair-shadow-003 | File modes affect Candidate v2 | `runtime-test` | `index.test.js` Phase 2.3 mode-only case | PASS | Distinct mode digest and CandidateId |
| REQ-repair-shadow-006 | Seven-dimensional match is recorded | `runtime-test` | `index.test.js` Phases 4.1/4.2 and 2.5 | PASS | All seven dimensions evaluated |
| REQ-repair-shadow-006 | Divergence emits telemetry without throwing | `runtime-test` | `index.test.js` Phases 4.3/4.4 | PASS | `match:false` and structured telemetry |
| REQ-repair-shadow-006 | Production HEAD, branches, and defaults remain byte-identical | `runtime-test` | `scripts/k4b-repair-shadow-e2e.test.js` happy path | PASS | Snapshots repository HEAD, all branches, and `openspec/config.yaml` immediately before/after real K6a orchestration |
| REQ-repair-shadow-006 | Empty values still count as evaluated | `runtime-test` | `index.test.js` Phase 2.5 | PASS | `skipped_dimensions` is empty |

Compliance summary: **20 / 20 scenarios satisfy their MUST evidence requirement**.

## Correctness (Static Evidence)

| Requirement area | Status | Notes |
|---|---|---|
| Closed K6a dispatch | Implemented | Five-key allowlist; authoritative properties assigned after filtering; frozen invocation |
| Material dependency propagation | Implemented | Transitive predecessors are reintegrated from S0 into deterministic effective bases |
| Strict patch integration | Implemented | Per-WorkOrder containment, hunk counts/overlaps/context/deletion, and mode validation |
| Candidate freeze | Implemented | One final freeze; `base_tree` remains original SourceSnapshot digest |
| Complete comparator | Implemented | Fixed seven-dimension list, including empty values |
| Auditable persistence | Implemented | Binding recomputation, filesystem-store CAS, idempotent retry, defensive query |

## Design Coherence

| Decision | Followed? | Notes |
|---|---|---|
| ADR-001 derived base without origin drift | Yes | Fresh workspace per node and original SourceSnapshot identity preserved |
| ADR-002 closed executeWorkOrder constructor | Yes | No production `executorFn` branch |
| ADR-003 incremental integration and single freeze | Yes | Per-node material propagation, final S0-anchored Candidate |
| ADR-004 filesystem-store execution index | Yes | CAS index keyed by CandidateId |
| Documentation coherence | Partial | Authoritative roadmap is current, but `docs/architecture/harness-evolution.md` still reports K4b done/K6b next-eligible |

## Traceability Matrix

| REQ | Tasks | Commits | Runtime tests | Status |
|---|---|---|---|---|
| REQ-repair-shadow-001 | 1.1–1.4, 3.2, 3.7, 4.3–4.5, 5.4 | Working tree; no phase commits | Focused suite + K4b E2E | OK |
| REQ-repair-shadow-003 | 2.1–2.4, 4.5, 5.4 | Working tree; no phase commits | Integrator cases in focused suite | OK |
| REQ-repair-shadow-006 | 2.5–2.6, 4.5, 5.4, 6.3–6.5 | Working tree; no phase commits | Comparator tests + production-surface snapshot E2E | OK |
| REQ-repair-shadow-008 | 1.5–1.6, 2.7, 3.1–3.3, 4.1–4.2, 5.2 | Working tree; no phase commits | Real K6a E2E + derived-base tests | OK |
| REQ-repair-shadow-009 | 1.7–1.8, 3.4–3.6, 3.8, 5.2 | Working tree; no phase commits | Store, missing-store, failure, and E2E query tests | OK |

## Assumption Reconciliation

| id | statement | reversibility | outcome |
|---|---|---|---|
| `sdd-spec-001` | Exact dispatch allowlist deferred to design | high | Resolved by design with five explicit keys |
| `sdd-apply-001` | Persistence previously conditional on store presence | high | Corrected: store is mandatory; missing store fails closed with no promotion |

## Issues Found

### CRITICAL

None.

Resolved by this full discovery:

1. **K4B-V001**: RESOLVED — the maturity assertion now follows the current roadmap contract and passed in `npm test`.
2. **K4B-V002**: RESOLVED — fresh full-suite evidence is 2649 passed, 0 failed, 2 skipped, exit 0.
3. **K4B-V003**: RESOLVED — the real K6a happy-path E2E snapshots production HEAD, branches, and configuration defaults before/after orchestration and passed.

### WARNING

1. **K4B-W001** `[tasks-gap]`: `docs/architecture/harness-evolution.md` remains stale relative to the authoritative roadmap (K4b done/K6b next-eligible versus K4b in progress/K6b blocked).

### SUGGESTION

None.

## Targeted Recheck — Generation 1

Generation 1 remains preserved as `superseded` with terminal reason `contract-drift`. A direct `getLineageNextAction(...)` call returned `supersede-and-discovery` (`contract-changed`), so verification proceeded through the full discovery pipeline rather than Pipeline A.

The new discovery produced no BLOCKER or CRITICAL findings, so no successor lineage generation was opened. K4B-V001, K4B-V002, and K4B-V003 are certified fixed by fresh runtime evidence. `K4B-W001` remains the sole advisory finding.

## Final Verdict

**PASS WITH WARNINGS**

All 20 MUST scenarios have acceptable runtime evidence, all core tasks are complete, and `npm test` passes with 2649 passed, 0 failed, and 2 skipped. Archive is acceptable with the non-blocking K4B-W001 documentation warning.
