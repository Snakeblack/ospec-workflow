# headless-conformance-host Specification

## Purpose

Provide a deterministic Headless Conformance Host that exercises the
host-agnostic contract with fault injection and rejects adapters that duplicate
lifecycle or Graph semantics. It is a conformance fixture, not a second product
target.

## Requirements

### Requirement: Distinct From Minimal Kernel Harness {#REQ-headless-conformance-host-001}

The Headless Conformance Host MUST be a distinct module/kind from the Minimal
Kernel Harness. The harness MUST remain the protocol/lifecycle fixture; the
conformance host MUST own host-fault and adapter-contract matrices. Neither MUST
absorb the other's authority surface.

#### Scenario: Kinds remain distinct

- GIVEN both Minimal Kernel Harness and Headless Conformance Host are present
- WHEN their module identities/kinds are inspected
- THEN they MUST be distinct
- AND the conformance host MUST NOT replace protocol harness entrypoints

### Requirement: Host Fault Matrix Coverage {#REQ-headless-conformance-host-002}

The Headless Conformance Host MUST deterministically exercise at least these
faults against the host contract: timeout, cancel, worker fail, and interrupt.
Each fault MUST produce a structured, machine-readable outcome. Private mocks
that bypass the published transport ports MUST NOT satisfy this requirement.

#### Scenario: Timeout fault is exercised

- GIVEN a conformance fixture configured to inject transport timeout
- WHEN the Headless Conformance Host runs
- THEN it MUST record a timeout outcome through the contract ports
- AND MUST NOT invent a successful enforced capability for that fault path

#### Scenario: Cancel fault is exercised

- GIVEN a conformance fixture configured to inject cancellation
- WHEN the Headless Conformance Host runs
- THEN it MUST record a cancel outcome
- AND MUST NOT leave authoritative lifecycle mutation half-applied via the
  adapter

#### Scenario: Worker fail fault is exercised

- GIVEN a conformance fixture configured to inject WorkerTransport failure
- WHEN the Headless Conformance Host runs
- THEN it MUST record a worker-fail outcome
- AND MUST NOT treat the failure as silent success

#### Scenario: Interrupt fault is exercised

- GIVEN a conformance fixture configured to interrupt mid-transport
- WHEN the Headless Conformance Host resumes or reports
- THEN it MUST record an interrupt outcome
- AND reconciliation through kernel ports MUST remain fail-closed where
  authority is involved

### Requirement: Reject Lifecycle Or Graph Duplicating Adapters {#REQ-headless-conformance-host-003}

Conformance MUST reject any adapter that implements or duplicates lifecycle
reducer semantics, Graph compilation/authority, OperationPermit minting, or
Authority Store CAS. Rejection MUST use a stable reason code.

#### Scenario: Lifecycle-duplicating adapter fails conformance

- GIVEN an adapter that computes next lifecycle transitions independently of
  the kernel
- WHEN Headless Conformance Host evaluates it
- THEN conformance MUST fail
- AND MUST cite lifecycle-duplication as the reason

#### Scenario: Graph-duplicating adapter fails conformance

- GIVEN an adapter that compiles or treats Graph IR as authority
- WHEN Headless Conformance Host evaluates it
- THEN conformance MUST fail
- AND MUST cite Graph-duplication as the reason

### Requirement: Deterministic Conformance Results {#REQ-headless-conformance-host-004}

Conformance fixtures MUST emit stable results including scenario ID, injected
fault, adapter identity, capability states observed, proof verification
outcome (when applicable), and pass/fail. Volatile timestamps MUST be excluded
from semantic digests.

#### Scenario: Repeated conformance run is equivalent

- GIVEN the same fixture, seed, adapter_version and host_version
- WHEN the Headless Conformance Host runs twice
- THEN semantic results MUST be byte-equivalent
