# Apply Progress: k6a-isolation-frontier-hardening

## Overview

- **Change**: `k6a-isolation-frontier-hardening`
- **Branch**: `fix/k6a-isolation-frontier-hardening`
- **Execution Mode**: Focused TDD (RED → GREEN → VERIFY BATCH)
- **Delivery**: `size:exception` (review-workload-001) — full remaining backlog in one apply; no chained slice
- **Status**: Completed locally (`npm test` green)

This is the first apply batch. No previous `apply-progress.md` existed.

---

## Phase Execution Summary

### Phase 1: Immutable Captured Sandbox Policy (P0-1)

- **Tasks**: 1.1–1.5 `[x]`
- **Key Deliverables**:
  - Preload freezes `{ workspaceRoot, allowedPaths }` at load.
  - `confineChildEnv(userEnv, capturedPolicy, preloadPath)` rebuilds `OSPEC_SANDBOX_*` + `NODE_OPTIONS` from the snapshot; never live `process.env`.
  - Nested `spawn` / `execFile` / `fork` receive the captured snapshot.
  - RED tests mutate `OSPEC_SANDBOX_*` then spawn/execFile/fork; child stays on original `allowed_paths`.
- **Verification**: `node --test scripts/lib/worker-sandbox.test.js` (19/19). Closed v2.47.1 `env:{}` inheritance and fake-basename `node` / `realpath(process.execPath)` tests remain green.

### Phase 2: Exhaustive Mutating Filesystem Wrap (P0-2)

- **Tasks**: 2.1–2.5 `[x]`
- **Key Deliverables**:
  - Node 22 mutating-surface inventory covers `mkdtemp*`, `chmod*`/`lchmod*`, `chown*`/`lchown*`, `utimes*`/`lutimes*`, `mkdtempDisposable*`, sync/callback/promise/FileHandle.
  - Wrapper `assertWriteAllowed` / `assertMutationTargetAllowed` before original call; fd→path registry; unknown fd fail-closed.
  - Allowed-path success cases; post-flight `ValidateAllowedPaths` still runs after permitted mutations.
- **Verification**: included in `worker-sandbox.test.js` (19/19).

### Phase 3: WorkerIsolation Live-Identity + Host Contract (P0-3)

- **Tasks**: 3.1–3.5 `[x]`
- **Key Deliverables**:
  - `verifyCapabilityProof` WorkerIsolation branch requires `expectedPortId` + `expectedFingerprint`; mismatch → `transport-identity-mismatch`; missing → `expected-field-missing`.
  - `resolveCapabilityState` / `evaluateEnforcementEligibility` forward those fields.
  - Host contract: exactly five required ports; missing WorkerIsolation claim is not `missing-transport-port`; WorkerTransport stays policy-free.
- **Verification**: `node --test scripts/lib/capability-proof/index.test.js scripts/lib/host-contract/index.test.js` (25/25).

### Phase 4: Reference Adapter — Shared Transport + Real Probe

- **Tasks**: 4.1–4.7 `[x]`
- **Key Deliverables**:
  - Removed `claude-worker-isolation` from `buildTransports`; probe runs on executing `WorkerTransport` only.
  - `WorkerTransport.fingerprint` = `sha256Fingerprint("worker-transport-live-identity/v1", { adapter_id, port_id, probe_digest })`.
  - WorkerIsolation semantic evidence carries `transport.port_id` / `transport.fingerprint` (hashed into `evidence_digest`; no new proof schema field).
  - Isolation probe attempts three real writes via `executeSandboxedCommand`; host observes PASS/BLOCKED/BLOCKED.
  - Vacuous `{ blocked: true }` is rejected (`isLiveIsolationProbeEvidence`).
- **Verification**: `node --test scripts/lib/host-adapters/claude.test.js scripts/lib/host-adapters/registry.test.js scripts/lib/worker-sandbox.test.js`.

### Phase 5: Executor Fail-Closed + E2E (REQ-008)

- **Tasks**: 5.1–5.7 `[x]`
- **Key Deliverables**:
  - Commands refused unless `isolationReported=enforced`; G≠F invalidates enforced; non-command primitives MAY complete without enforced claim.
  - WorkerIsolation verify bound to executing WorkerTransport `port_id`/`fingerprint`.
  - Enforced path uses confined `executeSandboxedCommand` on the same transport; unconfined `spawnSync` cannot claim enforced.
  - E2E enforced cases use `confinedTransportRun` → `executeSandboxedCommand`; no `spawnSync` in the E2E file.
  - Sandbox-wrapper denials on stderr map to `containment-violation/v1` (`undeclared_write`) so wrapper fail-closed is the containment check, not post-flight inventory alone.
- **Verification**: `node --test scripts/lib/worker-executor.test.js scripts/k6a-e2e-worker-isolation.test.js` (56/56).

### Phase 6: Lifecycle Model Conformance

- **Tasks**: 6.1–6.7 `[x]`
- **Key Deliverables**:
  - Ten `K6A_EXECUTABLE_INVARIANTS` (was six). Ids: existing six plus `inv-k6a-sandbox-policy-immutability`, `inv-k6a-transport-binding`, `inv-k6a-real-containment-probe`, `inv-k6a-mutating-fs-surface`.
  - `inv-k6a-host-isolation-fallback` rewritten: commands without enforced fail closed (id kept).
  - None of the ten appear on the deferred list.
- **Verification**: `node --test scripts/lib/lifecycle-model.test.js` (17/17); `node --test scripts/lib/k6a-lifecycle-model.test.js` (11/11).

### Phase 7: Integration Verification

- **Tasks**: 7.1–7.3 `[x]`
- **7.1** `npm test`: 2610 tests, 2608 pass, 0 fail, 2 skipped. `All checks passed.`
- **7.2** Static scan of this change’s production JS:
  - No `CandidateId` / `computeCandidateId` emission from K6a primitives (`worker-executor.js` only documents the prohibition).
  - No K4b Repair/shadow/compiler surfaces introduced.
  - No OS-jail / seccomp / landlock / chroot as authority for `enforced` (`software_surface`).
  - No sixth host port (`claude-worker-isolation` removed).
- **7.3** Chain strategy is `size:exception`. Work-unit forecast (PR1 policy → PR2 fs wrap → PR3 identity → PR4 probe/executor/E2E/lifecycle) is documented in `tasks.md` but not split; maintainer accepted a single oversized PR. Full `npm test` is green on this branch.

---

## Task Status

All 39 tasks in `tasks.md` marked `[x]` after local verification.

## Deviations from Design

None material. Implementation follows design verbatim for sdd-design-001 (evidence carries `transport.port_id`/`fingerprint`) and sdd-design-002 (fingerprint = sha256 of adapter_id+port_id+live probe_digest under `worker-transport-live-identity/v1`).

E2E undeclared-write assertions accept the wrapper-blocked relative path (`unauthorized` from `mkdirSync`) in addition to the leaf file path, because P0-2 fails closed before `writeFileSync`. The executor still emits `containment-violation/v1`.

## Risks / Notes

- Review workload remains High (~1,300 net lines across 17 production/test files plus OpenSpec artifacts). `size:exception` is the approved delivery path.
- `isolationReported=enforced` remains a software-boundary claim, not an OS jail.

---

## 4R slice correction (S-2331116459080264 / F-a93a0811da865770)

- **Finding**: CRITICAL — preload intercepted `child_process` but not `node:worker_threads`. `Worker(src, { eval: true, execArgv: [] })` could drop `--require` and write outside `allowed_paths`.
- **Files**: `scripts/lib/worker-sandbox-preload.js`, `scripts/lib/worker-sandbox.test.js` (pending.paths only; `state.yaml` untouched).
- **Behavior**: wrap exported `Worker` so nested workers **inherit confinement**: force `execArgv` to `--require` this preload, confine `env` via `confineChildEnv(..., capturedPolicy, PRELOAD_SCRIPT_PATH)`. `worker.SHARE_ENV` **fail-closed** (EACCES). Other options (`eval`, `workerData`, `transferList`, …) preserved.
- **Test**: `node --test scripts/lib/worker-sandbox.test.js` → **20 pass / 0 fail** (RED: eval + `execArgv: []` must not create `extTarget`).
- **Backlog**: all 39 original tasks remain `[x]`; this item is a 4R correction only.
