# Proposal: K6a Isolation Frontier Hardening

## Intent

K6a is **not terminal** at `v2.47.1` (`a62266c929319bc16b91b07c9333d193b7bf1376`). Documentary `K6a=done` is overruled by code + OpenSpec + Git. Close remaining isolation-frontier defects; keep K4b blocked. `isolationReported=enforced` is a **software-boundary** claim (architecture-001), not an OS jail.

Closed at v2.47.1 and **not reopened**: `env:{}` / `NODE_OPTIONS` inheritance; fake basename `node` (`realpath(process.execPath)`).

## Scope

### In Scope

- **P0-1:** Capture `{workspaceRoot, allowedPaths}` in the preload closure; `confineChildEnv` rebuilds child env from that snapshot, never live `process.env`. RED: mutate `OSPEC_SANDBOX_*` then `spawn` / `execFile` / `fork`; child stays on original `allowed_paths`.
- **P0-2:** Wrap remaining Node 22+ mutating fs APIs (`mkdtemp*`, `chmod*`, `chown*`, `utimes*`, `lutimes*`, `mkdtempDisposable*`, all styles) plus a mutation-surface suite. Not an OS jail.
- **P0-3:** WorkerIsolation proof binds to the executing `WorkerTransport` (`port_id` / fingerprint). Mismatch invalidates `enforced`. Containment challenge traverses that fingerprint.
- **P1 probe:** Three real ops on that transport — allowed / undeclared workspace / external-root — PASS / BLOCKED / BLOCKED.
- **P1 REQ-008:** Spec matches runtime: commands without `enforced` fail closed (no fallback-execute).
- Adversarial P0 tests; `npm test` + K6a E2E pass.

### Out of Scope

- K4b Repair/shadow, Graph recompilation, Candidate freeze as product (no `CandidateId` emission).
- OS/container/syscall jail as authority for `enforced`.
- K6b–K6d, K7, K8, K9, K10.
- Reopening v2.47.1 `env:{}` / fake-node fixes.

## Capabilities

### New Capabilities

None

### Modified Capabilities

- `worker-isolation`: REQ-008 fail-closed for commands; immutable captured policy; exhaustive mutating fs wrap; real three-way probe; proof bound to executing transport.
- `capability-proof`: WorkerIsolation `enforced` binds live identity to WorkerTransport `port_id` / fingerprint (extends REQ-005).
- `host-capabilities-contract`: WorkerIsolation is a capability **on** WorkerTransport, not a sixth required port. REQ-005 policy-free ports preserved.
- `reference-host-adapter`: Isolation probe and commands share the executing WorkerTransport fingerprint.
- `lifecycle-model-conformance`: Reconcile `inv-k6a-host-isolation-fallback` to fail-closed commands; add checkers for policy immutability, transport binding, real probe, mutating-fs surface.

## Approach

Focused TDD (`testing.tdd_mode: focused`), software surface only.

1. Freeze sandbox policy in preload; child `OSPEC_SANDBOX_*` never from live `process.env`.
2. Bind `ExecuteWorkOrder` so proof, containment challenge, and commands share one transport fingerprint; E2E `enforced` MUST NOT use unconfined `spawnSync`.
3. Replace vacuous `{blocked:true}` with three attempted writes.
4. Complete mutating `fs` wrappers; adversarial `mkdtemp` / `chmod` / `chown` / `utimes` (+ equivalents).
5. Rewrite REQ-008 and the K6a fallback invariant: refuse commands unless `isolationReported=enforced`.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `scripts/lib/worker-sandbox-preload.js`, `worker-sandbox-confine.js`, `worker-sandbox.js` | Modified | Immutable policy; exhaustive fs wrap; real probe |
| `scripts/lib/worker-executor.js` | Modified | Bind isolation proof to executing transport |
| `scripts/lib/host-adapters/claude.js` | Modified | Shared fingerprint for worker + isolation |
| `scripts/lib/worker-sandbox.test.js`, `scripts/k6a-e2e-worker-isolation.test.js` | Modified | P0 adversarial + confined E2E |
| `openspec/specs/{worker-isolation,capability-proof,host-capabilities-contract,reference-host-adapter,lifecycle-model-conformance}/spec.md` | Modified | Deltas listed under Capabilities |

Roadmap/architecture docs are not updated in this phase.

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Missed mutating fs API | Med | Enumerate Node 22 `fs`/`fs/promises` surface in tests |
| Isolation looks like a sixth port | Med | Spec: capability-on-port; five transports stay |
| Fail-closed commands break partial hosts | Med | Intended: refuse commands unless `enforced` |
| Review >400 lines (high-risk) | High | `ask-on-risk`; chain PRs if tasks forecast High |

## Rollback Plan

Revert the implementing PR(s). Software-only; no OS jail, no Candidate/Repair state. Independent revert leaves v2.47.1 closed fixes intact.

## Dependencies

- Baseline `v2.47.1` = `a62266c929319bc16b91b07c9333d193b7bf1376`.
- Closed inheritance/execPath tests stay green.
- K4a / K5 / K2a / K3 exist; this change does not extend them.

## Success Criteria

- [ ] Immutable captured sandbox policy; child env never from live `process.env`.
- [ ] WorkerIsolation proof bound to executing WorkerTransport fingerprint/`port_id`; mismatch invalidates `enforced`.
- [ ] Probe attempts allowed / undeclared / external writes through that transport (PASS / BLOCKED / BLOCKED).
- [ ] Exhaustive mutating fs wrap + mutation-surface tests (`mkdtemp` / `chmod` / `chown` / `utimes` + equivalents).
- [ ] REQ-008 fail-closed for commands when not `enforced`.
- [ ] Adversarial tests for the three P0s; `npm test` + K6a E2E pass.

K6a remains **non-terminal** until these hold. K4b stays blocked.

> **Branch advisory:** Before `sdd-apply` begins, a feature branch SHOULD be created following the `<tipo>/<descripción>` convention defined in the `branch-pr` skill (e.g. `git checkout -b feat/k6a-isolation-frontier-hardening main`). This note is SHOULD, not MUST.
