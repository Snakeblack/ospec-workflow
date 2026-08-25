# Delta for reference-host-adapter

## ADDED Requirements

### Requirement: Isolation Probe And Commands Share Executing Transport {#REQ-reference-host-adapter-007}

The `claude` adapter MUST bind WorkerIsolation live probe, CapabilityProof expected live identity (`port_id` / fingerprint), and `ExecuteWorkOrder` command dispatch to the **same** executing `WorkerTransport`. A WorkerIsolation `enforced` claim MUST NOT be recorded when probe or commands traverse a different transport, or when commands use unconfined local spawn (`spawnSync` or equivalent). The WorkerIsolation live probe MUST attempt allowed, undeclared-workspace, and external-root writes through that transport; the host MUST observe `PASS` / `BLOCKED` / `BLOCKED`. Fixture-only digests and vacuous blocked flags MUST NOT mark WorkerIsolation `enforced`. `enforced` remains a software-boundary claim; an OS jail MUST NOT be required.

#### Scenario: Probe and commands share one WorkerTransport fingerprint

- GIVEN the claude adapter resolving WorkerIsolation with executing transport identity F
- WHEN the containment probe runs and commands are dispatched
- THEN both MUST use transport F
- AND expected live identity for the WorkerIsolation proof MUST carry F's `port_id` and fingerprint

#### Scenario: Mismatched or unconfined path cannot mark enforced

- GIVEN a WorkerIsolation probe bound to transport F
- WHEN commands would execute on a different transport or via unconfined local spawn
- THEN the claude adapter MUST NOT mark WorkerIsolation `enforced`

#### Scenario: Three-way live probe is required for WorkerIsolation enforced

- GIVEN the claude adapter claiming WorkerIsolation `enforced`
- WHEN the live probe for that capability is inspected
- THEN it MUST include attempted allowed / undeclared-workspace / external-root writes on the executing transport
- AND observed outcomes MUST be `PASS` / `BLOCKED` / `BLOCKED`
