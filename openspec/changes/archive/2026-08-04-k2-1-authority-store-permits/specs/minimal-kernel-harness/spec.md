# Delta for minimal-kernel-harness

## ADDED Requirements

### Requirement: Authority Fault Matrix Through Public Entrypoint {#REQ-minimal-kernel-harness-007}

The Minimal Kernel Harness MUST exercise the K2.1 authority fault matrix through
the same public kernel entrypoint used by runtime consumers. The matrix MUST
cover at least: CAS conflict, stale permit, permit reuse, and ambiguous
irreversible effect. Private reducer-only fixtures MUST NOT satisfy this
requirement.

#### Scenario: CAS conflict fixture

- GIVEN two concurrent writers sharing the same loaded revision
- WHEN both attempt compareAndSwap through the public entrypoint
- THEN exactly one MUST succeed
- AND the harness result MUST record a CAS-conflict outcome for the loser
- AND budgets MUST NOT inflate because of the conflict

#### Scenario: Stale permit fixture

- GIVEN a permit whose expected_revision no longer matches the head
- WHEN the harness authorizes a mutation with that permit
- THEN authorize MUST fail closed as stale
- AND the final head digest MUST match the pre-attempt head

#### Scenario: Permit reuse fixture

- GIVEN a permit already consumed into an OperationReceipt
- WHEN the harness presents the same permit again
- THEN the attempt MUST fail closed
- AND no second authoritative advance MUST occur

#### Scenario: Ambiguous irreversible effect fixture

- GIVEN an irreversible effect whose outcome is injected as ambiguous
- WHEN the harness continues the protocol
- THEN the next kind MUST be `decide` or `stop`
- AND the same irreversible effect MUST NOT auto-retry

### Requirement: Fixed Path No Regression Under K2.1 {#REQ-minimal-kernel-harness-008}

Harness fixtures that encode the fixed-policy control path MUST continue to pass
after Authority Store, permits, and effect classes are enforced. K2.1 MUST NOT
alter fixed defaults or invent a second lifecycle authority inside the harness.

#### Scenario: Fixed-path fixture remains green

- GIVEN an accepted fixed-policy lifecycle harness fixture
- WHEN it runs under K2.1 permit and CAS enforcement
- THEN the fixture MUST still converge to its expected terminal outcome
- AND MUST NOT require a changed global default policy
