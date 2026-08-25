# Tasks: K6a Isolation Frontier Hardening

## Spec/Design Reconciliation

| Requirement / Scenario | Priority | Design Allocation | Status | Notes |
|------------------------|----------|-------------------|--------|-------|
| REQ-worker-isolation-011 / Mutated OSPEC_SANDBOX_* | MUST | `worker-sandbox-preload.js`, `worker-sandbox-confine.js` | covered-by-design | Snapshot → `confineChildEnv`; RED spawn/execFile/fork |
| REQ-worker-isolation-011 / Closed inheritance guards | MUST | `worker-sandbox-confine.js`, `worker-sandbox.test.js` | covered-by-design | v2.47.1 `env:{}` + `realpath(process.execPath)` unchanged |
| REQ-worker-isolation-012 / Undeclared mutating fs fail-closed | MUST | `worker-sandbox-preload.js` | covered-by-design | Wrapper before mutation; inventory not sole check |
| REQ-worker-isolation-012 / Allowed mutating fs succeeds | MUST | `worker-sandbox-preload.js` | covered-by-design | Post-flight still runs |
| REQ-worker-isolation-013 / PASS/BLOCKED/BLOCKED probe | MUST | `worker-sandbox.js`, `host-adapters/claude.js` | covered-by-design | Three real writes via executing WorkerTransport |
| REQ-worker-isolation-013 / Vacuous blocked flag | MUST | `worker-sandbox.js`, `worker-executor.js` | covered-by-design | Require `attempted:true`; `{blocked:true}` alone rejected |
| REQ-worker-isolation-014 / Matching transport enforced | MUST | `worker-executor.js`, `claude.js` | covered-by-design | Same fingerprint; confined path only |
| REQ-worker-isolation-014 / Different transport invalidates | MUST | `worker-executor.js`, `capability-proof/index.js` | covered-by-design | G ≠ F → fail closed |
| REQ-worker-isolation-008 / Enforced with sandbox + WT | MUST | `worker-executor.js` | covered-by-design | Existing path + identity bind |
| REQ-worker-isolation-008 / Enforced without WT fails | MUST | `worker-executor.js` | covered-by-design | No local spawn claiming enforced |
| REQ-worker-isolation-008 / Partial refuses commands | MUST | `worker-executor.js` | covered-by-design | REQ-008 drift closure |
| REQ-worker-isolation-008 / Non-command MAY complete | MUST | `worker-executor.js`, `worker-workspace.js` | covered-by-design | No enforced claim |
| REQ-capability-proof-006 / Match / mismatch / missing identity | MUST | `capability-proof/index.js` | covered-by-design | expectedPortId + expectedFingerprint; no schema field |
| REQ-host-capabilities-contract-009 / Five ports + not missing-port | MUST | `host-contract/index.js`, `claude.js` | covered-by-design | Drop isolation port from buildTransports |
| REQ-reference-host-adapter-007 / Shared fingerprint + live probe | MUST | `host-adapters/claude.js`, E2E | covered-by-design | No unconfined spawnSync for enforced |
| REQ-lifecycle-model-conformance-004 / K6a not deferred | MUST | `lifecycle-model.js` | covered-by-design | Ten ids in K6A_EXECUTABLE_INVARIANTS |
| REQ-lifecycle-model-conformance-012 / Ten executable checkers | MUST | `lifecycle-model.js` | covered-by-design | Four new + rewrite fallback (keep id) |

### Reconciliation Verdict
- MUST coverage: complete
- SHOULD/MAY gaps: none
- Ambiguities to track: `sdd-design-001` (evidence carries `transport.port_id`/`fingerprint`); `sdd-design-002` (`WorkerTransport.fingerprint` = sha256 of adapter_id+port_id+probe_digest). Both allocated in design §Interfaces; apply follows design verbatim.

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~1,450–1,900 (additions + deletions across ~15 files) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR1 policy immutability → PR2 mutating fs wrap → PR3 live-identity + host contract → PR4 probe/executor/E2E/lifecycle |
| Delivery strategy | ask-on-risk |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: size-exception
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Immutable captured sandbox policy (P0-1) | PR1 | `worker-sandbox-preload.js`, `worker-sandbox-confine.js`, RED env-mutation tests; base `main` |
| 2 | Exhaustive mutating fs wrap (P0-2) | PR2 | Preload wraps + Node 22 inventory suite; base PR1 branch or `main` if stacked |
| 3 | Live-identity binding + five-port contract | PR3 | `capability-proof`, `host-contract`, `claude.js` drop isolation port; base PR2 |
| 4 | Real probe + REQ-008 fail-closed + E2E + lifecycle | PR4 | `worker-sandbox.js`, `worker-executor.js`, E2E, four new K6a checkers; base PR3 |

### Checklist Status Legend

- `[ ]` Not implemented yet
- `[~]` Implemented but not yet verified locally
- `[x]` Implemented and verified locally

## Phase 1: Immutable Captured Sandbox Policy (P0-1)

- [x] 1.1 RED — Add adversarial tests in `scripts/lib/worker-sandbox.test.js`: mutate `OSPEC_SANDBOX_*` then `spawn`/`execFile`/`fork`; assert child stays on original `allowed_paths` [REQ-worker-isolation-011]
- [x] 1.2 GREEN — Freeze `{workspaceRoot, allowedPaths}` at preload load in `scripts/lib/worker-sandbox-preload.js` (`Object.freeze` closure) [REQ-worker-isolation-011]
- [x] 1.3 GREEN — Change `confineChildEnv(userEnv, capturedPolicy, preloadPath)` in `scripts/lib/worker-sandbox-confine.js` to rebuild `OSPEC_SANDBOX_*` + `NODE_OPTIONS` from snapshot, never live `process.env` [REQ-worker-isolation-011]
- [x] 1.4 GREEN — Pass captured snapshot from preload into every nested `spawn`/`execFile`/`fork` wrap in `worker-sandbox-preload.js` [REQ-worker-isolation-011]
- [x] 1.5 VERIFY — Confirm existing v2.47.1 regression tests (`env:{}` inheritance, fake-basename `node` / `realpath(process.execPath)`) remain green in `worker-sandbox.test.js` [REQ-worker-isolation-011]

## Phase 2: Exhaustive Mutating Filesystem Wrap (P0-2)

- [x] 2.1 RED — Add Node 22 mutation-surface inventory test in `worker-sandbox.test.js` enumerating `Object.keys(fs)` / `fs.promises` for unwrapped mutating APIs [REQ-worker-isolation-012]
- [x] 2.2 RED — Add per-family undeclared-target fail-closed tests (`mkdtemp*`, `chmod*`/`lchmod*`, `chown*`/`lchown*`, `utimes*`/`lutimes*`, `mkdtempDisposable*`, sync/callback/promise/FileHandle styles) via sandboxed `-e` scripts [REQ-worker-isolation-012]
- [x] 2.3 GREEN — Wrap remaining mutating fs families in `scripts/lib/worker-sandbox-preload.js` with `assertWriteAllowed` before original call [REQ-worker-isolation-012]
- [x] 2.4 GREEN — Resolve fd/FileHandle paths via fd→path registry; unknown fd fail-closed in same file [REQ-worker-isolation-012]
- [x] 2.5 VERIFY — Add allowed-path success cases; assert post-flight `ValidateAllowedPaths` still runs after permitted mutations [REQ-worker-isolation-012]

## Phase 3: WorkerIsolation Live-Identity + Host Contract (P0-3)

- [x] 3.1 RED — Add tests in `scripts/lib/capability-proof/index.test.js`: match, G≠F mismatch (`transport-identity-mismatch`), missing `expectedPortId`/`expectedFingerprint` (`expected-field-missing`) [REQ-capability-proof-006]
- [x] 3.2 GREEN — Extend `verifyCapabilityProof` WorkerIsolation branch in `scripts/lib/capability-proof/index.js` with `expectedPortId` + `expectedFingerprint` against hashed evidence [REQ-capability-proof-006]
- [x] 3.3 GREEN — Forward `expectedPortId`/`expectedFingerprint` through `resolveCapabilityState` in `scripts/lib/host-contract/index.js` [REQ-capability-proof-006, REQ-host-capabilities-contract-009]
- [x] 3.4 RED — Update `scripts/lib/host-contract/index.test.js`: exactly five required ports; missing WorkerIsolation claim is not `missing-transport-port`; WorkerTransport stays policy-free [REQ-host-capabilities-contract-009]
- [x] 3.5 VERIFY — Run capability-proof and host-contract test files; no sixth port introduced [REQ-host-capabilities-contract-009]

## Phase 4: Reference Adapter — Shared Transport + Real Probe

- [x] 4.1 RED — Add tests in `scripts/lib/host-adapters/claude.test.js`: probe and commands share fingerprint F; unconfined `spawnSync` cannot mark `enforced`; vacuous `{blocked:true}` rejected [REQ-reference-host-adapter-007, REQ-worker-isolation-013, REQ-worker-isolation-014]
- [x] 4.2 GREEN — Remove `claude-worker-isolation` from `buildTransports` in `scripts/lib/host-adapters/claude.js`; probe via executing `WorkerTransport` only [REQ-host-capabilities-contract-009, REQ-reference-host-adapter-007]
- [x] 4.3 GREEN — Stamp `WorkerTransport.fingerprint` after live probe per design (`sha256Fingerprint("worker-transport-live-identity/v1", {adapter_id, port_id, probe_digest})`) [REQ-reference-host-adapter-007]
- [x] 4.4 GREEN — Include `transport.port_id` + `transport.fingerprint` in WorkerIsolation semantic evidence (hashed into `evidence_digest`; no new proof schema field) [REQ-capability-proof-006, REQ-reference-host-adapter-007]
- [x] 4.5 RED — Add probe attempt-record tests in `worker-sandbox.test.js`: `{id, attempted:true, wrote:boolean}`; `attempted:false` and bare `{blocked:true}` MUST NOT authorize enforced [REQ-worker-isolation-013]
- [x] 4.6 GREEN — Rewrite isolation probe in `scripts/lib/worker-sandbox.js` to attempt allowed / undeclared-workspace / external-root writes through `executeSandboxedCommand`; host observes PASS/BLOCKED/BLOCKED [REQ-worker-isolation-013]
- [x] 4.7 GREEN — Wire `executeWorkerIsolationProbe(WorkerTransport)` in `claude.js`; drop vacuous blocked-only evidence paths [REQ-reference-host-adapter-007, REQ-worker-isolation-013]

## Phase 5: Executor Fail-Closed + E2E (REQ-008)

- [x] 5.1 RED — Add tests in `scripts/lib/worker-executor.test.js`: commands refused unless `isolationReported=enforced`; transport G≠F invalidates enforced; non-command primitives MAY complete without enforced claim [REQ-worker-isolation-008, REQ-worker-isolation-014]
- [x] 5.2 GREEN — Bind WorkerIsolation verify to executing `WorkerTransport` `port_id`/`fingerprint` in `scripts/lib/worker-executor.js` [REQ-worker-isolation-014, REQ-capability-proof-006]
- [x] 5.3 GREEN — Refuse command lists when isolation is `partial`/`instructional`/`unavailable`; remove documented local-subprocess fallback for commands [REQ-worker-isolation-008]
- [x] 5.4 GREEN — Ensure enforced command path uses confined `executeSandboxedCommand` on same transport; block unconfined `spawnSync` claiming enforced [REQ-worker-isolation-014, REQ-reference-host-adapter-007]
- [x] 5.5 RED — Update `scripts/k6a-e2e-worker-isolation.test.js`: enforced cases MUST use `executeSandboxedCommand` with same fingerprint as probe; no unconfined `spawnSync` [REQ-reference-host-adapter-007, REQ-worker-isolation-014]
- [x] 5.6 GREEN — Implement E2E enforced path through shared WorkerTransport fingerprint in E2E helpers [REQ-reference-host-adapter-007]
- [x] 5.7 VERIFY — Enforced-without-WorkerTransport and partial-with-commands scenarios fail closed in executor + E2E [REQ-worker-isolation-008]

## Phase 6: Lifecycle Model Conformance

- [x] 6.1 RED — Update `scripts/lib/lifecycle-model.test.js` to expect ten `K6A_EXECUTABLE_INVARIANTS` (currently six) [REQ-lifecycle-model-conformance-004, REQ-lifecycle-model-conformance-012]
- [x] 6.2 GREEN — Rewrite `inv-k6a-host-isolation-fallback` checker in `scripts/lib/lifecycle-model.js`: commands without enforced fail closed (keep invariant id) [REQ-lifecycle-model-conformance-012]
- [x] 6.3 GREEN — Add `inv-k6a-sandbox-policy-immutability` checker exercising env mutation + child confinement [REQ-lifecycle-model-conformance-012]
- [x] 6.4 GREEN — Add `inv-k6a-transport-binding` checker: G≠F invalidates enforced [REQ-lifecycle-model-conformance-012]
- [x] 6.5 GREEN — Add `inv-k6a-real-containment-probe` checker: PASS/BLOCKED/BLOCKED with attempted writes [REQ-lifecycle-model-conformance-012]
- [x] 6.6 GREEN — Add `inv-k6a-mutating-fs-surface` checker: wrapped mutating APIs fail closed at wrapper [REQ-lifecycle-model-conformance-012]
- [x] 6.7 VERIFY — Register all four new ids in `K6A_EXECUTABLE_INVARIANTS`; confirm none appear in deferred list; run `scripts/lib/k6a-lifecycle-model.test.js` [REQ-lifecycle-model-conformance-004]

## Phase 7: Integration Verification

- [x] 7.1 Run full `npm test`; all unit, integration, model, and K6a E2E suites green
- [x] 7.2 Static scan: no `CandidateId` emission, no K4b Repair/shadow surfaces, no OS-jail authority for `enforced` introduced
- [x] 7.3 Mark work-unit PR boundaries in apply-progress if chaining; each unit must pass `npm test` independently before merge
