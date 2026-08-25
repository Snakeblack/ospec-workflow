## Verification Report

**Change**: k6a-isolation-frontier-hardening
**Version**: 2.47.1
**Mode**: Standard (focused TDD)

### Completeness
| Metric | Value |
|--------|-------|
| Tasks total | 39 |
| Tasks complete | 39 |
| Tasks incomplete | 0 |

### Build & Tests Execution
**Build**: ➖ Not configured (`rules.verify.build_command` empty)

**Tests**: ✅ 2608 passed / ❌ 0 failed / ⚠️ 2 skipped (2610 total)
```text
npm test  (node scripts/check.js)
  Native Node tests: node --test scripts/**/*.test.js
    # tests 2610
    # pass 2608
    # fail 0
    # skipped 2
  Generate + validate targets (github-copilot, opencode, codex, vscode, cursor, antigravity)
  claude CLI not found — generate without validator
All checks passed. exit 0
```

K6a suites included in the same run (all green): `worker-sandbox.test.js`, `worker-executor.test.js`, `capability-proof/index.test.js`, `host-contract/index.test.js`, `host-adapters/claude.test.js`, `k6a-e2e-worker-isolation.test.js`, `lifecycle-model.test.js`, `k6a-lifecycle-model.test.js`.

**Manual verification**: not performed
```text
Not required; automated runtime tests cover every change-local MUST scenario.
```

**Coverage**: ➖ Not available / threshold: 0% → ➖ Not available

### Spec Compliance Matrix
| Requirement | Scenario | Evidence Level | Source | Result | Notes |
|-------------|----------|----------------|--------|--------|-------|
| REQ-worker-isolation-011 | Mutated OSPEC_SANDBOX_* does not expand child allowed_paths | `runtime-test` | `worker-sandbox.test.js` > mutated OSPEC_SANDBOX_* spawn/execFile/fork; `k6a-lifecycle-model.test.js` > Invariant 7 | PASS | `confineChildEnv` rebuilds keys from capturedPolicy; preload freeze + confinedOptions |
| REQ-worker-isolation-011 | Closed inheritance and execPath guards stay green | `runtime-test` | `worker-sandbox.test.js` > nested spawnSync empty env; fake basename node; realpath identity | PASS | v2.47.1 `env:{}` / NODE_OPTIONS / fake-node still pass |
| REQ-worker-isolation-012 | Undeclared mutating fs API fails closed at the wrapper | `runtime-test` | `worker-sandbox.test.js` > Node 22 mutating fs inventory; `k6a-lifecycle-model.test.js` > Invariant 10 | PASS | mkdtemp/chmod/chown/utimes/lutimes/mkdtempDisposable + styles wrap before original call |
| REQ-worker-isolation-012 | Allowed mutating fs API succeeds inside captured paths | `runtime-test` | `worker-sandbox.test.js` > allowed mutating fs APIs succeed; `worker-executor.test.js` > post-flight containment | PASS | MAY succeed proven; post-flight still runs on ExecuteWorkOrder delta |
| REQ-worker-isolation-013 | Probe records PASS / BLOCKED / BLOCKED on the executing transport | `runtime-test` | `worker-sandbox.test.js` > isolation probe attempts three writes; `claude.test.js` > sandboxed worker demonstrates containment; Invariant 9 | PASS | Three real writes via executeSandboxedCommand on WorkerTransport |
| REQ-worker-isolation-013 | Vacuous blocked flag does not authorize enforced | `runtime-test` | `worker-sandbox.test.js` > isLiveIsolationProbeEvidence({blocked:true})===false; `claude.test.js` > vacuous primitive stays partial; executor containment-probe-unfulfilled | PASS | `{blocked:true}` without attempted writes rejected |
| REQ-worker-isolation-014 | Matching executing transport may report enforced | `runtime-test` | `worker-executor.test.js` > enforces capability proof; `claude.test.js` > probe and commands share fingerprint; E2E enforced path | PASS | Commands travel confinedTransportRun → executeSandboxedCommand |
| REQ-worker-isolation-014 | Different transport invalidates enforced | `runtime-test` | `worker-executor.test.js` > G≠F invalidates; `capability-proof/index.test.js` > TRANSPORT_IDENTITY_MISMATCH; Invariant 8 | PASS | Fail closed; isolationReported ≠ enforced |
| REQ-worker-isolation-008 | Enforced capability executes with sandbox and verified WorkerTransport | `runtime-test` | `worker-executor.test.js` > proof + transport → enforced; `k6a-e2e-worker-isolation.test.js` > Host Isolation Fallback / Real E2E | PASS | Sandboxed transport; isolationReported=enforced |
| REQ-worker-isolation-008 | Enforced capability without WorkerTransport fails closed | `runtime-test` | `worker-executor.test.js` > missing transport; E2E missing-transport; unconfined-spawn-refused when enforced without port | PASS | No local spawn claiming enforced |
| REQ-worker-isolation-008 | Partial instructional or unavailable refuses commands | `runtime-test` | `worker-executor.test.js` > refuse unless enforced (partial/instructional/unavailable); Invariant 6; E2E fallback | PASS | REQ-008 drift closed |
| REQ-worker-isolation-008 | Non-command primitives may use software boundary without enforced | `runtime-test` | `worker-executor.test.js` > non-command MAY complete; Invariant 6 internalOk | PASS | Completes; MUST NOT record enforced |
| REQ-capability-proof-006 | Matching executing transport live identity verifies | `runtime-test` | `capability-proof/index.test.js` > WorkerIsolation live-identity match | PASS | Proof schema still capability-proof/v1; no port_id/fingerprint fields on document |
| REQ-capability-proof-006 | Different transport invalidates enforced | `runtime-test` | `capability-proof/index.test.js` > TRANSPORT_IDENTITY_MISMATCH | PASS | G ≠ F fail closed |
| REQ-capability-proof-006 | Missing executing transport identity fails closed | `runtime-test` | `capability-proof/index.test.js` > expected-field-missing /expectedPortId and /expectedFingerprint | PASS | Live-identity inputs only; not proof-document fields |
| REQ-host-capabilities-contract-009 | Five transports remain the required port set | `runtime-test` | `host-contract/index.test.js` > exactly five required transports; `claude.js` buildTransports has no isolation port | PASS | REQUIRED_TRANSPORTS length 5; claude-worker-isolation removed |
| REQ-host-capabilities-contract-009 | WorkerIsolation is not a missing-port failure | `runtime-test` | `host-contract/index.test.js` > missing WorkerIsolation is not missing-transport-port; `registry.test.js` > degrades to unavailable | PASS | Honest partial/unavailable, not missing-transport-port |
| REQ-host-capabilities-contract-009 | WorkerTransport still rejects embedded isolation policy | `runtime-test` | `host-contract/index.test.js` > DeliveryGateTransport and WorkerTransport with embedded policy are rejected | PASS | isolation_policy → POLICY_OWNING_TRANSPORT |
| REQ-reference-host-adapter-007 | Probe and commands share one WorkerTransport fingerprint | `runtime-test` | `claude.test.js` > probe and commands share WorkerTransport fingerprint | PASS | expectedPortId/Fingerprint = WT.port_id/fingerprint |
| REQ-reference-host-adapter-007 | Mismatched or unconfined path cannot mark enforced | `runtime-test` | `claude.test.js` > unconfined spawnSync cannot mark enforced; E2E file has zero spawnSync | PASS | E2E enforced uses confinedTransportRun → executeSandboxedCommand |
| REQ-reference-host-adapter-007 | Three-way live probe is required for WorkerIsolation enforced | `runtime-test` | `claude.js` executeWorkerIsolationProbe; `claude.test.js` > sandboxed worker demonstrates containment; fixture-only tests | PASS | Host observes PASS/BLOCKED/BLOCKED; fixture-only digest refused |
| REQ-lifecycle-model-conformance-004 | Deferred invariant cannot satisfy K2.1 gate | `runtime-test` | `lifecycle-model.test.js` > deferred invariants are listed but do not count as K2 enforcement | PASS | deferred never counts_as_enforced |
| REQ-lifecycle-model-conformance-004 | CAS and permit invariants are not deferred | `runtime-test` | `lifecycle-model.test.js` > K2.1 manifest lists nine executable invariants not on deferred list | PASS | |
| REQ-lifecycle-model-conformance-004 | K2a host invariants are not deferred | `runtime-test` | `lifecycle-model.test.js` > K2a manifest lists six executable invariants not on deferred list | PASS | |
| REQ-lifecycle-model-conformance-004 | K4a Execution Graph and replay invariants are not deferred | `runtime-test` | `lifecycle-model.test.js` > every executable invariant / runAllInvariantCheckers includes K4A_EXECUTABLE_INVARIANTS; DEFERRED_INVARIANTS are def-* only | PASS | K4a checkers execute; none on deferred list |
| REQ-lifecycle-model-conformance-004 | K5 budget and recovery invariants are not deferred | `runtime-test` | `lifecycle-model.test.js` > K5 manifest lists seven executable invariants not on deferred list | PASS | |
| REQ-lifecycle-model-conformance-004 | K6a worker isolation and containment invariants are not deferred | `runtime-test` | `lifecycle-model.test.js` > K6a manifest lists ten executable invariants not on deferred list | PASS | Ten ids; none deferred |
| REQ-lifecycle-model-conformance-012 | Every K6a worker isolation invariant has an executable checker | `runtime-test` | `k6a-lifecycle-model.test.js` > K6a manifest lists 10 executable invariants | PASS | optional:false; runtime_composed:true |
| REQ-lifecycle-model-conformance-012 | Model proves containment violation halts execution fail-closed | `runtime-test` | `k6a-lifecycle-model.test.js` > Invariant 3 | PASS | containment-violation/v1 |
| REQ-lifecycle-model-conformance-012 | Model proves interrupted execution preserves partial telemetry | `runtime-test` | `k6a-lifecycle-model.test.js` > Invariant 5 | PASS | status interrupted |
| REQ-lifecycle-model-conformance-012 | Model proves commands without enforced fail closed | `runtime-test` | `k6a-lifecycle-model.test.js` > Invariant 6 | PASS | Fallback checker rewritten; id kept |
| REQ-lifecycle-model-conformance-012 | Model proves captured sandbox policy is immutable | `runtime-test` | `k6a-lifecycle-model.test.js` > Invariant 7 | PASS | |
| REQ-lifecycle-model-conformance-012 | Model proves WorkerIsolation binds the executing transport | `runtime-test` | `k6a-lifecycle-model.test.js` > Invariant 8 | PASS | |
| REQ-lifecycle-model-conformance-012 | Model proves the three-way probe is real | `runtime-test` | `k6a-lifecycle-model.test.js` > Invariant 9 | PASS | |
| REQ-lifecycle-model-conformance-012 | Model proves mutating fs wrap is exhaustive | `runtime-test` | `k6a-lifecycle-model.test.js` > Invariant 10 | PASS | |

**Compliance summary**: 35/35 scenarios satisfied at acceptable evidence levels (`runtime-test`)

### Frontier claims (user-intent)
| # | Claim | Verdict | Evidence |
|---|--------|---------|----------|
| 1 | Immutable captured policy (confineChildEnv from capturedPolicy, not live process.env OSPEC_SANDBOX_*) | PROVED | `worker-sandbox-confine.js` overwrites OSPEC_SANDBOX_* from snapshot; preload never re-reads live env after freeze; RED env-mutation tests pass |
| 2 | Exhaustive mutating fs wrap (mkdtemp/chmod/chown/utimes + disposable) | PROVED | preload wrapPromise/Sync/Callback families; inventory test + Invariant 10 |
| 3 | WorkerIsolation bound to executing WorkerTransport port_id/fingerprint; mismatch invalidates enforced | PROVED | verifyCapabilityProof expectedPortId/Fingerprint; executor executingWorkerTransportIdentity; G≠F tests |
| 4 | Probe attempts three writes; vacuous blocked:true rejected | PROVED | executeWorkerIsolationProbe + isLiveIsolationProbeEvidence |
| 5 | Commands fail-closed unless enforced (REQ-008) | PROVED | commandList + isolationReported !== enforced → refuse; partial/instructional/unavailable covered |
| 6 | E2E enforced uses executeSandboxedCommand, not unconfined spawnSync of the work-order command | PROVED | `k6a-e2e-worker-isolation.test.js` has zero spawnSync; confinedTransportRun → executeSandboxedCommand |
| 7 | No CandidateId; no K4b; v2.47.1 env:{} and fake-node tests still pass | PROVED | K6a production JS has no CandidateId emission / K4b Repair surfaces; sandbox inheritance + fake-node tests green in the 2608 pass set |

### Correctness (Static Evidence)
| Requirement | Status | Notes |
|------------|--------|-------|
| Immutable captured policy | ✅ Implemented | Object.freeze capturedPolicy; confineChildEnv(userEnv, capturedPolicy, preloadPath) |
| Exhaustive mutating fs wrap | ✅ Implemented | assertWriteAllowed / assertMutationTargetAllowed before original; fd→path registry |
| Live three-way probe | ✅ Implemented | Three attempted writes through WorkerTransport; host existsSync |
| Transport-bound WorkerIsolation | ✅ Implemented | expectedPortId + expectedFingerprint; no sixth port; proof schema unchanged |
| REQ-008 fail-closed commands | ✅ Implemented | Refuse command lists unless isolationReported=enforced |
| No CandidateId / no K4b / no OS jail | ✅ Implemented | software_surface; CandidateId only as prohibition comments; K4b out of scope |

### Coherence (Design)
| Decision | Followed? | Notes |
|----------|-----------|-------|
| ADR-001 Captured policy snapshot | ✅ Yes | confineChildEnv reconstructs OSPEC_SANDBOX_* + NODE_OPTIONS from snapshot |
| ADR-002 Live identity, no schema field | ✅ Yes | expectedPortId/Fingerprint; evidence hashed; proof required fields unchanged |
| ADR-003 Commands fail-closed | ✅ Yes | No local-subprocess command fallback for partial/unavailable |
| Capability on WorkerTransport, not sixth port | ✅ Yes | buildTransports has five ports; probe via executeWorkerIsolationProbe(WorkerTransport) |
| WorkerTransport.fingerprint = sha256(adapter_id, port_id, probe_digest) under worker-transport-live-identity/v1 | ✅ Yes | stampWorkerTransportLiveIdentity; confirms sdd-design-002 |
| Semantic evidence carries transport.port_id/fingerprint | ✅ Yes | Confirms sdd-design-001 |
| enforced is software-boundary, not OS jail | ✅ Yes | architecture-001 |

### Issues Found
**CRITICAL**: None
**WARNING**: None
**SUGGESTION**: None

### Traceability Matrix
| REQ | Tasks | Commits | Tests | Status |
|-----|-------|---------|-------|--------|
| REQ-worker-isolation-011 | 1.1–1.5 | working-tree (uncommitted) | `worker-sandbox.test.js`; Invariant 7 | OK |
| REQ-worker-isolation-012 | 2.1–2.5 | working-tree (uncommitted) | `worker-sandbox.test.js`; Invariant 10 | OK |
| REQ-worker-isolation-013 | 4.1, 4.5–4.7 | working-tree (uncommitted) | `worker-sandbox.test.js`; `claude.test.js`; Invariant 9 | OK |
| REQ-worker-isolation-014 | 4.1, 5.1–5.6 | working-tree (uncommitted) | `worker-executor.test.js`; `claude.test.js`; E2E; Invariant 8 | OK |
| REQ-worker-isolation-008 | 5.1–5.4, 5.7 | working-tree (uncommitted) | `worker-executor.test.js`; E2E fallback; Invariant 6 | OK |
| REQ-capability-proof-006 | 3.1–3.3, 4.4 | working-tree (uncommitted) | `capability-proof/index.test.js` | OK |
| REQ-host-capabilities-contract-009 | 3.3–3.5, 4.2 | working-tree (uncommitted) | `host-contract/index.test.js`; `claude.test.js`; `registry.test.js` | OK |
| REQ-reference-host-adapter-007 | 4.1–4.7, 5.4–5.6 | working-tree (uncommitted) | `claude.test.js`; `k6a-e2e-worker-isolation.test.js` | OK |
| REQ-lifecycle-model-conformance-004 | 6.1, 6.7 | working-tree (uncommitted) | `lifecycle-model.test.js` | OK |
| REQ-lifecycle-model-conformance-012 | 6.1–6.7 | working-tree (uncommitted) | `k6a-lifecycle-model.test.js`; `lifecycle-model.test.js` | OK |

### Assumption Reconciliation
| id | statement | reversibility | outcome |
|----|-----------|----------------|---------|
| sdd-propose-001 | Transport binding is live-identity of REQ-005 rather than a new CapabilityProof schema field | high | confirmed |
| sdd-spec-001 | WorkerIsolation binding is live-identity only; no new required proof field | high | confirmed |
| sdd-design-001 | Semantic evidence carries transport.port_id and transport.fingerprint hashed into evidence_digest | high | confirmed |
| sdd-design-002 | WorkerTransport.fingerprint is sha256Fingerprint of adapter_id, port_id, and live probe_digest under worker-transport-live-identity/v1 | high | confirmed |

### Verdict
PASS
All 35 change-local MUST scenarios have runtime-test evidence; npm test is green (2608 pass / 0 fail / 2 skipped); the seven frontier claims are proved; design ADRs are followed; assumptions confirmed with no unresolved low-reversibility entries.
