# Delta for headless-conformance-host

## ADDED Requirements

### Requirement: Async Transport Outcomes Are Awaited And Caught {#REQ-headless-conformance-host-005}

The Headless Conformance Host MUST invoke transport ports through an async path
that `await`s `Promise<TransportOutcome>` and `catch`es rejections. A rejected
Promise MUST surface as a structured failure (`ok: false`) and MUST NEVER be
recorded as a successful outcome.

#### Scenario: Rejected port Promise is not success

- GIVEN a transport port whose invoke Promise rejects during a conformance run
- WHEN the Headless Conformance Host observes the outcome
- THEN it MUST record `ok: false` with a classified failure
- AND MUST NOT record `ok: true` for that invoke

#### Scenario: Successful async port is normalized

- GIVEN a transport port that resolves a successful TransportOutcome
- WHEN the Headless Conformance Host awaits it
- THEN the recorded outcome MUST preserve `ok: true`
- AND MUST remain machine-readable and deterministic for the fixture

## MODIFIED Requirements

### Requirement: Host Fault Matrix Coverage {#REQ-headless-conformance-host-002}

The Headless Conformance Host MUST deterministically exercise at least these
faults against the host contract: timeout, cancel, worker fail, and interrupt.
Each fault MUST be driven through adapter transport ports (failing port
implementations or equivalent port-level failure), produce a structured
machine-readable outcome, and MUST NOT rely solely on synthetic helpers that
bypass the published ports. Private mocks that bypass the published transport
ports MUST NOT satisfy this requirement. Synthetic inject helpers MAY exist for
test setup but MUST NOT alone count as fault-matrix coverage.
(Previously: faults could be satisfied by synthetic injectFault paths without
requiring failure to traverse adapter ports.)

#### Scenario: Timeout fault is exercised

- GIVEN a conformance fixture whose adapter port fails as timeout
- WHEN the Headless Conformance Host runs
- THEN it MUST record a timeout outcome through the contract ports
- AND MUST NOT invent a successful enforced capability for that fault path

#### Scenario: Cancel fault is exercised

- GIVEN a conformance fixture whose adapter port fails as cancel
- WHEN the Headless Conformance Host runs
- THEN it MUST record a cancel outcome
- AND MUST NOT leave authoritative lifecycle mutation half-applied via the
  adapter

#### Scenario: Worker fail fault is exercised

- GIVEN a conformance fixture whose WorkerTransport port fails
- WHEN the Headless Conformance Host runs
- THEN it MUST record a worker-fail outcome
- AND MUST NOT treat the failure as silent success

#### Scenario: Interrupt fault is exercised

- GIVEN a conformance fixture whose adapter port fails as interrupt
- WHEN the Headless Conformance Host resumes or reports
- THEN it MUST record an interrupt outcome
- AND reconciliation through kernel ports MUST remain fail-closed where
  authority is involved

#### Scenario: Synthetic inject alone does not satisfy coverage

- GIVEN only a synthetic injectFault helper that bypasses adapter ports
- WHEN host-fault matrix coverage is evaluated
- THEN coverage MUST remain incomplete
- AND conformance MUST NOT pass solely on that synthetic path
